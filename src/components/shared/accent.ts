/**
 * Farbakzente für die Symbolflächen der Inhaltskarten (z. B. „Meine Aufgaben“, „Geburtstage“): Jede Art von Inhalt
 * bekommt einen eigenen, wiedererkennbaren Farbton, damit man Kartentypen auf einen Blick unterscheidet. Die Farbe
 * ist reine Orientierungshilfe – jede Bedeutung steht zusätzlich im Text (siehe status-badge.tsx für Zustände wie
 * „überfällig“); die Symbole sind für Screenreader ausgeblendet.
 *
 * Die Kennzahlenkarten des Dashboards (`StatCard`) nutzen diese Akzentfarben bewusst NICHT mehr: Vier verschieden
 * bunte Karten nebeneinander lasen sich wie Deko statt wie Kennzahlen. Sie teilen sich stattdessen einen einzigen,
 * neutralen Stil – die Markenfarbe bleibt echten Aktionen vorbehalten.
 */
export const ACCENT = {
  blue: { tile: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  violet: { tile: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
  emerald: { tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
  amber: { tile: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  rose: { tile: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300" },
  slate: { tile: "bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300" },
} as const;

export type Accent = keyof typeof ACCENT;
