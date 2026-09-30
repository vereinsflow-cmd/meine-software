import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * Die Anleitung zur Kontolöschung am Smartphone (Pixel 7, 412 px): Google Play und die Android-App öffnen sie auf dem Handy.
 * Nichts läuft seitlich aus dem Bildschirm, und die Links in den Fußzeilen (jetzt drei) passen nebeneinander oder brechen sauber
 * um. Läuft nur im Projekt "mobil".
 */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("Konto löschen – Smartphone", () => {
  test("Seite und Fußzeilen passen auf den Bildschirm", async ({ page }) => {
    const width = page.viewportSize()!.width;

    for (const path of ["/konto-loeschen", "/anmelden"]) {
      await open(page, path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(1);

      const link = page.getByRole("contentinfo").getByRole("link", { name: "Konto löschen" });
      await link.scrollIntoViewIfNeeded();
      await expect(link, path).toBeInViewport();
      const box = (await link.boundingBox())!;
      expect(box.x, path).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, path).toBeLessThanOrEqual(width);
    }
  });
});
