import { expect, test, type Browser, type Page } from "@playwright/test";
import { pngImage } from "../helpers/images";
import { login, open, USERS } from "./helpers";

/**
 * Vereinslogo – mit dem zweiten Demo-Verein („Anderer Verein e.V.“), damit die übrigen Tests die unveränderten Daten des
 * TSV Musterstadt sehen. Am Ende wird das Logo wieder entfernt.
 */
const LOGO = Buffer.from(pngImage(160, 160, { rgba: [200, 40, 40, 255] }));

async function as<T>(browser: Browser, email: string, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await login(page, email);
    return await run(page);
  } finally {
    await context.close();
  }
}

const headerLogo = (page: Page) => page.getByRole("banner").locator('img[src^="/api/vereine/"]');

test("Vereinslogo: hochladen, anzeigen, geschützt ausliefern und wieder entfernen", async ({
  page,
  browser,
  request,
}) => {
  await login(page, USERS.otherAdmin);
  await open(page, "/einstellungen");
  const card = page.getByRole("heading", { name: "Vereinslogo", level: 2 });
  await expect(card).toBeVisible();
  await expect(page.getByText("Noch kein Logo")).toBeVisible();
  await expect(page.getByText("Anfangsbuchstaben „AV“")).toBeVisible();
  await expect(headerLogo(page)).toHaveCount(0); // ohne Logo wird gar kein Bild angefragt

  // SVG wird schon im Browser abgewiesen (verbindlich prüft der Server, siehe unten)
  await page.getByLabel("Logo auswählen").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "kein SVG" })).toBeVisible();

  // Hochladen (bewusst mit falschem Browser-Typ: gezählt wird der Inhalt)
  await page.getByLabel("Logo auswählen").setInputFiles({
    name: "wappen.png",
    mimeType: "application/octet-stream",
    buffer: LOGO,
  });
  await expect(page.getByText("Vorschau – noch nicht gespeichert")).toBeVisible();
  await page.getByRole("button", { name: "Logo hochladen" }).click();
  await expect(page.getByText("Logo gespeichert.")).toBeVisible();
  await expect(page.getByText("Aktuelles Logo")).toBeVisible();

  // In der Kopfzeile: echtes, geladenes Bild neben dem Namen (schmückend, ohne eigenen Namen)
  const img = headerLogo(page);
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("alt", "");
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(160);
  const src = (await img.getAttribute("src"))!;
  const [, clubId, version] = /^\/api\/vereine\/([0-9a-f-]{36})\/logo\?v=([0-9a-f]{16})$/.exec(
    src,
  )!;
  expect(clubId).toBeTruthy();

  // Auslieferung: Typ aus der Positivliste, nosniff, Sandbox, nur privat zwischengespeichert
  const served = await page.request.get(src);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect(served.headers()["content-security-policy"]).toContain("sandbox");
  expect(served.headers()["cache-control"]).toBe("private, max-age=31536000, immutable");
  expect(Buffer.from(await served.body())).toEqual(LOGO);
  const stale = await page.request.get(`/api/vereine/${clubId}/logo?v=0000000000000000`);
  expect(stale.headers()["cache-control"]).toBe("private, no-cache");

  // Schutz der Schnittstelle
  const url = `/api/vereine/${clubId}/logo`;
  const svg = await page.request.post(url, {
    multipart: {
      file: { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<svg onload='x'/>") },
    },
  });
  expect(svg.status()).toBe(422);
  const tooBig = await page.request.post(url, {
    multipart: {
      file: { name: "logo.png", mimeType: "image/png", buffer: Buffer.alloc(1_300_000, 0x61) },
    },
  });
  expect(tooBig.status()).toBe(413);
  const crossSite = await page.request.post(url, {
    multipart: { file: { name: "logo.png", mimeType: "image/png", buffer: LOGO } },
    headers: { origin: "https://boese-seite.example" },
  });
  expect(crossSite.status()).toBe(403);
  expect((await request.get(src)).status()).toBe(401); // nicht angemeldet

  // Mitglied eines anderen Vereins: „nicht gefunden“ – auch kein Hochladen in den fremden Verein
  await as(browser, USERS.admin, async (tsv) => {
    expect((await tsv.request.get(src)).status()).toBe(404);
    const foreign = await tsv.request.post(url, {
      multipart: { file: { name: "logo.png", mimeType: "image/png", buffer: LOGO } },
    });
    expect(foreign.status()).toBe(404);
  });

  // Mitglied in beiden Vereinen: sieht das Logo im Vereinswechsler beim anderen Verein
  await as(browser, USERS.mehrfach, async (both) => {
    await open(both, "/dashboard");
    await both.getByRole("button", { name: "Verein wechseln" }).click();
    const item = both.getByRole("menuitem", { name: /Anderer Verein/ });
    await expect(item.locator(`img[src="${src}"]`)).toBeVisible();
  });

  // Das Logo steht auch auf dem gedruckten Helferplan (neben dem Namen, nicht in der Überschrift)
  await open(page, "/helferplanung/drucken");
  await expect(page.locator("#helferplan-ausdruck header img")).toHaveAttribute("src", src);
  await expect(
    page
      .locator("#helferplan-ausdruck")
      .getByRole("heading", { name: "Anderer Verein e.V.", level: 1 }),
  ).toBeVisible();

  // Entfernen: wieder Anfangsbuchstaben, kein Bild mehr – die alte Adresse ist „nicht gefunden“
  await open(page, "/einstellungen");
  await page.getByRole("button", { name: "Logo entfernen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Entfernen" }).click();
  await expect(page.getByText("Logo entfernt.")).toBeVisible();
  await expect(page.getByText("Noch kein Logo")).toBeVisible();
  await expect(headerLogo(page)).toHaveCount(0);
  expect((await page.request.get(src)).status()).toBe(404);
  expect(version).toHaveLength(16);
});
