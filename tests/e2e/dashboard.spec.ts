import { expect, test, type Locator, type Page } from "@playwright/test";
import { USERS, chooseTab, loginSettled as login, open, openNavGroup } from "./helpers";

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
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, Anna" })).toBeVisible();
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
    // Große Fassung (Stil „Analytics“): oben das Paar aus Mitglieder-Kachel und Aufgaben-Ring, dazu die Gruppe der übrigen
    // Kennzahlen – kein Karussell. exact: „Kennzahlen“ steckt auch in „Weitere Kennzahlen“.
    await expect(page.locator('[data-layout="studio"]')).toHaveAttribute("data-size", "m");
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    const pair = page.getByRole("group", { name: "Kennzahlen", exact: true });
    const side = page.getByRole("group", { name: "Weitere Kennzahlen", exact: true });
    await expect(pair.locator('[data-slot="card"]')).toHaveCount(2);
    // Reihenfolge im Code (Tastatur, Screenreader): Termine, Helferstunden, freie Plätze, zuletzt die Offenen Zahlungen
    const sideCards = side.locator('[data-slot="card"]');
    await expect(sideCards).toHaveCount(4);
    await expect(sideCards.nth(0)).toHaveAttribute("data-kpi", "Termine in 30 Tagen");
    await expect(sideCards.nth(1)).toHaveAttribute("data-kpi", /^Helferstunden \d{4}$/);
    await expect(sideCards.nth(2)).toHaveAttribute("data-kpi", "Freie Helferplätze");
    await expect(sideCards.nth(3)).toHaveAttribute("aria-labelledby", "w-offene-zahlungen-kachel");
    // Die Offenen Zahlungen stehen damit genau einmal da – die eigene Karte unter den Kennzahlen entfällt.
    await expect(page.getByRole("region", { name: "Offene Zahlungen" })).toHaveCount(1);

    // Ob zwischen Zahl und Text ein Leerzeichen im Namen des Links steht, hängt vom Aufbau der Karte ab – daher `\s*`.
    const members = page.getByRole("link", { name: /^Mitglieder \d+/ });
    const tasks = page.getByRole("link", { name: /^Aufgaben im Verein\s*\d+\s*offen/ });
    const nextEvents = page.getByRole("link", { name: /^Termine in 30 Tagen\s*\d+/ });
    const hours = page.getByRole("link", { name: /^Helferstunden \d{4}/ });
    const freeShifts = page.getByRole("link", { name: /^Freie Helferplätze\s*\d+/ });
    for (const link of [members, tasks, nextEvents, hours, freeShifts]) {
      await expect(link).toBeVisible();
    }

    // Jede Kennzahlenkarte nennt einen kurzen Vergleich zur Einordnung der Zahl …
    await expect(members).toContainText(/gegenüber dem Vormonat/);
    await expect(nextEvents).toContainText(/Nächster Termin|Keine kommenden Termine/);
    // Die Demo-Daten haben offene Schichten (siehe den Hinweis über den Reitern am Ende des Tests)
    await expect(freeShifts).toContainText(/\d+ von \d+ (Plätzen|Platz) besetzt/);
    await expect(hours).toContainText(/gegenüber letzter Woche|Diese Woche noch keine Stunden/);
    // … und wie eine Aktie die Veränderung im Zeitraum (▲/▼/±) – sie gehört zum Namen des Links.
    await expect(members).toHaveAccessibleName(/[+−±]\d+ \([+−±]\d+,\d %\) in 12 Monaten/);
    await expect(nextEvents).toHaveAccessibleName(/[+−±]\d+.*in 12 Wochen$/);
    await expect(hours).toContainText(/seit 01\.01\.\d{4}/);
    // Die Zahl der freien Plätze steht genau einmal im Namen des Links: Zahl, Besetzung, Veränderung der besetzten Plätze
    await expect(freeShifts).toHaveAccessibleName(
      /^Freie Helferplätze\s*\d+\s*\d+ von \d+ (Plätzen|Platz) besetzt\s*[+−±]\d+ besetzt\s*in \d+ Wochen$/,
    );

    // Die Karten (der Link liegt darin, Kurs und Zeitraum-Knöpfe daneben)
    const card = (group: Locator, link: Locator) =>
      group.locator('[data-slot="card"]').filter({ has: link });
    const heroCard = card(pair, members);
    const tasksCard = card(pair, tasks);
    const eventsCard = card(side, nextEvents);
    const hoursCard = card(side, hours);
    const shiftsCard = card(side, freeShifts);
    const paymentsTile = side.getByRole("region", { name: "Offene Zahlungen" });
    // Den großen Kursverlauf hat nur die Mitglieder-Kachel; Termine und freie Plätze zeigen eine kleine Linie, die
    // Helferstunden Balken je Abschnitt, der Aufgaben-Ring keinen Verlauf.
    await expect(heroCard.locator('[data-slot="quote-chart"]:visible')).toHaveCount(1);
    await expect(tasksCard.locator('[data-slot="quote-chart"]')).toHaveCount(0);
    await expect(side.locator('[data-slot="quote-chart"]')).toHaveCount(0);
    await expect(eventsCard.locator('[data-slot="sparkline"]')).toHaveCount(1);
    await expect(shiftsCard.locator('[data-slot="sparkline"]')).toHaveCount(1);
    // Der Balken der freien Plätze zeigt die besetzten von den benötigten (nur, wenn Schichten geplant sind – hier ja)
    await expect(shiftsCard.locator('[data-slot="pill-bar"]')).toHaveCount(1);
    // Helferstunden: im laufenden Jahr ein Balken je Monat seit Januar (Berliner Kalender)
    const month = Number(
      new Intl.DateTimeFormat("de-DE", { month: "numeric", timeZone: "Europe/Berlin" }).format(
        new Date(),
      ),
    );
    await expect(hoursCard.locator('[data-slot="step-bar"]')).toHaveCount(month);

    // Jede Karte mit Verlauf hat Zeitraum-Knöpfe; ein Klick wechselt nur den Verlauf dieser Karte (und führt nicht weg), die
    // Veränderung nennt den neuen Zeitraum
    const eventPeriods = eventsCard.getByRole("group", {
      name: "Zeitraum für „Termine in 30 Tagen“",
    });
    await expect(eventPeriods.getByRole("button")).toHaveText(["12 W", "6 M", "12 M"]);
    await expect(eventPeriods.getByRole("button", { pressed: true })).toHaveText("12 W");
    await expect(
      shiftsCard.getByRole("group", { name: "Zeitraum für „Freie Helferplätze“" }),
    ).toBeVisible();
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

    // Anordnung nach Inhaltsbreite – in beiden Fällen Mitglieder-Kachel und Aufgaben-Ring nebeneinander und gleich hoch, nichts
    // ragt aus dem Fenster. Maus weg (eine gedrückte Karte gibt sonst nach).
    await page.mouse.move(0, 0);
    const box = async (locator: Locator) => (await locator.boundingBox())!;
    const measure = async (label: string) => {
      const [m, a] = [await box(heroCard), await box(tasksCard)];
      expect(Math.abs(a.y - m.y), label).toBeLessThanOrEqual(1);
      expect(Math.abs(a.height - m.height), label).toBeLessThanOrEqual(1);
      expect(a.x, label).toBeGreaterThan(m.x + m.width);
      const [t, h, f, p] = [
        await box(eventsCard),
        await box(hoursCard),
        await box(shiftsCard),
        await box(paymentsTile),
      ];
      const width = page.viewportSize()!.width;
      for (const each of [m, a, t, h, f, p]) {
        expect(each.x + each.width, label).toBeLessThanOrEqual(width);
      }
      return { m, a, t, h, f, p, s: await box(side) };
    };
    const arrangement = () => side.evaluate((element) => getComputedStyle(element).display);
    const viewport = page.viewportSize()!;

    // 1280 px: Neben der schmalen Symbolleiste ist der Inhalt mindestens 58 rem breit – die übrigen Kennzahlen stehen als
    // schmale Spalte rechts neben dem Paar, untereinander in der Reihenfolge des Codes (Termine, Helferstunden, freie Plätze,
    // Zahlungen).
    await expect.poll(arrangement, { message: "1280 px" }).toBe("flex");
    {
      const { m, a, t, h, f, p, s } = await measure("1280 px");
      expect(s.x).toBeGreaterThan(a.x + a.width); // rechts neben dem Paar …
      expect(s.width).toBeLessThan(a.x + a.width - m.x); // … schmaler als das Paar …
      // … und oben bündig mit dem Anfang des Reiters: mit „Erste Schritte“ davor (offene Schritte des Vereinsadministrators)
      // beginnt die Spalte schon neben dieser Karte, sonst neben dem Paar.
      const intro = page.getByRole("region", { name: "Erste Schritte" });
      const start = (await intro.count()) > 0 ? (await box(intro)).y : m.y;
      expect(Math.abs(s.y - start)).toBeLessThanOrEqual(2);
      const column = [t, h, f, p];
      for (const [index, each] of column.entries()) {
        expect(Math.abs(each.x - s.x)).toBeLessThanOrEqual(1); // alle in der Spalte …
        const previous = column[index - 1];
        if (previous) expect(each.y).toBeGreaterThan(previous.y + previous.height); // … in der Reihenfolge des Codes
      }
    }

    // 1100 px (Inhalt schmaler als 58 rem): die übrigen Kennzahlen als Raster unter dem Paar – links Termine, freie Plätze und
    // Offene Zahlungen untereinander, rechts die Helferstunden über alle drei Reihen (oben und unten bündig).
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect.poll(arrangement, { message: "1100 px" }).toBe("grid");
    {
      const { m, t, h, f, p, s } = await measure("1100 px");
      expect(s.y).toBeGreaterThan(m.y + m.height);
      for (const each of [f, p]) expect(Math.abs(each.x - t.x)).toBeLessThanOrEqual(1);
      expect(f.y).toBeGreaterThan(t.y + t.height); // freie Plätze unter den Terminen …
      expect(p.y).toBeGreaterThan(f.y + f.height); // … Zahlungen unter den freien Plätzen
      expect(h.x).toBeGreaterThan(t.x + t.width);
      expect(Math.abs(h.y - t.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(h.y + h.height - (p.y + p.height))).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize(viewport); // zurück auf 1280 px für den Rest des Tests
    await expect.poll(arrangement).toBe("flex");

    // Unten auf der Mitglieder-Kachel: Aktiv, Passiv und alle übrigen Status – zusammen genau die große Zahl
    await expect(heroCard.getByRole("term")).toHaveText(["Aktiv", "Passiv", "Weitere"]);
    const digits = (text: string | null) => Number((text ?? "").replace(/\D/g, ""));
    const parts = (await heroCard.getByRole("definition").allTextContents()).map(digits);
    const total = digits(await heroCard.locator('[data-slot="kpi-value"]').textContent());
    expect(total).toBeGreaterThan(0);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
    // Der Aufgaben-Ring führt zu den Aufgaben und teilt die offenen auf: überfällig und im Zeitplan
    await expect(tasks).toHaveAttribute("href", "/aufgaben");
    const ring = (await tasks.textContent())!.match(
      /^Aufgaben im Verein\s*(\d+)\s*offen(?:\s*davon \d+ für dich)?\s*Überfällig\s*(\d+)\s*Im Zeitplan\s*(\d+)$/,
    );
    expect(ring).not.toBeNull();
    const [openTasks, overdue, onTime] = ring!.slice(1).map(Number);
    expect(overdue! + onTime!).toBe(openTasks);

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
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, Hans" })).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, Maria" })).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 1, name: /Willkommen/ })).toBeVisible();
    await open(page, "/dashboard?tab=termine");
    await expect(page.getByText("Sommerfest 2026")).toHaveCount(0);
    await expect(page.getByText("Vorstandssitzung")).toHaveCount(0);
  });
});
