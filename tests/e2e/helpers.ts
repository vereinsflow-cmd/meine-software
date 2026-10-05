import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
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
  // Erst wenn React das Formular übernommen hat („hydratisiert“), schickt es per JavaScript ab – vorher täte es der Browser
  // selbst (als POST an die Seite, ohne Anmeldung). React hängt dabei eigene Schlüssel an die DOM-Knoten.
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form !== null && Object.keys(form).some((key) => key.startsWith("__react"));
  });
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

/**
 * Klappt in der übergebenen Navigation (Seitenleiste oder mobiles Menü) das einklappbare Untermenü mit dem
 * angegebenen Namen auf, falls es noch geschlossen ist – die Menüpunkte „Verein“, „Organisation“, „Kommunikation“ und
 * „Einstellungen“ sind standardmäßig zu. Ohne Wirkung, wenn die Gruppe schon offen ist.
 *
 * Wartet, bis das Aufklappen fertig animiert ist: Solange die Gruppe noch wächst, sind untere Einträge abgeschnitten,
 * und ein Überfahren/Klicken ließe den Browser die halb offene Gruppe verschieben – danach läge ein anderer Eintrag unter
 * dem Zeiger.
 */
export async function openNavGroup(
  nav: ReturnType<Page["getByRole"]>,
  groupLabel: string,
): Promise<void> {
  const trigger = nav.getByRole("button", { name: groupLabel, exact: true });
  if ((await trigger.getAttribute("aria-expanded")) === "true") return;
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const content = nav.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
  await content.evaluate((element) =>
    Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
  );
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Benutzermenü/ }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/anmelden/);
}

/**
 * Öffnet „Beitrittsanträge“ als berechtigte Person, richtet den QR-Code ein, falls noch keiner besteht, und liefert den
 * öffentlichen Link. Ein vorhandener Link (z. B. aus einem anderen Test) bleibt – so ist die Reihenfolge der Tests egal.
 */
export async function setUpJoinLink(page: Page): Promise<string> {
  await open(page, "/mitglieder/antraege");
  const setup = page.getByRole("button", { name: "QR-Code einrichten" });
  if (await setup.isVisible()) {
    await setup.click();
    // Beim Einrichten fragt die App, wie viele Anmeldungen der QR-Code zulässt – reichlich für alle Tests
    const dialog = page.getByRole("dialog", { name: "QR-Code einrichten" });
    await dialog.locator('input[name="limit"]').fill("1000");
    await dialog.getByRole("button", { name: "QR-Code einrichten" }).click();
    await expect(dialog).toBeHidden();
  }
  const link = page.getByLabel("Link zum Antragsformular");
  await expect(link).toBeVisible();
  return link.inputValue();
}

export interface OutboxMail {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

/**
 * E-Mails an eine Adresse aus dem Postausgang der E2E-Umgebung (`MAIL_TRANSPORT=file` schreibt jede Mail als JSON nach
 * `.local/outbox/`). Der Ordner wird nicht geleert – eindeutige Adressen je Test halten die Treffer auseinander.
 */
export function outboxMailsTo(address: string): OutboxMail[] {
  const dir = path.resolve(".local", "outbox");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(readFileSync(path.join(dir, name), "utf8")) as OutboxMail;
      } catch {
        return null; // wird gerade geschrieben
      }
    })
    .filter((mail): mail is OutboxMail => mail !== null && mail.to === address);
}

/**
 * Kassenbuch einrichten, falls noch nicht geschehen (die E2E-Datenbank startet ohne). Mehrere Testdateien brauchen es –
 * alle mit denselben Werten, damit Kontostände überall gleich sind.
 */
/** „JJJJ-MM-TT“ vor `days` Tagen (Berlin). */
export function isoDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(date);
}

export async function ensureLedger(page: Page): Promise<void> {
  await open(page, "/finanzen/kassenbuch");
  const setup = page.getByRole("button", { name: "Kassenbuch einrichten" });
  if (await setup.isVisible()) {
    // Beginn vor 60 Tagen statt am 1. Januar: Die bezahlte Seed-Rechnung (vor 40 Tagen) liegt so zu jeder Jahreszeit im
    // Kassenbuch – auch im Januar.
    await page.getByLabel("Kassenbuch beginnt am").fill(isoDaysAgo(60));
    await page.getByLabel("Bank").fill("Sparkasse Musterstadt");
    await page.getByLabel("Anfangsbestand in €").first().fill("11.200,00");
    await page.getByLabel("Anfangsbestand in €").nth(1).fill("239,80");
    await setup.click();
  }
  await expect(page.getByRole("button", { name: "Neue Buchung" })).toBeVisible({ timeout: 20_000 });
}
