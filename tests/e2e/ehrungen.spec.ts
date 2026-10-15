import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, chooseTab, login, loginSettled, open } from "./helpers";

/**
 * Ehrungen (runde Mitgliedsjubiläen): Seite `/mitglieder/ehrungen` mit Jahresauswahl, Stufen als Tabellen, Druckansicht,
 * CSV-Export, Rechte je Rolle und die Dashboard-Karte „Jubiläen“. Die Jubilare legt der Test selbst per CSV-Import an
 * (Eintrittsdaten relativ zu heute in Berlin), damit er unabhängig vom Datum des Laufs ist.
 */

/** Heutiger Kalendertag in Berlin als „JJJJ-MM-TT“ – wie die Anwendung rechnet. */
const berlinToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const shiftDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const minusYears = (iso: string, years: number) =>
  `${Number(iso.slice(0, 4)) - years}${iso.slice(4)}`;

const today = berlinToday();
const YEAR = Number(today.slice(0, 4));
const suffix = String(Date.now() % 100000);
const NAMES = {
  fifty: `Fünfzig${suffix}`, // 50 Jahre im laufenden Jahr, Handball
  forty: `Vierzig${suffix}`, // 40 Jahre im laufenden Jahr, Fußball
  left: `Ausgetreten${suffix}`, // 50 Jahre im laufenden Jahr – aber vorher ausgetreten
  soon: `Bald${suffix}`, // 75 Jahre in zwei Tagen (Dashboard), Fußball
};
// In zwei Tagen (einen Tag später, falls das ein 29. Februar wäre – den gibt es 75 Jahre vorher nicht)
const soonOffset = shiftDays(today, 2).endsWith("02-29") ? 3 : 2;
const soonDay = shiftDays(today, soonOffset);

/** Legt die Jubilare über den CSV-Import an – genau wie ein Verein seine Mitgliederliste übernimmt. */
async function importJubilare(page: Page) {
  const dir = path.resolve(".local", "e2e-files");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ehrungen-${suffix}.csv`);
  writeFileSync(
    file,
    [
      "Vorname;Nachname;Mitgliedsnummer;Eintritt;Austritt;Status;Abteilungen",
      `Erika;${NAMES.fifty};E-${suffix}-1;${YEAR - 50}-03-01;;aktiv;Handball`,
      `Otto;${NAMES.forty};E-${suffix}-2;${YEAR - 40}-03-02;;aktiv;Fußball`,
      `Paul;${NAMES.left};E-${suffix}-3;${YEAR - 50}-12-01;${YEAR}-01-15;ausgetreten;Fußball`,
      `Berta;${NAMES.soon};E-${suffix}-4;${minusYears(soonDay, 75)};;aktiv;Fußball`,
    ].join("\n") + "\n",
    "utf8",
  );
  await open(page, "/mitglieder/import");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("4 gültig")).toBeVisible();
  await page.getByRole("button", { name: "4 Mitglieder importieren" }).click();
  await expect(page.getByText("Import abgeschlossen")).toBeVisible();
}

/** Öffnet „Dashboard anpassen“ – vor der Hydration geht ein Klick verloren, daher wiederholen (wie dashboard-anpassen.spec.ts). */
async function openCustomize(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Dashboard anpassen" });
  await expect(async () => {
    await page.getByRole("button", { name: "Anpassen" }).click();
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return dialog;
}

test.describe.serial("Ehrungen", () => {
  test("Vereinsadministrator: Liste je Stufe, Jahr wechseln, Drucken, Export", async ({ page }) => {
    await login(page, USERS.admin);
    await importJubilare(page);

    // Von der Mitgliederliste aus erreichbar
    await open(page, "/mitglieder");
    await page.getByRole("link", { name: "Ehrungen", exact: true }).click();
    await expect(page).toHaveURL(/\/mitglieder\/ehrungen$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ehrungen" })).toBeVisible();
    await expect(page.getByText(/10, 25, 40, 50, 60, 70 oder 75 Jahre Mitglied/)).toBeVisible();
    await expect(page.getByLabel("Jahr", { exact: true })).toHaveValue(String(YEAR));

    const fifty = page.getByRole("region", { name: "50 Jahre", exact: true });
    const row = fifty.getByRole("row").filter({ hasText: NAMES.fifty });
    await expect(row.getByRole("link", { name: `${NAMES.fifty}, Erika` })).toBeVisible();
    await expect(row).toContainText(`E-${suffix}-1`);
    await expect(row).toContainText(`01.03.${YEAR}`); // Jubiläum am
    await expect(row).toContainText(`01.03.${YEAR - 50}`); // Eintritt
    await expect(row).toContainText("Handball");
    await expect(
      page
        .getByRole("region", { name: "40 Jahre", exact: true })
        .getByRole("link", { name: `${NAMES.forty}, Otto` }),
    ).toBeVisible();
    // Vor dem Jubiläum ausgetreten: erscheint nicht
    await expect(page.getByRole("link", { name: new RegExp(NAMES.left) })).toHaveCount(0);
    expect(await violations(page)).toEqual([]);

    // Der Name führt zum Mitglied
    await row.getByRole("link", { name: `${NAMES.fifty}, Erika` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Erika ${NAMES.fifty}`);
    await page.goBack();

    // Nächstes Jahr: Erika ist dann 51 Jahre dabei – keine Stufe
    await page.getByLabel("Jahr", { exact: true }).selectOption(String(YEAR + 1));
    await page.getByRole("button", { name: "Anzeigen" }).click();
    await expect(page).toHaveURL(new RegExp(`jahr=${YEAR + 1}`));
    await expect(page.getByRole("link", { name: new RegExp(NAMES.fifty) })).toHaveCount(0);

    // Drucken: eigene, schlichte Druckansicht für das gewählte Jahr
    await open(page, `/mitglieder/ehrungen?jahr=${YEAR}`);
    await page.getByRole("link", { name: "Liste drucken" }).click();
    await expect(page).toHaveURL(new RegExp(`/mitglieder/ehrungen/drucken\\?jahr=${YEAR}$`));
    const sheet = page.getByRole("article", { name: `Ehrungen ${YEAR}` });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("table", { name: "50 Jahre Mitgliedschaft" })).toContainText(
      `${NAMES.fifty}, Erika`,
    );
    await expect(sheet).not.toContainText("@"); // keine Kontaktdaten auf dem Papier
    const pageStyle = (await page.locator("#ehrungen-seitenstil").textContent()) ?? "";
    expect(pageStyle).toContain("size: A4 portrait;");
    expect(pageStyle).toContain(`Ehrungen ${YEAR}`); // wiederkehrende Kopfzeile auf jeder Seite
    expect(await violations(page)).toEqual([]);
    // Beim Drucken bleibt nur das Blatt
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("heading", { level: 1, name: "Ehrungen drucken" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Drucken" })).toBeHidden();
    await expect(sheet).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    // CSV-Export (nur mit Exportrecht – der Vereinsadministrator hat es)
    const response = await page.request.get(`/mitglieder/ehrungen/export?jahr=${YEAR}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain(`ehrungen-${YEAR}.csv`);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const csv = await response.text();
    expect(csv).toContain("Jubiläum (Jahre);Jubiläum am;Mitgliedsnummer;Vorname;Nachname");
    expect(csv).toContain(`50;01.03.${YEAR};E-${suffix}-1;Erika;${NAMES.fifty};Aktiv;Handball`);
    expect(csv).not.toContain(NAMES.left);
  });

  test("Abteilungsleiterin: nur Jubilare der eigenen Abteilung, kein Export", async ({ page }) => {
    await login(page, USERS.abteilung);
    await open(page, "/mitglieder");
    await page.getByRole("link", { name: "Ehrungen", exact: true }).click();
    await expect(page.getByText("Du siehst die Mitglieder deiner Abteilungen.")).toBeVisible();
    await expect(page.getByRole("link", { name: `${NAMES.forty}, Otto` })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(NAMES.fifty) })).toHaveCount(0); // Handball
    await expect(page.getByRole("link", { name: "Export" })).toHaveCount(0);
    const response = await page.request.get(`/mitglieder/ehrungen/export?jahr=${YEAR}`);
    expect(response.status()).toBe(403);
  });

  test("Mitglied: kein Link und kein Zugriff", async ({ page }) => {
    await login(page, USERS.mitglied);
    await open(page, "/mitglieder");
    await expect(page.getByRole("link", { name: "Ehrungen", exact: true })).toHaveCount(0);
    await open(page, "/mitglieder/ehrungen");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    await open(page, "/mitglieder/ehrungen/drucken");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
  });

  test("Dashboard: Karte „Jubiläen“ im Reiter Mitglieder, über „Anpassen“ ausblendbar", async ({
    page,
  }) => {
    await loginSettled(page, USERS.admin);
    await open(page, "/dashboard?tab=mitglieder");
    await chooseTab(page, "Mitglieder");
    const card = page.getByRole("region", { name: "Jubiläen" });
    await expect(card).toBeVisible();
    const more = card.getByRole("button", { name: /weitere/ });
    if (await more.count()) await more.click();
    const item = card.getByRole("listitem").filter({ hasText: NAMES.soon });
    await expect(item.getByRole("link", { name: `Berta ${NAMES.soon}` })).toBeVisible();
    await expect(item).toContainText("75 Jahre Mitglied");
    await expect(item).toContainText(`(in ${soonOffset} Tagen)`);
    await card.getByRole("link", { name: "Alle Ehrungen" }).click();
    await expect(page).toHaveURL(/\/mitglieder\/ehrungen$/);

    // Ausblenden über „Anpassen“ und wieder herstellen
    await open(page, "/dashboard?tab=mitglieder");
    let dialog = await openCustomize(page);
    await dialog
      .getByRole("region", { name: "Mitglieder" })
      .getByRole("checkbox", { name: "Jubiläen", exact: true })
      .uncheck();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await chooseTab(page, "Mitglieder");
    await expect(page.getByRole("region", { name: "Jubiläen" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Geburtstage" })).toBeVisible();
    dialog = await openCustomize(page);
    await dialog.getByRole("button", { name: "Standard wiederherstellen" }).click();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await chooseTab(page, "Mitglieder");
    await expect(page.getByRole("region", { name: "Jubiläen" })).toBeVisible();
  });

  test("Helfer: keine Karte „Jubiläen“", async ({ page }) => {
    await login(page, USERS.helfer);
    await open(page, "/dashboard");
    await expect(page.getByRole("region", { name: "Jubiläen" })).toHaveCount(0);
  });
});
