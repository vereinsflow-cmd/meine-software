import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * Helferplanung im Browser. Tests, die Daten verändern, legen eigene Schichten mit eindeutigem Namen an und räumen
 * sie wieder ab bzw. tragen sich wieder aus – alle Tests teilen sich die Seed-Daten der E2E-Datenbank.
 */

async function openSommerfestPlan(page: Page): Promise<void> {
  await page.goto("/helferplanung");
  await page
    .getByRole("link", { name: /Sommerfest 2026/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Helferplan: Sommerfest 2026/ }),
  ).toBeVisible();
}

async function createShift(
  page: Page,
  title: string,
  from: string,
  to: string,
  required = 2,
): Promise<void> {
  await page.getByRole("button", { name: "Neue Schicht" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Neue Schicht" });
  await dialog.getByLabel("Bezeichnung").fill(title);
  await dialog.getByLabel("Beginn").fill(from);
  await dialog.getByLabel("Ende").fill(to);
  await dialog.getByLabel("Benötigte Helfer").fill(String(required));
  await dialog.getByRole("button", { name: "Schicht anlegen" }).click();
  await expect(page.getByRole("listitem", { name: `Schicht ${title}` })).toBeVisible();
}

async function deleteShift(page: Page, title: string): Promise<void> {
  const card = page.getByRole("listitem", { name: `Schicht ${title}` });
  await card.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
  await expect(card).toHaveCount(0);
}

test.describe("Helferplanung – Veranstalter", () => {
  test("Übersicht zeigt Einsätze, offene Schichten und die Veranstaltung mit Besetzung", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung");
    await expect(page.getByRole("heading", { level: 1, name: "Helferplanung" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Meine Einsätze" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Offene Schichten" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sommerfest 2026/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Helferstunden" })).toBeVisible();
  });

  test("Schicht anlegen, Helfer zuweisen, Überschneidung wird verhindert, Schicht löschen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    const suffix = Date.now() % 100000;
    const first = `E2E Erste ${suffix}`;
    const second = `E2E Zweite ${suffix}`;

    // Zwei sich überschneidende Schichten (23:00–23:30 bzw. 23:10–23:50 – im Seed-Plan sonst nichts).
    await createShift(page, first, "23:00", "23:30");
    await createShift(page, second, "23:10", "23:50");
    const card1 = page.getByRole("listitem", { name: `Schicht ${first}` });
    const card2 = page.getByRole("listitem", { name: `Schicht ${second}` });
    await expect(card1.getByText("Unbesetzt")).toBeVisible();

    // Zuweisen: "Helfer, Hans" hat im Seed nur Aufbau/Getränkestand am Vormittag/Mittag.
    await card1.getByRole("button", { name: "Zuweisen" }).click();
    await page.getByLabel("Mitglied suchen").fill("Helfer");
    await page.getByRole("option", { name: /Helfer, Hans/ }).click();
    await page.getByRole("button", { name: "Helfer, Hans zuweisen" }).click();
    await expect(card1.getByText(/Hans Helfer/)).toBeVisible();
    await expect(card1.getByText("Teilweise besetzt")).toBeVisible();

    // Zweite, überschneidende Schicht: dieselbe Person ist nicht wählbar – mit Begründung.
    await card2.getByRole("button", { name: "Zuweisen" }).click();
    await page.getByLabel("Mitglied suchen").fill("Helfer");
    const option = page.getByRole("option", { name: /Helfer, Hans/ });
    await expect(option).toBeDisabled();
    await expect(option).toContainText(`Überschneidet sich mit der Schicht „${first}“`);
    await page.keyboard.press("Escape");

    // Aufräumen
    await deleteShift(page, second);
    await deleteShift(page, first);
  });

  test("Schicht mit Pflichtfeldern: Validierungsfehler statt Absturz", async ({ page }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    await page.getByRole("button", { name: "Neue Schicht" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Neue Schicht" });
    await dialog.getByLabel("Benötigte Helfer").fill("0");
    await dialog.getByRole("button", { name: "Schicht anlegen" }).click();
    await expect(dialog.getByText("Bitte gib eine Bezeichnung ein.")).toBeVisible();
    await expect(dialog.getByText("Mindestens 1 Helfer.")).toBeVisible();
    await expect(dialog).toBeVisible(); // Dialog bleibt offen, nichts wurde angelegt
  });

  // Die Druckansicht selbst (Filter, Kopf-/Fußzeile, „Noch nicht besetzt“, print:hidden-Elemente …) hat
  // eigene, ausführlichere Tests in helferplan-drucken.spec.ts.
  test("„Drucken“ führt von der Veranstaltung aus in die Druckansicht, bereits auf sie eingegrenzt", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    await page.getByRole("link", { name: "Drucken" }).click();
    await expect(page).toHaveURL(/\/helferplanung\/drucken\?event=/);
    await expect(page.getByRole("heading", { name: "Sommerfest 2026" })).toBeVisible();
  });

  test("CSV-Export der Helferplanung", async ({ page }) => {
    await login(page, USERS.admin);
    await openSommerfestPlan(page);
    const href = await page.getByRole("link", { name: "CSV-Export" }).getAttribute("href");
    expect(href).toMatch(/^\/api\/helferplanung\/[0-9a-f-]{36}\/export$/);
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("helferplan-");
    const body = await response.text();
    expect(body).toContain("Grillstand");
    expect(body).toContain("Aufbau");
  });

  test("Helferstunden-Übersicht zeigt dokumentierte Stunden der Jahreshauptversammlung", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/helferplanung/stunden");
    await expect(page.getByRole("heading", { level: 1, name: "Helferstunden" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Helferstunden/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Gesamt" })).toBeVisible();
  });
});

test.describe("Helferplanung – Helfer und Mitglieder", () => {
  test("Helfer trägt sich ein und wieder aus (Abbau am Abend)", async ({ page }) => {
    await login(page, USERS.helfer);
    await openSommerfestPlan(page);
    const card = page.getByRole("listitem", { name: "Schicht Abbau" });
    await expect(card).toBeVisible();

    // Hans Helfer ist im Seed bei Aufbau (vormittags) und Getränkestand (mittags) eingetragen; der Abbau am Abend ist frei.
    await card.getByRole("button", { name: "Eintragen" }).click();
    await expect(card.getByText("Mein Einsatz")).toBeVisible();
    await expect(card.getByRole("button", { name: "Austragen" })).toBeVisible();

    // Übersicht "Meine Einsätze" führt die Schicht.
    await page.goto("/helferplanung");
    await expect(
      page.getByRole("region", { name: "Meine Einsätze" }).getByText("Abbau"),
    ).toBeVisible();

    await openSommerfestPlan(page);
    await page
      .getByRole("listitem", { name: "Schicht Abbau" })
      .getByRole("button", { name: "Austragen" })
      .click();
    await expect(
      page.getByRole("listitem", { name: "Schicht Abbau" }).getByText("Mein Einsatz"),
    ).toHaveCount(0);
  });

  test("Überschneidende Schicht: Eintragen ist gesperrt, die Begründung nennt die Kollision", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await openSommerfestPlan(page);
    // Kuchenbuffet (13–17 Uhr) überschneidet sich mit Hans' Getränkestand (12–15 Uhr).
    const card = page.getByRole("listitem", { name: "Schicht Kuchenbuffet" });
    await expect(card.getByRole("button", { name: "Eintragen" })).toHaveCount(0);
    await expect(card.getByRole("note")).toContainText(
      "Überschneidet sich mit deiner Schicht „Getränkestand“",
    );
  });

  test("Helfer sieht keine Verwaltungsfunktionen und keine internen Hinweise", async ({ page }) => {
    await login(page, USERS.helfer);
    await openSommerfestPlan(page);
    await expect(page.getByRole("button", { name: "Neue Schicht" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zuweisen" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "CSV-Export" })).toHaveCount(0);
    const response = await page.request.get(
      `/api/helferplanung/${page.url().split("/").pop()}/export`,
    );
    expect(response.status()).toBe(403);
  });

  test("Grillstand ab 18: Maria ist bereits am Kuchenbuffet eingeteilt – Überschneidung wird erklärt", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await openSommerfestPlan(page);
    const grill = page.getByRole("listitem", { name: "Schicht Grillstand" });
    await expect(grill).toContainText("ab 18 Jahren");
    await expect(grill.getByRole("button", { name: "Eintragen" })).toHaveCount(0);
    await expect(grill.getByRole("note")).toContainText(
      "Überschneidet sich mit deiner Schicht „Kuchenbuffet“",
    );
    await expect(
      page.getByRole("listitem", { name: "Schicht Kuchenbuffet" }).getByText("Mein Einsatz"),
    ).toBeVisible();
  });
});
