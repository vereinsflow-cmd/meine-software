import { expect, test } from "@playwright/test";
import { USERS, login, open, openNavGroup, preferWideSidebar } from "./helpers";

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

  test("Symbolleiste bei üblicher Bildschirmhöhe: Logo-Kachel nicht angeschnitten, „Persönlich“ und die Menüs ohne Scrollen erreichbar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await login(page, USERS.admin);
    // Früher wurde die Kopfzeile bei langer Navigation zusammengedrückt und schnitt das Logo oben an (y = 0).
    const link = page.getByRole("link", { name: "VereinsFlow – Startseite" });
    await expect(link).toBeInViewport({ ratio: 1 });
    const box = (await link.locator("img:visible").boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    // Die Symbolleiste passt in 720 px Höhe: Das Kürzel der Person („Persönlich“) steht unten ganz im Bild, sein Menü mit
    // Profil und Hilfe & Support ebenso.
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("button", { name: /^Persönlich/ })).toBeInViewport({ ratio: 1 });
    await openNavGroup(nav, /^Persönlich/);
    await expect(nav.getByRole("link", { name: "Hilfe & Support" })).toBeInViewport();
    await expect(nav.getByRole("link", { name: "Mein Profil" })).toBeInViewport();
    await page.keyboard.press("Escape");
    // Auch das Menü einer Gruppe liegt ganz im Bild (es steht `fixed` über der Seite und schiebt sich vom Rand weg).
    await openNavGroup(nav, "Einstellungen");
    await expect(nav.getByRole("link", { name: "Änderungsprotokoll" })).toBeInViewport();
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

  test("Symbolleiste zeigt das volle Symbol auf weißer Kachel als Link zum Dashboard – auch in dunkler Darstellung", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const link = page.getByRole("link", { name: "VereinsFlow – Startseite" });
    await expect(link).toHaveAttribute("href", "/dashboard");
    await expect(link).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const logo = link.locator("img:visible");
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveAttribute("src", "/brand/symbol.svg");
    const box = (await logo.boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1); // nur das Symbol, ohne Wortmarke
    // Die Leiste ist immer dunkel, die Kachel immer weiß – deshalb steht fest die helle Fassung, auch bei dunkler Seite.
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, "/mitglieder");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveAttribute("src", "/brand/symbol.svg");
  });

  test("breite Seitenleiste zeigt das waagerechte Logo in heller Fassung, nicht angeschnitten; eingeklappt wieder das Symbol", async ({
    page,
  }) => {
    await preferWideSidebar(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await login(page, USERS.admin);
    const collapse = page.getByRole("button", { name: "Seitenleiste einklappen" });
    await expect(collapse).toBeVisible();
    const link = page.getByRole("link", { name: "VereinsFlow – Startseite" });
    const logo = link.locator("img:visible");
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveAttribute("src", "/brand/logo-weiss.svg"); // die Leiste ist dunkel
    // Die gemerkte Wahl greift erst nach dem Einhängen: Die Leiste wächst dann kurz von schmal auf breit – erst danach messen.
    await expect(logo).toBeInViewport({ ratio: 1 });
    await expect(async () => {
      const box = (await logo.boundingBox())!;
      const head = (await link.locator("xpath=..").boundingBox())!;
      expect(box.width).toBeGreaterThan(box.height * 3); // Symbol links, Wortmarke rechts
      // Ganz im Kopf der Leiste: oben mit Abstand (früher bei y = 0 angeschnitten), unten nicht über dessen Rand, rechts
      // nicht über die Leiste hinaus.
      expect(box.y).toBeGreaterThanOrEqual(8);
      expect(box.y + box.height).toBeLessThanOrEqual(head.y + head.height + 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(head.x + head.width);
    }).toPass({ timeout: 5_000 });

    await collapse.click();
    await expect(logo).toHaveAttribute("src", "/brand/symbol.svg");
  });

  test("Smartphone-Menü: Logo steht oben im ausgeklappten Menü", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await login(page, USERS.helfer);
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("img", { name: /VereinsFlow/ })).toBeVisible();
  });
});
