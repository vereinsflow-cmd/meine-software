import { expect, test } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open } from "./helpers";

/** Barrierefreiheit (axe, WCAG 2.1 A/AA) aller Seiten – Einzelheiten und Grenzen der Prüfung stehen in `axe.ts`. */

const publicPages = ["/anmelden", "/passwort-vergessen", "/impressum", "/datenschutzerklaerung"];

const adminPages = [
  "/dashboard",
  "/mitglieder",
  "/mitglieder/neu",
  "/mitglieder/statistik",
  "/mitglieder/import",
  "/mitglieder/antraege",
  "/mitglieder/antraege/aushang",
  "/veranstaltungen",
  "/veranstaltungen/neu",
  "/helferplanung",
  "/helferplanung/stunden",
  "/kalender",
  "/kalender?ansicht=woche",
  "/kalender?ansicht=liste",
  "/aufgaben",
  "/nachrichten",
  "/nachrichten?chat=alle", // geöffneter Chat: Sprechblasen, Eingabezeile
  "/nachrichten/neu",
  "/dokumente",
  "/abteilungen",
  "/benutzer",
  "/einstellungen",
  "/einrichtung?schritt=abteilungen",
  "/einrichtung?schritt=mitglieder",
  "/einrichtung?schritt=vorstand",
  "/einrichtung?schritt=abschluss",
  "/protokoll",
  "/finanzen",
  "/finanzen/kassenbuch",
  "/finanzen/rechnungen",
  "/finanzen/beitraege",
  "/finanzen/beitraege/arten",
  "/finanzen/beitraege/familien",
  "/finanzen/abschluss",
  "/finanzen/einstellungen",
  "/hilfe",
  "/hilfe/meldungen",
  "/profil",
  "/datenschutz",
  "/benachrichtigungen",
];

test.describe("Barrierefreiheit (axe) – öffentliche Seiten", () => {
  for (const path of publicPages) {
    test(path, async ({ page }) => {
      await open(page, path);
      expect(await violations(page)).toEqual([]);
    });
  }
});

test.describe("Barrierefreiheit (axe) – angemeldet als Vereinsadministrator", () => {
  for (const path of adminPages) {
    test(path, async ({ page }) => {
      await login(page, USERS.admin);
      await open(page, path);
      expect(await violations(page)).toEqual([]);
    });
  }

  test("Detailseiten: Veranstaltung, Helferplan, Mitglied", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/veranstaltungen");
    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Sommerfest 2026" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);

    await open(page, "/helferplanung");
    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sommerfest 2026", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Tagesablauf" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);

    await open(page, "/mitglieder");
    await page.locator("tbody a[href^='/mitglieder/']").first().click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });

  test("geöffneter Dialog: Dokument hochladen", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/dokumente");
    await page.getByRole("button", { name: "Dokument hochladen" }).click();
    const dialog = page.getByRole("dialog", { name: "Dokument hochladen" });
    await expect(dialog).toBeVisible();
    expect(await violations(page)).toEqual([]);
    // Mit den Rechnungs-Angaben (Auswahl „Muss noch bezahlt werden“ / „Ist schon bezahlt“, Betrag, Fälligkeit)
    await dialog.getByRole("checkbox", { name: /Das ist eine Rechnung/ }).check();
    await expect(dialog.getByRole("radio", { name: "Muss noch bezahlt werden" })).toBeChecked();
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("Barrierefreiheit (axe) – andere Rollen und dunkle Darstellung", () => {
  for (const [role, path] of [
    ["helfer", "/dashboard"],
    ["helfer", "/helferplanung"],
    ["mitglied", "/dashboard"],
    ["mitglied", "/dokumente"],
    ["abteilung", "/aufgaben"],
  ] as const) {
    test(`${role}: ${path}`, async ({ page }) => {
      await login(page, USERS[role]);
      await open(page, path);
      expect(await violations(page)).toEqual([]);
    });
  }

  for (const path of [
    "/dashboard",
    "/helferplanung",
    "/mitglieder",
    "/kalender",
    "/benachrichtigungen",
    "/aufgaben",
    "/veranstaltungen",
    "/hilfe",
    "/datenschutz",
    "/nachrichten?chat=alle", // Sprechblasen in den dunklen WhatsApp-Farben
    "/einstellungen", // Vereinslogo-Karte mit Anfangsbuchstaben auf dunklem Grund
  ]) {
    test(`dunkel: ${path}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await login(page, USERS.admin);
      await open(page, path);
      await expect(page.locator("html")).toHaveClass(/dark/);
      expect(await violations(page)).toEqual([]);
    });
  }
});
