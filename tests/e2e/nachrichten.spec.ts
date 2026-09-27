import { expect, test, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/** Nachrichten als Chats (wie WhatsApp): links die Chats je Zielgruppe, rechts der Verlauf mit Sprechblasen. */
const uniqueSubject = (prefix: string) => `${prefix} ${Date.now() % 100000}`;

const chatList = (page: Page) => page.getByRole("list", { name: "Chats" });
const bubble = (page: Page, subject: string | RegExp) =>
  page.getByRole("article", {
    name: typeof subject === "string" ? new RegExp(`: ${subject}$`) : subject,
  });

/** Öffnet einen Chat über die Liste und wartet, bis sein Verlauf da ist. */
async function openChat(page: Page, title: string): Promise<void> {
  await chatList(page)
    .getByRole("link", { name: new RegExp(`^${title}`) })
    .click();
  await expect(page).toHaveURL(/[?&]chat=/);
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
}

test.describe("Nachrichten – Empfänger", () => {
  test("Chatliste zeigt Ungelesenes; der Chat zeigt Sprechblasen, markiert als gelesen, Schreiben nur für Berechtigte", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await open(page, "/nachrichten");
    await expect(page.getByRole("heading", { level: 1, name: "Nachrichten" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Neue Nachricht" })).toHaveCount(0);

    const entry = chatList(page).getByRole("link", { name: /^Alle Mitglieder/ });
    await expect(entry).toContainText("Willkommen bei VereinsFlow!"); // Vorschau: der Betreff
    await expect(entry).toContainText(/ungelesene Nachricht/);

    await openChat(page, "Alle Mitglieder");
    const welcome = bubble(page, "Willkommen bei VereinsFlow!");
    await expect(welcome).toContainText("Anna Admin"); // Name über der Blase, wie in Gruppen
    await expect(welcome).toContainText("Ankündigung");
    await expect(welcome).toContainText("Liebe Mitglieder,");
    await expect(welcome.getByRole("button")).toHaveCount(0); // Empfänger dürfen nicht zurückrufen
    await expect(welcome).not.toContainText("gelesen"); // keine Lesestatistik für Empfänger
    await expect(
      page.getByText("Nur Vorstand und Abteilungsleitung können hier schreiben."),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Nachricht an/ })).toHaveCount(0);

    // Geöffnet = gelesen
    await expect(chatList(page).getByRole("link", { name: /^Alle Mitglieder/ })).not.toContainText(
      /ungelesen/,
    );
  });

  test("Helfer und Mitglieder dürfen keine Nachrichten schreiben", async ({ page }) => {
    await login(page, USERS.helfer);
    await open(page, "/nachrichten/neu");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    await expect(page.getByLabel("Betreff")).toHaveCount(0);
  });

  test("Nachrichten anderer Vereine und fremde IDs sind nicht erreichbar; Entwürfe stehen nicht im Chat", async ({
    page,
    browser,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/nachrichten?chat=alle");
    await expect(bubble(page, "Willkommen bei VereinsFlow!")).toBeVisible();
    await expect(bubble(page, /Erinnerung: Helfer für das Sommerfest gesucht/)).toHaveCount(0); // Entwurf
    await expect(page.getByRole("link", { name: /^Entwürfe/ })).toBeVisible();
    const id = (await bubble(page, "Willkommen bei VereinsFlow!").getAttribute("id"))!.replace(
      "nachricht-",
      "",
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, USERS.otherAdmin);
    await otherPage.goto(`/nachrichten/${id}`);
    await expect(otherPage.getByText("Nicht gefunden")).toBeVisible();
    await otherPage.goto("/nachrichten?chat=alle");
    await expect(otherPage.getByText("Liebe Mitglieder")).toHaveCount(0);
    await other.close();
  });
});

test.describe("Nachrichten – Schreiben", () => {
  test("Im Chat schreiben: Rückfrage, grüne Blase rechts, beim Empfänger links mit Namen; Zurückrufen", async ({
    page,
    browser,
  }) => {
    const text = uniqueSubject("Arbeitseinsatz am Samstag");
    await login(page, USERS.admin);
    await open(page, "/nachrichten?chat=alle");
    await expect(page.getByText(/^Erreicht \d+ Personen$/)).toBeVisible();

    const input = page.getByRole("textbox", { name: "Nachricht an Alle Mitglieder" });
    await expect(page.getByRole("button", { name: "Senden" })).toBeDisabled(); // leer geht nichts
    await input.fill(`${text}\nWer kann ab 10 Uhr helfen?`);
    await page.getByRole("button", { name: "Senden" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Nachricht senden?" });
    await expect(confirm).toContainText(/an \d+ Personen im Chat „Alle Mitglieder“/);
    await confirm.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByText(/Nachricht an \d+ Personen gesendet\./)).toBeVisible();
    await expect(input).toHaveValue("");

    // Die erste Zeile wird zum Betreff – in der Blase steht der Text nur einmal.
    const mine = page.getByRole("article", { name: `Nachricht von dir: ${text}` });
    await expect(mine).toContainText("Wer kann ab 10 Uhr helfen?");
    await expect(mine).toContainText(/0 von \d+ gelesen/);

    const marias = await browser.newContext();
    const maria = await marias.newPage();
    await login(maria, USERS.mitglied);
    await open(maria, "/nachrichten?chat=alle");
    await expect(
      maria.getByRole("article", { name: `Nachricht von Anna Admin: ${text}` }),
    ).toContainText("Wer kann ab 10 Uhr helfen?");

    await page.reload();
    await expect(page.getByRole("article", { name: `Nachricht von dir: ${text}` })).toContainText(
      /1 von \d+ gelesen/,
    );
    await page.getByRole("button", { name: `Aktionen für „${text}“` }).click();
    await page.getByRole("menuitem", { name: "Zurückrufen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Zurückrufen" }).click();
    await expect(page.getByText("Nachricht zurückgerufen.")).toBeVisible();
    await expect(page.getByRole("article", { name: `Nachricht von dir: ${text}` })).toHaveCount(0);

    await maria.reload();
    await expect(maria.getByRole("article", { name: new RegExp(text) })).toHaveCount(0);
    await marias.close();
  });

  test("Ausführlich mit Betreff: Validierung, Vorschau, Sicherheitsabfrage, Versand in den Chat, Benachrichtigung", async ({
    page,
    browser,
  }) => {
    const subject = uniqueSubject("E2E Rundmail");
    await login(page, USERS.admin);
    await open(page, "/nachrichten");
    await page.getByRole("link", { name: "Neue Nachricht" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Neue Nachricht" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("status").filter({ hasText: /Erreicht \d+ Personen/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Jetzt senden/ }).click();
    await expect(page.getByText("Bitte gib einen Betreff ein.")).toBeVisible();
    await expect(page.getByText("Bitte schreibe eine Nachricht.")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Schadcode im Text wird nur als Text angezeigt
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByLabel(/^Nachricht/)
      .fill("Hallo zusammen!\n<img src=x onerror=alert('xss')>\nBis bald");
    await page.getByLabel("Als Ankündigung kennzeichnen").check();
    await page.getByRole("button", { name: /Jetzt senden/ }).click();
    const confirm = page.getByRole("alertdialog", { name: "Nachricht jetzt senden?" });
    await expect(confirm).toContainText(subject);
    await expect(confirm).toContainText(/geht an \d+ Personen/);
    await confirm.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByText(/Nachricht an \d+ Personen gesendet\./)).toBeVisible();

    // Weiter im Chat der Gruppe, an der neuen Nachricht.
    await expect(page).toHaveURL(/\/nachrichten\?chat=alle#nachricht-[0-9a-f-]{36}$/);
    const sent = page.getByRole("article", { name: `Nachricht von dir: ${subject}` });
    await expect(sent).toContainText(subject); // eigener Betreff steht fett über dem Text
    await expect(sent).toContainText("Ankündigung");
    await expect(sent.getByText("<img src=x onerror=alert('xss')>")).toBeVisible();
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    expect(dialogs).toEqual([]);
    const id = new URL(page.url()).hash.replace("#nachricht-", "");

    // Maria: Benachrichtigung → der Link führt in den Chat, an die Nachricht.
    const marias = await browser.newContext();
    const maria = await marias.newPage();
    await login(maria, USERS.mitglied);
    await open(maria, "/benachrichtigungen");
    await expect(maria.getByText(`Ankündigung: ${subject}`)).toBeVisible();
    await maria.goto(`/nachrichten/${id}`);
    await expect(maria).toHaveURL(new RegExp(`chat=alle#nachricht-${id}$`));
    await expect(
      maria.getByRole("article", { name: `Nachricht von Anna Admin: ${subject}` }),
    ).toBeVisible();
    await marias.close();

    // Aufräumen: zurückrufen
    await page.getByRole("button", { name: `Aktionen für „${subject}“` }).click();
    await page.getByRole("menuitem", { name: "Zurückrufen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Zurückrufen" }).click();
    await expect(page.getByText("Nachricht zurückgerufen.")).toBeVisible();
  });

  test("Entwurf speichern, wieder öffnen, ändern und verwerfen", async ({ page }) => {
    const subject = uniqueSubject("E2E Entwurf");
    await login(page, USERS.admin);
    await open(page, "/nachrichten/neu");
    await page.getByLabel("Betreff").fill(subject);
    await page.getByLabel(/^Nachricht/).fill("Noch nicht fertig.");
    await page.getByRole("button", { name: "Als Entwurf speichern" }).click();
    await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();
    await expect(page).toHaveURL(/ansicht=entwuerfe/);

    const draft = page.getByRole("link", { name: new RegExp(subject) });
    await expect(draft).toContainText("Entwurf");
    await draft.click();
    await expect(page.getByRole("heading", { level: 1, name: "Entwurf bearbeiten" })).toBeVisible();
    await expect(page.getByLabel("Betreff")).toHaveValue(subject);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Betreff").fill(`${subject} (überarbeitet)`);
    await page.getByRole("button", { name: "Als Entwurf speichern" }).click();
    await expect(
      page.getByRole("link", { name: new RegExp(`${subject} \\(überarbeitet\\)`) }),
    ).toBeVisible();

    // Verwerfen (auf der Seite des Entwurfs)
    await page.getByRole("link", { name: new RegExp(`${subject} \\(überarbeitet\\)`) }).click();
    await expect(page).toHaveURL(/\/nachrichten\/neu\?entwurf=/);
    const id = new URL(page.url()).searchParams.get("entwurf")!;
    await page.goto(`/nachrichten/${id}`);
    await page.getByRole("button", { name: "Entwurf verwerfen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Verwerfen" }).click();
    await expect(page.getByText("Entwurf verworfen.")).toBeVisible();
    await expect(page).toHaveURL(/ansicht=entwuerfe/);
    await expect(page.getByRole("link", { name: new RegExp(subject) })).toHaveCount(0);
  });

  test("Abteilungsleiterin: keine Nachricht an alle, nur an die eigene Abteilung", async ({
    page,
  }) => {
    await login(page, USERS.abteilung);
    await open(page, "/nachrichten?chat=alle");
    await expect(
      page.getByText("In diesem Chat schreiben nur Vorstand und Verwaltung."),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Nachricht an/ })).toHaveCount(0);

    await open(page, "/nachrichten/neu");
    const audience = page.getByLabel(/^An wen\?/);
    await expect(audience.locator("option")).toHaveText([
      "Eine Abteilung",
      "Zugesagte Teilnehmer einer Veranstaltung",
      "Eingetragene Helfer einer Veranstaltung",
    ]);
    await expect(page.getByLabel(/^Abteilung/).locator("option")).toHaveText([
      "Bitte wählen",
      "Fußball",
    ]);
    await expect(page.getByRole("status").filter({ hasText: /Erreicht \d+ Person/ })).toBeVisible();
  });
});
