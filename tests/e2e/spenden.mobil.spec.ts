import { expect, test, type Locator, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, chooseNewDonor, ensureLedger, login, open, openDonationDialog } from "./helpers";

/**
 * Spenden am Smartphone (Pixel 7, 412 px; dazu 390 px): „Spende erfassen“ geht am Handy, „Letzte Spenden“ ist eine Liste,
 * „Alle Spenden“ und „Spender“ stehen als gestapelte Karten (`<Table stack>`), die Menüs „⋯“ sind gut treffbar und nichts
 * läuft seitlich über – auch nicht mit einem sehr langen Spendernamen. Läuft nur im Projekt „mobil“; das Kassenbuch und die
 * Spende legt der erste Test selbst an.
 */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const YEAR = Number(
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(
    new Date(),
  ),
);
const suffix = String(Date.now() % 100000);
// Ein langer Name ohne gute Trennstellen: Auch dann darf nichts über den Rand laufen.
const DONOR = `Bürgerstiftung Großkleinwinkelhausen-Langenbergerfeld ${suffix}`;

/** Gestapelt: Die Kopfzeile ist nur noch für Screenreader da (1 × 1 Pixel), jede Zeile eine Karte so breit wie der Schirm. */
async function expectStacked(page: Page, table: Locator, row: Locator, firstColumn: string) {
  const head = table
    .getByRole("rowgroup")
    .filter({ has: page.getByRole("columnheader", { name: firstColumn }) });
  const headBox = (await head.boundingBox())!;
  expect(headBox.width).toBeLessThanOrEqual(1);
  expect(headBox.height).toBeLessThanOrEqual(1);
  const rowBox = (await row.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(rowBox.x).toBeGreaterThanOrEqual(0);
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(viewport.width);
  expect(await row.evaluate((element) => getComputedStyle(element).display)).toBe("block");
}

/** Die Beschriftung einer Zelle in der Karte (aus `<TableCell label>`, als `::before`). */
const cellLabel = (cell: Locator) =>
  cell.evaluate((element) => getComputedStyle(element, "::before").content);

test.describe.serial("Spenden – mobil", () => {
  test("Spende erfassen am Handy; im Cockpit steht sie unter „Letzte Spenden“, nichts läuft über", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, USERS.vorstand);
    await ensureLedger(page);
    await open(page, "/finanzen/spenden");

    const dialog = await openDonationDialog(page);
    await chooseNewDonor(dialog);
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(DONOR);
    await dialog
      .getByRole("combobox", { name: "Art", exact: true })
      .selectOption({ label: "Stiftung oder Verein" });
    await dialog.getByRole("textbox", { name: "Straße und Hausnummer" }).fill("Am Markt 1");
    await dialog.getByRole("textbox", { name: "Ort", exact: true }).fill("Bielefeld");
    await dialog.getByRole("textbox", { name: "PLZ" }).fill("33602");
    await dialog.getByRole("textbox", { name: "Betrag in €" }).fill("350,00");
    // Über 300 € braucht auch eine Überweisung eine Zuwendungsbestätigung.
    await expect(dialog.getByText(/^Zuwendungsbestätigung: nötig –/)).toBeVisible();
    // Das Fenster läuft am Handy nicht seitlich über; „Spende speichern“ geht über die ganze Breite.
    expect(
      await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    const save = dialog.getByRole("button", { name: "Spende speichern" });
    const saveBox = (await save.boundingBox())!;
    const formBox = (await dialog.locator("form").boundingBox())!;
    expect(saveBox.width).toBeGreaterThanOrEqual(formBox.width - 1);
    await save.click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(/^Spende gespeichert und gebucht als Nr\. \d{4}-\d{4}\.$/).first(),
    ).toBeVisible();

    // „Letzte Spenden“ ist am Handy eine Liste (Name und Betrag oben, Datum, Zweck und Stand darunter).
    const latest = page.getByRole("list", { name: `Die neuesten Spenden ${YEAR}` });
    const item = latest.getByRole("listitem").filter({ hasText: DONOR });
    await expect(item).toContainText("350,00 €");
    await expect(item.getByText("nötig", { exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: `Die neuesten Spenden ${YEAR}` })).toBeHidden();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("Alle Spenden: gestapelte Karten, „⋯“ gut treffbar, kein seitlicher Überlauf", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/spenden/alle");
    const table = page.getByRole("table", { name: `Spenden ${YEAR}, neueste zuerst` });
    const row = table.getByRole("row").filter({ hasText: DONOR });
    await expect(row).toBeVisible();
    await expectStacked(page, table, row, "Spender");
    // Jede Angabe wird eine Zeile „Beschriftung · Wert“; der Spender ist der Titel der Karte (ohne Beschriftung).
    expect(await cellLabel(row.locator('[data-label="Datum"]'))).toContain("Datum");
    expect(await cellLabel(row.locator('[data-label="Bestätigung"]'))).toContain("Bestätigung");
    expect(await cellLabel(row.locator('[data-label="Betrag"]'))).toContain("Betrag");
    await expect(row.getByRole("cell").first()).toContainText("Stiftung oder Verein");
    await expect(row.locator('[data-label="Betrag"]')).toContainText("350,00 €");
    // „⋯“ ist mit dem Finger gut zu treffen (mindestens 44 × 44 px).
    const menu = row.getByRole("button", { name: /^Weitere Aktionen/ });
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.height).toBeGreaterThanOrEqual(44);
    expect(menuBox.width).toBeGreaterThanOrEqual(44);
    // Die Filterleiste scrollt in sich, die Seite nicht.
    await expect(page.getByRole("navigation", { name: "Nach Bestätigung filtern" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await violations(page)).toEqual([]);

    await menu.click();
    await expect(page.getByRole("menuitem", { name: "Im Kassenbuch ansehen" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("Spender: gestapelte Karten mit Anschrift, Bestätigung und Summe, kein seitlicher Überlauf", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/spenden/spender");
    const table = page.getByRole("table", {
      name: `Spender ${YEAR}, nach Summe der Spenden geordnet`,
    });
    const row = table.getByRole("row").filter({ hasText: DONOR });
    await expect(row).toBeVisible();
    await expectStacked(page, table, row, "Spender");
    expect(await cellLabel(row.locator('[data-label="Anschrift"]'))).toContain("Anschrift");
    expect(await cellLabel(row.locator('[data-label="Bestätigung"]'))).toContain("Bestätigung");
    expect(await cellLabel(row.locator(`[data-label="Spenden ${YEAR}"]`))).toContain(
      `Spenden ${YEAR}`,
    );
    await expect(row.locator('[data-label="Anschrift"]')).toContainText("33602 Bielefeld");
    await expect(row.getByText("fehlt", { exact: true })).toBeVisible();
    await expect(row.locator(`[data-label="Spenden ${YEAR}"]`)).toContainText("350,00 €");
    const menu = row.getByRole("button", { name: `Weitere Aktionen für ${DONOR}` });
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.height).toBeGreaterThanOrEqual(44);
    expect(menuBox.width).toBeGreaterThanOrEqual(44);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await violations(page)).toEqual([]);
  });

  test("schmales Smartphone (390 px): Cockpit, Alle Spenden und Spender laufen nicht über", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.vorstand);
    for (const path of [
      "/finanzen/spenden",
      "/finanzen/spenden/alle",
      "/finanzen/spenden/spender",
      "/finanzen/spenden/beleg",
    ]) {
      await open(page, path);
      // Nur sichtbare Treffer: Im Cockpit steht der Name auch in der Tabelle „Letzte Spenden“, die am Handy versteckt ist.
      // Sind mehr als drei Bestätigungen offen, fehlt er unter „Das steht an“ („… und 4 weitere“) – dann wäre der erste
      // Treffer die versteckte Tabellenzelle.
      if (path !== "/finanzen/spenden/beleg")
        await expect(page.getByText(DONOR).filter({ visible: true }).first()).toBeVisible();
      expect(await overflow(page), path).toBeLessThanOrEqual(1);
    }
    // Die Karte in „Alle Spenden“ bleibt im Bild.
    await open(page, "/finanzen/spenden/alle");
    const row = page
      .getByRole("table", { name: `Spenden ${YEAR}, neueste zuerst` })
      .getByRole("row")
      .filter({ hasText: DONOR });
    const rowBox = (await row.boundingBox())!;
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(390);
  });
});
