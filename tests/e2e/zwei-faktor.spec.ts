import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, inviteNewPerson, login, open, outboxMailsTo, waitForHydratedForm } from "./helpers";
import { TestAuthenticator } from "./totp";

/**
 * Zwei-Faktor-Anmeldung (TOTP) von Anfang bis Ende: im Profil einrichten (QR-Code, Schlüssel, erster Code), mit dem Code aus
 * der App oder einem Wiederherstellungscode anmelden, neue Codes erstellen, ausschalten – und das Zurücksetzen durch den
 * Verein, wenn Handy und Codes weg sind.
 *
 * Der Test lädt dafür eine eigene Person ein: Die Demo-Konten bleiben ohne Zwei-Faktor, andere Tests melden sich weiter nur
 * mit dem Passwort an. Die Codes rechnet {@link TestAuthenticator} wie eine echte Authenticator-App.
 */
const id = randomBytes(3).toString("hex");
const PERSON = {
  email: `zwei-faktor-${id}@e2e.test`,
  firstName: "Zora",
  lastName: `Zweifaktor${id}`,
  password: "Zwei Faktoren sind besser als einer",
};
const NAME = `${PERSON.firstName} ${PERSON.lastName}`;

let app: TestAuthenticator;
let recoveryCodes: string[] = [];

const twoFactorSection = (page: Page) =>
  page.getByRole("region", { name: "Zwei-Faktor-Anmeldung", exact: true });

const mailSubjects = () => outboxMailsTo(PERSON.email).map((mail) => mail.subject);

/** Erster Schritt der Anmeldung: Passwort richtig → weiter zur Code-Eingabe (noch keine Sitzung). */
async function passwordStep(page: Page, path = "/anmelden"): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/anmelden/);
  await waitForHydratedForm(page);
  await page.getByLabel("E-Mail-Adresse").fill(PERSON.email);
  await page.getByLabel("Passwort").fill(PERSON.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/anmelden\/bestaetigen$/);
  await expect(page.getByRole("heading", { name: "Anmeldung bestätigen" })).toBeVisible();
  await waitForHydratedForm(page);
}

/** Im Profil einrichten: Schlüssel ablesen, Passwort und erster Code, Wiederherstellungscodes merken. */
async function setUp(page: Page): Promise<void> {
  await open(page, "/profil");
  const section = twoFactorSection(page);
  await expect(section.getByText("Nicht eingerichtet")).toBeVisible();
  await section.getByRole("button", { name: "Zwei-Faktor-Anmeldung einrichten" }).click();
  await expect(
    section.getByRole("heading", { name: "Schritt 1: QR-Code mit der App scannen" }),
  ).toBeVisible();
  await expect(
    section.getByRole("img", { name: "QR-Code für die Authenticator-App" }),
  ).toBeVisible();
  const key = (await section.locator("code").textContent())!.replace(/\s/g, "");
  expect(key).toMatch(/^[A-Z2-7]{32}$/); // 160 Bit in Base32
  app = new TestAuthenticator(key);

  await waitForHydratedForm(page);
  await section.getByLabel("Passwort").fill(PERSON.password);
  await section.getByLabel("Code aus der App").fill(await app.freshCode());
  await section.getByRole("button", { name: "Einschalten" }).click();
  const list = section.getByRole("list", { name: "Wiederherstellungscodes" });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  recoveryCodes = await list.getByRole("listitem").allTextContents();
  for (const code of recoveryCodes) expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  await section.getByRole("button", { name: "Ich habe sie gespeichert" }).click();
  await expect(section.getByText("Eingeschaltet")).toBeVisible();
  await expect(section.getByText("Du hast noch 10 Wiederherstellungscodes.")).toBeVisible();
}

test.describe.serial("Zwei-Faktor-Anmeldung", () => {
  test("einrichten: QR-Code und Schlüssel, falsches Passwort und falscher Code werden abgelehnt, danach eingeschaltet – andere Geräte abgemeldet", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await login(page, USERS.admin);
    const person = await inviteNewPerson(page, browser, PERSON);
    // Ein zweites Gerät der Person: Beim Einschalten endet diese Sitzung.
    const otherDevice = await (await browser.newContext()).newPage();
    await login(otherDevice, PERSON.email, PERSON.password);

    await open(person, "/profil");
    const section = twoFactorSection(person);
    await expect(section.getByText("Nicht eingerichtet")).toBeVisible();
    await section.getByRole("button", { name: "Zwei-Faktor-Anmeldung einrichten" }).click();
    await expect(
      section.getByRole("img", { name: "QR-Code für die Authenticator-App" }),
    ).toBeVisible();
    await expect(section.getByText("Schlüssel zum Abtippen")).toBeVisible();
    await person.waitForLoadState("networkidle");
    expect(await violations(person)).toEqual([]);

    // Eine angefangene Einrichtung ändert an der Anmeldung nichts – und lässt sich abbrechen.
    await waitForHydratedForm(person);
    await section.getByRole("button", { name: "Abbrechen" }).click();
    await expect(section.getByText("Nicht eingerichtet")).toBeVisible();

    // Neu beginnen: zuerst ein falsches Passwort (eine offene Sitzung allein reicht nicht), dann ein falscher Code, dann richtig
    await section.getByRole("button", { name: "Zwei-Faktor-Anmeldung einrichten" }).click();
    const key = (await section.locator("code").textContent())!.replace(/\s/g, "");
    expect(key).toMatch(/^[A-Z2-7]{32}$/);
    app = new TestAuthenticator(key);
    await waitForHydratedForm(person);
    await section.getByLabel("Passwort").fill("falsches-Passwort-123");
    await section.getByLabel("Code aus der App").fill(app.wrongCode());
    await section.getByRole("button", { name: "Einschalten" }).click();
    await expect(section.getByText("Das Passwort ist nicht korrekt.")).toBeVisible();

    await section.getByLabel("Passwort").fill(PERSON.password);
    await section.getByRole("button", { name: "Einschalten" }).click();
    await expect(section.getByText(/^Der Code stimmt nicht\. Gib den Code ein/)).toBeVisible();

    await section.getByLabel("Code aus der App").fill(await app.freshCode());
    await section.getByRole("button", { name: "Einschalten" }).click();
    // Die Codes ersetzen beide Schritte; der Fokus steht auf ihrer Überschrift (nicht am Seitenanfang).
    const codesHeading = section.getByRole("heading", { name: "Deine Wiederherstellungscodes" });
    await expect(codesHeading).toBeVisible();
    await expect(codesHeading).toBeFocused();
    await expect(
      section.getByRole("heading", { name: "Schritt 1: QR-Code mit der App scannen" }),
    ).toHaveCount(0);
    const list = section.getByRole("list", { name: "Wiederherstellungscodes" });
    await expect(list.getByRole("listitem")).toHaveCount(10);
    recoveryCodes = await list.getByRole("listitem").allTextContents();
    for (const code of recoveryCodes) expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(new Set(recoveryCodes).size).toBe(10);
    expect(await violations(person)).toEqual([]);
    await section.getByRole("button", { name: "Ich habe sie gespeichert" }).click();
    await expect(section.getByText("Eingeschaltet")).toBeVisible();
    await expect(section.getByText("Du hast noch 10 Wiederherstellungscodes.")).toBeVisible();
    // Nach dem Neuladen bleiben die Codes verborgen – sie stehen nur einmal da.
    await person.reload();
    await expect(section.getByText("Eingeschaltet")).toBeVisible();
    await expect(person.getByText(recoveryCodes[0]!)).toHaveCount(0);

    await expect.poll(mailSubjects).toContain("Zwei-Faktor-Anmeldung eingeschaltet");
    // Das andere Gerät ist abgemeldet, dieses bleibt angemeldet.
    await otherDevice.goto("/dashboard");
    await expect(otherDevice).toHaveURL(/\/anmelden/);
    await otherDevice.context().close();
    await person.context().close();
  });

  test("anmelden mit dem Code aus der App: falscher Code, dann richtig – das Rücksprungziel bleibt", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/veranstaltungen");
    await expect(page).toHaveURL(/\/anmelden\?next=%2Fveranstaltungen/);
    await waitForHydratedForm(page);
    await page.getByLabel("E-Mail-Adresse").fill(PERSON.email);
    await page.getByLabel("Passwort").fill(PERSON.password);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/anmelden\/bestaetigen$/);
    await expect(page.getByRole("heading", { name: "Anmeldung bestätigen" })).toBeVisible();
    // Nur das Passwort reicht nicht: Ohne Code gibt es keine Sitzung.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/anmelden/);

    await passwordStep(page, "/anmelden?next=%2Fveranstaltungen");
    const code = page.getByLabel("Code aus der App");
    await expect(code).toBeFocused();
    expect(await violations(page)).toEqual([]);
    await code.fill(app.wrongCode());
    await page.getByRole("button", { name: "Bestätigen" }).click();
    await expect(page.getByText(/^Der Code stimmt nicht\./)).toBeVisible();
    await expect(page).toHaveURL(/\/anmelden\/bestaetigen$/);

    await code.fill(await app.freshCode());
    await page.getByRole("button", { name: "Bestätigen" }).click();
    await expect(page).toHaveURL(/\/veranstaltungen$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("ohne Passwort keine Code-Eingabe; „Abbrechen“ führt zurück zur Anmeldung", async ({
    page,
  }) => {
    await page.goto("/anmelden/bestaetigen");
    await expect(page).toHaveURL(/\/anmelden$/);

    await passwordStep(page);
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(page).toHaveURL(/\/anmelden$/);
    await page.goto("/anmelden/bestaetigen");
    await expect(page).toHaveURL(/\/anmelden$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/anmelden/);
  });

  test("Wiederherstellungscode: meldet einmal an, danach nicht mehr – das Profil zählt mit", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const [first] = recoveryCodes;
    await passwordStep(page);
    await page.getByRole("button", { name: /Wiederherstellungscode verwenden/ }).click();
    const field = page.getByLabel("Wiederherstellungscode");
    await expect(field).toBeFocused();
    // Klein geschrieben und ohne Bindestrich – so tippen es Menschen ab.
    await field.fill(first!.replace("-", "").toLowerCase());
    await page.getByRole("button", { name: "Bestätigen" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(mailSubjects).toContain("Anmeldung mit Wiederherstellungscode");

    await open(page, "/profil");
    await expect(
      twoFactorSection(page).getByText("Du hast noch 9 Wiederherstellungscodes."),
    ).toBeVisible();
    await page.getByRole("button", { name: /Benutzermenü/ }).click();
    await page.getByRole("menuitem", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/anmelden/);

    // Derselbe Code ein zweites Mal: abgelehnt
    await passwordStep(page);
    await page.getByRole("button", { name: /Wiederherstellungscode verwenden/ }).click();
    await page.getByLabel("Wiederherstellungscode").fill(first!);
    await page.getByRole("button", { name: "Bestätigen" }).click();
    await expect(page.getByText(/^Der Code stimmt nicht\./)).toBeVisible();
    await expect(page).toHaveURL(/\/anmelden\/bestaetigen$/);
  });

  test("neue Wiederherstellungscodes und Ausschalten nur mit Passwort und Code", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await passwordStep(page);
    await page.getByLabel("Code aus der App").fill(await app.freshCode());
    await page.getByRole("button", { name: "Bestätigen" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await open(page, "/profil");
    const section = twoFactorSection(page);
    await section.getByRole("button", { name: "Neue Wiederherstellungscodes" }).click();
    const renew = page.getByRole("dialog", { name: "Neue Wiederherstellungscodes" });
    const code = await app.freshCode();
    await renew.getByLabel("Passwort").fill("falsches-Passwort-123");
    await renew.getByLabel("Code aus der App").fill(code);
    await renew.getByRole("button", { name: "Neue Codes erstellen" }).click();
    await expect(renew.getByText("Das Passwort ist nicht korrekt.")).toBeVisible();

    // Ein falsches Passwort verbraucht den Code nicht: Derselbe Code gilt mit dem richtigen Passwort.
    await renew.getByLabel("Passwort").fill(PERSON.password);
    await renew.getByLabel("Code aus der App").fill(code);
    await renew.getByRole("button", { name: "Neue Codes erstellen" }).click();
    const list = renew.getByRole("list", { name: "Wiederherstellungscodes" });
    await expect(list.getByRole("listitem")).toHaveCount(10);
    // Der Fokus steht auf dem Warnhinweis über den neuen Codes, nicht nur auf dem Fenster.
    await expect(renew.getByRole("alert")).toBeFocused();
    const renewed = await list.getByRole("listitem").allTextContents();
    expect(renewed).not.toContain(recoveryCodes[1]);
    // Solange die Codes zu sehen sind, schließt nur „Ich habe sie gespeichert“ das Fenster.
    await page.keyboard.press("Escape");
    await expect(renew).toBeVisible();
    await renew.getByRole("button", { name: "Ich habe sie gespeichert" }).click();
    await expect(renew).toBeHidden();
    await expect(section.getByText("Du hast noch 10 Wiederherstellungscodes.")).toBeVisible();
    await expect.poll(mailSubjects).toContain("Neue Wiederherstellungscodes erstellt");

    // Ausschalten: ein alter Code gilt nicht mehr, ein neuer schon
    await section.getByRole("button", { name: "Ausschalten" }).click();
    const disable = page.getByRole("dialog", { name: "Zwei-Faktor-Anmeldung ausschalten?" });
    await disable.getByLabel("Passwort").fill(PERSON.password);
    await disable.getByLabel("Code aus der App").fill(recoveryCodes[1]!);
    await disable.getByRole("button", { name: "Ausschalten" }).click();
    await expect(disable.getByText(/^Der Code stimmt nicht\./)).toBeVisible();
    await disable.getByLabel("Code aus der App").fill(renewed[0]!);
    await disable.getByRole("button", { name: "Ausschalten" }).click();
    await expect(disable).toBeHidden();
    await expect(page.getByText("Die Zwei-Faktor-Anmeldung ist ausgeschaltet.")).toBeVisible();
    await expect(section.getByText("Nicht eingerichtet")).toBeVisible();
    await expect.poll(mailSubjects).toContain("Zwei-Faktor-Anmeldung ausgeschaltet");

    // Danach genügt wieder das Passwort.
    await page.getByRole("button", { name: /Benutzermenü/ }).click();
    await page.getByRole("menuitem", { name: "Abmelden" }).click();
    await login(page, PERSON.email, PERSON.password);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("Handy und Codes verloren: der Verein setzt zurück, die Person meldet sich mit dem Passwort an", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const person = await (await browser.newContext()).newPage();
    await login(person, PERSON.email, PERSON.password);
    await setUp(person);

    await login(page, USERS.admin);
    await open(page, "/benutzer");
    await page.getByRole("button", { name: `Aktionen für ${NAME}` }).click();
    await page.getByRole("menuitem", { name: "Zwei-Faktor-Anmeldung zurücksetzen" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Zwei-Faktor-Anmeldung zurücksetzen?" });
    await expect(confirm).toContainText(`Nur, wenn ${NAME} das Handy`);
    await confirm.getByRole("button", { name: "Zurücksetzen" }).click();
    await expect(page.getByText("Die Zwei-Faktor-Anmeldung wurde zurückgesetzt.")).toBeVisible();
    await expect.poll(mailSubjects).toContain("Zwei-Faktor-Anmeldung zurückgesetzt");
    await expect(confirm).toBeHidden();
    // Ohne Zwei-Faktor bietet das Menü das Zurücksetzen nicht mehr an (frisch geladen, damit kein Menü mehr offen ist).
    await open(page, "/benutzer");
    await page.getByRole("button", { name: `Aktionen für ${NAME}` }).click();
    const menu = page.getByRole("menu", { name: `Aktionen für ${NAME}` });
    await expect(menu.getByRole("menuitem", { name: "Zugang sperren" })).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Zwei-Faktor-Anmeldung zurücksetzen" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // Die Person ist überall abgemeldet und kommt mit dem Passwort allein wieder hinein.
    await person.goto("/dashboard");
    await expect(person).toHaveURL(/\/anmelden/);
    await login(person, PERSON.email, PERSON.password);
    await expect(person).toHaveURL(/\/dashboard$/);
    await open(person, "/profil");
    await expect(twoFactorSection(person).getByText("Nicht eingerichtet")).toBeVisible();
    await person.context().close();
  });
});
