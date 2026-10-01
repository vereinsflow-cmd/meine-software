/**
 * Farbakzente für die Symbolflächen der Inhaltskarten (z. B. „Meine Aufgaben“, „Geburtstage“): Jede Art von Inhalt
 * bekommt einen eigenen, wiedererkennbaren Farbton, damit man Kartentypen auf einen Blick unterscheidet. Die Farbe
 * ist reine Orientierungshilfe – jede Bedeutung steht zusätzlich im Text (siehe status-badge.tsx für Zustände wie
 * „überfällig“); die Symbole sind für Screenreader ausgeblendet.
 *
 * Die Kennzahlenkarten des Dashboards (`StatCard`) tragen seit 01.10.2026 (auf Wunsch: „farbiger und lebendiger“)
 * wieder die Farbe ihres Bereichs – kräftiger als die Inhaltskarten (`KPI_ACCENT`): Symbol, zart getönter Grund, Rand
 * und Mini-Grafik. Bedeutungsfarben (Vergleich grün/bernstein/rot, Besetzungsbalken) bleiben davon unberührt.
 */
export const ACCENT = {
  blue: { tile: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  violet: { tile: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
  emerald: { tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
  amber: { tile: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  rose: { tile: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300" },
  slate: { tile: "bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300" },
  teal: { tile: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300" },
} as const;

export type Accent = keyof typeof ACCENT;

/**
 * Farben der vier Kennzahlenkarten. Ausgeschriebene Klassen (Tailwind findet nur vollständige Namen im Quelltext).
 * `spark`: Grundfarbe der Mini-Grafik, `sparkNow`: der hervorgehobene Wert („jetzt“) – als Füllung (Balken) und als
 * Strich (Punkt am Ende der Linie).
 */
export const KPI_ACCENT = {
  blue: {
    surface:
      "bg-linear-to-br from-blue-100/70 via-blue-50/40 to-card ring-blue-200/80 dark:from-blue-400/15 dark:via-blue-400/5 dark:ring-blue-400/25",
    hover: "hover:ring-blue-300 dark:hover:ring-blue-400/45",
    tile: "bg-blue-600 text-white dark:bg-blue-400/25 dark:text-blue-200",
    spark:
      "text-blue-400/75 group-hover/card:text-blue-500/90 dark:text-blue-300/60 dark:group-hover/card:text-blue-300/85",
    sparkNowFill: "fill-blue-700 dark:fill-blue-200",
    sparkNowStroke: "stroke-blue-700 dark:stroke-blue-200",
  },
  violet: {
    surface:
      "bg-linear-to-br from-violet-100/70 via-violet-50/40 to-card ring-violet-200/80 dark:from-violet-400/15 dark:via-violet-400/5 dark:ring-violet-400/25",
    hover: "hover:ring-violet-300 dark:hover:ring-violet-400/45",
    tile: "bg-violet-600 text-white dark:bg-violet-400/25 dark:text-violet-200",
    spark:
      "text-violet-400/75 group-hover/card:text-violet-500/90 dark:text-violet-300/60 dark:group-hover/card:text-violet-300/85",
    sparkNowFill: "fill-violet-700 dark:fill-violet-200",
    sparkNowStroke: "stroke-violet-700 dark:stroke-violet-200",
  },
  emerald: {
    surface:
      "bg-linear-to-br from-emerald-100/70 via-emerald-50/40 to-card ring-emerald-200/80 dark:from-emerald-400/15 dark:via-emerald-400/5 dark:ring-emerald-400/25",
    hover: "hover:ring-emerald-300 dark:hover:ring-emerald-400/45",
    tile: "bg-emerald-600 text-white dark:bg-emerald-400/25 dark:text-emerald-200",
    spark:
      "text-emerald-400/75 group-hover/card:text-emerald-500/90 dark:text-emerald-300/60 dark:group-hover/card:text-emerald-300/85",
    sparkNowFill: "fill-emerald-700 dark:fill-emerald-200",
    sparkNowStroke: "stroke-emerald-700 dark:stroke-emerald-200",
  },
  amber: {
    surface:
      "bg-linear-to-br from-amber-100/70 via-amber-50/40 to-card ring-amber-200/80 dark:from-amber-400/15 dark:via-amber-400/5 dark:ring-amber-400/25",
    hover: "hover:ring-amber-300 dark:hover:ring-amber-400/45",
    tile: "bg-amber-500 text-white dark:bg-amber-400/25 dark:text-amber-200",
    spark:
      "text-amber-400/80 group-hover/card:text-amber-500/90 dark:text-amber-300/60 dark:group-hover/card:text-amber-300/85",
    sparkNowFill: "fill-amber-700 dark:fill-amber-200",
    sparkNowStroke: "stroke-amber-700 dark:stroke-amber-200",
  },
} as const;

export type KpiAccent = keyof typeof KPI_ACCENT;
