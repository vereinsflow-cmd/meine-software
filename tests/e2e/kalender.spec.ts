import { expect, test, type Locator, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/** Datum (JJJJ-MM-TT) in Europe/Berlin, `offset` Tage ab heute. Die Seed-Daten sind relativ zu "heute" angelegt. */
function berlinDate(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  });
}

/** Wie im Seed: Sommerfest = übernächster Samstag (der Samstag dieser Woche, sonst der nächste, plus sieben Tage). */
function festDay(): string {
  const weekdayMonday0 = (new Date(`${berlinDate(0)}T12:00:00Z`).getUTCDay() + 6) % 7;
  const untilSaturday = (5 - weekdayMonday0 + 7) % 7;
  return berlinDate((untilSaturday === 0 ? 7 : untilSaturday) + 7);
}

const monthTitle = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

test.describe("Kalender – Ansichten", () => {
  test("Monatsansicht zeigt eine Tabelle mit Wochentagen, Blättern und 'Heute' funktionieren", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/kalender");
    await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
    const heading = page.getByRole("heading", { level: 2 }).filter({ hasText: /\d{4}$/ });
    await expect(heading).toHaveText(monthTitle(berlinDate(0)));

    const table = page.getByRole("table", { name: "Monatsübersicht der Termine" });
    await expect(table).toBeVisible();
    for (const weekday of ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"])
      await expect(
        table.getByRole("columnheader", { name: new RegExp(`^${weekday}`) }),
      ).toBeVisible();
    await expect(table.locator('[aria-current="date"]')).toHaveCount(1); // heute ist markiert

    await page.getByRole("link", { name: "Nächster Monat" }).click();
    await expect(page).toHaveURL(/datum=\d{4}-\d{2}-01/);
    await expect(heading).not.toHaveText(monthTitle(berlinDate(0)));
    await page.getByRole("link", { name: "Vorheriger Monat" }).click();
    await expect(heading).toHaveText(monthTitle(berlinDate(0)));

    await page.getByRole("link", { name: "Nächster Monat" }).click();
    await page.getByRole("link", { name: "Heute", exact: true }).click();
    await expect(heading).toHaveText(monthTitle(berlinDate(0)));
  });

  test("Woche und Tag: Termin mit Link zur Veranstaltung, Wechsel der Ansicht behält das Datum", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const day = berlinDate(5); // Vorstandssitzung im Seed
    await page.goto(`/kalender?ansicht=woche&datum=${day}`);
    await expect(
      page.getByRole("heading", { level: 2 }).filter({ hasText: /^KW \d+/ }),
    ).toBeVisible();
    const chip = page.getByRole("link", { name: /Vorstandssitzung/ });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("19:30");

    await page
      .getByRole("navigation", { name: "Ansicht wählen" })
      .getByRole("link", { name: "Tag" })
      .click();
    await expect(page).toHaveURL(new RegExp(`ansicht=tag&datum=${day}`));
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toContainText(
      "19:30 – 21:30",
    );
    await expect(
      page.getByRole("navigation", { name: "Ansicht wählen" }).getByRole("link", { name: "Tag" }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: /Vorstandssitzung/ }).click();
    await expect(page).toHaveURL(/\/veranstaltungen\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vorstandssitzung" })).toBeVisible();
  });

  test("Liste gruppiert nach Tagen; leerer Zeitraum zeigt einen freundlichen Hinweis", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto(`/kalender?ansicht=liste&datum=${berlinDate(5)}`);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toBeVisible();

    await page.goto("/kalender?ansicht=tag&datum=2031-01-15");
    await expect(page.getByRole("heading", { level: 2, name: "Keine Termine" })).toBeVisible();
    // Im Hauptbereich suchen: Eine noch nicht eingeblendete, unsichtbare Kopie der gestreamten Seite liegt außerhalb.
    await expect(
      page.getByRole("main").getByText("An diesem Tag gibt es keine Termine"),
    ).toBeVisible();
  });

  test("Ungültige Parameter führen nicht zu Fehlern (Fallback auf Monat und heute)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/kalender?ansicht=hack&datum=31.02.2026&art=DROP&abteilung=%27%3B--&meine=x");
    await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: /\d{4}$/ })).toHaveText(
      monthTitle(berlinDate(0)),
    );
  });
});

test.describe("Kalender – Filter und Sichtbarkeit", () => {
  // Die Felder über ihre Rolle suchen: Beim Laden steht die Seite kurz ein zweites Mal im unsichtbaren Streaming-Puffer von
  // React (`<div hidden id="S:0">`); `getByLabel` fände dann zwei Felder, `getByRole` nur das sichtbare.
  test("Filter nach Art und Abteilung", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/kalender?ansicht=liste&datum=${berlinDate(5)}`);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toBeVisible();

    await page.getByRole("combobox", { name: "Art", exact: true }).selectOption("TRAINING");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/art=TRAINING/);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toHaveCount(0);

    // Nach „Zurücksetzen“ erst warten, bis die Seite ohne Filter da ist: Das Formular wird dabei neu aufgebaut, eine
    // vorher getroffene Auswahl ginge verloren und „Filtern“ schickte ein leeres Formular ab.
    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).not.toHaveURL(/art=/);
    await page.getByRole("combobox", { name: "Art", exact: true }).selectOption("MEETING");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/art=MEETING/);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toBeVisible();

    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).not.toHaveURL(/art=/);
    await page.getByRole("combobox", { name: "Abteilung" }).selectOption({ label: "Fußball" });
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/abteilung=/);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toHaveCount(0); // vereinsweit, nicht Fußball
  });

  test("Mitglied: 'Nur meine Termine' zeigt Zusagen und eigene Helferschichten", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await page.goto(`/kalender?ansicht=woche&datum=${festDay()}`);
    await expect(page.getByRole("link", { name: /Sommerfest 2026/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Schicht: Kuchenbuffet/ }).first()).toBeVisible();

    await page.goto(`/kalender?ansicht=liste&datum=${berlinDate(5)}`);
    await page.getByLabel("Nur meine Termine").check();
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/meine=1/);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toHaveCount(0);
  });

  test("Entwürfe sind nur für Verwalter im Kalender sichtbar", async ({ page, browser }) => {
    // Das Handball-Turnier ist im Seed ein Entwurf (in 40 Tagen).
    const day = berlinDate(40);
    await login(page, USERS.admin);
    await page.goto(`/kalender?ansicht=liste&datum=${day}`);
    const draft = page.getByRole("link", { name: /Handball-Turnier der Jugend/ });
    await expect(draft).toBeVisible();
    await expect(draft).toContainText("Entwurf");

    const context = await browser.newContext();
    const memberPage = await context.newPage();
    await login(memberPage, USERS.mitglied);
    await memberPage.goto(`/kalender?ansicht=liste&datum=${day}`);
    await expect(memberPage.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
    await expect(memberPage.getByRole("link", { name: /Handball-Turnier/ })).toHaveCount(0);
    await context.close();
  });

  test("Anderer Verein sieht keine Termine des TSV Musterstadt", async ({ page }) => {
    await login(page, USERS.otherAdmin);
    await page.goto(`/kalender?ansicht=liste&datum=${berlinDate(5)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Fußball-Training/ })).toHaveCount(0);
    await page.goto(`/kalender?ansicht=liste&datum=${festDay()}`);
    await expect(page.getByRole("link", { name: /Sommerfest 2026/ })).toHaveCount(0);
  });
});

// Die Tests nutzen März 2031: So weit in der Zukunft liegen keine Demo-Termine.
test.describe("Kalender – neuer Termin per Doppelklick", () => {
  const dialogOf = (page: Page) => page.getByRole("dialog", { name: "Neuer Termin" });

  /** Doppelklickt, bis das Fenster offen ist: Vor der Hydration geht ein Doppelklick verloren. */
  async function openByDoubleClick(page: Page, target: Locator): Promise<void> {
    await expect(async () => {
      await target.dblclick();
      await expect(dialogOf(page)).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
  }

  test("Monat: Doppelklick auf einen Tag öffnet „Neuer Termin“ mit diesem Datum; gespeichert steht der Entwurf am Tag", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/kalender?ansicht=monat&datum=2031-03-01");
    await expect(
      page.getByText("Doppelklick auf einen Tag legt dort einen neuen Termin an."),
    ).toBeVisible();

    const cell = page.locator('td[data-date="2031-03-12"]');
    await openByDoubleClick(page, cell);
    const dialog = dialogOf(page);
    await expect(dialog.getByLabel("Beginn – Datum")).toHaveValue("2031-03-12");
    await expect(dialog.getByLabel("Ende – Datum")).toHaveValue("2031-03-12");
    await expect(dialog.getByLabel("Titel")).toBeFocused(); // gleich lostippen
    expect(await page.evaluate(() => String(window.getSelection()))).toBe(""); // kein markiertes Wort

    await dialog.getByLabel("Titel").fill("Arbeitseinsatz Vereinsheim");
    await dialog.getByLabel(/^Art/).selectOption("WORK_ASSIGNMENT"); // Beschriftung „Art *“ (Pflichtfeld)
    await dialog.getByLabel("Beginn – Uhrzeit").fill("09:00");
    await dialog.getByLabel("Ende – Uhrzeit").fill("13:00");
    await dialog.getByRole("button", { name: "Als Entwurf speichern" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText("Termin als Entwurf angelegt.")).toBeVisible();
    const chip = cell.getByRole("link", { name: /Arbeitseinsatz Vereinsheim/ });
    await expect(chip).toContainText("09:00");
    await expect(chip).toContainText("(Entwurf)"); // Mitglieder sehen ihn erst nach dem Veröffentlichen
  });

  test("„Gleich veröffentlichen“: Vorgabe aus; angekreuzt steht der Termin sofort ohne „(Entwurf)“ am Tag", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/kalender?ansicht=monat&datum=2031-03-01");
    const cell = page.locator('td[data-date="2031-03-13"]');
    await openByDoubleClick(page, cell);
    const dialog = dialogOf(page);
    const publish = dialog.getByRole("checkbox", { name: "Gleich veröffentlichen" });
    await expect(publish).not.toBeChecked(); // Mitglieder werden benachrichtigt – nur mit Absicht
    await expect(dialog.getByText("Mitglieder sehen den Termin sofort")).toBeVisible();

    await dialog.getByLabel("Titel").fill("Frühjahrsputz");
    await dialog.getByLabel("Beginn – Uhrzeit").fill("10:00");
    await dialog.getByLabel("Ende – Uhrzeit").fill("12:00");
    await publish.check();
    await expect(dialog.getByRole("button", { name: "Als Entwurf speichern" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Veröffentlichen", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText("Termin veröffentlicht.")).toBeVisible();
    const chip = cell.getByRole("link", { name: /Frühjahrsputz/ });
    await expect(chip).toContainText("10:00");
    await expect(chip).not.toContainText("(Entwurf)");
  });

  test("Woche und Tag: Doppelklick auf eine Tagesspalte oder den leeren Tag; Abbrechen speichert nichts", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/kalender?ansicht=woche&datum=2031-03-19");
    await openByDoubleClick(page, page.locator('section[data-date="2031-03-20"]'));
    await expect(dialogOf(page).getByLabel("Beginn – Datum")).toHaveValue("2031-03-20");
    await dialogOf(page).getByLabel("Titel").fill("Wird nicht gespeichert");
    await dialogOf(page).getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialogOf(page)).toBeHidden();

    await open(page, "/kalender?ansicht=tag&datum=2031-03-20");
    await openByDoubleClick(
      page,
      page.getByRole("main").getByText("An diesem Tag gibt es keine Termine"),
    );
    await expect(dialogOf(page).getByLabel("Beginn – Datum")).toHaveValue("2031-03-20");
    await expect(dialogOf(page).getByLabel("Titel")).toHaveValue(""); // frisches Formular
    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toBeHidden();
    await expect(
      page.getByRole("main").getByText("An diesem Tag gibt es keine Termine"),
    ).toBeVisible();
  });

  test("Knopf „Neuer Termin“ (auch per Tastatur): gezeigter Tag vorbelegt, das Ende wandert mit dem Beginn", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/kalender?ansicht=tag&datum=2031-03-20");
    const button = page.getByRole("button", { name: "Neuer Termin" });
    await expect(async () => {
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(dialogOf(page)).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    const dialog = dialogOf(page);
    await expect(dialog.getByLabel("Beginn – Datum")).toHaveValue("2031-03-20");

    await dialog.getByLabel("Beginn – Datum").fill("2031-03-24");
    await expect(dialog.getByLabel("Ende – Datum")).toHaveValue("2031-03-24");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused(); // der Fokus kehrt zum Knopf zurück
  });

  test("Abteilungsleiterin: ihre Abteilung ist vorausgewählt", async ({ page }) => {
    await login(page, USERS.abteilung);
    await open(page, "/kalender?ansicht=monat&datum=2031-03-01");
    await openByDoubleClick(page, page.locator('td[data-date="2031-03-12"]'));
    const department = dialogOf(page).getByLabel("Abteilung");
    await expect(department.locator("option:checked")).toHaveText("Fußball");
  });

  test("Ohne Recht zum Anlegen: kein Knopf, kein Hinweis, Doppelklick öffnet nichts", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await open(page, "/kalender?ansicht=monat&datum=2031-03-01");
    await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Neuer Termin" })).toHaveCount(0);
    await expect(page.getByText("Doppelklick auf einen Tag")).toHaveCount(0);
    await page.locator('td[data-date="2031-03-12"]').dblclick();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("Kalender – iCal", () => {
  test("Einzelner Termin als .ics: nur mit Anmeldung, ohne interne Notizen", async ({
    page,
    playwright,
  }) => {
    await login(page, USERS.admin);
    await page.goto(`/kalender?ansicht=tag&datum=${berlinDate(5)}`);
    const href = await page.getByRole("link", { name: /Vorstandssitzung/ }).getAttribute("href");
    const id = href!.split("/").pop()!;

    const response = await page.request.get(`/api/calendar/event/${id}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/calendar");
    expect(response.headers()["content-disposition"]).toMatch(
      /attachment; filename="vorstandssitzung\.ics"/,
    );
    const body = await response.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("SUMMARY:Vorstandssitzung");
    expect(body).toContain("Vereinsheim\\, Besprechungsraum");
    expect(body).not.toContain("Trainerhonorare"); // interne Notiz der Veranstaltung

    const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    expect((await anonymous.get(`/api/calendar/event/${id}`)).status()).toBe(401);
    await anonymous.dispose();
  });

  test("Abo-Link: erzeugen, ohne Anmeldung abrufen, erneuern und widerrufen", async ({
    page,
    playwright,
  }) => {
    await login(page, USERS.helfer);
    await page.goto("/kalender");
    await page.getByRole("button", { name: "Abonnieren" }).click();
    const dialog = page.getByRole("dialog", { name: "Kalender abonnieren" });
    await dialog.getByRole("button", { name: /^(Neuen )?Link erzeugen$/ }).click();
    const url = await dialog.getByLabel("Dein persönlicher Link").inputValue();
    expect(url).toMatch(/^http:\/\/localhost:3100\/api\/calendar\/feed\/[A-Za-z0-9_-]{43}\.ics$/);
    await expect(dialog.getByText("Diesen Link siehst du nur jetzt.")).toBeVisible();

    // Kalender-Apps haben kein Sitzungs-Cookie: der geheime Link genügt.
    const anonymous = await playwright.request.newContext();
    const feed = await anonymous.get(url);
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toContain("text/calendar");
    expect(feed.headers()["cache-control"]).toContain("no-store");
    const body = await feed.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Sommerfest 2026");
    expect(body).toContain("SUMMARY:Helferschicht: Aufbau (Sommerfest 2026)"); // Hans ist beim Aufbau eingeteilt
    expect(body).not.toContain("Handball-Turnier"); // Entwurf
    expect(body).not.toContain("Strom-Verteiler"); // interne Notiz
    expect(body).not.toContain("Tagesordnung"); // interne Notiz

    // Neuer Link → der alte ist sofort ungültig.
    await dialog.getByRole("button", { name: "Neuen Link erzeugen" }).click();
    await expect(async () => {
      const second = await dialog.getByLabel("Dein persönlicher Link").inputValue();
      expect(second).not.toBe(url);
    }).toPass();
    expect((await anonymous.get(url)).status()).toBe(404);
    const newUrl = await dialog.getByLabel("Dein persönlicher Link").inputValue();
    expect((await anonymous.get(newUrl)).status()).toBe(200);

    // Widerruf
    await dialog.getByRole("button", { name: "Link widerrufen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Widerrufen" }).click();
    await expect(page.getByText("Der Abo-Link wurde widerrufen.")).toBeVisible();
    expect((await anonymous.get(newUrl)).status()).toBe(404);
    await anonymous.dispose();
  });

  test("Unbekannte oder manipulierte Abo-Links liefern 404 ohne Details", async ({
    playwright,
  }) => {
    const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    for (const path of [
      "/api/calendar/feed/abc.ics",
      `/api/calendar/feed/${"A".repeat(43)}.ics`,
      `/api/calendar/feed/${"A".repeat(43)}`,
      "/api/calendar/feed/..%2F..%2Fetc%2Fpasswd",
    ]) {
      const response = await anonymous.get(path);
      expect(response.status(), path).toBe(404);
      expect(await response.text()).toBe("Nicht gefunden");
    }
    await anonymous.dispose();
  });
});
