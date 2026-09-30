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
});
