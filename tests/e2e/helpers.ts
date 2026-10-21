import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from "@playwright/test";
import { appUrlPattern } from "./environment";

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

/** Begrüßung auf dem Dashboard nach der Tageszeit („Guten Morgen, Anna“, „Guten Tag, …“, „Guten Abend, …“). */
export const greeting = (firstName: string) =>
  new RegExp(`^Guten (Morgen|Tag|Abend), ${firstName}$`);

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

/** Setzt den eigenen Vornamen über „Mein Profil“ und meldet den bisherigen zurück (zum Zurücksetzen am Ende eines Tests). */
export async function renameSelf(page: Page, firstName: string): Promise<string> {
  await open(page, "/profil");
  const field = page.getByLabel("Vorname");
  const before = await field.inputValue();
  await field.fill(firstName);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dein Name wurde gespeichert.")).toBeVisible();
  return before;
}

/**
 * Wie der Kopf des Dashboards („Vereins-Bühne“) bei der aktuellen Fensterbreite sitzt: Höhe des Banners in rem (das Ladegerüst
 * hat fest 17 rem, am Handy 17,125 rem – dieselbe Klasse `HERO_BANNER_HEIGHT`), Zeilen der Begrüßung, ob sie mit „…“ endet und
 * in ihrer Schriftspalte bleibt, Reihen der sichtbaren Chips und wie viel unten oder rechts aus dem Banner ragt. Dazu, ob die
 * Rolle vor dem Datum steht, und der Abstand der untersten Zeile vom unteren Rand.
 */
export async function heroLayout(page: Page) {
  return page
    .getByRole("main")
    .locator('[data-slot="dashboard-hero"] [data-slot="hero-banner"]')
    .evaluate((banner) => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const box = banner.getBoundingClientRect();
      const title = banner.querySelector("h1")!;
      const text = document.createRange();
      text.selectNodeContents(title);
      const visible = (element: Element) => element.getBoundingClientRect().width > 0;
      const chips = [...banner.querySelectorAll("[data-hero-figure]")].filter(visible);
      // Zeile unter der Begrüßung: Rolle, Punkt, „, “ (nur für Screenreader), Datum
      const [role, , , date] = [...title.nextElementSibling!.children].map((part) =>
        part.getBoundingClientRect(),
      );
      return {
        // ungerundet: Der Browser legt auf 1/64 px genau an (17 rem bei 17,6 px = 299,1875 px) – im Test `expect.closeTo`
        rem: box.height / root,
        titleLines: new Set([...text.getClientRects()].map((line) => Math.round(line.bottom))).size,
        titleCut: title.scrollWidth > title.clientWidth + 1,
        titleInColumn:
          title.getBoundingClientRect().right <=
          title.parentElement!.getBoundingClientRect().right + 0.5,
        chipRows: new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size,
        outside: [...banner.querySelectorAll("h1, p, li, a, button")].filter((element) => {
          const r = element.getBoundingClientRect();
          return visible(element) && (r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5);
        }).length,
        roleBeforeDate: role!.bottom <= date!.top + 0.5 || role!.right <= date!.left + 0.5,
        bottomGap: Math.round(
          box.bottom -
            Math.max(date!.bottom, ...chips.map((chip) => chip.getBoundingClientRect().bottom)),
        ),
      };
    });
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
  groupLabel: string | RegExp,
): Promise<void> {
  // Breite Seitenleiste und schmale Symbolleiste (seit 17.10.2026 Standard ab 1024 px): Der Knopf heißt wie die Gruppe und
  // steuert sein Untermenü (`aria-expanded`/`aria-controls`) – in der Symbolleiste ein Ausklapp-Menü rechts daneben, das im
  // Code innerhalb der Navigation steht. „Persönlich“ heißt dort „Persönlich (BA)“ (Kürzel) – dafür ein regulärer Ausdruck.
  const trigger =
    typeof groupLabel === "string"
      ? nav.getByRole("button", { name: groupLabel, exact: true })
      : nav.getByRole("button", { name: groupLabel });
  if ((await trigger.getAttribute("aria-expanded")) === "true") return;
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const content = nav.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
  await content.evaluate((element) =>
    Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
  );
}

/**
 * Für Tests der breiten Seitenleiste mit Text: Seit 17.10.2026 ist ab 1024 px die schmale, dunkle Symbolleiste der Standard; die
 * breite gilt, wenn `vf:sidebar-breit` gesetzt ist (wie nach „Seitenleiste ausklappen“). Vor dem ersten Aufruf der Seite rufen.
 */
export async function preferWideSidebar(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vf:sidebar-breit", "1");
    } catch {
      // ohne Speicher bleibt die Symbolleiste
    }
  });
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

/** Wartet, bis React das (erste) Formular der Seite übernommen hat – vorher eingetippte Werte gingen verloren. */
export async function waitForHydratedForm(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form !== null && Object.keys(form).some((key) => key.startsWith("__react"));
  });
}

/**
 * Lädt als Vereinsadministrator (`admin` ist angemeldet) eine neue Person mit der Rolle „Mitglied“ ein und nimmt die
 * Einladung in einem eigenen Browser-Kontext an. Liefert die Seite der neuen, angemeldeten Person (auf dem Dashboard).
 * Für Tests, die ein Konto verändern (Zwei-Faktor, Passwort …), ohne die Demo-Konten anderer Tests anzufassen.
 */
export async function inviteNewPerson(
  admin: Page,
  browser: Browser,
  person: { email: string; firstName: string; lastName: string; password: string },
  /** Für Smartphone-Tests: das Gerät der neuen Person (z. B. `devices["Pixel 7"]`). */
  contextOptions: BrowserContextOptions = {},
): Promise<Page> {
  await open(admin, "/benutzer");
  const dialog = admin.getByRole("dialog", { name: "Person einladen" });
  await expect(async () => {
    await admin.getByRole("button", { name: "Person einladen" }).click();
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await dialog.getByLabel("E-Mail-Adresse").fill(person.email);
  await dialog.getByRole("button", { name: "Einladung senden" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => outboxMailsTo(person.email).length, { timeout: 15_000 }).toBe(1);
  const url = appUrlPattern("/einladung/[A-Za-z0-9_-]{43}").exec(
    outboxMailsTo(person.email)[0]!.text,
  )?.[0];
  expect(url, "Einladungslink in der E-Mail").toBeTruthy();

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await open(page, url!);
  await waitForHydratedForm(page);
  await page.getByLabel("Vorname").fill(person.firstName);
  await page.getByLabel("Nachname").fill(person.lastName);
  await page.locator('input[name="password"]').fill(person.password);
  await page.locator('input[name="passwordRepeat"]').fill(person.password);
  await page.getByRole("checkbox", { name: /Datenschutzerklärung/ }).check();
  await page.getByRole("button", { name: "Konto anlegen und beitreten" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

/**
 * Legt als Berechtigte ein Training der Abteilung Fußball von gestern (18:00–19:30) an und veröffentlicht es – für die
 * Anwesenheit, die erst ab einer Stunde vor Beginn erfasst werden kann. Liefert die Kennung der Veranstaltung.
 */
export async function createPublishedPastTraining(page: Page, title: string): Promise<string> {
  const day = isoDaysAgo(1);
  await open(page, "/veranstaltungen/neu");
  await page.getByLabel("Titel").fill(title);
  await page.getByLabel("Art der Veranstaltung").selectOption({ label: "Training" });
  await page.getByLabel("Abteilung").selectOption({ label: "Fußball" });
  await page.getByLabel("Beginn – Datum").fill(day);
  await page.getByLabel("Beginn – Uhrzeit").fill("18:00");
  await page.getByLabel("Ende – Datum").fill(day);
  await page.getByLabel("Ende – Uhrzeit").fill("19:30");
  await page.getByRole("button", { name: "Als Entwurf speichern" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({
    timeout: 20_000,
  });
  const id = /\/veranstaltungen\/([^/?#]+)$/.exec(page.url())?.[1];
  expect(id, "Kennung der neuen Veranstaltung in der Adresse").toBeTruthy();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Veranstaltung veröffentlichen?" });
  await confirm.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Veröffentlicht", { exact: true }).first()).toBeVisible();
  return id!;
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

/**
 * Öffnet auf einer Spenden-Seite (Cockpit oder „Alle Spenden“) das Fenster „Spende erfassen“. Ein Klick vor der Hydration
 * ginge verloren – deshalb wird er wiederholt, bis das Fenster offen ist.
 */
export async function openDonationDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Spende erfassen" });
  await expect(async () => {
    // Ist das Fenster nur langsam aufgegangen, nicht noch einmal klicken – der Knopf liegt dann hinter ihm.
    if (!(await dialog.isVisible()))
      await page.getByRole("button", { name: "Spende erfassen" }).click();
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return dialog;
}

/**
 * Im Spenden-Fenster „Von wem?“ → „Andere Person oder Firma“ → neuer Spender. Gibt es schon andere Spender, steht davor eine
 * Auswahl mit „Neu eintragen …“ – je nach Reihenfolge der Tests mal ja, mal nein. Danach ist das Feld „Name“ zu sehen.
 */
export async function chooseNewDonor(dialog: Locator): Promise<void> {
  await dialog.getByRole("radio", { name: /^Andere Person oder Firma/ }).check();
  const known = dialog.getByRole("combobox", { name: "Person oder Firma" });
  const name = dialog.getByRole("textbox", { name: "Name", exact: true });
  await expect(known.or(name)).toBeVisible();
  if (await known.isVisible()) await known.selectOption({ label: "Neu eintragen …" });
  await expect(name).toBeVisible();
}
