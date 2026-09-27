import type { TaskStatus } from "@/generated/prisma/enums";

/**
 * Aufgabenliste übersichtlich: Reiter (welche Aufgaben), Gruppen nach Frist und kurze Fristhinweise – reine Funktionen
 * für `(app)/aufgaben/page.tsx` und die Aufgabenkarten, einzeln getestet.
 */

/** Reiter über der Liste. Sie ersetzen die früheren Auswahlfelder „Ansicht“, „Zuständigkeit“ und „Nur überfällige“. */
export const TASK_TABS = ["offen", "mir", "niemand", "ueberfaellig", "erledigt", "alle"] as const;
export type TaskTab = (typeof TASK_TABS)[number];

export const TASK_TAB_LABEL: Record<TaskTab, string> = {
  offen: "Offen",
  mir: "Mir zugewiesen",
  niemand: "Nicht zugewiesen",
  ueberfaellig: "Überfällig",
  erledigt: "Erledigt",
  alle: "Alle",
};

export interface TaskTabParams {
  ansicht?: string;
  zustaendig?: string;
  ueberfaellig?: string;
}

/**
 * URL-Parameter je Reiter. Es sind die bisherigen Parameter – ältere Links (z. B. „Aufgaben zu dieser Veranstaltung“ mit
 * `ansicht=alle`) funktionieren unverändert. Jeder Reiter setzt alle drei, damit ein Wechsel die übrigen zurücksetzt.
 */
export const TASK_TAB_PARAMS: Record<TaskTab, Record<keyof TaskTabParams, string | undefined>> = {
  offen: { ansicht: undefined, zustaendig: undefined, ueberfaellig: undefined },
  mir: { ansicht: undefined, zustaendig: "me", ueberfaellig: undefined },
  niemand: { ansicht: undefined, zustaendig: "none", ueberfaellig: undefined },
  ueberfaellig: { ansicht: undefined, zustaendig: undefined, ueberfaellig: "1" },
  erledigt: { ansicht: "erledigt", zustaendig: undefined, ueberfaellig: undefined },
  alle: { ansicht: "alle", zustaendig: undefined, ueberfaellig: undefined },
};

/** Der Reiter, der zu den Parametern passt (bei alten Kombinationen der speziellere). */
export function activeTaskTab(params: TaskTabParams): TaskTab {
  if (params.ansicht === "erledigt") return "erledigt";
  if (params.ansicht === "alle") return "alle";
  if (params.ueberfaellig === "1") return "ueberfaellig";
  if (params.zustaendig === "me") return "mir";
  if (params.zustaendig === "none") return "niemand";
  return "offen";
}

/** Gruppen der Liste, in dieser Reihenfolge – passend zur Sortierung des Dienstes (Frist aufsteigend, ohne Frist zuletzt). */
export const DUE_GROUPS = ["ueberfaellig", "bald", "spaeter", "ohne", "erledigt"] as const;
export type DueGroup = (typeof DUE_GROUPS)[number];

export const DUE_GROUP_LABEL: Record<DueGroup, string> = {
  ueberfaellig: "Überfällig",
  bald: "Nächste 7 Tage",
  spaeter: "Später",
  ohne: "Ohne Datum",
  erledigt: "Erledigt",
};

interface Groupable {
  status: TaskStatus;
  dueInDays: number | null;
}

export function dueGroup(task: Groupable): DueGroup {
  if (task.status === "DONE") return "erledigt";
  if (task.dueInDays === null) return "ohne";
  if (task.dueInDays < 0) return "ueberfaellig";
  return task.dueInDays <= 7 ? "bald" : "spaeter";
}

/** Teilt die Liste in Gruppen; leere Gruppen entfallen, innerhalb einer Gruppe bleibt die Reihenfolge. */
export function groupByDue<T extends Groupable>(
  tasks: readonly T[],
): { group: DueGroup; label: string; tasks: T[] }[] {
  return DUE_GROUPS.map((group) => ({
    group,
    label: DUE_GROUP_LABEL[group],
    tasks: tasks.filter((task) => dueGroup(task) === group),
  })).filter((entry) => entry.tasks.length > 0);
}

/** Kurzer Hinweis zur Frist: „heute“, „morgen“, „in 3 Tagen“ (bis 14 Tage), „seit 5 Tagen überfällig“. */
export function dueHint(dueInDays: number | null, done: boolean): string | null {
  if (dueInDays === null || done) return null;
  if (dueInDays === 0) return "heute";
  if (dueInDays === 1) return "morgen";
  if (dueInDays > 1) return dueInDays <= 14 ? `in ${dueInDays} Tagen` : null;
  return dueInDays === -1 ? "seit gestern überfällig" : `seit ${-dueInDays} Tagen überfällig`;
}
