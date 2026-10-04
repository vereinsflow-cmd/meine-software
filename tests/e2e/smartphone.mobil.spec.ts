import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open, openNavGroup } from "./helpers";

/**
 * Smartphone-Ansicht (Pixel 7, 412 px breit). Läuft nur im Projekt "mobil": `npx playwright test --project=mobil`.
 * Prüft, dass nichts seitlich aus dem Bildschirm läuft und die Bedienung ohne Sidebar funktioniert.
 */
const berlinDate = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  });

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("Smartphone", () => {
  test("Menü öffnet sich, Navigation führt zur Helferplanung, kein seitliches Scrollen", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeHidden(); // Sidebar ist auf dem Smartphone ausgeblendet
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog");
    await openNavGroup(menu, "Verein");
    await expect(menu.getByRole("link", { name: "Helferplanung", exact: true })).toBeVisible();
    await menu.getByRole("link", { name: "Helferplanung", exact: true }).click();
    await expect(page).toHaveURL(/\/helferplanung$/);
    await expect(menu).toBeHidden(); // Menü schließt sich nach der Auswahl
    await expect(page.getByRole("heading", { level: 1, name: "Helferplanung" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("Kalender: Terminliste statt Tabelle, Ansicht wechselbar", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/kalender?ansicht=monat&datum=${berlinDate(5)}`);
    await expect(page.getByRole("table")).toHaveCount(0); // die Monatstabelle ist ausgeblendet …
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toBeVisible(); // … die Terminliste zeigt den Termin
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page
      .getByRole("navigation", { name: "Ansicht wählen" })
      .getByRole("link", { name: "Woche" })
      .click();
    await expect(page).toHaveURL(/ansicht=woche/);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("Helferplan: Karten und Schaltflächen sind bedienbar (Zielgröße, kein Überlauf)", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await page.goto("/helferplanung");

    // Schichten mit freien Plätzen je Veranstaltung: „Eintragen“ steht rechts neben der Schicht und ist am Handy gut
    // treffbar (44 px hoch).
    const freie = page.getByRole("list", { name: "Freie Plätze: Sommerfest 2026" });
    const quickSignUp = freie
      .getByRole("listitem")
      .filter({ hasText: "Abbau" })
      .getByRole("button", { name: "Eintragen" });
    await expect(quickSignUp).toBeVisible();
    const signUpBox = (await quickSignUp.boundingBox())!;
    expect(signUpBox.height).toBeGreaterThanOrEqual(44);
    expect(signUpBox.width).toBeGreaterThanOrEqual(64);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sommerfest 2026", exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const abbau = page.getByRole("listitem", { name: "Schicht Abbau" });
    const button = abbau.getByRole("button", { name: "Eintragen" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(64);
    // Die Zeitleiste fehlt am Handy – die Liste reicht.
    await expect(page.getByRole("group", { name: "Tagesablauf" })).toBeHidden();
  });

  test("Hauptseiten laufen nicht seitlich über den Bildschirm", async ({ page }) => {
    await login(page, USERS.admin);
    const paths = [
      "/dashboard",
      "/mitglieder",
      "/veranstaltungen",
      "/helferplanung",
      "/helferplanung/stunden",
      "/kalender",
      "/benachrichtigungen",
      "/abteilungen",
      "/benutzer",
    ];
    paths.push(
      "/aufgaben",
      "/nachrichten",
      "/nachrichten?chat=alle",
      "/nachrichten/neu",
      "/dokumente",
      "/finanzen",
      "/finanzen/kassenbuch",
      "/finanzen/rechnungen",
      "/hilfe",
      "/hilfe/meldungen",
      "/protokoll",
      "/profil",
      "/datenschutz",
    );
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(await horizontalOverflow(page), `${path} läuft seitlich über`).toBeLessThanOrEqual(1);
    }
  });

  test("Dokumente: Angaben stehen unter dem Namen, der Upload-Dialog passt auf den Bildschirm", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const name = `Mobil-${Date.now() % 100000}.txt`;
    const created = await page.request.post("/api/dokumente", {
      multipart: {
        file: { name, mimeType: "text/plain", buffer: Buffer.from("Hallo vom Smartphone") },
        access: "ALL_MEMBERS",
        category: "Handbuch",
      },
    });
    expect(created.status()).toBe(201);

    await page.goto("/dokumente");
    const entry = page.getByRole("row").filter({ hasText: name });
    await expect(entry.getByRole("link", { name })).toBeVisible();
    await expect(entry.locator("span").filter({ hasText: /^Handbuch$/ })).toBeVisible(); // Kategorie steht unter dem Namen …
    await expect(page.getByRole("columnheader", { name: "Kategorie" })).toHaveCount(0); // … nicht in einer eigenen Spalte
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Dokument hochladen" }).click();
    const dialog = page.getByRole("dialog", { name: "Dokument hochladen" });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(dialog.getByRole("button", { name: "Hochladen", exact: true })).toBeInViewport();
  });

  test("„Neuer Termin“ im Kalender: Knopf erreichbar, das Fenster passt auf den Bildschirm", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/kalender?ansicht=monat&datum=2031-03-01");
    await page.waitForLoadState("networkidle");
    const dialog = page.getByRole("dialog", { name: "Neuer Termin" });
    // Ein Tipp vor der Hydration geht verloren – dann erneut.
    await expect(async () => {
      await page.getByRole("button", { name: "Neuer Termin" }).click();
      await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(dialog.getByLabel("Beginn – Datum")).toHaveValue("2031-03-01");
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1); // scrollt innen statt über den Rand
    const save = dialog.getByRole("button", { name: "Als Entwurf speichern" });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
  });

  test("Abo-Dialog passt auf den Bildschirm", async ({ page }) => {
    await login(page, USERS.helfer);
    await page.goto("/kalender");
    await page.getByRole("button", { name: "Abonnieren" }).click();
    const dialog = page.getByRole("dialog", { name: "Kalender abonnieren" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  });
  test("Filter: am Handy nur Suche und Knopf „Filter“ – ein Tipp klappt die Felder auf; aktive Filter zählen mit", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/mitglieder");
    const toggle = page.getByRole("checkbox", { name: /^Filter/ });
    const status = page.getByRole("combobox", { name: "Nach Status filtern" });
    await expect(page.getByRole("searchbox", { name: "Mitglieder durchsuchen" })).toBeVisible();
    await expect(status).toBeHidden(); // zugeklappt: die Liste beginnt direkt unter der Suche
    expect(await violations(page)).toEqual([]);

    await page.locator("label", { hasText: /^Filter/ }).click();
    await expect(toggle).toBeChecked();
    await expect(status).toBeVisible();
    await status.selectOption("PASSIVE");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/status=PASSIVE/);
    // Nach dem Laden wieder zugeklappt, der Knopf nennt die Zahl der aktiven Filter
    await expect(page.locator("label", { hasText: /^Filter/ })).toContainText("1");
    await expect(page.getByRole("combobox", { name: "Nach Status filtern" })).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await violations(page)).toEqual([]);
  });
});
