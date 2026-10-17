import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, loginSettled as login } from "./helpers";

/** Öffnet „Dashboard anpassen“ – vor der Hydration geht ein Klick verloren, daher wiederholen. */
async function openCustomize(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Dashboard anpassen" });
  await expect(async () => {
    await page.getByRole("button", { name: "Anpassen" }).click();
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return dialog;
}

/** Überschriften der Karten im Reiter „Übersicht“ in ihrer Reihenfolge auf der Seite. */
const cardTitles = (page: Page) =>
  page
    .getByRole("tabpanel", { name: "Übersicht" })
    .getByRole("region")
    .evaluateAll((regions) =>
      regions
        .map((region) => region.getAttribute("aria-labelledby"))
        .map((id) => (id ? document.getElementById(id)?.textContent?.trim() : null))
        .filter(Boolean),
    );

/**
 * Gruppe „Kennzahlen“: in der großen Fassung das Paar aus Mitglieder-Kachel und Aufgaben-Ring, im einfachen Raster das Karussell.
 * `exact`: Sonst träfe der Name auch die Gruppe „Weitere Kennzahlen“ der großen Fassung.
 */
const kpiGroup = (page: Page) => page.getByRole("group", { name: "Kennzahlen", exact: true });

/** „Meine Aufgaben“ über die volle Breite, die beiden übrigen „Für dich“-Karten darunter nebeneinander. */
async function expectTasksWide(page: Page) {
  const regions = ["Meine Aufgaben", "Meine Einsätze", "Benachrichtigungen"].map((name) =>
    page.getByRole("region", { name }),
  );
  for (const region of regions) await expect(region).toBeVisible();
  const [tasks, shifts, news] = await Promise.all(
    regions.map(async (region) => (await region.boundingBox())!),
  );
  expect(tasks!.width).toBeGreaterThan(shifts!.width * 1.8);
  expect(shifts!.y).toBeGreaterThan(tasks!.y + tasks!.height);
  expect(Math.abs(shifts!.y - news!.y)).toBeLessThanOrEqual(1);
}

test.describe("Dashboard selbst einstellen", () => {
  test("Karte ausblenden und verschieben, bleibt nach dem Neuladen – „Standard wiederherstellen“ macht es rückgängig", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    const before = await cardTitles(page);
    expect(before.indexOf("Meine Aufgaben")).toBeLessThan(before.indexOf("Meine Einsätze"));
    await expect(page.getByRole("region", { name: "Benachrichtigungen" })).toBeVisible();

    const dialog = await openCustomize(page);
    expect(await violations(page)).toEqual([]); // Fenster ohne Verstöße (axe)
    await dialog.getByRole("checkbox", { name: "Benachrichtigungen" }).uncheck();
    await dialog.getByRole("button", { name: "„Meine Einsätze“ nach oben" }).click();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Dashboard gespeichert.")).toBeVisible();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("region", { name: "Benachrichtigungen" })).toHaveCount(0);
    let after = await cardTitles(page);
    expect(after.indexOf("Meine Einsätze")).toBeLessThan(after.indexOf("Meine Aufgaben"));

    await page.reload();
    await expect(page.getByRole("region", { name: "Meine Einsätze" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Benachrichtigungen" })).toHaveCount(0);
    after = await cardTitles(page);
    expect(after.indexOf("Meine Einsätze")).toBeLessThan(after.indexOf("Meine Aufgaben"));

    const again = await openCustomize(page);
    await expect(again.getByRole("checkbox", { name: /Benachrichtigungen/ })).not.toBeChecked();
    await again.getByRole("button", { name: "Standard wiederherstellen" }).click();
    await again.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Standard-Ansicht wiederhergestellt.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Benachrichtigungen" })).toBeVisible();
    expect(await cardTitles(page)).toEqual(before);
  });

  test("Größe je Karte: Kennzahlen „Klein“ als schmale Reihe ohne Grafiken, „Meine Aufgaben“ „Groß“ über die volle Breite – bleibt nach dem Neuladen", async ({
    page,
  }) => {
    // Ohne Bewegung: Die Kennzahlen blenden beim Laden versetzt ein und stünden beim Messen sonst kurz auf verschiedenen Höhen.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.vorstand);
    const kpis = page.locator("[data-layout]");
    const group = kpiGroup(page);
    const side = page.getByRole("group", { name: "Weitere Kennzahlen" });
    const payments = page.getByRole("region", { name: "Offene Zahlungen", exact: true });
    // Standard für den Vorstand (Mitglieder, Termine und Schichten): große Fassung („Studio“) in „Mittel“ – Mitglieder mit Kurs im
    // Paar, Termine, Helferstunden, freie Plätze und Zahlungen in der Gruppe „Weitere Kennzahlen“
    await expect(kpis).toHaveAttribute("data-layout", "studio");
    await expect(kpis).toHaveAttribute("data-size", "m"); // Standard: Mittel
    expect(await group.locator('[data-slot="quote-chart"]').count()).toBeGreaterThan(0);
    await expect(side).toBeVisible();
    await expect(payments).toHaveCount(1); // als Kachel in der Spalte, nicht noch einmal als Karte
    // Neben den Kennzahlen steht „Meine Aufgaben“ schon ohne eigene Einstellung über die volle Breite
    await expectTasksWide(page);

    const dialog = await openCustomize(page);
    await dialog.getByRole("combobox", { name: "Größe von „Kennzahlen“" }).selectOption("s");
    await dialog.getByRole("combobox", { name: "Größe von „Meine Aufgaben“" }).selectOption("l");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Dashboard gespeichert.")).toBeVisible();

    const check = async () => {
      // „Klein“: zurück zum einfachen Raster (Karussell am Handy) – keine große Fassung, keine Spalte daneben
      await expect(kpis).toHaveAttribute("data-layout", "grid");
      await expect(kpis).toHaveAttribute("data-size", "s");
      await expect(side).toHaveCount(0);
      await expect(group.locator('[data-slot="quote-chart"]')).toHaveCount(0); // kein Kursverlauf
      // Die Offenen Zahlungen stehen wieder als eigene Karte – einmal
      await expect(payments).toHaveCount(1);
      // Gemessen werden die Zellen des Rasters, nicht die Karten: Was eine Karte unter dem Mauszeiger tut (nach „Speichern“ steht
      // der Zeiger dort, wo eben der Knopf war, oft über einer Kennzahl – auch nach dem Neuladen), verschiebt die Zelle nicht.
      const tops = await group.evaluate((carousel) =>
        [...carousel.children].map((cell) => Math.round(cell.getBoundingClientRect().top)),
      );
      expect(tops).toHaveLength(4);
      expect(new Set(tops).size).toBe(1); // eine Reihe
      // Ohne große Fassung gilt wieder das Raster der Karten: „Meine Aufgaben“ steht nur über die volle Breite, weil sie auf
      // „Groß“ steht
      await expectTasksWide(page);
    };
    await check();
    await page.reload();
    await check();

    const again = await openCustomize(page);
    await expect(again.getByRole("combobox", { name: "Größe von „Kennzahlen“" })).toHaveValue("s");
    await expect(again.getByRole("combobox", { name: "Größe von „Meine Aufgaben“" })).toHaveValue(
      "l",
    );
    await again.getByRole("button", { name: "Standard wiederherstellen" }).click();
    await expect(again.getByRole("combobox", { name: "Größe von „Kennzahlen“" })).toHaveValue("m");
    await again.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Standard-Ansicht wiederhergestellt.")).toBeVisible();
    await expect(kpis).toHaveAttribute("data-layout", "studio");
    await expect(kpis).toHaveAttribute("data-size", "m");
    expect(await group.locator('[data-slot="quote-chart"]').count()).toBeGreaterThan(0);
    await expect(side).toBeVisible();
  });

  test("Kennzahlen „Groß“: große Fassung mit Hoch, Tief und Ø unter dem Mitglieder-Kurs – bleibt nach dem Neuladen", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    const kpis = page.locator("[data-layout]");
    const members = kpiGroup(page)
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("link", { name: /^Mitglieder/ }) });
    const term = (name: string) =>
      members.getByRole("term").filter({ hasText: new RegExp(`^${name}$`) });
    // „Mittel“ (Standard): unter dem Kurs nur die Aufteilung Aktiv · Passiv · Weitere
    await expect(kpis).toHaveAttribute("data-size", "m");
    await expect(term("Aktiv")).toBeVisible();
    await expect(term("Hoch")).toHaveCount(0);

    const dialog = await openCustomize(page);
    await dialog.getByRole("combobox", { name: "Größe von „Kennzahlen“" }).selectOption("l");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Dashboard gespeichert.")).toBeVisible();

    const check = async () => {
      // Bleibt die große Fassung (kein einfaches Raster wie bei „Klein“), nur größer
      await expect(kpis).toHaveAttribute("data-layout", "studio");
      await expect(kpis).toHaveAttribute("data-size", "l");
      await expect(page.getByRole("group", { name: "Weitere Kennzahlen" })).toBeVisible();
      await expect(members.locator('[data-slot="quote-chart"]')).toHaveCount(1);
      await expect(term("Hoch")).toBeVisible();
      await expect(term("Tief")).toBeVisible();
      await expect(term("Ø")).toBeVisible();
      await expect(term("Aktiv")).toBeVisible(); // die Aufteilung bleibt
    };
    await check();
    await page.reload();
    await check();

    // Aufräumen: wieder die Standard-Ansicht
    const again = await openCustomize(page);
    await expect(again.getByRole("combobox", { name: "Größe von „Kennzahlen“" })).toHaveValue("l");
    await again.getByRole("button", { name: "Standard wiederherstellen" }).click();
    await again.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Standard-Ansicht wiederhergestellt.")).toBeVisible();
    await expect(kpis).toHaveAttribute("data-size", "m");
    await expect(term("Hoch")).toHaveCount(0);
  });

  test("Alle Karten eines Reiters ausgeblendet: freundlicher Hinweis statt leerer Fläche", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    const dialog = await openCustomize(page);
    const overview = dialog.getByRole("region", { name: "Übersicht" });
    for (const box of await overview.getByRole("checkbox").all()) await box.uncheck();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Alle Karten ausgeblendet")).toBeVisible();
    // Aufräumen: wieder die Standard-Ansicht
    const again = await openCustomize(page);
    await again.getByRole("button", { name: "Standard wiederherstellen" }).click();
    await again.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Alle Karten ausgeblendet")).toHaveCount(0);
  });
  test("„Erste Schritte“: offene Schritte als Links, „Ausblenden“ blendet die Karte aus, „Anpassen“ holt sie zurück", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const card = page.getByRole("region", { name: "Erste Schritte" });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/\d von \d erledigt/);
    await expect(
      card.getByRole("progressbar", { name: "Fortschritt der ersten Schritte" }),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: "Vereinslogo hochladen" })).toHaveAttribute(
      "href",
      "/einstellungen",
    );

    await card.getByRole("button", { name: "Ausblenden" }).click();
    await expect(
      page.getByText("Ausgeblendet – über „Anpassen“ holst du die Karte zurück."),
    ).toBeVisible();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Meine Aufgaben" })).toBeVisible();
    await expect(card).toHaveCount(0);

    const dialog = await openCustomize(page);
    await expect(dialog.getByRole("checkbox", { name: /Erste Schritte/ })).not.toBeChecked();
    await dialog.getByRole("button", { name: "Standard wiederherstellen" }).click();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(card).toBeVisible();
  });
});
