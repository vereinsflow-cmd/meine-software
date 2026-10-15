import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open } from "./helpers";

/**
 * Ehrungen am Smartphone (Pixel 7, 412 px; dazu 390 px): Die Tabellen werden zu gestapelten Karten, nichts läuft seitlich
 * über, „Liste drucken“ ist gut treffbar und die Druckansicht passt ins Bild. Läuft nur im Projekt „mobil“.
 */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const YEAR = Number(
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(
    new Date(),
  ),
);
const suffix = String(Date.now() % 100000);
// Ein langer Name und mehrere Abteilungen: Auch dann darf nichts über den Rand laufen.
const LAST_NAME = `Langername-Jubiläumsmitglied${suffix}`;

async function importJubilar(page: Page) {
  const dir = path.resolve(".local", "e2e-files");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ehrungen-mobil-${suffix}.csv`);
  writeFileSync(
    file,
    `Vorname;Nachname;Mitgliedsnummer;Eintritt;Status;Abteilungen\nWilhelmine;${LAST_NAME};EM-${suffix};${YEAR - 25}-04-01;aktiv;Fußball|Handball|Tischtennis\n`,
    "utf8",
  );
  await open(page, "/mitglieder/import");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("1 gültig")).toBeVisible();
  await page.getByRole("button", { name: "1 Mitglieder importieren" }).click();
  await expect(page.getByText("Import abgeschlossen")).toBeVisible();
}

test.describe.serial("Ehrungen – mobil", () => {
  test("Smartphone: Stufen als gestapelte Karten, nichts läuft über, Knopf gut treffbar", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await importJubilar(page);

    await open(page, `/mitglieder/ehrungen?jahr=${YEAR}`);
    await expect(page.getByRole("heading", { level: 1, name: "Ehrungen" })).toBeVisible();
    const section = page.getByRole("region", { name: "25 Jahre", exact: true });
    const row = section.getByRole("row").filter({ hasText: LAST_NAME });
    await expect(row.getByRole("link", { name: `${LAST_NAME}, Wilhelmine` })).toBeVisible();
    await expect(row).toContainText("Fußball, Handball, Tischtennis");

    // Gestapelt: Die Kopfzeile ist nur noch für Screenreader da, die Zeile ist so breit wie ihre Karte.
    // (Der Kopfbereich ist auf 1 × 1 Pixel beschnitten; die Zellen darin behalten ihre Größe, sind aber nicht zu sehen.)
    const head = section
      .getByRole("rowgroup")
      .filter({ has: page.getByRole("columnheader", { name: "Name" }) });
    const headBox = (await head.boundingBox())!;
    expect(headBox.width).toBeLessThanOrEqual(1);
    expect(headBox.height).toBeLessThanOrEqual(1);
    const rowBox = (await row.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(rowBox.x).toBeGreaterThanOrEqual(0);
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(viewport.width);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    const print = page.getByRole("link", { name: "Liste drucken" });
    expect((await print.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    expect(await violations(page)).toEqual([]);

    await print.click();
    await expect(page.getByRole("article", { name: `Ehrungen ${YEAR}` })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("schmales Smartphone (390 px): Liste und Druckansicht laufen nicht über", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.admin);
    await open(page, `/mitglieder/ehrungen?jahr=${YEAR}`);
    await expect(page.getByRole("link", { name: `${LAST_NAME}, Wilhelmine` })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await open(page, `/mitglieder/ehrungen/drucken?jahr=${YEAR}`);
    await expect(
      page.getByRole("table", { name: "25 Jahre Mitgliedschaft" }).getByText(LAST_NAME),
    ).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});
