import { expect, test, type Page } from "@playwright/test";
import { pngImage } from "../helpers/images";
import { login, open, USERS } from "./helpers";

/** Vereinslogo auf dem Smartphone: Kopfzeile, ausgeklapptes Menü, kein seitliches Überlaufen. Räumt am Ende auf. */
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("Smartphone: Vereinslogo in Kopfzeile und Menü, ohne dass etwas überläuft", async ({
  page,
}) => {
  await login(page, USERS.otherAdmin);
  await open(page, "/einstellungen");
  await page.getByLabel("Logo auswählen").setInputFiles({
    name: "logo.webp.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngImage(512, 256)),
  });
  await page.getByRole("button", { name: "Logo hochladen" }).click();
  await expect(page.getByText("Logo gespeichert.")).toBeVisible();

  await open(page, "/dashboard");
  const header = page.getByRole("banner");
  await expect(header.locator('img[src^="/api/vereine/"]')).toBeVisible();
  await expect(header).toContainText("Anderer Verein e.V.");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.locator('img[src^="/api/vereine/"]')).toBeVisible();
  // Das Produktlogo bleibt das einzige benannte Bild im Menü (das Vereinslogo ist schmückend)
  await expect(menu.getByRole("img", { name: /VereinsFlow/ })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await open(page, "/einstellungen");
  await page.getByRole("button", { name: "Logo entfernen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Entfernen" }).click();
  await expect(page.getByText("Logo entfernt.")).toBeVisible();
});
