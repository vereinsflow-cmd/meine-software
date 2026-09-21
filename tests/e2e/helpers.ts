import { expect, type Page } from "@playwright/test";

/** Passwort der Demo-Benutzer (aus .env, siehe SEED_PASSWORD). Nur für lokale Test-Daten. */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Vereinsflow-Demo-2026!";

export const USERS = {
  superadmin: "superadmin@vereinsflow.local",
  admin: "admin@demo-verein.local",
  vorstand: "vorstand@demo-verein.local",
  abteilung: "abteilung@demo-verein.local",
  helfer: "helfer@demo-verein.local",
  mitglied: "mitglied@demo-verein.local",
  mehrfach: "mehrfach@demo-verein.local",
  otherAdmin: "admin@anderer-verein.local",
} as const;

/** Meldet über die Oberfläche an – genau wie ein echter Benutzer. */
export async function login(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/\/anmelden/);
}

/**
 * Meldet an und wartet, bis die Startseite fertig geladen und „lebendig“ (hydratisiert) ist. Erst dann greifen Klicks auf
 * Bedienelemente von Client-Komponenten (Reiter, „weitere anzeigen“ …); vorher gehen sie verloren.
 */
export async function loginSettled(
  page: Page,
  email: string,
  password = DEMO_PASSWORD,
): Promise<void> {
  await login(page, email, password);
  await page.waitForLoadState("networkidle");
}

/**
 * Wählt einen Reiter (Radix `Tabs`) und prüft, dass er ausgewählt ist. Ein Klick, der vor der Hydration kam und verloren ging,
 * wird wiederholt – so bleibt der Test auch auf langsamen Rechnern stabil.
 */
export async function chooseTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole("tab", { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Öffnet eine Seite und wartet, bis sie interaktiv ist. Im Entwicklungsmodus lädt die erste Anfrage einer Route
 * langsam; setzt man Formularwerte VOR der Hydration, überschreibt React Hook Form sie danach mit den Startwerten.
 */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Benutzermenü/ }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/anmelden/);
}
