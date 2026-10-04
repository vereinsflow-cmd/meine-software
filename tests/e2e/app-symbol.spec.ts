import { expect, test } from "@playwright/test";

/**
 * App-Symbol im Browser-Tab, in Lesezeichen und auf dem Startbildschirm (aus dem Logo-Paket, siehe docs/brand/README.md).
 * Browser laden Symbole und Manifest ohne Anmelde-Cookie – sie dürfen deshalb nicht zur Anmeldung umgeleitet werden.
 */
test.describe("App-Symbol", () => {
  test("jede Seite verweist auf Favicon, Vektor-Symbol, iPhone-Symbol und Manifest", async ({
    page,
  }) => {
    await page.goto("/anmelden");
    const head = page.locator("head");
    await expect(head.locator('link[rel="icon"][href^="/favicon.ico"]')).toHaveCount(1);
    await expect(head.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
    await expect(head.locator('link[rel="manifest"]')).toHaveCount(1);
    // Name unter dem Symbol auf iPhone/iPad – ohne den Vollbild-App-Modus einzuschalten.
    await expect(head.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "VereinsFlow",
    );
    await expect(head.locator('meta[name="mobile-web-app-capable"]')).toHaveCount(0);
  });

  test("Symbole und Manifest sind ohne Anmeldung abrufbar", async ({ request }) => {
    const get = (url: string) => request.get(url, { maxRedirects: 0 });

    const favicon = await get("/favicon.ico");
    expect(favicon.status()).toBe(200);
    const ico = await favicon.body();
    expect(ico.readUInt16LE(2)).toBe(1); // ICO-Datei …
    expect(ico.readUInt16LE(4)).toBe(3); // … mit 16, 32 und 48 px (nicht mehr das Next.js-Standardsymbol)

    const svg = await get("/icon.svg");
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    expect(await svg.text()).toContain('fill="#0F1C2E"'); // dunkle Kachel (Tinte) wie das Favicon der Website

    // Die Logo-Dateien der Oberfläche stehen schon auf der Anmeldeseite – auch sie brauchen keine Anmeldung.
    for (const file of ["logo.svg", "logo-weiss.svg", "logo-gestapelt.svg", "symbol-klein.svg"]) {
      const logo = await get(`/brand/${file}`);
      expect(logo.status(), file).toBe(200);
      expect(logo.headers()["content-type"], file).toContain("image/svg+xml");
    }

    expect((await get("/apple-icon.png")).status()).toBe(200);

    const manifest = await get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const data = (await manifest.json()) as {
      name: string;
      display: string;
      icons: { src: string; purpose: string }[];
    };
    expect(data.name).toBe("VereinsFlow");
    expect(data.display).toBe("browser");
    expect(data.icons.map((icon) => icon.purpose)).toEqual(["any", "any", "maskable"]);
    for (const icon of data.icons) {
      const response = await get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"], icon.src).toBe("image/png");
    }
  });
});
