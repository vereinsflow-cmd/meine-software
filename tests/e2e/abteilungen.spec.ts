import { expect, test, type Locator, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open } from "./helpers";

/**
 * Abteilungskarten mit Bild (`src/modules/departments/department-image.ts`): Steht eine der vorbereiteten Sportarten im Namen,
 * zeigt die Karte das Foto dazu, sonst einen Verlauf in der Abteilungsfarbe – ohne Upload, sofort nach dem Anlegen.
 * Zuordnung und Kontraste rechnet `tests/unit/department-image.test.ts` nach.
 */

const card = (page: Page, name: string) =>
  page.locator("article").filter({ has: page.getByRole("link", { name, exact: true }) });

/** Das Bild ist tatsächlich geladen (nicht nur eingebunden). */
async function expectLoaded(image: Locator) {
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
}

/** Löscht eine Abteilung über „Weitere Aktionen“ auf ihrer Seite (der Test räumt hinter sich auf). */
async function deleteDepartment(page: Page, name: string) {
  await open(page, "/abteilungen");
  const link = page.getByRole("link", { name, exact: true });
  if ((await link.count()) === 0) return;
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: "Weitere Aktionen" }).first();
  await expect(async () => {
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("menuitem", { name: "Löschen" }).click();
  await page
    .getByRole("alertdialog", { name: "Abteilung löschen?" })
    .getByRole("button", { name: "Endgültig löschen" })
    .click();
  await expect(page).toHaveURL(/\/abteilungen$/);
}

test.describe("Abteilungen mit Bild", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin);
  });

  test("Fußball zeigt das Fußballfoto, Jugendarbeit den Verlauf in ihrer Farbe – alle Angaben bleiben", async ({
    page,
  }) => {
    await open(page, "/abteilungen");

    const football = card(page, "Fußball");
    const photo = football.locator("img");
    await expect(photo).toHaveAttribute("data-department-image", "fussball");
    await expect(photo).toHaveAttribute("src", "/bilder/abteilungen/fussball-800.webp");
    await expect(photo).toHaveAttribute(
      "srcset",
      /fussball-480\.webp 480w, .*fussball-800\.webp 800w, .*fussball-1200\.webp 1200w/,
    );
    await expect(photo).toHaveAttribute("sizes", /.+/);
    // Rein schmückend; die Karten der ersten Reihe laden sofort.
    await expect(photo).toHaveAttribute("alt", "");
    await expect(photo).toHaveAttribute("aria-hidden", "true");
    await expect(photo).toHaveAttribute("loading", "eager");
    await expectLoaded(photo);
    await expect(football.getByRole("heading", { level: 2, name: "Fußball" })).toBeVisible();
    await expect(football).toContainText("Herren, Damen und Jugend");
    await expect(football).toContainText(/\d+ Mitglieder · 1 Gruppe/);
    await expect(football).toContainText("Leitung: Claudia Abteilungsleiterin");

    const youth = card(page, "Jugendarbeit");
    await expect(youth.locator("img")).toHaveCount(0);
    await expect(youth.locator('[data-department-image="verlauf"]')).toHaveAttribute(
      "style",
      /linear-gradient/,
    );
    await expect(youth).toContainText("Jugendtreff und Ferienfreizeiten");
    await expect(youth).toContainText("Leitung: –");

    // Tischtennis ist nicht Tennis.
    await expect(card(page, "Tischtennis").locator("img")).toHaveAttribute(
      "data-department-image",
      "tischtennis",
    );

    expect(await violations(page)).toEqual([]);

    // Die ganze Karte führt zur Abteilung – auch ein Klick oben ins Bild, weit weg vom Namen.
    await football.click({ position: { x: 24, y: 24 } });
    await expect(page).toHaveURL(/\/abteilungen\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Fußball" })).toBeVisible();
    // Oben auf ihrer Seite dasselbe Bild als schmales Band.
    const band = page.locator('img[data-department-image="fussball"]');
    await expect(band).toBeVisible();
    await expectLoaded(band);
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });

  test("Eine neu angelegte Abteilung „Basketball“ bekommt sofort das Basketballfoto", async ({
    page,
  }) => {
    const name = "Basketball";
    // Falls ein abgebrochener früherer Versuch sie hinterlassen hat (der Name ist je Verein eindeutig).
    await deleteDepartment(page, name);

    await open(page, "/abteilungen");
    await page.getByRole("button", { name: "Neue Abteilung" }).click();
    const create = page.getByRole("dialog", { name: "Neue Abteilung" });
    await create.locator('input[name="name"]').fill(name);
    await create.getByRole("button", { name: "Abteilung anlegen" }).click();

    // Auf ihrer Seite (dorthin geht es nach dem Anlegen) …
    await expect(page).toHaveURL(/\/abteilungen\/[0-9a-f-]{36}$/);
    const band = page.locator('img[data-department-image="basketball"]');
    await expect(band).toBeVisible();
    await expectLoaded(band);

    // … und in der Übersicht – ohne Upload, ohne weiteren Schritt.
    await open(page, "/abteilungen");
    const photo = card(page, name).locator("img");
    await expect(photo).toHaveAttribute("data-department-image", "basketball");
    await expect(photo).toHaveAttribute("src", "/bilder/abteilungen/basketball-800.webp");
    await expectLoaded(photo);
    await expect(card(page, name)).toContainText("0 Mitglieder");

    await deleteDepartment(page, name);
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  });

  test("Ein langes Einzelwort im Namen bricht um – am Handy (360 px) und bei drei Spalten bleibt alles in der Karte", async ({
    page,
  }) => {
    // Echter Vereinsname als ein Wort; früher wuchs die Liste am Handy auf seine Breite, bei drei Spalten war er abgeschnitten.
    const name = "Behindertensportgemeinschaft";
    await deleteDepartment(page, name);

    await open(page, "/abteilungen");
    await page.getByRole("button", { name: "Neue Abteilung" }).click();
    const create = page.getByRole("dialog", { name: "Neue Abteilung" });
    await create.locator('input[name="name"]').fill(name);
    await create.getByRole("button", { name: "Abteilung anlegen" }).click();
    await expect(page).toHaveURL(/\/abteilungen\/[0-9a-f-]{36}$/);
    const detail = new URL(page.url()).pathname;

    for (const viewport of [
      { width: 360, height: 800 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await open(page, "/abteilungen");
      const target = card(page, name);
      await expect(target).toBeVisible();
      const measured = await target.evaluate((article) => {
        const frame = article.getBoundingClientRect();
        /** Rechte Kante des tatsächlichen Textes (nicht seines Kastens – der bliebe auch bei Überlauf in der Karte). */
        const textRight = (element: Element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getBoundingClientRect().right;
        };
        const link = article.querySelector('[data-slot="abteilung-link"]')!;
        const leaders = [...article.querySelectorAll("p")].find((p) =>
          p.textContent?.startsWith("Leitung:"),
        )!;
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          page: document.documentElement.clientWidth,
          left: frame.left,
          right: frame.right,
          width: frame.width,
          name: textRight(link),
          leaders: textRight(leaders),
          nameLines: Math.round(
            link.getBoundingClientRect().height / parseFloat(getComputedStyle(link).lineHeight),
          ),
        };
      });
      const at = `bei ${viewport.width} px`;
      expect(measured.overflow, `Seite läuft seitlich über ${at}`).toBeLessThanOrEqual(1);
      expect(measured.left, at).toBeGreaterThanOrEqual(0);
      expect(measured.right, at).toBeLessThanOrEqual(measured.page);
      // Name und „Leitung“ enden vor dem Innenabstand der Karte (1,25 rem) – nichts wird abgeschnitten.
      expect(measured.name, at).toBeLessThanOrEqual(measured.right - 16);
      expect(measured.leaders, at).toBeLessThanOrEqual(measured.right - 16);
      if (viewport.width === 360) {
        // Eine Spalte mit je 16 px Seitenrand; der Name bricht dafür mitten im Wort um.
        expect(measured.width).toBeLessThanOrEqual(viewport.width - 32 + 1);
        expect(measured.nameLines).toBeGreaterThanOrEqual(2);
        // Auch die Seite der Abteilung (Band und Kopf) bleibt in der Breite.
        await open(page, detail);
        await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          "Seite der Abteilung läuft seitlich über",
        ).toBeLessThanOrEqual(1);
      }
    }

    await deleteDepartment(page, name);
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  });

  test("Beim Überfahren zoomt das Bild leicht heran – mit „Bewegung reduzieren“ nicht", async ({
    page,
  }) => {
    await open(page, "/abteilungen");
    const handball = card(page, "Handball");
    const photo = handball.locator("img");
    const scale = () => photo.evaluate((el) => getComputedStyle(el).scale);

    await handball.hover();
    await expect.poll(scale).toBe("1.05");

    await page.mouse.move(0, 0);
    await expect.poll(scale).toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await handball.hover();
    // Kurz warten: Ohne „Bewegung reduzieren“ wäre der Zoom nach 500 ms längst sichtbar.
    await page.waitForTimeout(600);
    expect(await scale()).toBe("none");
  });
});
