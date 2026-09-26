import { expect, test, type Page } from "@playwright/test";
import { USERS, loginSettled as login, open } from "./helpers";

/**
 * Seite einer Veranstaltung am Desktop: zwei Spalten wie gehabt – links Details und alles Weitere, rechts Teilnahme,
 * Teilnehmerzahl und Helfer. Die Reihenfolge auf dem Smartphone prüft `veranstaltung.mobil.spec.ts`.
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

/** Lage einer Kartenüberschrift. Genau eine muss sichtbar sein – die ausgeblendete Handy-Fassung zählt nicht mit. */
async function cardHeading(page: Page, name: string) {
  const heading = page.getByRole("main").getByRole("heading", { level: 2, name, exact: true });
  await expect(heading).toHaveCount(1);
  return (await heading.boundingBox())!;
}

test.describe("Veranstaltung", () => {
  test("Desktop: Details links, daneben rechts Teilnahme, Teilnehmerzahl und Helfer", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await openSommerfest(page);

    const details = await cardHeading(page, "Details");
    const participation = await cardHeading(page, "Deine Teilnahme");
    const count = await cardHeading(page, "Teilnehmerzahl");
    const helpers = await cardHeading(page, "Helfer");
    expect(participation.x).toBeGreaterThan(details.x + details.width); // rechte Spalte
    expect(Math.abs(participation.y - details.y)).toBeLessThanOrEqual(1); // beide Spalten beginnen oben
    for (const box of [count, helpers])
      expect(Math.abs(box.x - participation.x)).toBeLessThanOrEqual(1);
    expect(participation.y).toBeLessThan(count.y);
    expect(count.y).toBeLessThan(helpers.y);

    // Links stehen die übrigen Karten untereinander, die Teilnehmerliste zuletzt.
    let previous = details;
    for (const name of ["Interne Notizen", "Aufgaben und Checklisten", "Dokumente", "Teilnehmer"]) {
      const box = await cardHeading(page, name);
      expect(Math.abs(box.x - details.x)).toBeLessThanOrEqual(1);
      expect(box.y).toBeGreaterThan(previous.y);
      previous = box;
    }
  });

  test("Teilnehmerliste: zunächst fünf Personen, der Rest hinter „weitere Personen anzeigen“", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await openSommerfest(page);

    const card = page.getByRole("region", { name: "Teilnehmer", exact: true });
    const rows = card.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    const toggle = card.getByRole("button", { name: /anzeigen$/ }); // „N weitere Personen anzeigen“ / „Weniger anzeigen“
    await expect(toggle).toHaveText(/^\d+ weitere Personen? anzeigen$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Ein Klick vor der Hydration geht verloren – deshalb wiederholen, bis der Knopf „aufgeklappt“ meldet.
    await expect(async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(toggle).toHaveText("Weniger anzeigen");
    const total = await rows.count();
    expect(total).toBeGreaterThan(5); // im Seed antworten 13 Personen auf das Sommerfest

    await toggle.click();
    await expect(rows).toHaveCount(5);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText(
      `${total - 5} ${total - 5 === 1 ? "weitere Person" : "weitere Personen"} anzeigen`,
    );
  });
});
