import { z } from "zod";
import type { DashboardTabId } from "./tabs";

/**
 * Das Dashboard selbst einstellen: Jeder Reiter besteht aus Karten mit festem Namen, Standard-Reihenfolge und – bei Karten,
 * die nebeneinander unter einer Überschrift stehen – einer Gruppe. Jede Person speichert je Verein, welche Karten sie sieht
 * und in welcher Reihenfolge (`ClubMembership.dashboardLayout`). Welche Karten es überhaupt gibt, entscheidet weiter die Rolle
 * (die Seite reicht nur die erlaubten herein). Reine Funktionen ohne Server – einzeln getestet.
 */

export type BlockGroup = "finanzen" | "fuer-dich" | "anstehend" | "geburtstage" | "aktivitaet";

export interface DashboardBlock {
  id: string;
  label: string;
  /** Aufeinanderfolgende Karten derselben Gruppe stehen unter einer Überschrift (z. B. „Für dich“). */
  group?: BlockGroup;
}

/** Alle Karten je Reiter in der Standard-Reihenfolge – so sieht das Dashboard ohne eigene Einstellung aus. */
export const DASHBOARD_BLOCKS: Record<DashboardTabId, readonly DashboardBlock[]> = {
  uebersicht: [
    { id: "kennzahlen", label: "Kennzahlen" },
    { id: "zahlungen", label: "Offene Zahlungen", group: "finanzen" },
    { id: "aufgaben", label: "Meine Aufgaben", group: "fuer-dich" },
    { id: "einsaetze", label: "Meine Einsätze", group: "fuer-dich" },
    { id: "benachrichtigungen", label: "Benachrichtigungen", group: "fuer-dich" },
  ],
  termine: [
    { id: "veranstaltungen", label: "Kommende Veranstaltungen", group: "anstehend" },
    { id: "schichten", label: "Hier werden Helfer gesucht", group: "anstehend" },
    { id: "auswertungen", label: "Auswertungen" },
  ],
  mitglieder: [
    { id: "geburtstage", label: "Geburtstage", group: "geburtstage" },
    { id: "auswertungen", label: "Auswertungen" },
  ],
  aktivitaet: [
    { id: "aktivitaet", label: "Letzte Aktivitäten", group: "aktivitaet" },
    { id: "auswertungen", label: "Auswertungen" },
  ],
};

export const GROUP_TITLE: Record<BlockGroup, string> = {
  finanzen: "Finanzen",
  "fuer-dich": "Für dich",
  anstehend: "Anstehend",
  geburtstage: "Anstehend",
  aktivitaet: "Aktivität",
};

export interface TabPrefs {
  order: string[];
  hidden: string[];
}

export interface DashboardLayout {
  v: 1;
  tabs: Partial<Record<DashboardTabId, TabPrefs>>;
}

const ids = z.array(z.string().max(40)).max(20);
const tabPrefs = z.object({ order: ids, hidden: ids });

/**
 * Gespeicherte Einstellung (vom Browser geschickt oder aus der Datenbank gelesen). Unbekannte Karten fallen weg – so bleibt
 * eine alte Einstellung gültig, auch wenn es eine Karte nicht mehr gibt.
 */
export const dashboardLayoutSchema = z
  .object({
    v: z.literal(1),
    tabs: z.object({
      uebersicht: tabPrefs.optional(),
      termine: tabPrefs.optional(),
      mitglieder: tabPrefs.optional(),
      aktivitaet: tabPrefs.optional(),
    }),
  })
  .transform((layout): DashboardLayout => {
    const tabs: DashboardLayout["tabs"] = {};
    for (const tab of Object.keys(DASHBOARD_BLOCKS) as DashboardTabId[]) {
      const prefs = layout.tabs[tab];
      if (!prefs) continue;
      const known = new Set(DASHBOARD_BLOCKS[tab].map((block) => block.id));
      tabs[tab] = {
        order: [...new Set(prefs.order.filter((id) => known.has(id)))],
        hidden: [...new Set(prefs.hidden.filter((id) => known.has(id)))],
      };
    }
    return { v: 1, tabs };
  });

/** Liest eine gespeicherte Einstellung; ungültig oder leer → `null` (Standard-Ansicht). */
export function parseDashboardLayout(value: unknown): DashboardLayout | null {
  const result = dashboardLayoutSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Die Karten eines Reiters in der eigenen Reihenfolge (sichtbare und ausgeblendete): gespeicherte in ihrer Reihenfolge, Karten
 * ohne Eintrag (etwa nach einem neuen Recht) dahinter in der Standard-Reihenfolge. `available` sind die Karten, die die Rolle
 * sehen darf.
 */
export function orderedBlocks(
  tab: DashboardTabId,
  available: readonly string[],
  prefs?: TabPrefs,
): string[] {
  const defaults = DASHBOARD_BLOCKS[tab]
    .map((block) => block.id)
    .filter((id) => available.includes(id));
  const order = prefs?.order ?? [];
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index >= 0 ? index : order.length + defaults.indexOf(id);
  };
  return [...defaults].sort((a, b) => rank(a) - rank(b));
}

/** Wie `orderedBlocks`, getrennt nach sichtbar und ausgeblendet. */
export function arrangeBlocks(
  tab: DashboardTabId,
  available: readonly string[],
  prefs?: TabPrefs,
): { shown: string[]; hidden: string[] } {
  const sorted = orderedBlocks(tab, available, prefs);
  const hidden = new Set(prefs?.hidden ?? []);
  return {
    shown: sorted.filter((id) => !hidden.has(id)),
    hidden: sorted.filter((id) => hidden.has(id)),
  };
}

export type BlockSegment =
  { kind: "group"; group: BlockGroup; ids: string[] } | { kind: "single"; id: string };

/** Fasst aufeinanderfolgende Karten derselben Gruppe zusammen – sie stehen dann unter einer Überschrift. */
export function segmentBlocks(tab: DashboardTabId, shown: readonly string[]): BlockSegment[] {
  const groupOf = new Map(DASHBOARD_BLOCKS[tab].map((block) => [block.id, block.group]));
  const segments: BlockSegment[] = [];
  for (const id of shown) {
    const group = groupOf.get(id);
    const last = segments.at(-1);
    if (!group) segments.push({ kind: "single", id });
    else if (last?.kind === "group" && last.group === group) last.ids.push(id);
    else segments.push({ kind: "group", group, ids: [id] });
  }
  return segments;
}

/** Beschriftung einer Karte (für das Fenster „Dashboard anpassen“). */
export function blockLabel(tab: DashboardTabId, id: string): string {
  return DASHBOARD_BLOCKS[tab].find((block) => block.id === id)?.label ?? id;
}
