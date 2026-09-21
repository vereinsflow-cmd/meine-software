import { expect, test } from "@playwright/test";
import { USERS, login, open } from "./helpers";

const uniqueSubject = (prefix: string) => `${prefix} ${Date.now() % 100000}`;

test.describe("Nachrichten – Empfänger", () => {
  test("Posteingang zeigt die Willkommensnachricht; Ungelesenes ist markiert und wird beim Öffnen gelesen", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await open(page, "/nachrichten");
    await expect(page.getByRole("heading", { level: 1, name: "Nachrichten" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Neue Nachricht/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Neue Nachricht" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Ansicht wählen" })).toHaveCount(0); // keine Reiter ohne Sende-Recht

    const message = page.getByRole("link", { name: /Willkommen bei VereinsFlow!/ });
    await expect(message).toContainText("Ungelesen");
    await expect(message).toContainText("Ankündigung");
    await expect(message).toContainText("Von Anna Admin");

    await message.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Willkommen bei VereinsFlow!" }),
    ).toBeVisible();
    await expect(page.getByText("Liebe Mitglieder,")).toBeVisible();
    await expect(page.getByText(/Von Anna Admin/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Zurückrufen/ })).toHaveCount(0); // Empfänger dürfen nicht zurückrufen
    await expect(page.getByText(/Empfängern haben die Nachricht geöffnet/)).toHaveCount(0); // keine Statistik für Empfänger

    await page.getByRole("link", { name: "Nachrichten" }).first().click();
    await expect(page.getByRole("link", { name: /Willkommen bei VereinsFlow!/ })).not.toContainText(
      "Ungelesen",
    );
  });

  test("Helfer und Mitglieder dürfen keine Nachrichten schreiben", async ({ page }) => {
    await login(page, USERS.helfer);
    await open(page, "/nachrichten/neu");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    await expect(page.getByLabel("Betreff")).toHaveCount(0);
  });

  test("Nachrichten anderer Vereine und fremde IDs sind nicht erreichbar", async ({
    page,
    browser,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/nachrichten");
    const href = await page
      .getByRole("link", { name: /Erinnerung: Helfer für das Sommerfest gesucht/ })
      .count(); // (Entwurf – nur unter "Entwürfe")
    expect(href).toBe(0);
    await open(page, "/nachrichten?ansicht=gesendet");
    const url = await page
      .getByRole("link", { name: /Willkommen bei VereinsFlow!/ })
      .getAttribute("href");
    expect(url).toMatch(/^\/nachrichten\/[0-9a-f-]{36}$/);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, USERS.otherAdmin);
    await otherPage.goto(url!);
    await expect(otherPage.getByText("Nicht gefunden")).toBeVisible();
    await expect(otherPage.getByText("Liebe Mitglieder")).toHaveCount(0);
    await other.close();
  });
});

test.describe("Nachrichten – Verfassen und Senden", () => {
  test("Validierung, Empfänger-Vorschau, Sicherheitsabfrage, Versand, Lesestatistik und Rückruf", async ({
    page,
    browser,
  }) => {
    const subject = uniqueSubject("E2E Rundmail");
    await login(page, USERS.admin);
    await open(page, "/nachrichten");
    await page.getByRole("link", { name: "Neue Nachricht" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Neue Nachricht" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Vorschau der Zielgruppe (alle Mitglieder mit aktivem Konto außer dem Absender)
    await expect(
      page.getByRole("status").filter({ hasText: /Erreicht \d+ Personen/ }),
    ).toBeVisible();

    // Ohne Betreff und Text wird nichts gesendet
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
    await expect(page).toHaveURL(/\/nachrichten\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
    await expect(page.getByText("<img src=x onerror=alert('xss')>")).toBeVisible(); // als Text, nicht als Bild
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    await expect(
      page.getByText(/^0 von \d+ Empfängern haben die Nachricht geöffnet/),
    ).toBeVisible();
    expect(dialogs).toEqual([]);
    const messageUrl = page.url();

    // Maria wird benachrichtigt, findet die Nachricht ungelesen im Posteingang und öffnet sie.
    const marias = await browser.newContext();
    const maria = await marias.newPage();
    await login(maria, USERS.mitglied);
    await open(maria, "/benachrichtigungen");
    await expect(maria.getByText(`Ankündigung: ${subject}`)).toBeVisible();
    await open(maria, "/nachrichten");
    await expect(maria.getByRole("link", { name: new RegExp(subject) })).toContainText("Ungelesen");
    await maria.goto(messageUrl);
    await expect(maria.getByRole("heading", { level: 1, name: subject })).toBeVisible();

    // Die Statistik des Absenders zählt jetzt einen Leser – ohne Namen.
    await page.reload();
    await expect(
      page.getByText(/^1 von \d+ Empfängern haben die Nachricht geöffnet/),
    ).toBeVisible();

    // Rückruf: verschwindet bei Maria
    await page.getByRole("button", { name: "Zurückrufen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Zurückrufen" }).click();
    await expect(page.getByText("Nachricht zurückgerufen.")).toBeVisible();
    await expect(page).toHaveURL(/\/nachrichten$/);
    await open(maria, "/nachrichten");
    await expect(maria.getByRole("link", { name: new RegExp(subject) })).toHaveCount(0);
    await maria.goto(messageUrl);
    await expect(maria.getByText("Nicht gefunden")).toBeVisible();
    await marias.close();
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

    // Verwerfen (auf der Detailseite des Entwurfs ist der Verfasser berechtigt)
    await page.goto("/nachrichten?ansicht=entwuerfe");
    await page.getByRole("link", { name: new RegExp(`${subject} \\(überarbeitet\\)`) }).click();
    await expect(page).toHaveURL(/\/nachrichten\/neu\?entwurf=/);
    const id = new URL(page.url()).searchParams.get("entwurf")!;
    await page.goto(`/nachrichten/${id}`);
    await page.getByRole("button", { name: "Entwurf verwerfen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Verwerfen" }).click();
    await expect(page.getByText("Entwurf verworfen.")).toBeVisible();
    await page.goto("/nachrichten?ansicht=entwuerfe");
    await expect(page.getByRole("link", { name: new RegExp(subject) })).toHaveCount(0);
  });

  test("Abteilungsleiterin: keine Nachricht an alle, nur an die eigene Abteilung", async ({
    page,
  }) => {
    await login(page, USERS.abteilung);
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
