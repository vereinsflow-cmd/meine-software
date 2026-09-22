import { expect, test, type Page } from "@playwright/test";
import { USERS, login, openNavGroup } from "./helpers";

/**
 * Ausklappendes Menü auf dem Smartphone: Die Einträge blenden gestaffelt ein, solange „Bewegung reduzieren“ nicht
 * eingestellt ist. Läuft nur im Projekt "mobil" (Dateiendung `.mobil.spec.ts`).
 */
async function openMenu(page: Page) {
  await login(page, USERS.helfer);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  return page.getByRole("dialog");
}
const style = (link: ReturnType<Page["locator"]>, property: string) =>
  link.evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property);

test.describe("Smartphone-Menü – Animationen", () => {
  test("Einträge blenden gestaffelt ein (spätere Einträge starten später)", async ({ page }) => {
    const menu = await openMenu(page);
    const first = menu.getByRole("link", { name: "Dashboard", exact: true });
    const later = menu.getByRole("link", { name: "Hilfe & Support" });
    await expect(first).toBeVisible();
    expect(await style(first, "animation-name")).not.toBe("none");
    const delay = async (link: typeof first) => parseFloat(await style(link, "animation-delay"));
    expect(await delay(later)).toBeGreaterThan(await delay(first));
  });

  test("Symbol reagiert beim Antippen/Überfahren, das Menü schließt nach der Auswahl", async ({
    page,
  }) => {
    const menu = await openMenu(page);
    await openNavGroup(menu, "Verein");
    await menu.getByRole("link", { name: "Kalender", exact: true }).click();
    await expect(page).toHaveURL(/\/kalender/);
    await expect(menu).toBeHidden();
    // Erneut öffnen: Die Animation läuft jedes Mal neu, die Gruppe „Verein“ ist jetzt automatisch offen (aktive Seite)
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Kalender", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("„Bewegung reduzieren“: keine Einblend-Animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const menu = await openMenu(page);
    const link = menu.getByRole("link", { name: "Dashboard", exact: true });
    await expect(link).toBeVisible();
    expect(await style(link, "animation-name")).toBe("none");
  });
});
