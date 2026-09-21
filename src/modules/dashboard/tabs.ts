import type { DashboardData } from "./service";

/**
 * Reiter des Dashboards. Die Aufteilung folgt den vorhandenen Inhalten und den Bereichen der Anwendung:
 *  - Übersicht: Kennzahlen, eigene Aufgaben und Einsätze, Benachrichtigungen – was jetzt wichtig ist.
 *  - Termine & Helfer: kommende Veranstaltungen, gesuchte Helfer, Auswertungen zu Veranstaltungen und Helferstunden.
 *  - Mitglieder: Geburtstage und die Auswertungen zu den Mitgliedern.
 *  - Aufgaben & Aktivität: letzte Ereignisse im Verein und die Aufgabenauswertung.
 * Einen Reiter „Finanzen“ gibt es bewusst nicht: Die Finanzverwaltung ist noch eine Platzhalterseite ohne Daten.
 */
export type DashboardTabId = "uebersicht" | "termine" | "mitglieder" | "aktivitaet";

export const DASHBOARD_TABS: readonly { id: DashboardTabId; label: string }[] = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "termine", label: "Termine & Helfer" },
  { id: "mitglieder", label: "Mitglieder" },
  { id: "aktivitaet", label: "Aufgaben & Aktivität" },
];

export const DASHBOARD_TAB_IDS: readonly DashboardTabId[] = DASHBOARD_TABS.map((tab) => tab.id);

/**
 * Welche Reiter eine Rolle bekommt. Maßgeblich ist, welche Blöcke `getDashboard` liefert (die Berechtigung wird dort geprüft) –
 * ein Reiter ohne Inhalt entfällt. Die Übersicht gibt es immer (Benachrichtigungen sieht jeder).
 */
export function availableTabs(
  data: Pick<DashboardData, "members" | "events" | "shifts" | "tasks" | "birthdays" | "activity">,
): DashboardTabId[] {
  const tabs: DashboardTabId[] = ["uebersicht"];
  if (data.events || data.shifts) tabs.push("termine");
  if (data.members || data.birthdays) tabs.push("mitglieder");
  if (data.tasks || data.activity) tabs.push("aktivitaet");
  return tabs;
}

/** Ab welchem Weg (px), Verhältnis waagerecht : senkrecht und in welcher Zeit (ms) eine Bewegung als Wischen zählt. */
export const SWIPE = { minDistance: 64, ratio: 1.6, maxDuration: 700 } as const;

/**
 * Deutet eine Fingerbewegung: nach links (dx < 0) = nächster Bereich, nach rechts = voriger. Kurze, langsame oder überwiegend
 * senkrechte Bewegungen sind Scrollen oder Antippen und ergeben `null`.
 */
export function resolveSwipe(dx: number, dy: number, durationMs: number): "next" | "prev" | null {
  if (Math.abs(dx) < SWIPE.minDistance) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE.ratio) return null;
  if (durationMs > SWIPE.maxDuration) return null;
  return dx < 0 ? "next" : "prev";
}

/**
 * Der Reiter, der zuerst offen ist: der aus der Adresse (`?tab=mitglieder`), sofern es ihn für diese Rolle gibt –
 * sonst die Übersicht. Beliebige Eingaben in der Adresse landen so nie im Nichts.
 */
export function resolveTab(
  requested: string | undefined,
  available: readonly DashboardTabId[],
): DashboardTabId {
  const match = available.find((id) => id === requested);
  return match ?? available[0] ?? "uebersicht";
}
