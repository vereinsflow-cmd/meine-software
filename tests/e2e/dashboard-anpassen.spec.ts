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
    await login(page, USERS.vorstand);
    const kpis = page.locator("[data-layout]");
    const group = page.getByRole("group", { name: "Kennzahlen" });
    await expect(kpis).toHaveAttribute("data-size", "m"); // Standard: Mittel
    expect(await group.locator('[data-slot="quote-chart"]').count()).toBeGreaterThan(0);

    const dialog = await openCustomize(page);
    await dialog.getByRole("combobox", { name: "Größe von „Kennzahlen“" }).selectOption("s");
    await dialog.getByRole("combobox", { name: "Größe von „Meine Aufgaben“" }).selectOption("l");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Dashboard gespeichert.")).toBeVisible();

    const check = async () => {
      await expect(kpis).toHaveAttribute("data-size", "s");
      await expect(group.locator('[data-slot="quote-chart"]')).toHaveCount(0); // kein Kursverlauf
      // Gemessen werden die Zellen des Rasters, nicht die Karten: Eine Karte unter dem Mauszeiger hebt sich beim Überfahren
      // um 2 px an (`hover:-translate-y-0.5`) – und nach „Speichern“ steht der Zeiger dort, wo eben der Knopf war, oft über
      // einer Kennzahl (auch nach dem Neuladen).
      const tops = await group.evaluate((carousel) =>
        [...carousel.children].map((cell) => Math.round(cell.getBoundingClientRect().top)),
      );
      expect(tops).toHaveLength(4);
      expect(new Set(tops).size).toBe(1); // eine Reihe
      // „Meine Aufgaben“ über die volle Breite, die beiden übrigen „Für dich“-Karten darunter nebeneinander
      const tasks = (await page.getByRole("region", { name: "Meine Aufgaben" }).boundingBox())!;
      const shifts = (await page.getByRole("region", { name: "Meine Einsätze" }).boundingBox())!;
      const news = (await page.getByRole("region", { name: "Benachrichtigungen" }).boundingBox())!;
      expect(tasks.width).toBeGreaterThan(shifts.width * 1.8);
      expect(shifts.y).toBeGreaterThan(tasks.y + tasks.height);
      expect(Math.abs(shifts.y - news.y)).toBeLessThanOrEqual(1);
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
    await expect(kpis).toHaveAttribute("data-size", "m");
    expect(await group.locator('[data-slot="quote-chart"]').count()).toBeGreaterThan(0);
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
