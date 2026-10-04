import { expect, test } from "@playwright/test";
import { USERS, login, open, openNavGroup } from "./helpers";

test.describe("Logo", () => {
  test("Anmeldeseite zeigt das gestapelte Logo (Symbol oben, Wortmarke darunter) als Link zur Startseite", async ({
    page,
  }) => {
    await open(page, "/anmelden");
    const link = page.getByRole("link", { name: "VereinsFlow – Startseite" });
    await expect(link).toBeVisible();
    const logo = link.locator("img:visible");
    await expect(logo).toHaveAttribute("src", "/brand/logo-gestapelt.svg");
    const box = (await logo.boundingBox())!;
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(box.width * 0.5); // gestapelt: deutlich höher als die flache Fassung (0,22)
  });

  test("Seitenleiste zeigt das Logo als Link zum Dashboard", async ({ page }) => {
    await login(page, USERS.admin);
    const link = page.getByRole("link", { name: "VereinsFlow – Startseite" });
    await expect(link).toBeVisible();
    await expect(link.locator("img:visible")).toHaveAttribute("alt", ""); // der Linkname genügt, kein doppeltes Vorlesen
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
      .locator("img:visible")
      .boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    // Im eingeklappten Grundzustand (alle Untermenüs zu) passt die Navigation in 720 px Höhe; die Gruppe „Persönlich“
    // bleibt zusätzlich unten angeheftet, falls sie (kleinere Fenster, mehr Menüpunkte) doch scrollen muss.
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Hilfe & Support" })).toBeInViewport();
    await expect(nav.getByRole("link", { name: "Mein Profil" })).toBeInViewport();
    // Öffnet man ein Untermenü, bleibt sein Inhalt erreichbar – notfalls durch Scrollen innerhalb der Seitenleiste.
    await openNavGroup(nav, "Einstellungen");
    await nav.getByRole("link", { name: "Änderungsprotokoll" }).scrollIntoViewIfNeeded();
    await expect(nav.getByRole("link", { name: "Änderungsprotokoll" })).toBeVisible();
  });

  test("dunkle Darstellung: helle Fassung des Logos (weiße Schrift, Himmelblau) statt der schwarzen", async ({
    page,
  }) => {
    const logo = page.locator("header img:visible");

    await page.emulateMedia({ colorScheme: "light" });
    await open(page, "/anmelden");
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveAttribute("src", "/brand/logo-gestapelt.svg");

    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, "/anmelden");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(logo).toHaveCount(1); // die helle Fassung ist ausgeblendet, nicht zusätzlich sichtbar
    await expect(logo).toHaveAttribute("src", "/brand/logo-gestapelt-weiss.svg");
  });

  test("eingeklappte Seitenleiste zeigt nur das Symbol in der vereinfachten Form für kleine Größen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.getByRole("button", { name: "Seitenleiste einklappen" }).click();
    const logo = page
      .getByRole("link", { name: "VereinsFlow – Startseite" })
      .locator("img:visible");
    await expect(logo).toHaveAttribute("src", "/brand/symbol-klein.svg");
    const box = (await logo.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(36); // 2 rem – auf großen Bildschirmen wächst die Grundschrift leicht mit
    await page.getByRole("button", { name: "Seitenleiste ausklappen" }).click();
    await expect(logo).toHaveAttribute("src", "/brand/logo.svg");
  });

  test("Smartphone-Menü: Logo steht oben im ausgeklappten Menü", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await login(page, USERS.helfer);
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("img", { name: /VereinsFlow/ })).toBeVisible();
  });
});
