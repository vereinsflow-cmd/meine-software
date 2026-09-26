import { expect, test, type Locator, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/**
 * Seitenkopf (`PageHeader`) und Menü „Weitere Aktionen“: Der Titel wird nie von den Knöpfen zusammengedrückt, die Seite
 * scrollt nicht seitlich, seltene Aktionen stecken im Menü – und ihre Rückfragen bleiben offen, obwohl sich das Menü
 * beim Auswählen schließt.
 */

/** Der Seitenkopf: `PageHeader` = Titelbereich (mit h1) und Aktionsleiste nebeneinander in einem Element. */
const pageHeader = (page: Page) => page.getByRole("heading", { level: 1 }).locator("xpath=../..");

/** Öffnet „Weitere Aktionen“; ein Klick vor der Hydration ginge verloren und wird deshalb wiederholt. */
async function openMoreActions(page: Page) {
  const trigger = pageHeader(page).getByRole("button", { name: "Weitere Aktionen" });
  await expect(async () => {
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return trigger;
}

/** Titel und Aktionen überlappen nicht, der Titel behält seine Breite, nichts läuft seitlich über. */
async function expectHeaderFits(page: Page, title: string, firstAction: Locator) {
  const heading = (await page.getByRole("heading", { level: 1, name: title }).boundingBox())!;
  const action = (await firstAction.boundingBox())!;
  expect(heading.width).toBeGreaterThan(150);
  const besideRight = action.x >= heading.x + heading.width;
  const below = action.y >= heading.y + heading.height;
  expect(besideRight || below, "Aktion liegt über dem Titel").toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "seitliches Scrollen").toBeLessThanOrEqual(0);
}

test.describe("Seitenkopf und „Weitere Aktionen“", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await login(page, USERS.admin);
  });

  test("Veranstaltung: nur „Bearbeiten“ als Knopf, der Rest im Menü; Rückfragen öffnen und schließen sauber", async ({
    page,
  }) => {
    await open(page, "/veranstaltungen");
    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Sommerfest 2026" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const header = pageHeader(page);
    const edit = header.getByRole("link", { name: "Bearbeiten", exact: true });
    await expect(edit).toBeVisible();
    await expectHeaderFits(page, "Sommerfest 2026", edit);
    // Seltene und gefährliche Aktionen stehen nicht mehr als eigene Knöpfe im Kopf.
    for (const name of ["Abschließen", "Duplizieren", "Archivieren", "Absagen"])
      await expect(header.getByRole("button", { name, exact: true })).toHaveCount(0);

    // Veröffentlicht: Abschließen, Duplizieren, Archivieren – abgesetzt Absagen; Löschen erst im Entwurf/Archiv.
    const trigger = await openMoreActions(page);
    const menu = page.getByRole("menu");
    for (const name of ["Abschließen", "Duplizieren", "Archivieren", "Absagen"])
      await expect(menu.getByRole("menuitem", { name })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Löschen" })).toHaveCount(0);
    await expect(menu.getByRole("separator")).toHaveCount(1);

    // Absagen öffnet dieselbe Rückfrage wie früher der eigene Knopf – und sie bleibt offen.
    await menu.getByRole("menuitem", { name: "Absagen" }).click();
    const cancel = page.getByRole("dialog", { name: "„Sommerfest 2026“ absagen?" });
    await expect(cancel).toBeVisible();
    await expect(cancel.getByLabel(/Grund der Absage/)).toBeFocused();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(cancel).toHaveCount(0);
    await expect(trigger).toBeFocused(); // Fokus zurück auf den Menüknopf

    // Auch per Tastatur: Menü öffnen, Rückfrage „Abschließen“ abbrechen.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Abschließen" })).toBeFocused();
    await page.keyboard.press("Enter");
    const complete = page.getByRole("alertdialog", { name: "Veranstaltung abschließen?" });
    await expect(complete).toBeVisible();
    await complete.getByRole("button", { name: "Abbrechen" }).click();
    await expect(complete).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("heading", { level: 1, name: "Sommerfest 2026" })).toBeVisible();
  });

  test("Abteilung: „Bearbeiten“ in der Hauptfarbe, Deaktivieren und Löschen im Menü", async ({
    page,
  }) => {
    await open(page, "/abteilungen");
    await page.locator('a[href^="/abteilungen/"]', { hasText: "Fußball" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Fußball" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const header = pageHeader(page);
    const edit = header.getByRole("button", { name: "Bearbeiten", exact: true });
    await expect(edit).toBeVisible();
    await expect(edit).toHaveAttribute("data-variant", "default");
    await expectHeaderFits(page, "Fußball", edit);
    for (const name of ["Deaktivieren", "Löschen"])
      await expect(header.getByRole("button", { name, exact: true })).toHaveCount(0);

    const trigger = await openMoreActions(page);
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Deaktivieren" })).toBeVisible();
    const remove = menu.getByRole("menuitem", { name: "Löschen" });
    await expect(remove).toHaveAttribute("data-variant", "destructive");
    await remove.click();
    const confirm = page.getByRole("alertdialog", { name: "Abteilung löschen?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Abbrechen" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
