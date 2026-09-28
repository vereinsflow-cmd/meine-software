import { expect, test } from "@playwright/test";
import { USERS, loginSettled as login, open, openNavGroup } from "./helpers";

/**
 * Seitenleiste (Desktop): Die Gruppen klappen wie ein Akkordeon. Mit einer zugeklappten Gruppe verschwinden die Zähler
 * ihrer Einträge – dann zeigt die Gruppe deren Summe (für Screenreader als Beschreibung „N offen“; der Name bleibt).
 */
test.describe("Seitenleiste", () => {
  test("Zugeklappte Gruppe zeigt die Summe ihrer Zähler, aufgeklappt stehen sie wieder am Eintrag", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    // Eine eigene offene Aufgabe: So hat „Aufgaben“ (Gruppe „Organisation“) sicher einen Zähler.
    await open(page, "/aufgaben");
    await page.getByRole("button", { name: "Neue Aufgabe" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
    await dialog.getByLabel("Titel").fill(`E2E Seitenleiste ${Date.now() % 100000}`);
    await dialog.getByLabel("Zuständig").selectOption({ label: "Admin, Anna" });
    await dialog.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(page.getByText("Aufgabe angelegt.")).toBeVisible();

    await open(page, "/mitglieder"); // „Verein“ ist offen, „Organisation“ zu
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    const group = nav.getByRole("button", { name: "Organisation", exact: true });
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await expect(group).toHaveAccessibleDescription(/^\d+ offen$/);
    const sum = Number((await group.innerText()).replace(/\D/g, ""));
    expect(sum).toBeGreaterThan(0);

    await openNavGroup(nav, "Organisation");
    await expect(group).not.toHaveAccessibleDescription(/offen/);
    const tasks = nav.getByRole("link", { name: "Aufgaben", exact: true });
    await expect(tasks).toContainText(String(sum)); // der Zähler steht jetzt wieder am Eintrag
    // „Verein“ ist jetzt zu – ohne Zähler darin gibt es dort auch keine Summe
    await expect(
      nav.getByRole("button", { name: "Verein", exact: true }),
    ).not.toHaveAccessibleDescription(/offen/);
  });
});
