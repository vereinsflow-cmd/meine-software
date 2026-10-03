import { expect, test } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login } from "./helpers";

/**
 * Druckansicht des Helferplans (`/helferplanung/drucken`): erreichbar über einen gut sichtbaren Button, mit
 * Veranstaltungen-/Zeitraum-/Schichten-Filtern, und beim Drucken selbst ohne Menü/Formular. Je Veranstaltung ein Aushang
 * zum Eintragen und eine Anwesenheitsliste (seit 03.10.2026). Nutzt die Seed-Daten der E2E-Datenbank (Sommerfest 2026 mit
 * mehreren Schichten, Arbeitseinsatz Vereinsheim mit einer noch unbesetzten Schicht „Malerarbeiten“) – verändert nichts,
 * daher keine Aufräumschritte nötig.
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

  test("zeigt ohne Auswahl alle kommenden Veranstaltungen mit Helferbedarf: je ein Aushang und eine Anwesenheitsliste", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    // Im Ausdruck suchen (Solange React die gestreamte Seite noch nicht eingeblendet hat, liegt eine unsichtbare Kopie
    // außerhalb des Hauptbereichs – die darf nicht als zweiter Treffer zählen.)
    const printout = page.getByRole("main").locator("#helferplan-ausdruck");
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Arbeitseinsatz Vereinsheim" })).toBeVisible();
    // Jeder Aushang trägt Vereinsname und „Helferplan“; die Vorschau deutet Kopf- und Fußzeile des Papiers an.
    await expect(
      printout.getByText("TSV Musterstadt 1898 e.V.", { exact: true }).first(),
    ).toBeVisible();
    await expect(printout.getByText("Helferplan", { exact: true }).first()).toBeVisible();
    await expect(printout.getByText(/Erstellt am \d{2}\.\d{2}\.\d{4}/).first()).toBeVisible();

    const sommerfest = page.getByRole("region", { name: "Sommerfest 2026" });
    await expect(sommerfest.getByText(/Wir brauchen noch\s*\d+\s*Helfer/)).toBeVisible();
    await expect(sommerfest.getByText("So machst du mit")).toBeVisible();
    // Ansprechpartner der Veranstaltung (im Seed als Mitglied gewählt) und das Mindestalter am Grillstand (18)
    await expect(sommerfest.getByText("Fragen? Ansprechpartner")).toBeVisible();
    await expect(sommerfest.getByText("Bernd Vorstand").first()).toBeVisible();
    await expect(sommerfest.getByRole("article", { name: "Grillstand" })).toContainText(
      "Mindestalter ab 18 Jahren",
    );
    await expect(
      sommerfest.getByRole("heading", { name: "Anwesenheit (für Verantwortliche)" }),
    ).toBeVisible();
    // Je Veranstaltung ein Aushang und eine Anwesenheitsliste.
    const events = await page
      .getByRole("main")
      .locator("#helferplan-ausdruck")
      .getByRole("region")
      .count();
    await expect(
      page.getByRole("main").getByText(`· ${events} Aushänge und ${events} Anwesenheitslisten`),
    ).toBeVisible();
  });

  test("eine Schicht ohne Helfer trägt den Stempel „Noch nicht besetzt“ und Schreiblinien; die Anwesenheitsliste leere Zeilen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    const main = page.getByRole("main");
    const tile = main.getByRole("article", { name: "Malerarbeiten" });
    await expect(tile).toBeVisible();
    await expect(tile).toContainText("Noch nicht besetzt");
    await expect(tile.getByText("Name:").first()).toBeVisible();
    // Schreiblinien sind für Screenreader als „frei“ beschriftet, die Linie selbst ist verborgen.
    await expect(tile.getByRole("listitem").first()).toContainText("frei");

    const table = main.getByRole("table", { name: /Malerarbeiten/ });
    await expect(table).toContainText(/0 von \d+ besetzt/);
    await expect(table.getByRole("cell", { name: "frei", exact: true }).first()).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Anwesend" })).toBeVisible();
  });

  test("„Was drucken?“: nur den Aushang oder nur die Anwesenheitsliste", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    const main = page.getByRole("main");
    await page.getByRole("radio", { name: "Nur Aushang" }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page).toHaveURL(/inhalt=aushang/);
    await expect(main.getByText(/Wir brauchen noch/).first()).toBeVisible();
    await expect(main.getByRole("heading", { name: /Anwesenheit/ })).toHaveCount(0);
    const events = await page
      .getByRole("main")
      .locator("#helferplan-ausdruck")
      .getByRole("region")
      .count();
    await expect(
      main.getByText(`· ${events} ${events === 1 ? "Aushang" : "Aushänge"}`),
    ).toBeVisible();

    await page.getByRole("radio", { name: "Nur Anwesenheitsliste" }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page).toHaveURL(/inhalt=anwesenheit/);
    // Ohne Aushang trägt die Liste selbst die Überschrift der Veranstaltung.
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Sommerfest 2026" })
        .getByRole("heading", { name: "Anwesenheit (für Verantwortliche)" }),
    ).toBeVisible();
    // Erst prüfen, wenn die neue Ansicht da ist – sonst wäre „nicht vorhanden“ schon vor dem Laden wahr.
    await expect(main.getByText(/Wir brauchen noch/)).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Nur Anwesenheitsliste" })).toBeChecked();
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
    // Seed: Arbeitseinsatz am nächsten Samstag (in 1–7 Tagen), Sommerfest eine Woche später (in 8–14 Tagen).
    // „Bis“ in 7 Tagen (einschließlich) trennt beide an jedem Wochentag – auch samstags, wenn der Arbeitseinsatz
    // erst in genau 7 Tagen ist. Gerechnet in Berliner Zeit wie im Seed.
    const bis = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("sv-SE", {
      timeZone: "Europe/Berlin",
    });
    await page.getByLabel("Bis").fill(bis);
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page.getByRole("heading", { name: "Arbeitseinsatz Vereinsheim" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toHaveCount(0);
  });

  test("„Nur freie Plätze“ blendet voll besetzte Schichten aus", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    await expect(page.getByRole("main").locator("h3", { hasText: "Aufbau" })).toBeVisible(); // 5 von 5 besetzt
    await page.getByRole("checkbox", { name: "Nur freie Plätze" }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page.getByRole("main").locator("h3", { hasText: "Aufbau" })).toHaveCount(0);
    await expect(page.getByRole("main").locator("h3", { hasText: "Grillstand" })).toBeVisible(); // hat freie Plätze
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
    await expect(page.getByRole("link", { name: "Zurücksetzen", exact: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Nur freie Plätze" }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page).toHaveURL(/nurOffen=1/);
    await page.getByRole("link", { name: "Zurücksetzen", exact: true }).click();
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
    await expect(page.getByRole("main").getByText(/^Vorschau ·/)).toBeHidden();
    // Der eigentliche Ausdruck bleibt sichtbar; die angedeutete Kopf- und Fußzeile kommt beim Drucken aus `@page`.
    const printout = page.getByRole("main").locator("#helferplan-ausdruck");
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
    await expect(
      printout.locator("header").getByText("TSV Musterstadt 1898 e.V.", { exact: true }).first(),
    ).toBeVisible();
    await expect(printout.getByText(/Erstellt am/).first()).toBeHidden();
    // Zarte Tönungen werden mitgedruckt, auch ohne „Hintergrundgrafiken“ im Druckfenster.
    expect(await printout.evaluate((el) => getComputedStyle(el).printColorAdjust)).toBe("exact");
  });

  test("enthält keine Kontaktdaten der Helfer und keine Bedienelemente in den Ergebniszeilen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    const printout = page.getByRole("main").locator("#helferplan-ausdruck");
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
    await expect(printout.getByRole("button")).toHaveCount(0);
    await expect(printout.getByRole("link")).toHaveCount(0);
    // Keine E-Mail-Adressen der Helfer (Seed: …@demo-verein.local), obwohl ihre Namen draufstehen.
    await expect(printout.getByText("Hans Helfer").first()).toBeVisible();
    expect(await printout.textContent()).not.toContain("@demo-verein.local");
  });

  test("ohne kommende Schichten in der gewählten Auswahl: freundlicher Hinweis statt leerer Seite", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const weitWeg = new Date();
    weitWeg.setFullYear(weitWeg.getFullYear() + 5);
    await page.goto(`/helferplanung/drucken?von=${weitWeg.toISOString().slice(0, 10)}`);
    await expect(page.getByRole("main").getByText("Nichts zum Drucken")).toBeVisible();
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
