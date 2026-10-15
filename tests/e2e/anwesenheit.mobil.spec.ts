import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, createPublishedPastTraining, login, open } from "./helpers";

/**
 * Anwesenheit am Smartphone (Pixel 7, 412 px; dazu 390, 375 und 360 px) – so, wie ein Trainer am Spielfeldrand abhakt: drei
 * große Knöpfe je Person (mindestens 44 px hoch, die Beschriftung passt in ihr Feld), „Alle anwesend“ über die ganze Breite,
 * die Leiste „Speichern“ bleibt beim Scrollen unten sichtbar, nichts läuft seitlich über. Läuft nur im Projekt „mobil“; das Training legt der Test selbst an und
 * erfasst andere Personen als `anwesenheit.spec.ts`, damit sich die Zahlen beider Tests nicht vermischen.
 */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const suffix = String(Date.now() % 100000);
const TITLE = `Handytraining ${suffix}`;
// Schlimmster Fall für die Breite: ein sehr langer Doppelname ohne Leerzeichen
const LONG = {
  first: "Maximiliane-Theodora",
  last: `Sehrlangername-Mitgliedschaftsjubiläum${suffix}`,
};
let eventId = "";

const person = (page: Page, name: string) => page.getByRole("group", { name, exact: true });

test.describe.serial("Anwesenheit – mobil", () => {
  test("Smartphone: große Knöpfe, „Alle anwesend“, Speichern-Leiste bleibt unten, nichts läuft über", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, USERS.admin);
    eventId = await createPublishedPastTraining(page, TITLE);

    await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
    await expect(page.getByRole("heading", { level: 1, name: "Anwesenheit" })).toBeVisible();
    for (const name of ["Admin, Anna", "Vorstand, Bernd"]) {
      await page.getByLabel("Person wählen").selectOption({ label: name });
      await page.getByRole("button", { name: "Person hinzufügen" }).click();
      await expect(person(page, name)).toBeVisible();
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    const viewport = page.viewportSize()!;

    // Drei Knöpfe nebeneinander in der Karte, jeder mit dem Finger gut zu treffen
    for (const status of ["Anwesend", "Entschuldigt", "Fehlt"]) {
      const option = person(page, "Admin, Anna").locator("label").filter({ hasText: status });
      const box = (await option.boundingBox())!;
      expect(box.height, `„${status}“`).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    const remove = page.getByRole("button", { name: "Admin, Anna von der Liste nehmen" });
    const removeBox = (await remove.boundingBox())!;
    expect(removeBox.height).toBeGreaterThanOrEqual(44);
    expect(removeBox.width).toBeGreaterThanOrEqual(44);

    const all = page.getByRole("button", { name: "Alle anwesend" });
    const allBox = (await all.boundingBox())!;
    expect(allBox.height).toBeGreaterThanOrEqual(44);
    expect(allBox.width).toBeGreaterThan(viewport.width - 80); // über die ganze Breite

    await person(page, "Vorstand, Bernd").getByText("Entschuldigt", { exact: true }).click();
    await all.click();
    await expect(
      person(page, "Admin, Anna").getByRole("radio", { name: "Anwesend" }),
    ).toBeChecked();
    expect(await violations(page)).toEqual([]);

    // Die Leiste unten: auch nach dem Scrollen zum Seitenanfang im Bild, breit und groß genug
    const save = page.getByRole("button", { name: "Speichern (2)" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(save).toBeInViewport();
    const saveBox = (await save.boundingBox())!;
    expect(saveBox.height).toBeGreaterThanOrEqual(44);
    expect(saveBox.width).toBeGreaterThan(viewport.width - 80);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(viewport.height);

    await save.click();
    await expect(
      page.getByText("Anwesenheit gespeichert: 1 anwesend, 1 entschuldigt, 0 gefehlt."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Speichern (0)" })).toBeDisabled();
  });

  test("schmales Smartphone (390 px): Erfassen und Auswertung laufen nicht über", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.admin);
    await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
    await expect(
      person(page, "Vorstand, Bernd").getByRole("radio", { name: "Entschuldigt" }),
    ).toBeChecked();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    await open(page, `/veranstaltungen/${eventId}`);
    await expect(
      page.getByText(/Anwesend:\s*1\s*von\s*2\s*· 1 entschuldigt/).filter({ visible: true }),
    ).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Auswertung: am Handy eine Karte je Person
    await open(page, "/veranstaltungen/anwesenheit");
    const table = page.getByRole("table", { name: "Anwesenheit je Person" });
    const row = table.getByRole("row").filter({ hasText: "Admin, Anna" });
    await expect(row).toBeVisible();
    const box = (await row.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await violations(page)).toEqual([]);
  });
  test("375 und 360 px: jede Beschriftung passt in ihren Knopf – auch das gewählte „Entschuldigt“", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    for (const width of [375, 360]) {
      await page.setViewportSize({ width, height: 800 });
      await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
      const row = person(page, "Vorstand, Bernd");
      await expect(row.getByRole("radio", { name: "Entschuldigt" })).toBeChecked();
      // Ragt der Inhalt (Text, ggf. Haken) über den Knopf hinaus, ist scrollWidth größer als clientWidth.
      for (const name of ["Vorstand, Bernd", "Admin, Anna"]) {
        const clipped = await person(page, name)
          .locator("label")
          .evaluateAll((labels) =>
            labels
              .filter((label) => label.scrollWidth > label.clientWidth)
              .map((label) => label.textContent),
          );
        expect(clipped, `${name} bei ${width} px`).toEqual([]);
      }
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    }
  });

  test("Abteilungsseite (375 px): „Anwesenheit“ und „Bearbeiten“ stehen ganz in der Gruppenkarte", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, USERS.admin);
    await open(page, "/abteilungen");
    await page.locator('a[href^="/abteilungen/"]', { hasText: "Fußball" }).first().click();
    await expect(page).toHaveURL(/\/abteilungen\/[^/]+$/);
    const group = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { level: 3, name: "1. Herrenmannschaft" }),
    });
    await expect(group).toBeVisible();
    const card = (await group.boundingBox())!;
    for (const control of [
      group.getByRole("link", { name: "Anwesenheit der Gruppe 1. Herrenmannschaft" }),
      group.getByRole("button", { name: "Bearbeiten" }),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(card.x);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("sehr langer Name: Auswahl und Liste bleiben im Bild", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, USERS.admin);
    const dir = path.resolve(".local", "e2e-files");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `anwesenheit-mobil-${suffix}.csv`);
    writeFileSync(
      file,
      `Vorname;Nachname;Mitgliedsnummer;Eintritt;Status;Abteilungen\n${LONG.first};${LONG.last};AM-${suffix};2020-04-01;aktiv;Fußball\n`,
      "utf8",
    );
    await open(page, "/mitglieder/import");
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText("1 gültig")).toBeVisible();
    await page.getByRole("button", { name: "1 Mitglieder importieren" }).click();
    await expect(page.getByText("Import abgeschlossen")).toBeVisible();

    await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
    const name = `${LONG.last}, ${LONG.first}`;
    await expect(
      page.getByLabel("Person wählen").locator("option").filter({ hasText: name }),
    ).toHaveCount(1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.getByLabel("Person wählen").selectOption({ label: name });
    await page.getByRole("button", { name: "Person hinzufügen" }).click();
    const row = person(page, name);
    await expect(row).toBeVisible();
    const box = (await row.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});
