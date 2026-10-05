import { expect, test } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/**
 * Beiträge im Browser (Etappe 5): „Wer zahlt was“ mit den Beitragsarten aus dem Seed (Jugend, Passiv, Erwachsene) und
 * Claudias 50 % als Übungsleiterin, eine neue Beitragsart, eine Befreiung auf der Seite eines Mitglieds. Mitglieder sehen
 * weder die Seite noch die Karte „Beitrag“.
 */

test.describe("Beiträge – Kassenwart", () => {
  test("Wer zahlt was: Betrag mit Erklärung, Ermäßigung, beitragsfreie Ehrenmitglieder", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/beitraege");
    await expect(page.getByRole("heading", { level: 1, name: "Finanzen" })).toBeVisible();
    await expect(page.getByText(/Wer zahlt was im \d\. Quartal \d{4}/).first()).toBeVisible();
    const claudia = page.getByRole("row").filter({ hasText: "Claudia" });
    await expect(claudia).toContainText("18,00");
    await expect(claudia).toContainText(/50\s?% ermäßigt \(Übungsleiterin\)/);
    await expect(page.getByRole("heading", { name: "Beitragsfrei" })).toBeVisible();
    // Zeitraum wechseln.
    await page.getByRole("link", { name: /Nächster Zeitraum/ }).click();
    await expect(page).toHaveURL(/zeitraum=/);
  });

  test("Beitragsart anlegen: erscheint in der Reihenfolge der Grundbeiträge", async ({ page }) => {
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/beitraege/arten");
    await page.getByRole("button", { name: "Beitragsart anlegen" }).click();
    const dialog = page.getByRole("dialog", { name: "Beitragsart anlegen" });
    await dialog.getByLabel("Name").fill("E2E Fördermitglieder");
    await dialog.getByLabel("Passive").check();
    await dialog.getByLabel("Betrag in €").fill("3,00");
    await dialog.getByRole("button", { name: "Beitragsart anlegen" }).click();
    await expect(dialog).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: "E2E Fördermitglieder" });
    await expect(row).toContainText("4.");
    await expect(row).toContainText("3,00 € im Monat");
  });

  test("Befreiung beim Mitglied: Karte „Beitrag“ zeigt beitragsfrei", async ({ page }) => {
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/beitraege");
    await page.getByRole("row").filter({ hasText: "Hans" }).getByRole("link").first().click();
    const card = page
      .getByRole("heading", { name: "Beitrag" })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(card).toContainText(/\d+,\d{2}\s€/);
    await card.getByRole("button", { name: "Ermäßigung oder Befreiung" }).click();
    const dialog = page.getByRole("dialog", { name: "Beitrag anpassen" });
    await dialog.getByLabel("Was gilt?").selectOption({ label: "Beitragsfrei" });
    await dialog.getByLabel("Grund").fill("E2E Härtefall");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toContainText(/beitragsfrei/i);
    await expect(card).toContainText("E2E Härtefall");
  });
});

test.describe("Beiträge – ohne Finanzrecht", () => {
  test("Mitglied sieht weder Beiträge noch die Karte „Beitrag“", async ({ page }) => {
    await login(page, USERS.mitglied);
    await open(page, "/finanzen/beitraege");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    await open(page, "/profil");
    await expect(page.getByRole("heading", { name: "Beitrag" })).toHaveCount(0);
  });
});
