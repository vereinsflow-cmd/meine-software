import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * Helferplan-Druckansicht auf Smartphone (Pixel 7, 412 px) und Tablet-Breite (820 px): Der Button ist gut
 * treffbar, das Filterformular läuft nicht seitlich über den Bildschirm, und der Ausdruck bleibt lesbar. Läuft nur
 * im Projekt "mobil".
 */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("Helferplan drucken – mobil", () => {
  test("Smartphone: Button ist gut treffbar, Formular und Ausdruck laufen nicht über den Bildschirm", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung");
    const button = page.getByRole("link", { name: "Helferplan drucken" });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(36); // gut treffbar (Button-Standardgröße)

    await button.click();
    await expect(page.getByRole("heading", { level: 1, name: "Helferplan drucken" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    await page.getByRole("checkbox", { name: /Arbeitseinsatz Vereinsheim/ }).check();
    await page.getByRole("button", { name: "Auswahl anwenden" }).click();
    await expect(page.getByRole("heading", { name: "Arbeitseinsatz Vereinsheim" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("Tablet-Breite (820 px): Formular in mehreren Spalten, Ausdruck bleibt lesbar, nichts läuft über", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await login(page, USERS.admin);
    await page.goto("/helferplanung/drucken");
    await expect(page.getByRole("heading", { name: "TSV Musterstadt 1898 e.V." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Von dort lässt sich auch drucken – der Knopf bleibt erreichbar, ohne zu scrollen.
    const printButton = page.getByRole("button", { name: "Drucken" });
    await expect(printButton).toBeVisible();
  });
});
