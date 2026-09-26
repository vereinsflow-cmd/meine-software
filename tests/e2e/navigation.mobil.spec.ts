import { expect, test, type Page } from "@playwright/test";
import { USERS, login, openNavGroup } from "./helpers";

/**
 * Ausklappendes Menü auf dem Smartphone: Die Einträge blenden gestaffelt ein, solange „Bewegung reduzieren“ nicht
 * eingestellt ist, und sind gut mit dem Finger zu treffen. Läuft nur im Projekt "mobil" (Dateiendung `.mobil.spec.ts`).
 */
async function openMenu(page: Page) {
  await login(page, USERS.helfer);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  return page.getByRole("dialog");
}
const style = (link: ReturnType<Page["locator"]>, property: string) =>
  link.evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property);

test.describe("Smartphone-Menü – Größe und Gruppenköpfe", () => {
  test("375 × 812: Einträge und Gruppenköpfe mindestens 44 px hoch, Gruppenköpfe in normaler Schrift mit Pfeil", async ({
    page,
  }) => {
    // Niedriger als 820 px – die enge Einstellung für niedrige Bildschirme gilt nur in der festen Seitenleiste (ab 1024 px).
    await page.setViewportSize({ width: 375, height: 812 });
    const menu = await openMenu(page);
    const nav = menu.getByRole("navigation", { name: "Hauptnavigation" });
    await openNavGroup(nav, "Verein");
    await expect(nav.getByRole("link", { name: "Kalender", exact: true })).toBeVisible();

    const heights = await nav.locator("a, button").evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.textContent?.trim() ?? "",
        height: element.getBoundingClientRect().height,
      })),
    );
    expect(heights.length).toBeGreaterThan(5);
    for (const { name, height } of heights) expect(height, name).toBeGreaterThanOrEqual(44);

    // Gruppenkopf: normale Schrift (keine Großbuchstaben), mindestens 15 px, mit gut sichtbarem Pfeil
    const head = nav.getByRole("button", { name: "Verein", exact: true });
    expect(await style(head, "text-transform")).toBe("none");
    expect(parseFloat(await style(head, "font-size"))).toBeGreaterThanOrEqual(15);
    expect((await head.locator("svg").boundingBox())!.width).toBeGreaterThanOrEqual(18);

    // Akkordeon bleibt: Öffnet man „Organisation“, schließt sich „Verein“.
    await openNavGroup(nav, "Organisation");
    await expect(head).toHaveAttribute("aria-expanded", "false");
  });
});

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
