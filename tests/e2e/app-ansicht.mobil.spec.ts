import { expect, test, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/**
 * Sichere Bereiche der App-Ansicht (`viewport-fit=cover`, `--safe-*` in globals.css): Mit Kamera-Aussparung/Statusleiste oben und
 * Home-Indikator unten liegt nichts Bedienbares darunter – im normalen Browser (Bereiche 0) sieht alles aus wie bisher.
 * Chromium bildet die Bereiche über das DevTools-Protokoll nach (`Emulation.setSafeAreaInsetsOverride`).
 * Läuft nur im Projekt "mobil" (Pixel 7, 412 × 839).
 */
const TOP = 47; // Statusleiste mit Kamera-Aussparung (iPhone mit Notch)
const BOTTOM = 34; // Home-Indikator
const HEADER = 64; // --app-header-height (4 rem) bei 839 px Höhe

async function emulateSafeArea(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: TOP, right: 0, bottom: BOTTOM, left: 0 },
  });
}

const header = (page: Page) => page.locator("header").first();
const px = (value: string) => parseFloat(value);
const style = (locator: ReturnType<Page["locator"]>, property: string) =>
  locator.evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property);

test.describe("App-Ansicht – sichere Bereiche", () => {
  test("im normalen Browser unverändert: Kopfzeile 64 px ohne Zusatzabstand", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
    const box = (await header(page).boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBe(HEADER);
    expect(await style(header(page), "padding-top")).toBe("0px");
    expect(await style(page.locator("body"), "padding-left")).toBe("0px");
  });

  test("mit Statusleiste und Home-Indikator: Kopfzeile, Menü, Suche und Dialog bleiben frei", async ({
    page,
  }) => {
    await emulateSafeArea(page);
    await login(page, USERS.admin);
    await open(page, "/dashboard");

    // Kopfzeile reicht bis unter die Statusleiste, ihr Inhalt beginnt darunter; die Reiter kleben direkt unter ihr.
    const box = (await header(page).boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBe(HEADER + TOP);
    const menuButton = page.getByRole("button", { name: "Menü öffnen" });
    expect((await menuButton.boundingBox())!.y).toBeGreaterThanOrEqual(TOP);
    const tabsTop = await page.getByRole("tablist").evaluate((element) => {
      let node: Element | null = element;
      while (node && getComputedStyle(node).position !== "sticky") node = node.parentElement;
      return node ? getComputedStyle(node).top : null;
    });
    expect(tabsTop).toBe(`${HEADER + TOP}px`);

    // Ganz nach unten gescrollt endet der Inhalt über dem Home-Indikator.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const mainBottom = await page
      .locator("main")
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(mainBottom).toBeLessThanOrEqual(page.viewportSize()!.height - BOTTOM + 0.5);

    // Menü (Sheet von links): Inhalt unterhalb der Statusleiste und oberhalb des Home-Indikators.
    await menuButton.click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    expect(px(await style(menu, "padding-top"))).toBe(TOP);
    expect(px(await style(menu, "padding-bottom"))).toBe(BOTTOM);
    expect(
      (await menu.getByRole("button", { name: "Schließen" }).boundingBox())!.y,
    ).toBeGreaterThanOrEqual(TOP);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // Suche: am Handy oben – unter der Statusleiste.
    await page.getByRole("button", { name: "Suche öffnen", exact: true }).click();
    const search = page.getByRole("dialog", { name: "Suche" });
    await expect(search).toBeVisible();
    expect((await search.boundingBox())!.y).toBeGreaterThanOrEqual(TOP + 16);
    await page.keyboard.press("Escape");
    await expect(search).toBeHidden();

    // Dialog: mittig zwischen Statusleiste und Home-Indikator.
    await open(page, "/aufgaben");
    await page.getByRole("button", { name: "Neue Aufgabe" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
    await expect(dialog).toBeVisible();
    await dialog.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    const dialogBox = (await dialog.boundingBox())!;
    expect(dialogBox.y).toBeGreaterThanOrEqual(TOP);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(
      page.viewportSize()!.height - BOTTOM,
    );
  });

  test("Meldungen (Toaster) erscheinen unter der Statusleiste", async ({ page }) => {
    await emulateSafeArea(page);
    await login(page, USERS.mitglied);
    await open(page, "/profil");
    // Namen unverändert speichern – ändert nichts, zeigt aber die Erfolgsmeldung.
    await page.getByRole("button", { name: "Speichern" }).first().click();
    const toast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Dein Name wurde gespeichert." });
    await expect(toast).toBeVisible();
    // Die Meldung gleitet von oben herein – gemessen wird, wo sie zur Ruhe kommt.
    await expect.poll(async () => (await toast.boundingBox())!.y).toBeGreaterThanOrEqual(TOP + 16);
  });

  test("Nachrichten füllen den Bildschirm ohne Scrollen – auch mit sicheren Bereichen", async ({
    page,
  }) => {
    await emulateSafeArea(page);
    await login(page, USERS.admin);
    await open(page, "/nachrichten");
    await expect(page.getByRole("heading", { level: 1, name: "Nachrichten" })).toBeVisible();
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  });
});
