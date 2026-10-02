import { z } from "zod";
import type { DashboardTabId } from "./tabs";

/**
 * Das Dashboard selbst einstellen: Jeder Reiter besteht aus Karten mit festem Namen, Standard-Reihenfolge und – bei Karten,
 * die nebeneinander unter einer Überschrift stehen – einer Gruppe. Jede Person speichert je Verein, welche Karten sie sieht,
 * in welcher Reihenfolge und – seit 02.10.2026 – wie groß (`ClubMembership.dashboardLayout`). Welche Karten es überhaupt gibt, entscheidet weiter die Rolle
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
    { id: "erste-schritte", label: "Erste Schritte" },
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

/**
 * Größe einer Karte, je Person einstellbar (auf Wunsch, 02.10.2026: „das man die Felder anpassen kann in der Größe“):
 * `s` Klein, `m` Mittel (Standard), `l` Groß. Was das für die einzelne Karte heißt, entscheidet die Darstellung – Kennzahlen
 * etwa werden klein zu einer schmalen Reihe ohne Grafiken, Listenkarten groß über die volle Breite (siehe DESIGN.md).
 */
export const BLOCK_SIZES = ["s", "m", "l"] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];
export const DEFAULT_BLOCK_SIZE: BlockSize = "m";
export const BLOCK_SIZE_LABEL: Record<BlockSize, string> = { s: "Klein", m: "Mittel", l: "Groß" };

export interface TabPrefs {
  order: string[];
  hidden: string[];
  /** Nur Karten, die nicht „Mittel“ sind; fehlt das Feld, haben alle die Standardgröße. */
  sizes?: Record<string, BlockSize>;
}

export interface DashboardLayout {
  v: 1;
  tabs: Partial<Record<DashboardTabId, TabPrefs>>;
}

const ids = z.array(z.string().max(40)).max(20);
// Größen werden beim Lesen einzeln geprüft: Eine unbekannte Größe fällt weg, statt die ganze Einstellung ungültig zu machen.
const sizes = z
  .record(z.string().max(40), z.string().max(8))
  .refine((value) => Object.keys(value).length <= 20)
  .optional();
const tabPrefs = z.object({ order: ids, hidden: ids, sizes });

/**
 * Gespeicherte Einstellung (vom Browser geschickt oder aus der Datenbank gelesen). Unbekannte Karten und Größen fallen weg – so
 * bleibt eine alte Einstellung gültig, auch wenn es eine Karte nicht mehr gibt. „Mittel“ wird nicht gespeichert (Standard).
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
      const sized = Object.entries(prefs.sizes ?? {}).filter(
        (entry): entry is [string, BlockSize] =>
          known.has(entry[0]) &&
          (BLOCK_SIZES as readonly string[]).includes(entry[1]) &&
          entry[1] !== DEFAULT_BLOCK_SIZE,
      );
      tabs[tab] = {
        order: [...new Set(prefs.order.filter((id) => known.has(id)))],
        hidden: [...new Set(prefs.hidden.filter((id) => known.has(id)))],
        ...(sized.length > 0 ? { sizes: Object.fromEntries(sized) } : {}),
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

/** Eingestellte Größe einer Karte (ohne Einstellung „Mittel“). */
export function blockSize(prefs: TabPrefs | undefined, id: string): BlockSize {
  return prefs?.sizes?.[id] ?? DEFAULT_BLOCK_SIZE;
}

/** Wie viele Einträge eine Listenkarte zuerst zeigt (der Rest hinter „weitere anzeigen“): klein einer weniger, groß zwei mehr. */
export function initialRows(size: BlockSize, base: number): number {
  return size === "s" ? Math.max(1, base - 1) : size === "l" ? base + 2 : base;
}

/** Beschriftung einer Karte (für das Fenster „Dashboard anpassen“). */
export function blockLabel(tab: DashboardTabId, id: string): string {
  return DASHBOARD_BLOCKS[tab].find((block) => block.id === id)?.label ?? id;
}
