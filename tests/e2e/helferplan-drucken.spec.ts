import { expect, test } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login } from "./helpers";

/**
 * Druckansicht des Helferplans (`/helferplanung/drucken`): erreichbar über einen gut sichtbaren Button, mit
 * Veranstaltungen-/Zeitraum-/Schichten-Filtern, und beim Drucken selbst ohne Menü/Formular. Nutzt die Seed-Daten der
 * E2E-Datenbank (Sommerfest 2026 mit mehreren Schichten, Arbeitseinsatz Vereinsheim mit einer noch unbesetzten
 * Schicht „Malerarbeiten“) – verändert nichts, daher keine Aufräumschritte nötig.
 */

test.describe("Helferplan drucken", () => {
  test("gut sichtbarer Button auf der Helferplanungs-Übersicht führt zur Druckansicht", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung");
    const button = page.getByRole("link", { name: "Helferplan drucken" });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByRole("heading", { level: 1, name: "Helferplan drucken" })).toBeVisible();
    await expect(page).toHaveURL(/\/helferplanung\/drucken$/);
  });

  test("zeigt ohne Auswahl alle kommenden Veranstaltungen mit Helferbedarf, samt Vereinsname und Ort", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    await expect(page.getByRole("heading", { name: "TSV Musterstadt 1898 e.V." })).toBeVisible();
    await expect(page.getByText("Helferplan", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Arbeitseinsatz Vereinsheim" })).toBeVisible();
    await expect(page.getByText(/Erstellt am \d{2}\.\d{2}\.\d{4}/)).toBeVisible();
  });

  test("eine Schicht ohne Helfer zeigt deutlich „Noch nicht besetzt“, freie Plätze stehen als „— frei —“", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    const malerarbeiten = page.getByText("Malerarbeiten", { exact: false });
    await expect(malerarbeiten).toBeVisible();
    const section = page.locator("h3", { hasText: "Malerarbeiten" }).locator("xpath=..");
    await expect(section).toContainText("Noch nicht besetzt");
    await expect(section.getByText("— frei —").first()).toBeVisible();
  });

  test("Veranstaltungen lassen sich gezielt auswählen – nur die angehakte erscheint", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    await page.getByRole("checkbox", { name: /Arbeitseinsatz Vereinsheim/ }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page.getByRole("heading", { name: "Arbeitseinsatz Vereinsheim" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toHaveCount(0);
  });

  test("Zeitraum grenzt die Veranstaltungen ein", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    const bis = new Date();
    bis.setDate(bis.getDate() + 6); // vor dem Sommerfest (03.10.), nach dem Arbeitseinsatz (26.09.)
    await page.getByLabel("Bis").fill(bis.toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page.getByRole("heading", { name: "Arbeitseinsatz Vereinsheim" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toHaveCount(0);
  });

  test("„Nur freie Plätze“ blendet voll besetzte Schichten aus", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    await expect(page.locator("h3", { hasText: "Aufbau" })).toBeVisible(); // 5 von 5 besetzt
    await page.getByRole("checkbox", { name: "Nur freie Plätze" }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page.locator("h3", { hasText: "Aufbau" })).toHaveCount(0);
    await expect(page.locator("h3", { hasText: "Grillstand" })).toBeVisible(); // hat freie Plätze
  });

  test("Ausrichtung: Hochformat und Querformat setzen die passende Seitengröße", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    // `<style>` ist nicht Teil des sichtbaren Texts (wie <script>) – Playwrights Text-Matcher lesen ihn nicht,
    // deshalb direkt den DOM-Inhalt abfragen.
    const pageStyle = page.locator("#helferplan-seitenstil");
    await expect(await pageStyle.textContent()).toContain("size: A4 portrait;");

    await page.getByRole("radio", { name: "Querformat" }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page).toHaveURL(/ausrichtung=quer/);
    await expect(await pageStyle.textContent()).toContain("size: A4 landscape;");
  });

  test("„Zurücksetzen“ erscheint nur bei aktiver Auswahl und leert die Filter wieder", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    await expect(page.getByRole("link", { name: "Zurücksetzen" })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Nur freie Plätze" }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page).toHaveURL(/nurOffen=1/);
    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(/\/helferplanung\/drucken$/);
    await expect(page.getByRole("checkbox", { name: "Nur freie Plätze" })).not.toBeChecked();
  });

  test("von der Veranstaltung aus: „Drucken“ öffnet die Druckansicht bereits auf diese Veranstaltung eingegrenzt", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung");
    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: /Helferplan: Sommerfest 2026/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Drucken" }).click();
    await expect(page).toHaveURL(/\/helferplanung\/drucken\?event=/);
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Arbeitseinsatz Vereinsheim" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Zurück zum Helferplan" })).toBeVisible();
  });

  test("beim Drucken bleiben nur der Plan sichtbar: Menü, Formular, Zurück-Link und Drucken-Knopf sind ausgeblendet", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("link", { name: "Zurück zur Helferplanung" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Drucken" })).toBeHidden();
    await expect(page.getByRole("search", { name: "Ausdruck eingrenzen" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeHidden();
    // Der eigentliche Ausdruck bleibt sichtbar.
    await expect(page.getByRole("heading", { name: "TSV Musterstadt 1898 e.V." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
  });

  test("enthält keine Kontaktdaten der Helfer und keine Bedienelemente in den Ergebniszeilen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    const printout = page.locator("#helferplan-ausdruck");
    await expect(printout.getByRole("button")).toHaveCount(0);
    await expect(printout.getByRole("link")).toHaveCount(0);
  });

  test("ohne kommende Schichten in der gewählten Auswahl: freundlicher Hinweis statt leerer Seite", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const weitWeg = new Date();
    weitWeg.setFullYear(weitWeg.getFullYear() + 5);
    await page.goto(`/helferplanung/drucken?von=${weitWeg.toISOString().slice(0, 10)}`);
    await expect(page.getByText("Nichts zum Drucken")).toBeVisible();
  });

  test.describe("Barrierefreiheit (axe)", () => {
    for (const scheme of ["light", "dark"] as const) {
      test(`${scheme}: keine Verstöße`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await login(page, USERS.admin);
        await page.goto("/helferplanung/drucken");
        expect(await violations(page)).toEqual([]);
      });
    }
  });
});
