import { expect, test } from "@playwright/test";
import { USERS, login, open } from "./helpers";

test.describe("Logo", () => {
  test("Anmeldeseite zeigt das gestapelte Logo (Symbol oben, Wortmarke und Slogan darunter) als Link zur Startseite", async ({
    page,
  }) => {
    await open(page, "/anmelden");
    const link = page.getByRole("link", { name: "VereinsFlow – Startseite" });
    await expect(link).toBeVisible();
    const box = (await link.locator("svg").boundingBox())!;
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(box.width * 0.6); // gestapelt: deutlich höher als die flache Fassung
  });

  test("Seitenleiste zeigt das Logo als Link zum Dashboard", async ({ page }) => {
    await login(page, USERS.admin);
    const link = page.getByRole("link", { name: "VereinsFlow – Startseite" });
    await expect(link).toBeVisible();
    await expect(link.locator("svg")).toHaveAttribute("aria-hidden", "true"); // der Linkname genügt, kein doppeltes Vorlesen
    await open(page, "/mitglieder");
    await link.click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("Seitenleiste bei üblicher Bildschirmhöhe: Logo nicht angeschnitten, Hilfe & Support ohne Scrollen erreichbar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await login(page, USERS.admin);
    // Früher wurde die Kopfzeile bei langer Navigation zusammengedrückt und schnitt das Logo oben an (y = 0).
    const box = (await page
      .getByRole("link", { name: "VereinsFlow – Startseite" })
      .locator("svg")
      .boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    // Die ganze Navigation des Administrators passt in 720 px Höhe; die Gruppe „Persönlich“ bleibt zusätzlich unten angeheftet,
    // falls sie (kleinere Fenster, mehr Menüpunkte) doch scrollen muss.
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Änderungsprotokoll" })).toBeInViewport();
    await expect(nav.getByRole("link", { name: "Hilfe & Support" })).toBeInViewport();
    await expect(nav.getByRole("link", { name: "Mein Profil" })).toBeInViewport();
  });

  test("dunkle Darstellung: Wortmarke wechselt auf helle Schrift und bleibt lesbar", async ({
    page,
  }) => {
    // Pfade im Logo: 1 = Überschnitt der Kreise, 2 = "Vereins" (Schrift), 3 = "Flow", 4 = Slogan
    const inkOf = () =>
      page
        .locator("header svg path")
        .nth(1)
        .evaluate((element) => getComputedStyle(element).fill);

    await page.emulateMedia({ colorScheme: "light" });
    await open(page, "/anmelden");
    expect(await inkOf()).toBe("rgb(18, 37, 59)"); // dunkles Marineblau des Originals

    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, "/anmelden");
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await inkOf()).toBe("rgb(238, 243, 249)"); // helle Schrift auf dunklem Grund
  });

  test("Smartphone-Menü: Logo steht oben im ausgeklappten Menü", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await login(page, USERS.helfer);
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("img", { name: /VereinsFlow/ })).toBeVisible();
  });
});
