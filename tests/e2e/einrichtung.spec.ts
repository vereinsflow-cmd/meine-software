import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open, outboxMailsTo } from "./helpers";

/**
 * Ein neuer Verein von Anfang an: Die Plattformverwaltung legt ihn an, der erste Administrator nimmt die Einladung an
 * und landet im Assistenten „Verein einrichten“. Bis zum Abschluss ist die übrige App gesperrt; weiter geht es erst mit
 * den Pflichtangaben.
 */
test("neuer Verein: Einladung annehmen und Schritt für Schritt einrichten", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const id = randomBytes(3).toString("hex");
  const clubName = `Neuverein ${id}`;
  const adminEmail = `neu-${id}@e2e.test`;

  /** Legt als Plattformverwaltung einen Verein an und liefert den Einladungslink für seinen ersten Administrator. */
  async function createClub(name: string, slug: string): Promise<string> {
    const before = outboxMailsTo(adminEmail).length;
    await open(page, "/system");
    await page.getByRole("button", { name: "Verein anlegen" }).click();
    const create = page.getByRole("dialog", { name: "Neuen Verein anlegen" });
    await create.getByLabel("Vereinsname").fill(name);
    await create.getByLabel("Kürzel").fill(slug);
    await create.getByLabel("E-Mail-Adresse des ersten Administrators").fill(adminEmail);
    await create.getByRole("button", { name: "Verein anlegen" }).click();
    await expect(create).toBeHidden();
    await expect.poll(() => outboxMailsTo(adminEmail).length, { timeout: 15_000 }).toBe(before + 1);
    const mail = outboxMailsTo(adminEmail).find((m) => m.subject === `Einladung zu ${name}`);
    const url = /http:\/\/localhost:3100\/einladung\/[A-Za-z0-9_-]{43}/.exec(mail?.text ?? "")?.[0];
    expect(url).toBeTruthy();
    return url!;
  }

  await login(page, USERS.superadmin);
  const invitationUrl = await createClub(clubName, `neuverein-${id}`);

  const context = await browser.newContext();
  const admin = await context.newPage();
  await admin.goto(invitationUrl!);
  await admin.getByLabel("Vorname").fill("Nora");
  await admin.getByLabel("Nachname").fill("Neu");
  await admin.locator('input[name="password"]').fill("Unser neuer Verein legt heute los");
  await admin.locator('input[name="passwordRepeat"]').fill("Unser neuer Verein legt heute los");
  await admin.getByRole("checkbox", { name: /Datenschutzerklärung/ }).check();
  await admin.getByRole("button", { name: "Konto anlegen und beitreten" }).click();

  // Bis zum Abschluss nur der Assistent: kein Menü, keine Suche – andere Seiten führen zurück
  await expect(admin).toHaveURL(/\/einrichtung\?schritt=verein$/);
  await expect(admin.locator("#schritt-titel")).toHaveText("Vereinsdaten");
  await expect(admin.getByText("Schritt 1 von 6")).toBeVisible();
  await expect(admin.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: /Suchen/ })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "Abmelden" })).toBeVisible();
  for (const path of ["/dashboard", "/mitglieder/neu", "/einrichtung?schritt=abschluss"]) {
    await admin.goto(path);
    await expect(admin).toHaveURL(/\/einrichtung\?schritt=verein$/);
  }
  const steps = admin.getByRole("navigation", { name: "Schritte der Einrichtung" });
  await expect(steps.getByRole("link")).toHaveCount(1); // nur „Vereinsdaten“ – der Rest ist noch gesperrt
  await admin.waitForLoadState("networkidle");
  expect(await violations(admin)).toEqual([]);

  // 1. Pflichtangaben: ohne sie geht es nicht weiter
  await admin.getByRole("button", { name: "Speichern und weiter" }).click();
  await expect(admin.getByText("Bitte gib Straße und Hausnummer ein.")).toBeVisible();
  await expect(admin).toHaveURL(/schritt=verein$/);
  await admin.locator('input[name="contactEmail"]').fill(`kontakt-${id}@e2e.test`);
  await admin.locator('input[name="street"]').fill("Am Sportplatz 1");
  await admin.locator('input[name="postalCode"]').fill("12345");
  await admin.locator('input[name="city"]').fill("Musterstadt");
  await admin.getByRole("button", { name: "Speichern und weiter" }).click();
  await expect(admin).toHaveURL(/schritt=logo$/);
  await expect(admin.locator("#schritt-titel")).toHaveText("Logo");
  await expect(steps.getByRole("link", { name: /Vereinsdaten \(erledigt\)/ })).toBeVisible();

  // 2. Logo überspringen, 3. Abteilung anlegen – der Assistent bleibt offen
  await admin.getByRole("link", { name: "Weiter: Abteilungen" }).click();
  await expect(admin.locator("#schritt-titel")).toHaveText("Abteilungen");
  await admin.getByRole("button", { name: "Neue Abteilung" }).click();
  const department = admin.getByRole("dialog", { name: "Neue Abteilung" });
  await department.locator('input[name="name"]').fill("Fußball");
  await department.getByRole("button", { name: "Abteilung anlegen" }).click();
  await expect(department).toBeHidden();
  await expect(admin.getByRole("listitem").filter({ hasText: "Fußball" })).toBeVisible();

  // 4. Mitglieder: Die Wege des Assistenten sind erreichbar – mit dem Weg zurück; der Rest der App bleibt zu
  await admin.getByRole("link", { name: "Weiter: Mitglieder" }).click();
  await admin.getByRole("link", { name: /Einzeln anlegen/ }).click();
  await expect(admin).toHaveURL(/\/mitglieder\/neu$/);
  const back = admin.getByRole("complementary", { name: "Einrichtung des Vereins" });
  await expect(back).toContainText("Du richtest gerade deinen Verein ein.");
  await expect(admin.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await admin.waitForLoadState("networkidle");
  // Erst prüfen, wenn die Meldung „Abteilung angelegt.“ verschwunden ist (beim Ausblenden ist sie halb durchsichtig)
  await expect(admin.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  expect(await violations(admin)).toEqual([]);
  await back.getByRole("link", { name: "Zurück zum Assistenten" }).click();
  await expect(admin).toHaveURL(/schritt=mitglieder$/);
  await admin.goto("/kalender");
  await expect(admin).toHaveURL(/\/einrichtung\?schritt=/);

  // 5./6. Zugänge ansehen; zuletzt abschließen – jetzt öffnet sich die ganze App
  await admin.goto("/einrichtung?schritt=vorstand");
  await expect(admin.getByText("Nora Neu (du)")).toBeVisible();
  await admin.getByRole("link", { name: "Weiter: Abschluss" }).click();
  await expect(admin.getByText("Noch offen – geht auch später")).toHaveCount(3);
  await admin.getByRole("button", { name: "Einrichtung abschließen" }).click();
  await expect(admin).toHaveURL(/\/dashboard/);
  await expect(admin.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
  await expect(back).toBeHidden();
  await admin.goto("/kalender");
  await expect(admin).toHaveURL(/\/kalender/);

  // Gesperrt ist nur der Verein in Einrichtung: Wer mehreren angehört, wechselt über den Vereinswechsler zurück
  const secondUrl = await createClub(`Zweitverein ${id}`, `zweitverein-${id}`);
  await admin.goto(secondUrl);
  await admin.getByRole("button", { name: "Einladung annehmen" }).click();
  await expect(admin).toHaveURL(/\/einrichtung/);
  await expect(admin.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await admin.getByRole("button", { name: "Verein wechseln" }).click();
  await admin.getByRole("menuitem", { name: new RegExp(clubName) }).click();
  await expect(admin).toHaveURL(/\/dashboard/);
  await expect(admin.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();

  await context.close();
});
