import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, USERS, login, open } from "./helpers";

test.describe("Profil", () => {
  test("Seite zeigt Angaben, Vereine, Geräte – Name lässt sich ändern und wieder zurücksetzen", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await open(page, "/profil");
    await expect(page.getByRole("heading", { level: 1, name: "Mein Profil" })).toBeVisible();
    await expect(page.getByText(USERS.helfer)).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Meine Vereine" }).getByText("TSV Musterstadt 1898 e.V."),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Angemeldete Geräte" }).getByText("Dieses Gerät"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Zwei-Faktor-Authentifizierung" })
        .getByText("Nicht eingerichtet"),
    ).toBeVisible();

    const firstName = page.getByLabel("Vorname");
    await expect(firstName).toHaveValue("Hans");
    await firstName.fill("Hans-Peter");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Dein Name wurde gespeichert.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Benutzermenü/ })).toContainText("Hans-Peter"); // Name im Menü aktualisiert

    await page.getByLabel("Vorname").fill("Hans");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("button", { name: /Benutzermenü/ })).not.toContainText(
      "Hans-Peter",
    );
  });

  test("Validierung: leerer Name wird an den Feldern gemeldet", async ({ page }) => {
    await login(page, USERS.helfer);
    await open(page, "/profil");
    await page.getByLabel("Vorname").fill("");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Bitte gib deinen Vornamen ein.")).toBeVisible();
  });

  test("E-Mail-Benachrichtigungen umschalten (und wieder zurück)", async ({ page }) => {
    await login(page, USERS.helfer);
    await open(page, "/profil");
    const toggle = page.getByRole("switch", { name: "E-Mail-Benachrichtigungen" });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page.getByText("E-Mail-Benachrichtigungen sind ausgeschaltet.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("switch", { name: "E-Mail-Benachrichtigungen" })).not.toBeChecked();
    await page.getByRole("switch", { name: "E-Mail-Benachrichtigungen" }).click();
    await expect(page.getByText("E-Mail-Benachrichtigungen sind eingeschaltet.")).toBeVisible();
  });

  test("Passwort ändern: falsches Passwort und abweichende Wiederholung werden abgelehnt; Änderung und Rückänderung funktionieren", async ({
    page,
  }) => {
    const changed = "Ein-Ganz-Anderes-Passwort-2027!";
    await login(page, USERS.mehrfach);
    await open(page, "/profil");
    const form = page.getByRole("region", { name: "Passwort ändern" });

    // "Neues Passwort" (ohne "wiederholen") – das Pflichtfeld-Sternchen gehört zum Label-Text, daher kein exakter Vergleich.
    const newPassword = form.getByLabel(/^Neues Passwort(?! wiederholen)/);
    await form.getByLabel("Aktuelles Passwort").fill("falsches-Passwort-123");
    await newPassword.fill(changed);
    await form.getByLabel("Neues Passwort wiederholen").fill(changed);
    await form.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(form.getByText("Das aktuelle Passwort ist nicht korrekt.")).toBeVisible();

    await form.getByLabel("Aktuelles Passwort").fill(DEMO_PASSWORD);
    await form.getByLabel("Neues Passwort wiederholen").fill("etwas-anderes-Passwort-1!");
    await form.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(form.getByText("Die Passwörter stimmen nicht überein.")).toBeVisible();

    // Erfolgreich ändern …
    await form.getByLabel("Neues Passwort wiederholen").fill(changed);
    await form.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(page.getByText(/Dein Passwort wurde geändert/)).toBeVisible();

    // … und zurück auf das Demo-Passwort, damit andere Tests weiter funktionieren.
    await form.getByLabel("Aktuelles Passwort").fill(changed);
    await newPassword.fill(DEMO_PASSWORD);
    await form.getByLabel("Neues Passwort wiederholen").fill(DEMO_PASSWORD);
    await form.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(page.getByText(/Dein Passwort wurde geändert/).last()).toBeVisible();
  });

  test("Geräte: Anmeldung auf einem zweiten Gerät erscheint in der Liste und lässt sich von dort aus beenden", async ({
    page,
    browser,
  }) => {
    await login(page, USERS.mitglied);
    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await login(secondPage, USERS.mitglied);

    // Frühere Tests haben für dieselbe Person weitere Sitzungen angelegt – darum zählen wir relativ, nicht absolut.
    await open(page, "/profil");
    const devices = page.getByRole("region", { name: "Angemeldete Geräte" });
    const total = await devices.getByRole("listitem").count();
    expect(total).toBeGreaterThanOrEqual(2); // dieses und das zweite Gerät
    await expect(devices.getByText("Dieses Gerät")).toHaveCount(1);

    await devices.getByRole("button", { name: "Auf allen anderen Geräten abmelden" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByText("Alle anderen Geräte wurden abgemeldet.")).toBeVisible();
    await expect(devices.getByRole("listitem")).toHaveCount(1);

    // Das zweite Gerät ist abgemeldet.
    await secondPage.goto("/dashboard");
    await expect(secondPage).toHaveURL(/\/anmelden/);
    await second.close();

    // Das erste bleibt angemeldet.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /Willkommen, Maria/ })).toBeVisible();
  });

  test("einzelnes Gerät abmelden", async ({ page, browser }) => {
    await login(page, USERS.abteilung);
    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await login(secondPage, USERS.abteilung);

    await open(page, "/profil");
    const devices = page.getByRole("region", { name: "Angemeldete Geräte" });
    const before = await devices.getByRole("listitem").count();
    expect(before).toBeGreaterThanOrEqual(2);

    // Erst alle anderen beenden, dann zwei frische Sitzungen anlegen und gezielt nur EINE davon abmelden.
    await devices.getByRole("button", { name: "Auf allen anderen Geräten abmelden" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Abmelden" }).click();
    await expect(devices.getByRole("listitem")).toHaveCount(1);
    const third = await browser.newContext();
    await login(await third.newPage(), USERS.abteilung);
    await page.reload();
    await expect(devices.getByRole("listitem")).toHaveCount(2);

    await devices
      .getByRole("button", { name: /abmelden$/ })
      .first()
      .click();
    await expect(page.getByText("Das Gerät wurde abgemeldet.")).toBeVisible();
    await expect(devices.getByRole("listitem")).toHaveCount(1);

    const thirdPage = third.pages()[0]!;
    await thirdPage.goto("/dashboard");
    await expect(thirdPage).toHaveURL(/\/anmelden/);
    await third.close();
    await second.close();
  });
});
