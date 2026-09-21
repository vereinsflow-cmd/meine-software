import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open } from "./helpers";

/**
 * Auswertungen auf dem Dashboard: Themen als Reiter, Ansicht, Diagrammtyp und Zeitraum wählbar, Tabellenansicht,
 * Tastaturbedienung, leere Zustände, Ein-/Ausklappen – und die Barrierefreiheit in den verschiedenen Zuständen.
 */
const analytics = (page: Page) => page.getByRole("region", { name: "Auswertungen" });
const chart = (page: Page, name: RegExp | string) =>
  analytics(page).getByRole("group", { name, exact: false });

/**
 * Öffnet das Dashboard direkt im gewünschten Reiter (Adresse `?tab=…`). Die Auswertungen liegen je nach Thema in einem
 * anderen Reiter: Mitglieder → „mitglieder“, Veranstaltungen und Helferstunden → „termine“, Aufgaben → „aktivitaet“.
 */
async function openDashboard(page: Page, user: string = USERS.admin, tab = "mitglieder") {
  await login(page, user);
  await open(page, `/dashboard?tab=${tab}`);
  // „Einklappen“ gibt es erst am fertigen Bereich (der Platzhalter beim Laden hat den Knopf nicht).
  await expect(
    analytics(page).getByRole("button", { name: /Einklappen Auswertungen/ }),
  ).toBeVisible();
}

test.describe("Auswertungen – Bedienung", () => {
  test("Mitglieder: Statusverteilung als Donut, Wechsel auf Balken; Entwicklung mit Diagrammtyp und Zeitraum", async ({
    page,
  }) => {
    await openDashboard(page);
    const region = analytics(page);
    await expect(page.getByRole("tab", { name: "Mitglieder", selected: true })).toBeVisible(); // äußerer Reiter des Dashboards

    // Erste Ansicht: Mitglieder nach Status als Ring; die Werte stehen sichtbar in der Legende (nicht nur an der Farbe)
    await expect(chart(page, /Ringdiagramm: Mitglieder nach Status/)).toBeVisible();
    const legend = region.getByRole("list", { name: /Legende/ });
    await expect(legend.getByRole("listitem").filter({ hasText: "Aktiv" })).toContainText(/\d+/);
    await expect(legend.getByRole("listitem").filter({ hasText: "Aktiv" })).toContainText("%");

    // Auf Balken umschalten: dieselben Werte als liegende Balken, Wert am Balkenende
    await region.getByRole("radio", { name: "Balken" }).click();
    await expect(region.getByRole("radio", { name: "Balken" })).toBeChecked();
    const bars = region.getByRole("list", { name: /Balkendiagramm: Mitglieder nach Status/ });
    await expect(bars.getByRole("listitem").filter({ hasText: "Aktiv" })).toBeVisible();

    // Zweite Ansicht: Entwicklung als Linie; Diagrammtyp und Zeitraum wechseln
    await region.getByRole("radio", { name: "Entwicklung" }).click();
    await expect(chart(page, /Liniendiagramm: Mitgliederentwicklung/)).toBeVisible();
    await expect(region).toContainText("Letzte 12 Monate");
    await region.getByRole("radio", { name: "Fläche" }).click();
    await expect(chart(page, /Flächendiagramm: Mitgliederentwicklung/)).toBeVisible();
    await region.getByRole("radio", { name: "Balken" }).click();
    await expect(chart(page, /Balkendiagramm: Mitgliederentwicklung/)).toBeVisible();

    await region.getByRole("radio", { name: "8 Quartale" }).click();
    await expect(region).toContainText("Letzte 8 Quartale");
    await region.getByRole("radio", { name: "5 Jahre" }).click();
    await expect(region).toContainText("Letzte 5 Jahre");
    // Bestände zeigen keine Wochen (wenig sinnvoll) – die Auswahl gibt es dort nicht
    await expect(region.getByRole("radio", { name: "12 Wochen" })).toHaveCount(0);
  });

  test("Veranstaltungen: Wochen bis Jahre, Diagrammtyp, Verteilung nach Art", async ({ page }) => {
    await openDashboard(page, USERS.admin, "termine");
    const region = analytics(page);
    await region.getByRole("tab", { name: "Veranstaltungen" }).click(); // innerer Reiter der Auswertung
    await expect(chart(page, /Balkendiagramm: Veranstaltungen im Zeitverlauf/)).toBeVisible();

    for (const [label, text] of [
      ["12 Wochen", "Letzte 12 Wochen"],
      ["8 Quartale", "Letzte 8 Quartale"],
      ["5 Jahre", "Letzte 5 Jahre"],
      ["12 Monate", "Letzte 12 Monate"],
    ] as const) {
      await region.getByRole("radio", { name: label }).click();
      await expect(region).toContainText(text);
    }
    await region.getByRole("radio", { name: "Linie" }).click();
    await expect(chart(page, /Liniendiagramm: Veranstaltungen im Zeitverlauf/)).toBeVisible();

    await region.getByRole("radio", { name: "Nach Art" }).click();
    await expect(chart(page, /Ringdiagramm: Veranstaltungen nach Art/)).toBeVisible();
    await region.getByRole("radio", { name: "Balken" }).click();
    await expect(
      region.getByRole("list", { name: /Balkendiagramm: Veranstaltungen nach Art/ }),
    ).toBeVisible();
  });

  test("Helferstunden: Auswahl bleibt beim Zurückwechseln innerhalb des Reiters erhalten; Aufgaben liegen im Reiter „Aufgaben & Aktivität“", async ({
    page,
  }) => {
    await openDashboard(page, USERS.admin, "termine");
    const region = analytics(page);
    await region.getByRole("tab", { name: "Helferstunden" }).click();
    await expect(chart(page, /Balkendiagramm: Helferstunden/)).toBeVisible();
    await region.getByRole("radio", { name: "Fläche" }).click();
    await region.getByRole("tab", { name: "Veranstaltungen" }).click();
    await expect(chart(page, /Balkendiagramm: Veranstaltungen im Zeitverlauf/)).toBeVisible();
    await region.getByRole("tab", { name: "Helferstunden" }).click();
    await expect(chart(page, /Flächendiagramm: Helferstunden/)).toBeVisible();
    await expect(region.getByRole("radio", { name: "Fläche" })).toBeChecked();

    // Aufgaben: eigener Reiter des Dashboards, ohne inneren Reiter (nur ein Thema)
    await page.getByRole("tab", { name: "Aufgaben & Aktivität" }).click();
    await expect(chart(page, /Ringdiagramm: Aufgaben nach Status/)).toBeVisible();
    await expect(analytics(page).getByRole("tablist")).toHaveCount(0);
  });
  test("Zeiger: Fadenkreuz-Tooltip zeigt den Wert; der laufende Zeitraum ist als solcher gekennzeichnet", async ({
    page,
  }) => {
    await openDashboard(page);
    const region = analytics(page);
    await region.getByRole("radio", { name: "Entwicklung" }).click();
    const box = (await chart(page, /Liniendiagramm/).boundingBox())!;
    await page.mouse.move(box.x + box.width - 24, box.y + box.height / 2);
    await expect(region.getByText("laufend, noch nicht abgeschlossen")).toBeVisible();
    await page.mouse.move(box.x + 90, box.y + box.height / 2);
    await expect(region.getByText("laufend, noch nicht abgeschlossen")).toHaveCount(0);
    await page.mouse.move(box.x - 40, box.y - 40); // Zeiger weg: Tooltip verschwindet
    await expect(region.locator("[aria-hidden='true'].pointer-events-none.absolute")).toHaveCount(
      0,
    );
  });

  test("Tastatur: Pfeiltasten gehen durch die Zeiträume, die Werte werden angesagt (Live-Region)", async ({
    page,
  }) => {
    await openDashboard(page);
    const region = analytics(page);
    await region.getByRole("radio", { name: "Entwicklung" }).click();
    const group = chart(page, /Liniendiagramm/);
    const live = group.locator("[aria-live='polite']");
    await group.focus();
    await expect(live).toHaveText("");
    await page.keyboard.press("ArrowLeft"); // springt auf den letzten (laufenden) Zeitraum
    await expect(live).toContainText("(laufend)");
    await expect(live).toContainText("Mitglied");
    await page.keyboard.press("ArrowLeft"); // einen Zeitraum zurück
    await expect(live).not.toContainText("(laufend)");
    await page.keyboard.press("Home");
    await expect(live).toContainText(
      /Oktober|November|Dezember|Januar|Februar|März|April|Mai|Juni|Juli|August|September/,
    );
    await page.keyboard.press("Escape");
    await expect(live).toHaveText("");
  });

  test("Tabellenansicht: dieselben Werte als Tabelle, wieder zurück zum Diagramm", async ({
    page,
  }) => {
    await openDashboard(page);
    const region = analytics(page);
    await region.getByRole("radio", { name: "Entwicklung" }).click();
    const toggle = region.getByRole("button", { name: "Als Tabelle" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const table = region.getByRole("table", { name: /Mitgliederentwicklung/ });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(13); // Kopfzeile + 12 Monate
    await expect(table.getByRole("columnheader", { name: "Mitglieder" })).toBeVisible();
    await expect(table.getByRole("cell", { name: /\(laufend\)/ })).toHaveCount(1);
    await expect(chart(page, /Liniendiagramm/)).toHaveCount(0);
    await toggle.click();
    await expect(chart(page, /Liniendiagramm/)).toBeVisible();

    // Auch die Verteilung hat eine Tabelle
    await region.getByRole("radio", { name: "Nach Status" }).click();
    await toggle.click();
    await expect(
      region
        .getByRole("table", { name: /Mitglieder nach Status/ })
        .getByRole("columnheader", { name: "Anteil" }),
    ).toBeVisible();
  });

  test("Bereich lässt sich ein- und ausklappen", async ({ page }) => {
    await openDashboard(page);
    const region = analytics(page);
    const toggle = region.getByRole("button", { name: /Einklappen Auswertungen/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(region.getByRole("button", { name: /Ausklappen Auswertungen/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(region.getByRole("radio", { name: "Entwicklung" })).toBeHidden();
    await region.getByRole("button", { name: /Ausklappen Auswertungen/ }).click();
    await expect(region.getByRole("radio", { name: "Entwicklung" })).toBeVisible();
  });

  test("Rollen: Helfer sehen keinen Mitglieder-Reiter und nur ihre eigenen Stunden", async ({
    page,
  }) => {
    await openDashboard(page, USERS.helfer, "termine");
    await expect(page.getByRole("tab", { name: "Mitglieder" })).toHaveCount(0); // Reiter des Dashboards
    const tabs = analytics(page).getByRole("tab"); // innere Reiter der Auswertung
    await expect(tabs.filter({ hasText: "Veranstaltungen" })).toHaveCount(1);
    await analytics(page).getByRole("tab", { name: "Helferstunden" }).click();
    await expect(analytics(page)).toContainText("Meine Helferstunden");
  });
  test("leerer Zustand: freundlicher Hinweis statt leerem Diagramm (anderer Verein ohne Helferstunden)", async ({
    page,
  }) => {
    await openDashboard(page, USERS.otherAdmin, "termine");
    const region = analytics(page);
    await region.getByRole("tab", { name: "Helferstunden" }).click();
    await expect(region.getByText("Noch keine Daten")).toBeVisible();
    await expect(region.getByRole("group", { name: /Balkendiagramm/ })).toHaveCount(0);
    // Die Auswahl bleibt bedienbar; der Hinweis bleibt auch bei anderem Diagrammtyp und Zeitraum
    await region.getByRole("radio", { name: "Linie" }).click();
    await region.getByRole("radio", { name: "5 Jahre" }).click();
    await expect(region.getByText("Noch keine Daten")).toBeVisible();
  });
});

test.describe("Dashboard – Listen mit „Mehr anzeigen“", () => {
  test("Kommende Veranstaltungen: zunächst drei Einträge, der Rest hinter „weitere anzeigen“", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard?tab=termine");
    const events = page.getByRole("region", { name: "Kommende Veranstaltungen" });
    await expect(events.getByRole("listitem")).toHaveCount(3);
    const more = events.getByRole("button", { name: /weitere Termine anzeigen/ });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    expect(await events.getByRole("listitem").count()).toBeGreaterThan(3);
    const less = events.getByRole("button", { name: "Weniger anzeigen" });
    await expect(less).toHaveAttribute("aria-expanded", "true");
    await less.click();
    await expect(events.getByRole("listitem")).toHaveCount(3);
  });
});

test.describe("Auswertungen – Barrierefreiheit (axe) in verschiedenen Zuständen", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: Donut, Balken, Linie, Fläche, Tabelle`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openDashboard(page, USERS.admin, "mitglieder");
      const region = analytics(page);
      expect(await violations(page)).toEqual([]); // Ring (Mitglieder nach Status)

      await region.getByRole("radio", { name: "Balken" }).click();
      expect(await violations(page)).toEqual([]);

      await region.getByRole("radio", { name: "Entwicklung" }).click();
      await region.getByRole("radio", { name: "Fläche" }).click();
      expect(await violations(page)).toEqual([]);
      await region.getByRole("radio", { name: "Linie" }).click();
      expect(await violations(page)).toEqual([]);

      await region.getByRole("button", { name: "Als Tabelle" }).click();
      expect(await violations(page)).toEqual([]);

      // Reiter „Termine & Helfer“ (mit innerem Reiter der Auswertung)
      await page.getByRole("tab", { name: "Termine & Helfer" }).click();
      const events = analytics(page);
      await expect(events.getByRole("tab", { name: "Veranstaltungen" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await events.getByRole("radio", { name: "Nach Art" }).click();
      expect(await violations(page)).toEqual([]);
    });
  }
  test("leerer Zustand ohne Verstöße", async ({ page }) => {
    await openDashboard(page, USERS.otherAdmin, "termine");
    await analytics(page).getByRole("tab", { name: "Helferstunden" }).click();
    await expect(analytics(page).getByText("Noch keine Daten")).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("Seitenleiste – Animationen", () => {
  const nav = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" });
  /** Symbolfläche des Menüpunkts (erstes aria-hidden-Element im Link). */
  const tile = (page: Page, name: string) =>
    nav(page).getByRole("link", { name, exact: true }).locator("span[aria-hidden='true']").first();
  const style = (locator: ReturnType<typeof tile>, property: string) =>
    locator.evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property);

  test("Überfahren: Symbol wird leicht größer und bekommt Farbe und Grund", async ({ page }) => {
    await login(page, USERS.admin);
    const icon = tile(page, "Kalender");
    await expect.poll(() => style(icon, "scale")).toBe("none");
    const before = await style(icon, "background-color");
    await nav(page).getByRole("link", { name: "Kalender", exact: true }).hover();
    await expect.poll(() => style(icon, "scale")).toBe("1.1");
    expect(await style(icon, "background-color")).not.toBe(before);
    // Maus weg: zurück in den Ausgangszustand
    await page.mouse.move(700, 400);
    await expect.poll(() => style(icon, "scale")).toBe("none");
  });

  test("Tastaturfokus reagiert wie der Zeiger", async ({ page }) => {
    await login(page, USERS.admin);
    const icon = tile(page, "Aufgaben");
    await nav(page).getByRole("link", { name: "Aufgaben", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab"); // Fokus per Tastatur auf „Aufgaben“ (focus-visible)
    await expect.poll(() => style(icon, "scale")).toBe("1.1");
  });

  test("„Bewegung reduzieren“: keine Bewegung, aber die Farbänderung bleibt", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    const icon = tile(page, "Kalender");
    const before = await style(icon, "background-color");
    await nav(page).getByRole("link", { name: "Kalender", exact: true }).hover();
    await expect.poll(() => style(icon, "background-color")).not.toBe(before);
    expect(await style(icon, "scale")).toBe("none");
    expect(await style(icon, "translate")).toBe("none");
  });

  test("aktiver Menüpunkt ist klar gekennzeichnet (aria-current und gefüllter Grund)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const active = nav(page).getByRole("link", { name: "Dashboard", exact: true });
    await expect(active).toHaveAttribute("aria-current", "page");
    expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    await expect(
      nav(page).getByRole("link", { name: "Kalender", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  });
});
