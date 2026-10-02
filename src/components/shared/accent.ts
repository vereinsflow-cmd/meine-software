/**
 * Farbakzente für die Symbolflächen der Inhaltskarten (z. B. „Meine Aufgaben“, „Geburtstage“): Jede Art von Inhalt
 * bekommt einen eigenen, wiedererkennbaren Farbton, damit man Kartentypen auf einen Blick unterscheidet. Die Farbe
 * ist reine Orientierungshilfe – jede Bedeutung steht zusätzlich im Text (siehe status-badge.tsx für Zustände wie
 * „überfällig“); die Symbole sind für Screenreader ausgeblendet.
 *
 * Die Kennzahlenkarten des Dashboards (`StatCard`) tragen seit 01.10.2026 (auf Wunsch: „farbiger und lebendiger“)
 * wieder die Farbe ihres Bereichs – kräftiger als die Inhaltskarten (`KPI_ACCENT`): volles Symbol, getönter Grund über die
 * ganze Karte, farbiger Rand und Mini-Grafik (02.10.2026 noch kräftiger, auf Wunsch). Hinter Text höchstens die Stufe 100,
 * damit grauer Text 4,5 : 1 behält. Bedeutungsfarben (Vergleich grün/bernstein/rot, Besetzungsbalken) bleiben davon unberührt.
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
      "bg-linear-to-br from-blue-100 via-blue-50 to-blue-50/50 ring-blue-300 dark:from-blue-500/30 dark:via-blue-500/15 dark:to-blue-500/5 dark:ring-blue-400/50",
    hover: "hover:ring-blue-400 dark:hover:ring-blue-300/70",
    tile: "bg-blue-600 text-white dark:bg-blue-500 dark:text-white",
    spark:
      "text-blue-500/85 group-hover/card:text-blue-600 dark:text-blue-300/85 dark:group-hover/card:text-blue-200",
    sparkNowFill: "fill-blue-800 dark:fill-blue-100",
    sparkNowStroke: "stroke-blue-800 dark:stroke-blue-100",
  },
  violet: {
    surface:
      "bg-linear-to-br from-violet-100 via-violet-50 to-violet-50/50 ring-violet-300 dark:from-violet-500/30 dark:via-violet-500/15 dark:to-violet-500/5 dark:ring-violet-400/50",
    hover: "hover:ring-violet-400 dark:hover:ring-violet-300/70",
    tile: "bg-violet-600 text-white dark:bg-violet-500 dark:text-white",
    spark:
      "text-violet-500/85 group-hover/card:text-violet-600 dark:text-violet-300/85 dark:group-hover/card:text-violet-200",
    sparkNowFill: "fill-violet-800 dark:fill-violet-100",
    sparkNowStroke: "stroke-violet-800 dark:stroke-violet-100",
  },
  emerald: {
    surface:
      "bg-linear-to-br from-emerald-100 via-emerald-50 to-emerald-50/50 ring-emerald-300 dark:from-emerald-500/30 dark:via-emerald-500/15 dark:to-emerald-500/5 dark:ring-emerald-400/50",
    hover: "hover:ring-emerald-400 dark:hover:ring-emerald-300/70",
    tile: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white",
    spark:
      "text-emerald-500/85 group-hover/card:text-emerald-600 dark:text-emerald-300/85 dark:group-hover/card:text-emerald-200",
    sparkNowFill: "fill-emerald-800 dark:fill-emerald-100",
    sparkNowStroke: "stroke-emerald-800 dark:stroke-emerald-100",
  },
  amber: {
    surface:
      "bg-linear-to-br from-amber-100 via-amber-50 to-amber-50/50 ring-amber-300 dark:from-amber-500/30 dark:via-amber-500/15 dark:to-amber-500/5 dark:ring-amber-400/50",
    hover: "hover:ring-amber-400 dark:hover:ring-amber-300/70",
    tile: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
    spark:
      "text-amber-500/90 group-hover/card:text-amber-600 dark:text-amber-300/85 dark:group-hover/card:text-amber-200",
    sparkNowFill: "fill-amber-800 dark:fill-amber-100",
    sparkNowStroke: "stroke-amber-800 dark:stroke-amber-100",
  },
} as const;

export type KpiAccent = keyof typeof KPI_ACCENT;
