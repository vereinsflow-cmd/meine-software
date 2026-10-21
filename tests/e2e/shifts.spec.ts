import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { appUrlPattern } from "./environment";
import { USERS, login, open, openNavGroup, outboxMailsTo } from "./helpers";

/**
 * Helferplanung im Browser. Tests, die Daten verändern, legen eigene Schichten mit eindeutigem Namen an und räumen
 * sie wieder ab bzw. tragen sich wieder aus – alle Tests teilen sich die Seed-Daten der E2E-Datenbank.
 */

async function openSommerfestPlan(page: Page): Promise<void> {
  await page.goto("/helferplanung");
  await page
    .getByRole("link", { name: /Sommerfest 2026/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sommerfest 2026", exact: true }),
  ).toBeVisible();
}

/** Öffnet das Menü „⋯“ einer Schicht und wählt einen Punkt. */
async function chooseFromMenu(page: Page, title: string, item: string): Promise<void> {
  await page
    .getByRole("listitem", { name: `Schicht ${title}` })
    .getByRole("button", { name: `Weitere Aktionen für „${title}“` })
    .click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function createShift(
  page: Page,
  title: string,
  from: string,
  to: string,
  required = 2,
): Promise<void> {
  await page.getByRole("button", { name: "Neue Schicht" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Neue Schicht" });
  await dialog.getByLabel("Bezeichnung").fill(title);
  await dialog.getByLabel("Beginn").fill(from);
  await dialog.getByLabel("Ende").fill(to);
  await dialog.getByLabel("Benötigte Helfer").fill(String(required));
  await dialog.getByRole("button", { name: "Schicht anlegen" }).click();
  await expect(page.getByRole("listitem", { name: `Schicht ${title}` })).toBeVisible();
}

async function deleteShift(page: Page, title: string): Promise<void> {
  const card = page.getByRole("listitem", { name: `Schicht ${title}` });
  await chooseFromMenu(page, title, "Schicht löschen");
  await page.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
  await expect(card).toHaveCount(0);
}

test.describe("Helferplanung – Veranstalter", () => {
  test("Übersicht zeigt Einsätze und je Veranstaltung die Besetzung und die Schichten mit freien Plätzen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    // Fertig geladen (hydratisiert) – sonst ginge der Klick auf „Verein“ unten verloren.
    await open(page, "/helferplanung");
    await expect(page.getByRole("heading", { level: 1, name: "Helferplanung" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Meine Einsätze" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Veranstaltungen mit Helferplanung" }),
    ).toBeVisible();
    // Seed-Sommerfest: 9 von 21 Plätzen besetzt; Aufbau ist voll, der Grillstand hat noch niemanden.
    const fest = page.getByRole("article", { name: "Sommerfest 2026" });
    await expect(fest).toContainText("9 von 21 Plätzen besetzt, 12 frei");
    const freie = fest.getByRole("list", { name: "Freie Plätze: Sommerfest 2026" });
    await expect(freie.getByRole("listitem").filter({ hasText: "Grillstand" })).toContainText(
      "0 von 3",
    );
    await expect(freie.getByRole("listitem").filter({ hasText: "Aufbau" })).toHaveCount(0);
    await expect(fest).toContainText("Außerdem voll besetzt: Aufbau");
    // Der Knopf oben auf der Seite führt zu den Helferstunden; der Menüpunkt selbst heißt wie die Seite „Helferplanung“.
    const hours = page.getByRole("main").getByRole("link", { name: "Helferstunden", exact: true });
    await expect(hours).toBeVisible();
    await expect(hours).toHaveAttribute("href", "/helferplanung/stunden");
    // In der Symbolleiste zeigt die Gruppe „Verein“, dass sie die aktuelle Seite enthält; in ihrem Menü ist „Helferplanung“
    // markiert – einen eigenen Menüpunkt „Helferstunden“ gibt es dort nicht.
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(
      nav.getByRole("button", { name: "Verein", exact: true }),
    ).toHaveAccessibleDescription(/enthält die aktuelle Seite/);
    await openNavGroup(nav, "Verein");
    await expect(nav.getByRole("link", { name: "Helferplanung", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Helferstunden" })).toHaveCount(0);
  });

  test("Schicht anlegen, Helfer zuweisen, Überschneidung wird verhindert, Schicht löschen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    const suffix = Date.now() % 100000;
    const first = `E2E Erste ${suffix}`;
    const second = `E2E Zweite ${suffix}`;

    // Zwei sich überschneidende Schichten (23:00–23:30 bzw. 23:10–23:50 – im Seed-Plan sonst nichts).
    await createShift(page, first, "23:00", "23:30");
    await createShift(page, second, "23:10", "23:50");
    const card1 = page.getByRole("listitem", { name: `Schicht ${first}` });
    await expect(card1.getByText("0 von 2")).toBeVisible();
    await expect(card1.getByText("Noch niemand eingetragen")).toBeVisible();

    // Zuweisen über das Menü „⋯“: "Helfer, Hans" hat im Seed nur Aufbau/Getränkestand am Vormittag/Mittag.
    await chooseFromMenu(page, first, "Helfer zuweisen");
    await page.getByLabel("Mitglied suchen").fill("Helfer");
    await page.getByRole("option", { name: /Helfer, Hans/ }).click();
    await page.getByRole("button", { name: "Helfer, Hans zuweisen" }).click();
    await expect(card1.getByText(/Hans Helfer/)).toBeVisible();
    await expect(card1.getByText("1 von 2")).toBeVisible();

    // Aufgeklappt (Klick auf den Namen der Schicht): Namen untereinander, darunter die freien Plätze mit „Zuweisen“.
    await card1.getByRole("button", { name: first, exact: true }).click();
    const names = card1.getByRole("list", { name: "Eingetragen" });
    await expect(names).toContainText("Hans Helfer");
    await expect(names).not.toContainText("frei"); // die Liste nennt nur Personen
    await expect(card1).toContainText("1 Platz frei");
    await expect(card1.getByRole("button", { name: `Helfer für ${first} zuweisen` })).toBeVisible();
    await expect(names.getByRole("button", { name: "Hans Helfer austragen" })).toBeVisible();

    // Zweite, überschneidende Schicht: dieselbe Person ist nicht wählbar – mit Begründung.
    await chooseFromMenu(page, second, "Helfer zuweisen");
    await page.getByLabel("Mitglied suchen").fill("Helfer");
    const option = page.getByRole("option", { name: /Helfer, Hans/ });
    await expect(option).toBeDisabled();
    await expect(option).toContainText(`Überschneidet sich mit der Schicht „${first}“`);
    await page.keyboard.press("Escape");

    // Verklickt: „×“ trägt aus, „Rückgängig“ in der Meldung trägt wieder ein; der Fokus bleibt beim Namen der Schicht.
    await names.getByRole("button", { name: "Hans Helfer austragen" }).click();
    await expect(page.getByText("Hans Helfer ausgetragen.")).toBeVisible();
    await expect(card1.getByText("0 von 2")).toBeVisible();
    await expect(card1.getByRole("button", { name: first, exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Rückgängig" }).click();
    await expect(page.getByText("Hans Helfer ist wieder eingetragen.")).toBeVisible();
    await expect(card1.getByText("1 von 2")).toBeVisible();

    // Aufräumen – danach steht der Fokus auf „Tagesablauf“ (die Zeile ist weg).
    await deleteShift(page, second);
    await deleteShift(page, first);
    await expect(page.getByRole("heading", { level: 2, name: "Tagesablauf" })).toBeFocused();
  });

  test("Vorbeie Veranstaltung: Stunden über das Menü; Zuweisen und Löschen gibt es dort nicht mehr", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/veranstaltungen?zeitraum=vergangen");
    const href = await page
      .getByRole("link", { name: /Jahreshauptversammlung 2026/ })
      .first()
      .getAttribute("href");
    await page.goto(`/helferplanung/${href!.split("/").pop()}`);
    const row = page.getByRole("listitem", { name: "Schicht Bewirtung" });
    await row.getByRole("button", { name: "Weitere Aktionen für „Bewirtung“" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Stunden erfassen", "Schicht bearbeiten"]);
    await page.getByRole("menuitem", { name: "Stunden erfassen" }).click();
    // Die Schicht klappt auf, der Fokus springt zum ersten Stunden-Knopf.
    await expect(row.locator("[data-hours]").first()).toBeFocused();
  });

  test("Schicht mit Pflichtfeldern: Validierungsfehler statt Absturz", async ({ page }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    await page.getByRole("button", { name: "Neue Schicht" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Neue Schicht" });
    await dialog.getByLabel("Benötigte Helfer").fill("0");
    await dialog.getByRole("button", { name: "Schicht anlegen" }).click();
    await expect(dialog.getByText("Bitte gib eine Bezeichnung ein.")).toBeVisible();
    await expect(dialog.getByText("Mindestens 1 Helfer.")).toBeVisible();
    await expect(dialog).toBeVisible(); // Dialog bleibt offen, nichts wurde angelegt
  });

  // Die Druckansicht selbst (Filter, Kopf-/Fußzeile, „Hier hat sich noch niemand eingetragen.“, print:hidden-Elemente …) hat
  // eigene, ausführlichere Tests in helferplan-drucken.spec.ts.
  test("„Drucken“ führt von der Veranstaltung aus in die Druckansicht, bereits auf sie eingegrenzt", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    await page.getByRole("link", { name: "Drucken" }).click();
    await expect(page).toHaveURL(/\/helferplanung\/drucken\?event=/);
    await expect(
      page.getByRole("heading", { name: "Helferplan Sommerfest 2026", exact: true }),
    ).toBeVisible();
  });

  test("CSV-Export der Helferplanung", async ({ page }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    const href = await page.getByRole("link", { name: "CSV-Export" }).getAttribute("href");
    expect(href).toMatch(/^\/api\/helferplanung\/[0-9a-f-]{36}\/export$/);
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("helferplan-");
    const body = await response.text();
    expect(body).toContain("Grillstand");
    expect(body).toContain("Aufbau");
  });

  test("Helferstunden-Übersicht zeigt dokumentierte Stunden der Jahreshauptversammlung", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/stunden");
    await expect(page.getByRole("heading", { level: 1, name: "Helferstunden" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Helferstunden/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Gesamt" })).toBeVisible();
  });
});

test.describe("Helferplanung – Helfer und Mitglieder", () => {
  test("Helfer trägt sich ein und wieder aus (Abbau am Abend)", async ({ page }) => {
    await login(page, USERS.helfer);
    await openSommerfestPlan(page);
    const card = page.getByRole("listitem", { name: "Schicht Abbau" });
    await expect(card).toBeVisible();

    // Hans Helfer ist im Seed bei Aufbau (vormittags) und Getränkestand (mittags) eingetragen; der Abbau am Abend ist frei.
    await card.getByRole("button", { name: "Eintragen" }).click();
    await expect(card.getByText(/Hans Helfer \(du\)/)).toBeVisible();
    await expect(card.getByRole("button", { name: "Austragen" })).toBeVisible();

    // Übersicht "Meine Einsätze" führt die Schicht.
    await page.goto("/helferplanung");
    await expect(
      page.getByRole("region", { name: "Meine Einsätze" }).getByText("Abbau"),
    ).toBeVisible();

    await openSommerfestPlan(page);
    await page
      .getByRole("listitem", { name: "Schicht Abbau" })
      .getByRole("button", { name: "Austragen" })
      .click();
    await expect(
      page.getByRole("listitem", { name: "Schicht Abbau" }).getByText(/\(du\)/),
    ).toHaveCount(0);
  });

  test("Überschneidende Schicht: Eintragen ist gesperrt, die Begründung nennt die Kollision", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await openSommerfestPlan(page);
    // Kuchenbuffet (13–17 Uhr) überschneidet sich mit Hans' Getränkestand (12–15 Uhr).
    const card = page.getByRole("listitem", { name: "Schicht Kuchenbuffet" });
    await expect(card.getByRole("button", { name: "Eintragen" })).toHaveCount(0);
    await expect(card.getByRole("note")).toContainText(
      "Überschneidet sich mit deiner Schicht „Getränkestand“",
    );
  });

  test("Helfer sieht keine Verwaltungsfunktionen und keine internen Hinweise", async ({ page }) => {
    await login(page, USERS.helfer);
    await openSommerfestPlan(page);
    await expect(page.getByRole("button", { name: "Neue Schicht" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zuweisen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Weitere Aktionen/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "CSV-Export" })).toHaveCount(0);
    const response = await page.request.get(
      `/api/helferplanung/${page.url().split("/").pop()}/export`,
    );
    expect(response.status()).toBe(403);
  });

  test("Grillstand ab 18: Maria ist bereits am Kuchenbuffet eingeteilt – Überschneidung wird erklärt", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await openSommerfestPlan(page);
    const grill = page.getByRole("listitem", { name: "Schicht Grillstand" });
    await expect(grill).toContainText("ab 18 Jahren");
    await expect(grill.getByRole("button", { name: "Eintragen" })).toHaveCount(0);
    await expect(grill.getByRole("note")).toContainText(
      "Überschneidet sich mit deiner Schicht „Kuchenbuffet“",
    );
    // Die eigene Schicht ist aufgeklappt und markiert („Du“).
    const kuchen = page.getByRole("listitem", { name: "Schicht Kuchenbuffet" });
    await expect(kuchen.getByRole("list", { name: "Eingetragen" })).toContainText("Maria Mitglied");
    await expect(kuchen.getByText("Du", { exact: true })).toBeVisible();
  });
});

test.describe("Helferplanung – „Neue Schicht“ auf der Übersicht", () => {
  test("Vorstand: Knopf vorn im Kopf, Auswahl der Veranstaltung mit Suche, danach ist „Neue Schicht“ gleich offen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/helferplanung");
    const header = page.locator('[data-slot="page-header"]');
    const button = header.getByRole("button", { name: "Neue Schicht" });
    await expect(button).toBeVisible();
    // Hauptaktion zuerst, wie auf den anderen Seiten (danach „Helferstunden“ und „Helferplan drucken“).
    await expect(header.getByRole("link").or(header.getByRole("button")).first()).toHaveText(
      "Neue Schicht",
    );

    // Abbrechen mit Escape: der Fokus kehrt zum Knopf zurück.
    await button.click();
    const picker = page.getByRole("dialog", { name: "Für welche Veranstaltung?" });
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    // Seed: zehn kommende Veranstaltungen (sechs Trainings …) – also mit Suchfeld; der Entwurf steht mit drin.
    const events = picker.getByRole("list", { name: "Veranstaltungen" }).getByRole("link");
    await expect(events.filter({ hasText: "Handball-Turnier der Jugend" })).toContainText(
      "Entwurf",
    );
    await expect(events.filter({ hasText: "Sommerfest 2026" })).toContainText("5 Schichten");
    const search = picker.getByLabel("Veranstaltung suchen");
    await expect(search).toBeFocused();
    await search.fill("sommerfest");
    await expect(events).toHaveCount(1);
    await search.fill("gibt es nicht");
    await expect(picker.getByText("Keine Veranstaltung gefunden.")).toBeVisible();
    await search.fill("Sommerfest");
    await events.first().click();

    // Der Helferplan des Sommerfests – mit offenem Dialog (die Seite dahinter ist für Screenreader ausgeblendet).
    const dialog = page.getByRole("dialog", { name: "Neue Schicht" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Bezeichnung")).toBeFocused();
    // Der Parameter ist gleich wieder aus der Adresse – Neuladen öffnet den Dialog nicht erneut.
    await expect(page).toHaveURL(/\/helferplanung\/[0-9a-f-]{36}$/);

    const title = `E2E Übersicht ${Date.now() % 100000}`;
    await dialog.getByLabel("Bezeichnung").fill(title);
    await dialog.getByLabel("Beginn").fill("23:00");
    await dialog.getByLabel("Ende").fill("23:30");
    await dialog.getByLabel("Benötigte Helfer").fill("2");
    await dialog.getByRole("button", { name: "Schicht anlegen" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sommerfest 2026", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("listitem", { name: `Schicht ${title}` })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("listitem", { name: `Schicht ${title}` })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await deleteShift(page, title);
  });

  test("Zurück und wieder vor: „Neue Schicht“ öffnet sich nicht noch einmal", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/helferplanung");
    await page.getByRole("button", { name: "Neue Schicht" }).first().click();
    const picker = page.getByRole("dialog", { name: "Für welche Veranstaltung?" });
    await picker.getByLabel("Veranstaltung suchen").fill("Sommerfest");
    await picker.getByRole("list", { name: "Veranstaltungen" }).getByRole("link").first().click();
    const dialog = page.getByRole("dialog", { name: "Neue Schicht" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/helferplanung\/[0-9a-f-]{36}$/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Helferplanung" })).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sommerfest 2026", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/helferplanung\/[0-9a-f-]{36}$/);
    // Der Dialog öffnete sich (vor der Behebung) erst nach dem Anzeigen der Seite – kurz warten, dann prüfen.
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Der Knopf öffnet ihn weiter wie gewohnt.
    await page
      .locator('[data-slot="page-header"]')
      .getByRole("button", { name: "Neue Schicht" })
      .click();
    await expect(dialog).toBeVisible();
  });

  test("Abteilungsleiterin: nur Veranstaltungen ihrer Abteilung zur Auswahl", async ({ page }) => {
    await login(page, USERS.abteilung);
    await open(page, "/helferplanung");
    await page.getByRole("button", { name: "Neue Schicht" }).first().click();
    const picker = page.getByRole("dialog", { name: "Für welche Veranstaltung?" });
    const events = picker.getByRole("list", { name: "Veranstaltungen" }).getByRole("link");
    // Seed: sechs Trainings der Fußballabteilung – weniger als sieben, also ohne Suchfeld; der Fokus steht dann auf der
    // ersten Veranstaltung (nicht auf „Schließen“).
    await expect(events.first()).toBeVisible();
    await expect(events.first()).toBeFocused();
    for (const text of await events.allInnerTexts()) expect(text).toContain("Fußball");
    await expect(events.filter({ hasText: "Sommerfest 2026" })).toHaveCount(0);
    await expect(events.filter({ hasText: "Handball-Turnier der Jugend" })).toHaveCount(0);
    await expect(picker.getByLabel("Veranstaltung suchen")).toHaveCount(0);
  });

  test("Helfer und Mitglieder: kein Knopf – und ?neu=schicht öffnet im Helferplan nichts", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await open(page, "/helferplanung");
    await expect(page.getByRole("heading", { level: 1, name: "Helferplanung" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Neue Schicht" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Weitere Aktionen" })).toHaveCount(0);
    await openSommerfestPlan(page);
    await open(page, `${new URL(page.url()).pathname}?neu=schicht`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sommerfest 2026", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, USERS.mitglied);
    await open(page, "/helferplanung");
    await expect(page.getByRole("button", { name: "Neue Schicht" })).toHaveCount(0);
  });

  test("Neuer Verein ohne Veranstaltung: der Dialog erklärt es und bietet „Veranstaltung anlegen“ an", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const admin = await newClubAdmin(page, browser);
    await open(admin, "/helferplanung");
    await expect(admin.getByRole("heading", { name: "Keine kommenden Schichten" })).toBeVisible();
    // Im Kopf und in der leeren Liste – beide öffnen dieselbe Erklärung.
    await expect(admin.getByRole("button", { name: "Neue Schicht" })).toHaveCount(2);
    await admin.getByRole("button", { name: "Neue Schicht" }).last().click();
    const dialog = admin.getByRole("dialog", { name: "Noch keine passende Veranstaltung" });
    await expect(dialog).toContainText("Gerade steht keine an");
    const create = dialog.getByRole("link", { name: "Veranstaltung anlegen" });
    await expect(create).toHaveAttribute("href", "/veranstaltungen/neu");
    await create.click();
    await expect(admin).toHaveURL(/\/veranstaltungen\/neu$/);
    await admin.context().close();
  });
});

/**
 * Legt als Plattformverwaltung einen frischen Verein an (ohne Veranstaltungen), nimmt die Einladung als dessen erster
 * Administrator an und schließt die Einrichtung mit den Pflichtangaben ab (wie einrichtung.spec.ts, nur kürzer). Liefert
 * die angemeldete Seite des neuen Administrators in einem eigenen Browser-Kontext.
 */
async function newClubAdmin(page: Page, browser: Browser): Promise<Page> {
  const id = randomBytes(3).toString("hex");
  const name = `Schichtverein ${id}`;
  const email = `schicht-${id}@e2e.test`;
  await login(page, USERS.superadmin);
  await open(page, "/system");
  await page.getByRole("button", { name: "Verein anlegen" }).click();
  const create = page.getByRole("dialog", { name: "Neuen Verein anlegen" });
  await create.getByLabel("Vereinsname").fill(name);
  await create.getByLabel("Kürzel").fill(`schichtverein-${id}`);
  await create.getByLabel("E-Mail-Adresse des ersten Administrators").fill(email);
  await create.getByRole("button", { name: "Verein anlegen" }).click();
  await expect(create).toBeHidden();
  await expect.poll(() => outboxMailsTo(email).length, { timeout: 15_000 }).toBe(1);
  const url = appUrlPattern("/einladung/[A-Za-z0-9_-]{43}").exec(outboxMailsTo(email)[0]!.text);
  expect(url).toBeTruthy();

  const admin = await (await browser.newContext()).newPage();
  await admin.goto(url![0]);
  await admin.getByLabel("Vorname").fill("Sina");
  await admin.getByLabel("Nachname").fill("Schicht");
  // Nur für dieses Testkonto in der E2E-Datenbank (wird mit ihr gelöscht).
  const secret = `Helferplan ohne Termine ${id}`;
  await admin.locator('input[name="password"]').fill(secret);
  await admin.locator('input[name="passwordRepeat"]').fill(secret);
  await admin.getByRole("checkbox", { name: /Datenschutzerklärung/ }).check();
  await admin.getByRole("button", { name: "Konto anlegen und beitreten" }).click();
  await expect(admin).toHaveURL(/\/einrichtung\?schritt=verein$/);
  await admin.locator('input[name="contactEmail"]').fill(`kontakt-${id}@e2e.test`);
  await admin.locator('input[name="street"]').fill("Am Sportplatz 1");
  await admin.locator('input[name="postalCode"]').fill("12345");
  await admin.locator('input[name="city"]').fill("Musterstadt");
  await admin.getByRole("button", { name: "Speichern und weiter" }).click();
  await expect(admin).toHaveURL(/schritt=logo$/);
  await open(admin, "/einrichtung?schritt=abschluss");
  await admin.getByRole("button", { name: "Einrichtung abschließen" }).click();
  await expect(admin).toHaveURL(/\/dashboard/);
  return admin;
}
