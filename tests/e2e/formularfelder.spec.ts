import { expect, test, type Locator, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/**
 * Eingabefelder und Tastaturfokus (siehe docs/DESIGN.md): Felder einer Zeile beginnen oben bündig, Feldränder und
 * Fokusrahmen heben sich mit mindestens 3:1 von ihrer Fläche ab (WCAG 1.4.11) – hell und dunkel. axe (a11y.spec.ts) prüft
 * nur Textkontraste; die Farbwerte selbst prüft zusätzlich tests/unit/theme-contrast.test.ts.
 */

/** Feld zur Beschriftung – genau dieser Text, bei Pflichtfeldern mit dem angehängten Sternchen. */
const field = (page: Page, label: string) => page.getByLabel(new RegExp(`^${label}( \\*)?$`));

/** Oberkante eines Felds und seiner Beschriftung (`label[for]`). */
async function tops(field: Locator): Promise<{ label: number; field: number }> {
  return field.evaluate((element) => ({
    field: element.getBoundingClientRect().top,
    label: document.querySelector(`label[for="${element.id}"]`)!.getBoundingClientRect().top,
  }));
}

/**
 * Kontrast (WCAG) zwischen einer Farbe des Elements (Rand oder Fokusrahmen) und der deckenden Fläche dahinter, im Browser
 * gerechnet. Der Umweg über ein Canvas wandelt jede CSS-Farbe (auch oklch) in sRGB.
 */
function contrastToSurface(
  locator: Locator,
  property: "border-top-color" | "outline-color",
): Promise<number> {
  return locator.evaluate((element, prop) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Kein Canvas");
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const luminance = ([r, g, b]: number[]) =>
      [r, g, b]
        .map((channel) => channel / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
    let surface = rgba(getComputedStyle(document.body).backgroundColor);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const color = rgba(getComputedStyle(parent).backgroundColor);
      if (color[3] === 255) {
        surface = color;
        break;
      }
    }
    const own = rgba(getComputedStyle(element).getPropertyValue(prop));
    const [light, dark] = [luminance(own), luminance(surface)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  }, property);
}

/** Meldet im gewünschten Farbschema an, öffnet die Seite und prüft, dass das Schema wirklich greift. */
async function openIn(page: Page, scheme: "light" | "dark", path: string) {
  await page.emulateMedia({ colorScheme: scheme });
  await login(page, USERS.admin);
  await open(page, path);
  const html = page.locator("html");
  if (scheme === "dark") await expect(html).toHaveClass(/\bdark\b/);
  else await expect(html).not.toHaveClass(/\bdark\b/);
}

test.describe("Formularfelder", () => {
  test("Felder einer Zeile beginnen oben bündig, auch wenn nur das Nachbarfeld einen Hilfetext hat", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    for (const [path, left, right] of [
      ["/mitglieder/neu", "Status", "Funktion im Verein"],
      ["/veranstaltungen/neu", "Sichtbarkeit", "Zielgruppe"],
    ] as const) {
      await open(page, path);
      const a = await tops(field(page, left));
      const b = await tops(field(page, right));
      expect(Math.abs(a.label - b.label), `${path}: Beschriftungen`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.field - b.field), `${path}: Felder`).toBeLessThanOrEqual(1);
    }
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme === "light" ? "hell" : "dunkel"}: Feldränder mindestens 3:1, Auswahlfeld mit derselben Fläche wie ein Textfeld`, async ({
      page,
    }) => {
      await openIn(page, scheme, "/mitglieder/neu");
      const text = field(page, "Vorname");
      const select = field(page, "Status");
      for (const input of [text, select]) {
        await expect
          .poll(() => contrastToSurface(input, "border-top-color"))
          .toBeGreaterThanOrEqual(3);
      }
      const background = (input: Locator) =>
        input.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(await background(select)).toBe(await background(text));
    });

    test(`${scheme === "light" ? "hell" : "dunkel"}: Tastaturfokus auf Links – 2 px in der Markenfarbe mit 2 px Abstand, mindestens 3:1`, async ({
      page,
    }) => {
      await openIn(page, scheme, "/mitglieder");
      const link = page.locator("tbody a[href^='/mitglieder/']").first();
      await link.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab"); // Fokus per Tastatur auf den Mitgliedsnamen (focus-visible)
      await expect(link).toBeFocused();
      const { color, brand, ...outline } = await link.evaluate((element) => {
        // Die Markenfarbe so, wie der Browser sie ausrechnet – dann lassen sich beide Farbangaben direkt vergleichen.
        const probe = document.createElement("span");
        probe.style.color = "var(--primary)";
        document.body.append(probe);
        const brand = getComputedStyle(probe).color;
        probe.remove();
        const style = getComputedStyle(element);
        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          offset: style.outlineOffset,
          color: style.outlineColor,
          brand,
        };
      });
      expect(outline).toEqual({ style: "solid", width: "2px", offset: "2px" });
      expect(color, "Fokusrahmen in der Markenfarbe").toBe(brand);
      await expect.poll(() => contrastToSurface(link, "outline-color")).toBeGreaterThanOrEqual(3);
    });
  }
});
