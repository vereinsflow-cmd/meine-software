import { expect, test, type Page } from "@playwright/test";
import { USERS, ensureLedger, login, open } from "./helpers";

/**
 * Feld „Bank“ am Handy (Pixel 7): 16-px-Schrift (sonst zoomt iOS beim Antippen), Vorschläge mindestens 44 px hoch und
 * per Antippen übernommen, nichts läuft seitlich über; eine lange Liste scrollt mit dem Finger, auch im Fenster. Läuft nur
 * im Projekt „mobil“. Ein echtes Handy mit offener Tastatur ersetzt das nicht.
 */

const isBankSearch = (url: URL) => url.pathname === "/api/banken";

/** Angemeldet als Kassenwart, Fenster „Konto hinzufügen“ offen – liefert das Feld „Bank oder Beschreibung“. */
async function openBankField(page: Page) {
  await login(page, USERS.vorstand);
  await ensureLedger(page);
  await open(page, "/finanzen/einstellungen");
  await page.getByRole("button", { name: "Konto hinzufügen" }).click();
  const dialog = page.getByRole("dialog", { name: "Konto hinzufügen" });
  const bank = dialog.getByRole("combobox", { name: "Bank oder Beschreibung" });
  await expect(bank).toBeVisible();
  return { dialog, bank };
}

/** Bank-Feld füllen und auf die Antwort der Suche warten. */
async function search(page: Page, bank: ReturnType<Page["getByRole"]>, q: string) {
  const answered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return isBankSearch(url) && url.searchParams.get("q") === q;
  });
  await bank.fill(q);
  await answered;
}

test("Bank am Handy: große Schrift, gut treffbare Vorschläge, Antippen übernimmt", async ({
  page,
}) => {
  const { dialog, bank } = await openBankField(page);
  expect(
    await bank.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);

  await search(page, bank, "sparkasse vest");
  const list = page.getByRole("listbox", { name: "Vorschläge" });
  const options = list.getByRole("option");
  await expect(options.first()).toContainText("Sparkasse Vest Recklinghausen");
  for (const height of await options.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  ))
    expect(height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await options.first().tap();
  await expect(bank).toHaveValue("Sparkasse Vest Recklinghausen");
  await expect(bank).toBeFocused(); // die Tastatur bleibt offen
  await expect(list).toBeHidden();
  await expect(dialog).toHaveAttribute("data-state", "open");
});

test("Lange Liste am Handy: scrollt mit dem Finger, obwohl das Fenster das Scrollen sperrt", async ({
  page,
}) => {
  // Acht lange Namen (mehrzeilig) – zu viel für den Platz unter oder über dem Feld.
  const long = "Raiffeisenbank Weißenburg-Gunzenhausen Höchstädt-Überlinge";
  await page.route(isBankSearch, (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          banks: Array.from({ length: 8 }, (_, index) => ({
            id: `stub-${index}`,
            name: `${long} ${index + 1}`,
            place: "Weißenburg",
            detail: "Weißenburg in Bayern · BLZ 765 600 60",
            value: long,
          })),
        },
      },
    }),
  );
  const { bank } = await openBankField(page);
  await search(page, bank, "lange namen");
  const list = page.getByRole("listbox", { name: "Vorschläge" });
  await expect(list.getByRole("option")).toHaveCount(8);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  // Wischen mit dem Finger (echte Touch-Ereignisse über das DevTools-Protokoll von Chromium).
  const box = (await list.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height * 0.8),
    yDistance: -Math.round(box.height * 0.6),
    gestureSourceType: "touch",
    speed: 600,
  });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
