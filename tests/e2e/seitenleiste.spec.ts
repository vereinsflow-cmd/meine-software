import { expect, test, type Page } from "@playwright/test";
import { USERS, loginSettled as login, open, openNavGroup, preferWideSidebar } from "./helpers";

/**
 * Seitenleiste (Desktop). Standard ab 1024 px ist seit 17.10.2026 die schmale, dunkle Symbolleiste: je Gruppe ein Knopf, der
 * rechts daneben ein Menü mit ihren Seiten öffnet; Zähler stehen als Summe am Knopf (für Screenreader als Beschreibung
 * „N offen“, ebenso „enthält die aktuelle Seite“ – der Name bleibt genau der Name der Gruppe). Unten öffnet das Kürzel der
 * Person „Persönlich“, darunter klappt „Seitenleiste ausklappen“ die breite Leiste mit Text aus.
 *
 * In der breiten Leiste klappen die Gruppen wie ein Akkordeon. Mit einer zugeklappten Gruppe verschwinden die Zähler ihrer
 * Einträge – dann zeigt die Gruppe deren Summe.
 */

/** Eine eigene offene Aufgabe: So hat „Aufgaben“ (seit 17.10.2026 Gruppe „Verein“) sicher einen Zähler. */
async function createOwnTask(page: Page): Promise<void> {
  await open(page, "/aufgaben");
  await page.getByRole("button", { name: "Neue Aufgabe" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
  await dialog.getByLabel("Titel").fill(`E2E Seitenleiste ${Date.now() % 100000}`);
  await dialog.getByLabel("Zuständig").selectOption({ label: "Admin, Anna" });
  await dialog.getByRole("button", { name: "Aufgabe anlegen" }).click();
  await expect(page.getByText("Aufgabe angelegt.")).toBeVisible();
}

test.describe("Seitenleiste", () => {
  test("Breite Leiste: zugeklappte Gruppe zeigt die Summe ihrer Zähler, aufgeklappt stehen sie wieder am Eintrag", async ({
    page,
  }) => {
    await preferWideSidebar(page);
    await login(page, USERS.admin);
    await createOwnTask(page);

    await open(page, "/dokumente"); // „Organisation“ ist offen, „Verein“ (mit „Aufgaben“) zu
    // Erst nach dem Einhängen liest die Seite die gemerkte Wahl – bis dahin steht kurz die Symbolleiste da.
    await expect(page.getByRole("button", { name: "Seitenleiste einklappen" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    const group = nav.getByRole("button", { name: "Verein", exact: true });
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await expect(group).toHaveAccessibleDescription(/^\d+ offen$/);
    const sum = Number((await group.innerText()).replace(/\D/g, ""));
    expect(sum).toBeGreaterThan(0);

    await openNavGroup(nav, "Verein");
    await expect(group).not.toHaveAccessibleDescription(/offen/);
    const tasks = nav.getByRole("link", { name: "Aufgaben", exact: true });
    await expect(tasks).toContainText(String(sum)); // der Zähler steht jetzt wieder am Eintrag
    // „Organisation“ ist jetzt zu – ohne Zähler darin (Dokumente, Finanzen) gibt es dort auch keine Summe
    await expect(
      nav.getByRole("button", { name: "Organisation", exact: true }),
    ).not.toHaveAccessibleDescription(/offen/);
  });

  test("Symbolleiste: Gruppe mit Zählern nennt die Summe in der Beschreibung, ihr Menü zeigt den Eintrag mit Zähler", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await createOwnTask(page);

    await open(page, "/dokumente"); // eine Seite außerhalb von „Verein“ – sonst stünde „enthält die aktuelle Seite“ dabei
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    const group = nav.getByRole("button", { name: "Verein", exact: true });
    await expect(group).toHaveAccessibleDescription(/^\d+ offen$/);
    const describedBy = await group.getAttribute("aria-describedby");
    const description = await nav.locator(`[id="${describedBy}"]`).textContent();
    const sum = Number(/^(\d+) offen$/.exec(description ?? "")?.[1]);
    expect(sum).toBeGreaterThan(0);
    await expect(group).toContainText(sum > 9 ? "9+" : String(sum)); // der blaue Kreis am Symbol

    // Das Menü steht im Code in der Navigation; „Aufgaben“ trägt dort den Zähler (für Screenreader „Aufgaben (N)“).
    await openNavGroup(nav, "Verein");
    const tasks = nav.getByRole("link", { name: `Aufgaben (${sum})`, exact: true });
    await expect(tasks).toBeVisible();
    await expect(tasks.getByText(sum > 99 ? "99+" : String(sum), { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Mitglieder", exact: true })).toBeVisible();

    // Escape schließt das Menü, der Fokus kehrt zum Knopf der Gruppe zurück.
    await page.keyboard.press("Escape");
    await expect(tasks).toHaveCount(0);
    await expect(group).toBeFocused();

    // Ein Klick auf einen Eintrag führt hin und schließt das Menü; die Gruppe enthält jetzt die aktuelle Seite.
    await openNavGroup(nav, "Verein");
    await tasks.click();
    await expect(page).toHaveURL(/\/aufgaben$/);
    await expect(tasks).toHaveCount(0);
    await expect(group).toHaveAccessibleDescription(/^\d+ offen, enthält die aktuelle Seite$/);
  });

  test("Symbolleiste: aktuelle Gruppe und „Persönlich“ im Bild; ausgeklappt bleibt der Fokus am Umschalter und die Wahl gemerkt", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, USERS.admin);
    await open(page, "/benutzer");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });

    // Die aktuelle Seite („Benutzer und Rollen“) steckt im Menü „Einstellungen“ – ihr Knopf sagt das.
    const settings = nav.getByRole("button", { name: "Einstellungen", exact: true });
    await expect(settings).toHaveAccessibleDescription("enthält die aktuelle Seite");
    await expect(settings).toBeInViewport({ ratio: 1 });

    // Unten das Kürzel der Person: Es öffnet Profil, Datenschutz und Hilfe & Support.
    const personal = nav.getByRole("button", { name: /^Persönlich/ });
    await expect(personal).toBeInViewport({ ratio: 1 });
    await openNavGroup(nav, /^Persönlich/);
    for (const name of ["Mein Profil", "Datenschutz", "Hilfe & Support"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("link", { name: "Hilfe & Support", exact: true })).toHaveCount(0);
    // Escape gibt den Fokus an den Knopf des Menüs zurück – erst danach weiter, sonst holte er ihn sich gleich wieder.
    await expect(personal).toBeFocused();

    // Ausklappen per Tastatur: Der Knopf der breiten Leiste übernimmt den Fokus (sonst landete er im Nichts).
    const expand = page.getByRole("button", { name: "Seitenleiste ausklappen" });
    await expand.focus();
    await expect(expand).toBeFocused();
    await page.keyboard.press("Enter");
    const collapse = page.getByRole("button", { name: "Seitenleiste einklappen" });
    await expect(collapse).toBeVisible();
    await expect(collapse).toBeFocused();
    await expect(expand).toHaveCount(0);
    // Breit steht „Persönlich“ unten angeheftet mit Text da.
    for (const name of ["Mein Profil", "Datenschutz", "Hilfe & Support"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeInViewport({ ratio: 1 });
    }

    // Die Wahl gilt auch nach dem Neuladen (auf diesem Gerät).
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(collapse).toBeVisible();
    await expect(expand).toHaveCount(0);

    // Einklappen führt zurück zur Symbolleiste.
    await collapse.click();
    await expect(expand).toBeVisible();
    await expect(personal).toBeVisible();
    await expect(collapse).toHaveCount(0);
  });
});
