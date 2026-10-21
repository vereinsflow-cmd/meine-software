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
  "/dokumente?rechnungen=offen", // gewählter Filterknopf, Rechnungsspalte mit „Bezahlt“
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
  "/finanzen/spenden",
  "/finanzen/spenden/alle",
  "/finanzen/spenden/spender",
  "/finanzen/spenden/beleg",
  "/finanzen/beitraege",
  "/finanzen/beitraege/arten",
  "/finanzen/beitraege/familien",
  "/finanzen/beitraege/lauf",
  "/finanzen/beitraege/offen",
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
    await page.getByRole("link", { name: "Profil öffnen" }).click();
    await expect(page).toHaveURL(/\/mitglieder\/[0-9a-f-]{36}\?von=/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });

  test("Mitgliederliste: Filter aufgeklappt, anderes Mitglied gewählt, nach Nummer sortiert", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/mitglieder?sort=memberNumber&dir=desc");
    await page.locator("label", { hasText: /^Filter/ }).click();
    await expect(page.getByRole("combobox", { name: "Nach Status filtern" })).toBeVisible();
    await page
      .getByRole("region", { name: "Mitgliederliste" })
      .locator("[data-member] a:visible")
      .nth(1)
      .click();
    await expect(page).toHaveURL(/id=[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });

  test("Dokumente: Menü „…“ geöffnet und daraus „Dokument bearbeiten“", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/dokumente");
    const trigger = page.getByRole("button", { name: /^Aktionen für / }).first();
    const menu = page.getByRole("menu");
    await expect(async () => {
      if (!(await menu.isVisible())) await trigger.click();
      await expect(menu).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    // Nur das Menü selbst (zu `aria-hidden` außerhalb siehe `violations` in axe.ts); die Seite ist oben geprüft.
    expect(await violations(page, { only: "[role=menu]" })).toEqual([]);
    await menu.getByRole("menuitem", { name: "Bearbeiten" }).click();
    await expect(page.getByRole("dialog", { name: "Dokument bearbeiten" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("geöffneter Dialog: „Neue Schicht“ auf der Übersicht (Auswahl der Veranstaltung), hell und dunkel", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await open(page, "/helferplanung");
      await page.getByRole("button", { name: "Neue Schicht" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Für welche Veranstaltung?" });
      await expect(dialog).toBeVisible();
      expect(await violations(page), colorScheme).toEqual([]);
      // Mit Suchbegriff ohne Treffer („Keine Veranstaltung gefunden.“)
      await dialog.getByLabel("Veranstaltung suchen").fill("gibt es nicht");
      await expect(dialog.getByText("Keine Veranstaltung gefunden.")).toBeVisible();
      expect(await violations(page), colorScheme).toEqual([]);
    }
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

test.describe("Dashboard-Kopf mit Tastatur und Screenreader", () => {
  test("Fotos schmückend; Chips, Knöpfe und „Anpassen“ in Lesereihenfolge mit sichtbarem Fokus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, USERS.admin);
    const hero = page.getByRole("main").locator('[data-slot="dashboard-hero"]');
    // Bilder ohne Namen und für Screenreader verborgen; die Überschrift der Seite ist die Begrüßung
    await expect(hero.getByRole("img")).toHaveCount(0);
    for (const img of await hero.locator("img").all()) {
      await expect(img).toHaveAttribute("alt", "");
      await expect(img).toHaveAttribute("aria-hidden", "true");
    }
    await expect(hero.getByRole("heading", { level: 1 })).toHaveCount(1);
    const chips = hero.getByRole("list", { name: "Auf einen Blick" }).getByRole("link");
    await expect(chips).toHaveCount(3);

    // Reihenfolge mit Tab: die drei Chips, die beiden Knöpfe, „Anpassen“
    const first = chips.first();
    const ringBefore = await first.evaluate((element) => getComputedStyle(element).boxShadow);
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    // sichtbarer Fokus: der Ring ändert sich
    expect(await first.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
      ringBefore,
    );
    const order: string[] = [];
    for (let step = 0; step < 5; step++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ??
            document.activeElement?.textContent?.replace(/\s+/g, " ").trim() ??
            "",
        ),
      );
    }
    expect(order.slice(0, 2)).toEqual([
      expect.stringMatching(/Termine? in 30 Tagen$/),
      expect.stringMatching(/offener? Helferpl/),
    ]);
    expect(order.slice(2)).toEqual(["Neue Veranstaltung", "Neues Mitglied", "Dashboard anpassen"]);
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("Barrierefreiheit (axe) – andere Rollen und dunkle Darstellung", () => {
  for (const [role, path] of [
    ["helfer", "/dashboard"],
    ["helfer", "/helferplanung"],
    ["mitglied", "/dashboard"],
    ["otherAdmin", "/dashboard"], // Kopf ohne Abteilungen: Nacht und Licht, keine Fotos
    ["otherAdmin", "/finanzen"], // Übersicht ohne Kassenbuch: Leerzustand auf der Nacht
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
    "/dokumente", // Dateityp-Kacheln, Schilder und „Bezahlt“ zartgrün auf dunklem Grund
    "/finanzen", // Kopf auf der Nacht, Kontokarten und Töpfe auf Fotos, Beträge grün/rot auf dunklem Grund
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
