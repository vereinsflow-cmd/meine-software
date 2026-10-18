import { expect, test, type Locator, type Page } from "@playwright/test";
import { USERS, chooseTab, greeting, loginSettled as login, open, openNavGroup } from "./helpers";

/**
 * Listen auf dem Dashboard zeigen zunächst nur die ersten Einträge; „N weitere … anzeigen“ klappt den Rest auf. Ein Klick vor
 * der Hydration geht verloren – deshalb wird wiederholt, bis der Knopf „aufgeklappt“ meldet.
 */
async function expandAll(region: Locator): Promise<void> {
  await expect(region.getByRole("listitem").first()).toBeVisible(); // erst warten, bis die Karte da ist
  const toggle = region.getByRole("button", { name: /anzeigen/ });
  if ((await toggle.count()) === 0) return; // nichts zu erweitern
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

/** Wechselt im Dashboard den Reiter (im Browser, ohne Neuladen). */
async function selectTab(page: Page, name: string) {
  await chooseTab(page, name);
}
test.describe("Dashboard", () => {
  test("Vereinsadministrator: vier Reiter mit Kennzahlen, Aufgaben, Terminen, Geburtstagen, Aktivitäten und Auswertungen", async ({
    page,
  }) => {
    // Ohne Bewegung: Die Kennzahlen blenden sonst beim Laden versetzt ein (8 px von unten) und ihre Zahlen zählen hoch – hier
    // werden Lage und Summen gemessen. Vor dem Aufruf gesetzt, denn beides entscheidet sich beim ersten Bild.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: greeting("Anna") })).toBeVisible();
    await expect(
      page.locator("main").getByText("Vereinsadministrator", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText([
      "Übersicht",
      "Termine & Helfer",
      "Mitglieder",
      "Aufgaben & Aktivität",
    ]);

    // Reiter „Übersicht“ (zuerst offen): Kennzahlen (Karten sind Links in die jeweiligen Bereiche), eigene Aufgaben,
    // Einsätze und Benachrichtigungen
    await expect(page.getByRole("tab", { name: "Übersicht", selected: true })).toBeVisible();
    // Große Fassung (Stil „Vertix“): die Mitglieder-Karte, der Viererblock aus Kacheln (die erste blau) und die Helferstunden in
    // einer Gruppe – kein Karussell.
    await expect(page.locator('[data-layout="studio"]')).toHaveAttribute("data-size", "m");
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    const kpis = page.getByRole("group", { name: "Kennzahlen", exact: true });
    // Reihenfolge im Code (Tastatur, Screenreader): Mitglieder, die Kacheln (Zahlungen zuerst), zuletzt die Helferstunden
    const kpiCards = kpis.locator("[data-kpi]");
    await expect(kpiCards).toHaveCount(6);
    const order = await kpiCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-kpi")),
    );
    expect(order.slice(0, 5)).toEqual([
      "Mitglieder",
      "Offene Zahlungen",
      "Termine in 30 Tagen",
      "Aufgaben im Verein",
      "Freie Helferplätze",
    ]);
    expect(order[5]).toMatch(/^Helferstunden \d{4}$/);
    // Die Summe steht als Kachel, die Rechnungen (mit „Bezahlt“) weiter als eigene Karte darunter.
    await expect(page.getByRole("region", { name: "Offene Zahlungen" })).toHaveCount(1);

    // Ob zwischen Zahl und Text ein Leerzeichen im Namen des Links steht, hängt vom Aufbau der Karte ab – daher `\s*`.
    const members = page.getByRole("link", { name: /^Mitglieder \d+/ });
    const tasks = page.getByRole("link", { name: /^Aufgaben im Verein\s*\d+\s*offen/ });
    const nextEvents = page.getByRole("link", { name: /^Termine in 30 Tagen\s*\d+/ });
    const hours = page.getByRole("link", { name: /^Helferstunden \d{4}/ });
    const freeShifts = page.getByRole("link", { name: /^Freie Helferplätze\s*\d+/ });
    const payments = page.getByRole("link", { name: /^Offene Zahlungen\s*[\d.]+,\d\d\s*€/ });
    for (const link of [members, tasks, nextEvents, hours, freeShifts, payments]) {
      await expect(link).toBeVisible();
    }
    await expect(payments).toHaveAttribute("href", "/finanzen/rechnungen?stand=offen");
    await expect(payments).toContainText(/in \d+ Rechnung/);

    // Jede Kennzahl nennt einen kurzen Satz zur Einordnung der Zahl …
    await expect(members).toContainText(/gegenüber dem Vormonat/);
    await expect(nextEvents).toContainText(/Nächster Termin|Keine kommenden Termine/);
    // Die Demo-Daten haben offene Schichten (siehe den Hinweis über den Reitern am Ende des Tests)
    await expect(freeShifts).toContainText(/\d+ von \d+ (Plätzen|Platz) besetzt/);
    await expect(hours).toContainText(/gegenüber letzter Woche|Diese Woche noch keine Stunden/);
    // … und wie eine Aktie die Veränderung im Zeitraum (▲/▼/±) – sie gehört zum Namen des Links.
    await expect(members).toHaveAccessibleName(/[+−±]\d+ \([+−±]\d+,\d %\) in 12 Monaten/);
    await expect(nextEvents).toHaveAccessibleName(/^Termine in 30 Tagen\s*\d+\s*[+−±]\d+/);
    await expect(hours).toContainText(/seit 01\.01\.\d{4}/);
    // Die Zahl der freien Plätze steht genau einmal im Namen des Links: Zahl, Veränderung der besetzten Plätze, Besetzung
    await expect(freeShifts).toHaveAccessibleName(
      /^Freie Helferplätze\s*\d+\s*[+−±]\d+ besetzt\s*\d+ von \d+ (Plätzen|Platz) besetzt$/,
    );

    // Die Karten (der Link liegt darin, Zeitraum-Knöpfe und Balken daneben)
    const card = (link: Locator) => kpis.locator('[data-slot="card"]').filter({ has: link });
    const heroCard = card(members);
    const tilesCard = kpis.locator("[data-kpi-tiles]");
    const hoursCard = card(hours);
    // Helferstunden: im laufenden Jahr ein Balken je Monat seit Januar (Berliner Kalender)
    const month = Number(
      new Intl.DateTimeFormat("de-DE", { month: "numeric", timeZone: "Europe/Berlin" }).format(
        new Date(),
      ),
    );
    await expect(hoursCard.locator('[data-slot="step-bar"]')).toHaveCount(month);
    // Die Kacheln haben keine eigenen Zeitraum-Knöpfe (wie in der Vorlage)
    await expect(tilesCard.getByRole("group", { name: /^Zeitraum für/ })).toHaveCount(0);

    // Zeitraum-Knöpfe: ein Klick wechselt nur den Verlauf dieser Karte (und führt nicht weg), die Veränderung nennt den neuen
    // Zeitraum
    let navigated = false;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigated = true;
    });
    const periods = heroCard.getByRole("group", { name: "Zeitraum für „Mitglieder“" });
    await expect(periods.getByRole("button")).toHaveText(["6 M", "12 M", "5 J"]);
    await expect(periods.getByRole("button", { pressed: true })).toHaveText("12 M");
    await periods.getByRole("button", { name: "Verlauf in 6 Monaten" }).click();
    await expect(periods.getByRole("button", { pressed: true })).toHaveText("6 M");
    await expect(members).toContainText("in 6 Monaten");
    const hourPeriods = hoursCard.getByRole("group", { name: /^Zeitraum für „Helferstunden/ });
    await expect(hourPeriods.getByRole("button", { pressed: true })).toHaveText(/^\d{4}$/);
    await hourPeriods.getByRole("button", { name: "Verlauf in 12 Wochen" }).click();
    await expect(hours).toContainText("in 12 Wochen");
    await expect(hoursCard.locator('[data-slot="step-bar"]')).toHaveCount(12); // ein Balken je Woche
    await expect(members).toContainText("in 6 Monaten"); // die Mitglieder-Karte bleibt bei ihrem Zeitraum
    expect(navigated).toBe(false);
    // Tastaturfokus: Der Rahmen liegt an der Karte selbst (sonst schnitte ihr Rand ihn ab)
    const ringBefore = await heroCard.evaluate((element) => getComputedStyle(element).boxShadow);
    await members.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(members).toBeFocused();
    expect(await heroCard.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
      ringBefore,
    );
    await page.keyboard.press("Escape");

    // Anordnung nach Inhaltsbreite; nichts ragt aus dem Fenster. Maus weg (eine gedrückte Karte gibt sonst nach).
    await page.mouse.move(0, 0);
    const box = async (locator: Locator) => (await locator.boundingBox())!;
    const measure = async (label: string) => {
      const [m, t, h] = [await box(heroCard), await box(tilesCard), await box(hoursCard)];
      const width = page.viewportSize()!.width;
      for (const each of [m, t, h]) expect(each.x + each.width, label).toBeLessThanOrEqual(width);
      // Mitglieder-Karte und Kacheln immer nebeneinander, oben bündig und gleich hoch
      expect(Math.abs(t.y - m.y), label).toBeLessThanOrEqual(1);
      expect(Math.abs(t.height - m.height), label).toBeLessThanOrEqual(1);
      expect(t.x, label).toBeGreaterThan(m.x + m.width);
      return { m, t, h };
    };
    const viewport = page.viewportSize()!;

    // 1280 px: zwei Spalten – die Helferstunden darunter über die ganze Breite
    {
      const { m, t, h } = await measure("1280 px");
      expect(h.y).toBeGreaterThan(m.y + m.height);
      expect(Math.abs(h.x - m.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(h.x + h.width - (t.x + t.width))).toBeLessThanOrEqual(1);
    }
    // 1600 px: drei Spalten nebeneinander wie in der Vorlage
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect
      .poll(async () => Math.abs((await box(hoursCard)).y - (await box(heroCard)).y), {
        message: "1600 px",
      })
      .toBeLessThanOrEqual(1);
    {
      const { t, h } = await measure("1600 px");
      expect(h.x).toBeGreaterThan(t.x + t.width);
    }
    await page.setViewportSize(viewport); // zurück auf 1280 px für den Rest des Tests

    // Unten auf der Mitglieder-Karte: Aktiv, Passiv und alle übrigen Status – zusammen genau die große Zahl
    await expect(heroCard.getByRole("term")).toHaveText(["Aktiv", "Passiv", "Weitere"]);
    const digits = (text: string | null) => Number((text ?? "").replace(/\D/g, ""));
    const parts = (await heroCard.locator('[data-slot="split-count"]').allTextContents()).map(
      digits,
    );
    const total = digits(await heroCard.locator('[data-slot="kpi-value"]').textContent());
    expect(total).toBeGreaterThan(0);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
    // Die Aufgaben-Kachel führt zu den Aufgaben und nennt Überfälliges (oder „Im Zeitplan“)
    await expect(tasks).toHaveAttribute("href", "/aufgaben");
    await expect(tasks).toHaveText(
      /^Aufgaben im Verein\s*\d+\s*offen\s*(\d+ überfällig|Im Zeitplan|Alles erledigt)(\s*davon \d+ für dich)?$/,
    );

    await expect(page.getByRole("heading", { level: 2, name: "Für dich" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Meine Aufgaben" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Meine Einsätze" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Benachrichtigungen" })).toBeVisible();
    // „Meine Aufgaben“ steht in der großen Fassung über die volle Breite, die übrigen Karten darunter nebeneinander
    const [mine, shiftsMine] = [
      await box(page.getByRole("region", { name: "Meine Aufgaben" })),
      await box(page.getByRole("region", { name: "Meine Einsätze" })),
    ];
    expect(mine.width).toBeGreaterThan(shiftsMine.width * 1.8);
    // Karten anderer Reiter sind jetzt nicht sichtbar – nichts steht doppelt da
    await expect(page.getByRole("region", { name: "Kommende Veranstaltungen" })).toHaveCount(0);

    // Reiter „Termine & Helfer“
    await selectTab(page, "Termine & Helfer");
    const events = page.getByRole("region", { name: "Kommende Veranstaltungen" });
    await expect(events.getByRole("link").first()).toBeVisible();
    await expandAll(events); // das Sommerfest steht als fünfter Termin hinter „weitere anzeigen“
    await expect(events.getByRole("link", { name: /Sommerfest 2026/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Hier werden Helfer gesucht" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Auswertungen" })).toBeVisible();

    // Reiter „Mitglieder“: Geburtstage und die Statusverteilung als Diagramm
    await selectTab(page, "Mitglieder");
    await expect(page.getByRole("region", { name: "Geburtstage" })).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Auswertungen" })
        .getByRole("listitem")
        .filter({ hasText: "Aktiv" }),
    ).toBeVisible();

    // Reiter „Aufgaben & Aktivität“: Verwalter mit Protokollrecht sehen die letzten Aktivitäten
    await selectTab(page, "Aufgaben & Aktivität");
    await expect(page.getByRole("region", { name: "Letzte Aktivitäten" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Auswertungen" })).toContainText("Aufgaben");

    // Schnellzugriffe bleiben in jedem Reiter erreichbar (über den Reitern)
    await expect(page.getByRole("link", { name: "Neue Veranstaltung", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Neues Mitglied" })).toBeVisible();
    // Der Hinweis auf unbesetzte Schichten steht über den Reitern und bleibt bei jedem Reiter sichtbar
    await expect(page.getByText("Helferschichten sind noch nicht besetzt")).toBeVisible();
  });

  test("Kennzahl 'Mitglieder' führt in die Mitgliederliste, Termin-Link in die Veranstaltung", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.getByRole("link", { name: /^Mitglieder \d+/ }).click();
    await expect(page).toHaveURL(/\/mitglieder$/);

    await open(page, "/dashboard?tab=termine"); // Reiter direkt über die Adresse
    const events = page.getByRole("region", { name: "Kommende Veranstaltungen" });
    await expandAll(events);
    await events.getByRole("link", { name: /Sommerfest 2026/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sommerfest 2026" })).toBeVisible();
  });

  test("Helfer: eigene Einsätze, Aufgaben und Termine – aber keine Mitglieder, keine Geburtstage, keine Aktivitäten", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await expect(page.getByRole("heading", { level: 1, name: greeting("Hans") })).toBeVisible();
    // Kein Reiter „Mitglieder“ (Mitgliederzahlen sind nicht für Helfer)
    await expect(page.getByRole("tab")).toHaveText([
      "Übersicht",
      "Termine & Helfer",
      "Aufgaben & Aktivität",
    ]);

    const mine = page.getByRole("region", { name: "Meine Einsätze" });
    await expect(mine.getByRole("link", { name: /Aufbau/ })).toBeVisible();
    await expect(mine.getByRole("link", { name: /Getränkestand/ })).toBeVisible();

    // Mindestens die ungelesene Benachrichtigung aus den Demo-Daten – andere Tests (z. B. Aufgaben zuweisen) können weitere erzeugen.
    await expect(page.getByRole("link", { name: /^Ungelesen [1-9]\d*/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Meine Helferstunden \d{4}/ })).toBeVisible();
    // Ohne Mitgliederzahlen keine große Fassung: die gleich großen Farbkarten im einfachen Raster
    await expect(page.locator('[data-layout="grid"]')).toHaveCount(1);
    await expect(page.locator('[data-layout="studio"]')).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Weitere Kennzahlen" })).toHaveCount(0);

    // Nicht für diese Rolle:
    await expect(page.getByRole("link", { name: /^Mitglieder \d+/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Geburtstage" })).toHaveCount(0);
    await expect(page.getByText("Helferschichten sind noch nicht besetzt")).toHaveCount(0);
    // exact: Benachrichtigungen heißen „Neue Veranstaltung: …“ (andere Tests veröffentlichen Termine) – gemeint ist der Knopf.
    await expect(page.getByRole("link", { name: "Neue Veranstaltung", exact: true })).toHaveCount(
      0,
    );
    await selectTab(page, "Aufgaben & Aktivität");
    await expect(page.getByRole("region", { name: "Letzte Aktivitäten" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Auswertungen" })).toBeVisible(); // Aufgabenauswertung
  });

  test("Mitglied: nur „Übersicht“ und „Termine & Helfer“ – keine Verwaltungsfunktionen", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await expect(page.getByRole("heading", { level: 1, name: greeting("Maria") })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveText(["Übersicht", "Termine & Helfer"]);
    await expect(
      page
        .getByRole("region", { name: "Meine Einsätze" })
        .getByRole("link", { name: /Kuchenbuffet/ }),
    ).toBeVisible();
    await selectTab(page, "Termine & Helfer");
    await expect(page.getByRole("region", { name: "Kommende Veranstaltungen" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Geburtstage" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Neues Mitglied" })).toHaveCount(0);
    // Schmale Symbolleiste (Standard ab 1024 px): „Dashboard“ ist ein direkter Link und hier die aktuelle Seite; „Verein“ ist
    // ein Knopf, der rechts daneben ein Menü mit den Seiten öffnet – die Links gibt es nur, solange das Menü offen ist.
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("button", { name: "Seitenleiste ausklappen" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const calendar = nav.getByRole("link", { name: "Kalender", exact: true });
    await expect(calendar).toHaveCount(0);
    await openNavGroup(nav, "Verein");
    await expect(calendar).toBeVisible();
    await calendar.click();
    await expect(page).toHaveURL(/\/kalender$/);
    await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
    // Das Menü schließt beim Seitenwechsel, und die Gruppe zeigt an, dass sie die aktuelle Seite enthält
    await expect(calendar).toHaveCount(0);
    await expect(
      nav.getByRole("button", { name: "Verein", exact: true }),
    ).toHaveAccessibleDescription(/enthält die aktuelle Seite/);
  });

  test("Abteilungsleiterin sieht Kennzahlen und Auswertung nur für ihre Abteilung", async ({
    page,
  }) => {
    await login(page, USERS.abteilung);
    await expect(
      page.getByRole("link", { name: /^Mitglieder \(deine Abteilung\) \d+/ }),
    ).toBeVisible();
    await selectTab(page, "Mitglieder");
    await expect(page.getByRole("region", { name: "Auswertungen" })).toContainText(
      "Nur deine Abteilung",
    );
  });

  test("Anderer Verein: eigene Daten, keine Termine des TSV", async ({ page }) => {
    await login(page, USERS.otherAdmin);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Guten (Morgen|Tag|Abend), / }),
    ).toBeVisible();
    await open(page, "/dashboard?tab=termine");
    await expect(page.getByText("Sommerfest 2026")).toHaveCount(0);
    await expect(page.getByText("Vorstandssitzung")).toHaveCount(0);
  });
});
