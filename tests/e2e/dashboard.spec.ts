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
    await login(page, USERS.admin);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, Anna!" })).toBeVisible();
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
    const members = page.getByRole("link", { name: /^Mitglieder \d+/ });
    const nextEvents = page.getByRole("link", { name: /Termine in 30 Tagen \d+/ });
    const freeShifts = page.getByRole("link", { name: /Freie Helferplätze \d+/ });
    const hours = page.getByRole("link", { name: /^Helferstunden \d{4}/ });
    await expect(members).toBeVisible();
    await expect(nextEvents).toBeVisible();
    await expect(freeShifts).toBeVisible();
    await expect(hours).toBeVisible();

    // Jede Kennzahlenkarte nennt einen kurzen Vergleich zur Einordnung der Zahl …
    await expect(members).toContainText(/gegenüber dem Vormonat/);
    await expect(nextEvents).toContainText(/Nächster Termin|Keine kommenden Termine/);
    await expect(freeShifts).toContainText(
      /von \d+ (Plätzen|Platz) besetzt|Keine Schichten geplant/,
    );
    await expect(hours).toContainText(/gegenüber letzter Woche|Diese Woche noch keine Stunden/);
    // … und wie eine Aktie die Veränderung im Zeitraum (▲/▼/±) – sie gehört zum Namen des Links.
    await expect(members).toHaveAccessibleName(/[+−±]\d+ \([+−±]\d+,\d %\) in 12 Monaten/);
    await expect(hours).toContainText(/seit 01\.01\.\d{4}/);
    // Die Karten (der Link liegt darin, Kurs und Zeitraum-Knöpfe daneben)
    const card = (label: RegExp) =>
      page
        .getByRole("group", { name: "Kennzahlen" })
        .locator('[data-slot="card"]')
        .filter({
          has: page.getByRole("link", { name: label }),
        });
    const cards = [
      card(/^Mitglieder \d+/),
      card(/Termine in 30 Tagen \d+/),
      card(/Freie Helferplätze \d+/),
      card(/^Helferstunden \d{4}/),
    ];
    // Kursverlauf in jeder Karte (die freien Plätze: in der hohen Kachel unter dem Ring) …
    for (const each of cards) {
      await expect(each.locator('[data-slot="quote-chart"]:visible')).toHaveCount(1);
    }
    // … mit Zeitraum-Knöpfen; ein Klick wechselt nur den Verlauf dieser Karte (und führt nicht weg), die Veränderung nennt
    // den neuen Zeitraum
    let navigated = false;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigated = true;
    });
    const periods = cards[0]!.getByRole("group", { name: "Zeitraum für „Mitglieder“" });
    await expect(periods.getByRole("button", { pressed: true })).toHaveText("12 M");
    await periods.getByRole("button", { name: "Verlauf in 6 Monaten" }).click();
    await expect(periods.getByRole("button", { pressed: true })).toHaveText("6 M");
    await expect(members).toContainText("in 6 Monaten");
    const hourPeriods = cards[3]!.getByRole("group", { name: /^Zeitraum für „Helferstunden/ });
    await hourPeriods.getByRole("button", { name: "Verlauf in 12 Wochen" }).click();
    await expect(hours).toContainText("in 12 Wochen");
    await expect(members).toContainText("in 6 Monaten"); // die Mitglieder-Karte bleibt bei ihrem Zeitraum
    expect(navigated).toBe(false);
    // Tastaturfokus: Der Rahmen liegt an der Karte selbst (sonst schnitte ihr Rand ihn ab)
    const ringBefore = await cards[0]!.evaluate((element) => getComputedStyle(element).boxShadow);
    await members.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(members).toBeFocused();
    expect(await cards[0]!.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
      ringBefore,
    );
    await page.keyboard.press("Escape");
    // Kachelraster (ab 1280 px): Mitglieder und freie Plätze reichen über beide Reihen, Termine und Helferstunden teilen sich
    // die Mitte – oben und unten schließt alles bündig ab. Ohne Bewegung (eine überfahrene Karte hebt sich sonst an).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(0, 0);
    const [m, t, f, h] = await Promise.all(cards.map(async (each) => (await each.boundingBox())!));
    for (const box of [t, f]) expect(Math.abs(box.y - m.y)).toBeLessThanOrEqual(1);
    for (const box of [h, f]) {
      expect(Math.abs(box.y + box.height - (m.y + m.height))).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(t.height - h.height)).toBeLessThanOrEqual(1);
    expect(h.y).toBeGreaterThan(t.y + t.height);
    // Die hohe Kachel zeigt die freien Plätze im Ring; die schmale Fassung (Leiste) ist ausgeblendet – die Zahl steht genau
    // einmal im Namen des Links, die Aufschlüsselung unter dem Ring wird nicht vorgelesen.
    await expect(freeShifts.locator('svg[data-slot="fill-meter"]')).toBeVisible();
    await expect(freeShifts.getByText(/^(Plätze|Platz) frei$/)).toBeVisible();
    await expect(freeShifts).toHaveAccessibleName(
      /^Freie Helferplätze \d+ (Plätze|Platz) frei (\d+ von \d+ (Plätzen|Platz) besetzt|Keine Schichten geplant)$/,
    );
    await expect(page.getByRole("heading", { level: 2, name: "Für dich" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Meine Aufgaben" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Meine Einsätze" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Benachrichtigungen" })).toBeVisible();
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
    await expect(page.getByRole("link", { name: "Neue Veranstaltung" })).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, Hans!" })).toBeVisible();
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

    // Nicht für diese Rolle:
    await expect(page.getByRole("link", { name: /^Mitglieder \d+/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Geburtstage" })).toHaveCount(0);
    await expect(page.getByText("Helferschichten sind noch nicht besetzt")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Neue Veranstaltung" })).toHaveCount(0);
    await selectTab(page, "Aufgaben & Aktivität");
    await expect(page.getByRole("region", { name: "Letzte Aktivitäten" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Auswertungen" })).toBeVisible(); // Aufgabenauswertung
  });

  test("Mitglied: nur „Übersicht“ und „Termine & Helfer“ – keine Verwaltungsfunktionen", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await expect(page.getByRole("heading", { level: 1, name: "Willkommen, Maria!" })).toBeVisible();
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
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await openNavGroup(nav, "Verein");
    await expect(nav.getByRole("link", { name: "Kalender", exact: true })).toBeVisible();
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
