/**
 * Farbakzente für Kennzahlen- und Bereichskarten: Jede Art von Inhalt bekommt einen eigenen, wiedererkennbaren Farbton,
 * damit die Karten nicht alle gleich aussehen. Die Farbe ist reine Orientierungshilfe – jede Bedeutung steht zusätzlich im
 * Text (siehe status-badge.tsx für Zustände wie „überfällig“); die Symbole sind für Screenreader ausgeblendet.
 */
export const ACCENT = {
  blue: {
    tile: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    bar: "bg-blue-500 dark:bg-blue-400",
  },
  violet: {
    tile: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    bar: "bg-violet-500 dark:bg-violet-400",
  },
  emerald: {
    tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    bar: "bg-emerald-500 dark:bg-emerald-400",
  },
  amber: {
    tile: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    bar: "bg-amber-500 dark:bg-amber-400",
  },
  rose: {
    tile: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    bar: "bg-rose-500 dark:bg-rose-400",
  },
  slate: {
    tile: "bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
    bar: "bg-slate-500 dark:bg-slate-400",
  },
} as const;

export type Accent = keyof typeof ACCENT;
