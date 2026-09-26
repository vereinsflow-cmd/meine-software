import { expect, test, type Page } from "@playwright/test";
import { USERS, loginSettled as login, open } from "./helpers";

/**
 * Seite einer Veranstaltung auf dem Smartphone (Pixel 7). Läuft nur im Projekt "mobil". Am Handy steht zuerst, was der
 * Einzelne tun will (zu- oder absagen), dann Details, Helfer und Teilnehmerzahl, danach der Rest – und zwar für Auge,
 * Tastatur und Screenreader in derselben Reihenfolge.
 */
async function openSommerfest(page: Page): Promise<void> {
  await open(page, "/veranstaltungen");
  await page
    .getByRole("link", { name: /Sommerfest 2026/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Sommerfest 2026" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("Veranstaltung – Smartphone", () => {
  test("zuerst die eigene Teilnahme, dann Details, Helfer und Teilnehmerzahl, die Teilnehmerliste zuletzt", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await openSommerfest(page);

    // Reihenfolge im Dokument = Reihenfolge für Tastatur und Screenreader. Die ausgeblendete Desktop-Spalte zählt nicht mit.
    const headings = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(headings).toHaveText([
      "Deine Teilnahme",
      "Details",
      "Helfer",
      "Teilnehmerzahl",
      "Interne Notizen",
      "Aufgaben und Checklisten",
      "Dokumente",
      "Teilnehmer",
    ]);
    // … und auf dem Bildschirm dieselbe Reihenfolge untereinander.
    const tops: number[] = [];
    for (const heading of await headings.all()) tops.push((await heading.boundingBox())!.y);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));

    // Zu- und Absagen ist ohne Scrollen zu sehen, die Helferplanung gleich nach den Details erreichbar.
    await expect(page.getByRole("heading", { level: 2, name: "Deine Teilnahme" })).toBeInViewport();
    await expect(page.getByRole("link", { name: "Helferplanung öffnen" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("Teilnehmerliste zeigt zunächst fünf Personen", async ({ page }) => {
    await login(page, USERS.admin);
    await openSommerfest(page);

    const card = page.getByRole("region", { name: "Teilnehmer", exact: true });
    await expect(card.getByRole("listitem")).toHaveCount(5);
    const more = card.getByRole("button", { name: /^\d+ weitere Personen? anzeigen$/ });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    const box = await more.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(24); // Zielgröße für den Finger (WCAG 2.2, 2.5.8)
  });
});
