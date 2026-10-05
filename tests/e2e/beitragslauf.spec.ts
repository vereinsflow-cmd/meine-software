import { expect, test } from "@playwright/test";
import { violations } from "./axe";
import { USERS, ensureLedger, login, open } from "./helpers";

/**
 * Beitragslauf im Browser (Etappe 7): Prüfen, Vorschau, Erstellen – danach stehen die Beiträge unter „Offene Beiträge“,
 * ein zweiter Lauf hätte nichts mehr zu tun, und rückgängig streicht alles wieder (die Seite bleibt für die folgenden
 * Tests im Ausgangszustand). Mitglieder kommen nicht hinein.
 */

test.describe("Beitragslauf – Kassenwart", () => {
  test("Prüfen, Vorschau, Erstellen; Offene Beiträge; rückgängig", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, USERS.vorstand);
    await ensureLedger(page);

    await open(page, "/finanzen/beitraege/lauf");
    await expect(page.getByRole("heading", { name: /^Beitragslauf \S+/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schritt 1: Prüfen" })).toBeVisible();
    expect(await violations(page), "Schritt 1").toEqual([]);

    await page.getByRole("link", { name: "Weiter zur Vorschau" }).click();
    await expect(page.getByRole("heading", { name: /^Vorschau: \d+ Beiträge?$/ })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Familie Krüger" })).toContainText(
      /Zahler: Sophie Krüger/,
    );
    expect(await violations(page), "Schritt 2").toEqual([]);
    // Filter „Lastschrift“: nur Lastschrift-Zeilen.
    await page.getByRole("link", { name: /^Lastschrift \d+$/ }).click();
    await expect(page).toHaveURL(/filter=lastschrift/);
    await page.getByRole("link", { name: /^Alle \d+$/ }).click();

    const create = page.getByRole("button", { name: /^\d+ Beiträge? erstellen$/ });
    const label = (await create.textContent())!.trim();
    await create.click();
    await page.getByRole("alertdialog").getByRole("button", { name: label }).click();
    await expect(page).toHaveURL(/\/finanzen\/beitraege\/laeufe\//, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Beitragslauf rückgängig" })).toBeVisible();
    // Erst wenn die Meldung „Beiträge erstellt.“ verschwunden ist: Beim Einblenden ist sie noch halb durchsichtig.
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
    expect(await violations(page), "Lauf").toEqual([]);
    const runUrl = page.url();

    await open(page, "/finanzen/beitraege/offen");
    const familyRow = page.getByRole("row").filter({ hasText: "Familie Krüger" });
    await expect(familyRow).toContainText("zahlt: Sophie Krüger");
    await familyRow.getByRole("link", { name: "Familie Krüger" }).click();
    await expect(page.getByRole("heading", { name: "So wird gerechnet" })).toBeVisible();
    expect(await violations(page), "Beitrag").toEqual([]);

    // Ein zweiter Lauf hätte nichts mehr zu tun.
    await open(page, "/finanzen/beitraege/lauf");
    await expect(page.getByText(/ist nichts \(mehr\) zu erstellen/)).toBeVisible();

    // Rückgängig: alles gestrichen.
    await page.goto(runUrl);
    await page.getByRole("button", { name: "Beitragslauf rückgängig" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Grund").fill("E2E-Test");
    await dialog.getByRole("button", { name: "Rückgängig machen" }).click();
    await expect(page.getByText(/Rückgängig gemacht am .*: E2E-Test/)).toBeVisible();
    await open(page, "/finanzen/beitraege/offen?status=gestrichen");
    await expect(page.getByRole("row").filter({ hasText: "Familie Krüger" })).toContainText(
      "gestrichen",
    );
  });
});

test.describe("Beitragslauf – ohne Finanzrecht", () => {
  test("Mitglied sieht weder den Lauf noch offene Beiträge", async ({ page }) => {
    await login(page, USERS.mitglied);
    await open(page, "/finanzen/beitraege/lauf");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    await open(page, "/finanzen/beitraege/offen");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
  });
});
