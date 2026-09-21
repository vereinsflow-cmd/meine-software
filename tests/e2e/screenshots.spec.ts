import path from "node:path";
import { test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * Entwicklungswerkzeug (kein Test): erzeugt Screenshots der wichtigsten Seiten für die optische Kontrolle.
 *   SCREENSHOTS=1 npx playwright test screenshots --project=desktop      (helle Darstellung)
 *   SCREENSHOTS=dark npx playwright test screenshots --project=desktop   (dunkle Darstellung, Dateiname mit „-dark“)
 * Ergebnis: .local/screens/*.png
 */
test.skip(!process.env.SCREENSHOTS, "Nur mit SCREENSHOTS=1 oder SCREENSHOTS=dark");

const dark = process.env.SCREENSHOTS === "dark";
// Optional andere Fenstergröße, z. B. SCREENSHOT_SIZE=1920x1080 (Dateiname bekommt dann „-1920“ angehängt).
const size = /^(\d{3,4})x(\d{3,4})$/.exec(process.env.SCREENSHOT_SIZE ?? "");
test.use({
  colorScheme: dark ? "dark" : "light",
  ...(size ? { viewport: { width: Number(size[1]), height: Number(size[2]) } } : {}),
});

const dir = path.resolve(".local", "screens");

/** Legt für die Ansicht "Dokumente" ein paar Beispieldateien an (die Demo-Daten enthalten keine Dateien). */
async function createSampleDocuments(page: Page): Promise<void> {
  const samples = [
    { name: "Satzung 2026.pdf", category: "Satzung", access: "ALL_MEMBERS" },
    { name: "Protokoll Vorstandssitzung.txt", category: "Protokolle", access: "BOARD" },
    { name: "Kassenbericht 2025.csv", category: "Finanzen", access: "ADMIN" },
    { name: "Beitrittsformular.pdf", category: "Formulare", access: "ALL_MEMBERS" },
  ];
  for (const sample of samples) {
    const buffer = sample.name.endsWith(".pdf")
      ? Buffer.from("%PDF-1.4\n%%EOF\n")
      : Buffer.from("Beispielinhalt\n");
    await page.request.post("/api/dokumente", {
      multipart: {
        file: { name: sample.name, mimeType: "application/octet-stream", buffer },
        access: sample.access,
        category: sample.category,
      },
    });
  }
}

/** Bereich „Auswertungen“ auf dem Dashboard; die Schritte davor stellen Reiter, Ansicht, Diagrammtyp usw. ein. */
const analytics = (page: Page) => page.getByRole("region", { name: "Auswertungen" });
/** Diagrammzustände; `tab` ist der Dashboard-Reiter (Adresse `?tab=…`), in dem das Diagramm liegt. */
const chartStates: Record<string, { tab: string; steps: (page: Page) => Promise<void> }> = {
  donut: { tab: "mitglieder", steps: async () => {} },
  entwicklung: {
    tab: "mitglieder",
    steps: async (page) => {
      await analytics(page).getByRole("radio", { name: "Entwicklung" }).click();
    },
  },
  flaeche: {
    tab: "mitglieder",
    steps: async (page) => {
      await analytics(page).getByRole("radio", { name: "Entwicklung" }).click();
      await analytics(page).getByRole("radio", { name: "Fläche" }).click();
    },
  },
  balken: {
    tab: "mitglieder",
    steps: async (page) => {
      await analytics(page).getByRole("radio", { name: "Entwicklung" }).click();
      await analytics(page).getByRole("radio", { name: "Balken" }).click();
    },
  },
  tabelle: {
    tab: "mitglieder",
    steps: async (page) => {
      await analytics(page).getByRole("radio", { name: "Entwicklung" }).click();
      await analytics(page).getByRole("button", { name: "Als Tabelle" }).click();
    },
  },
  ereignisse: { tab: "termine", steps: async () => {} },
  ereignisArt: {
    tab: "termine",
    steps: async (page) => {
      await analytics(page).getByRole("radio", { name: "Nach Art" }).click();
    },
  },
  stunden: {
    tab: "termine",
    steps: async (page) => {
      await analytics(page).getByRole("tab", { name: "Helferstunden" }).click();
    },
  },
  aufgabenBalken: {
    tab: "aktivitaet",
    steps: async (page) => {
      await analytics(page).getByRole("radio", { name: "Balken" }).click();
    },
  },
};

const pages: {
  role: keyof typeof USERS;
  path: string;
  name: string;
  before?: (page: Page) => Promise<void>;
  /** Nach dem Laden der Seite (z. B. Reiter wechseln); mit `target` wird nur dieser Ausschnitt aufgenommen. */
  after?: (page: Page) => Promise<void>;
  target?: (page: Page) => ReturnType<Page["locator"]>;
}[] = [
  ...Object.entries(chartStates).map(([state, { tab, steps }]) => ({
    role: "admin" as const,
    path: `/dashboard?tab=${tab}`,
    name: `admin-auswertung-${state}`,
    after: steps,
    target: analytics,
  })),
  {
    role: "helfer",
    path: "/dashboard?tab=termine",
    name: "helfer-auswertung",
    after: chartStates.stunden!.steps,
    target: analytics,
  },
  // Die vier Reiter des Dashboards als ganze Seite
  { role: "admin", path: "/dashboard", name: "admin-dashboard" },
  { role: "admin", path: "/dashboard?tab=termine", name: "admin-dashboard-termine" },
  { role: "admin", path: "/dashboard?tab=mitglieder", name: "admin-dashboard-mitglieder" },
  { role: "admin", path: "/dashboard?tab=aktivitaet", name: "admin-dashboard-aktivitaet" },
  { role: "helfer", path: "/dashboard?tab=aktivitaet", name: "helfer-dashboard-aktivitaet" },
  { role: "admin", path: "/benachrichtigungen", name: "admin-benachrichtigungen" },
  { role: "helfer", path: "/dashboard", name: "helfer-dashboard" },
  { role: "admin", path: "/mitglieder", name: "admin-mitglieder" },
  { role: "admin", path: "/mitglieder/neu", name: "admin-mitglied-neu" },
  { role: "admin", path: "/mitglieder/statistik", name: "admin-mitglieder-statistik" },
  { role: "admin", path: "/mitglieder/import", name: "admin-mitglieder-import" },
  { role: "abteilung", path: "/mitglieder", name: "abteilung-mitglieder" },
  { role: "abteilung", path: "/dashboard", name: "abteilung-dashboard" },
  { role: "mitglied", path: "/dashboard", name: "mitglied-dashboard" },
  { role: "admin", path: "/veranstaltungen", name: "admin-veranstaltungen" },
  { role: "admin", path: "/kalender", name: "admin-kalender-monat" },
  { role: "admin", path: "/kalender?ansicht=woche", name: "admin-kalender-woche" },
  { role: "admin", path: "/kalender?ansicht=liste", name: "admin-kalender-liste" },
  { role: "admin", path: "/helferplanung", name: "admin-helferplanung" },
  { role: "helfer", path: "/helferplanung", name: "helfer-helferplanung" },
  { role: "admin", path: "/helferplanung/stunden", name: "admin-helferstunden" },
  { role: "mitglied", path: "/profil", name: "mitglied-profil" },
  { role: "mitglied", path: "/datenschutz", name: "mitglied-datenschutz" },
  { role: "admin", path: "/datenschutz", name: "admin-datenschutz" },
  { role: "admin", path: "/aufgaben", name: "admin-aufgaben" },
  { role: "admin", path: "/nachrichten", name: "admin-nachrichten" },
  { role: "admin", path: "/nachrichten/neu", name: "admin-nachricht-neu" },
  { role: "admin", path: "/dokumente", name: "admin-dokumente", before: createSampleDocuments },
  { role: "mitglied", path: "/dokumente", name: "mitglied-dokumente" },
  { role: "admin", path: "/protokoll", name: "admin-protokoll" },
  { role: "mitglied", path: "/hilfe", name: "mitglied-hilfe" },
  { role: "admin", path: "/hilfe", name: "admin-hilfe" },
  { role: "admin", path: "/hilfe/meldungen", name: "admin-hilfe-meldungen" },
];

for (const entry of pages) {
  test(`Screenshot ${entry.name}`, async ({ page }, testInfo) => {
    await login(page, USERS[entry.role]);
    await entry.before?.(page);
    await page.goto(entry.path);
    await page.waitForLoadState("networkidle");
    await entry.after?.(page);
    const file = path.join(
      dir,
      `${testInfo.project.name}-${entry.name}${dark ? "-dark" : ""}${size ? `-${size[1]}` : ""}.png`,
    );
    if (entry.target) {
      await page.mouse.move(0, 0); // kein Hover-Zustand im Bild
      await entry.target(page).screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: true });
    }
  });
}
