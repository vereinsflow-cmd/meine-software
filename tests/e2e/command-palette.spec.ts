import { expect, test, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/** Die volle Auslöser-Pille (ab `sm` sichtbar) – ihr aria-label trägt als einziges die Tastenkombination in Klammern. */
const trigger = (page: Page) => page.getByLabel(/Suche öffnen \(/);
const dialog = (page: Page) => page.getByRole("dialog", { name: "Suche" });
const searchInput = (page: Page) => dialog(page).getByPlaceholder(/Suchen/);

test.describe("Zentrale Suche (Strg/⌘+K)", () => {
  test("öffnet per Klick, die Eingabe ist fokussiert; Esc schließt und gibt den Fokus zurück", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");

    await trigger(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(searchInput(page)).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test("öffnet mit Strg+K von einer beliebigen Seite aus", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/kalender");

    await page.keyboard.press("Control+K");
    await expect(dialog(page)).toBeVisible();
  });

  test("Eingabe filtert bereits während des Tippens; Enter springt zum Treffer", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");
    await trigger(page).click();

    await searchInput(page).fill("Mitglied hinzufügen");
    const group = dialog(page).getByRole("group", { name: "Aktionen" });
    await expect(group.getByText("Mitglied hinzufügen")).toBeVisible();
    await expect(group.getByText("Neues Mitglied anlegen")).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/mitglieder\/neu$/);
    await expect(dialog(page)).toHaveCount(0);
  });

  test("eine sinnlose Suche zeigt eine verständliche „Keine Ergebnisse“-Meldung", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");
    await trigger(page).click();

    await searchInput(page).fill("qwertzuiopasdfghjkl123456");
    await expect(dialog(page).getByText(/Keine Ergebnisse für/)).toBeVisible();
  });

  test("Ergebnisse sind nach Kategorien gruppiert (Aktionen vor Seiten)", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");
    await trigger(page).click();

    await searchInput(page).fill("mitglied");
    const aktionenHeading = dialog(page).getByText("Aktionen", { exact: true });
    const seitenHeading = dialog(page).getByText("Seiten", { exact: true });
    await expect(aktionenHeading).toBeVisible();
    await expect(seitenHeading).toBeVisible();

    const aktionenBox = await aktionenHeading.boundingBox();
    const seitenBox = await seitenHeading.boundingBox();
    expect(aktionenBox?.y ?? 0).toBeLessThan(seitenBox?.y ?? Number.POSITIVE_INFINITY);
  });

  test("Pfeiltasten wechseln die Auswahl; Enter springt zum ausgewählten, nicht zum ersten Treffer", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");
    await trigger(page).click();

    await searchInput(page).fill("veranstaltung");
    await expect(dialog(page).getByText("Veranstaltung erstellen")).toBeVisible();
    await expect(dialog(page).getByText("Veranstaltungen", { exact: true })).toBeVisible();

    await page.keyboard.press("ArrowDown"); // weg vom automatisch ausgewählten ersten Treffer
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/veranstaltungen$/);
  });

  test("Seiten heißen wie im Menü und sind auch unter dem früheren Menünamen zu finden („Termine“ → Kalender)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");
    await trigger(page).click();

    await searchInput(page).fill("Termine");
    const seiten = dialog(page).getByRole("group", { name: "Seiten" });
    await expect(seiten.getByText("Kalender", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/kalender$/);
  });

  test("zeigt nur Aktionen, die die Rolle auch darf", async ({ page }) => {
    await login(page, USERS.mitglied);
    await open(page, "/dashboard");
    await trigger(page).click();

    await searchInput(page).fill("Mitglied hinzufügen");
    // exact: true, sonst zählt auch die „Keine Ergebnisse für „Mitglied hinzufügen“ …“-Meldung mit,
    // die den Suchtext als Teilstring enthält.
    await expect(dialog(page).getByText("Mitglied hinzufügen", { exact: true })).toHaveCount(0);
    await expect(dialog(page).getByText(/Keine Ergebnisse für/)).toBeVisible();
  });
});
