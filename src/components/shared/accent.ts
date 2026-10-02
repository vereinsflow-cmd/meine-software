/**
 * Farbakzente für die Symbolflächen der Inhaltskarten (z. B. „Meine Aufgaben“, „Geburtstage“): Jede Art von Inhalt
 * bekommt einen eigenen, wiedererkennbaren Farbton, damit man Kartentypen auf einen Blick unterscheidet. Die Farbe
 * ist reine Orientierungshilfe – jede Bedeutung steht zusätzlich im Text (siehe status-badge.tsx für Zustände wie
 * „überfällig“); die Symbole sind für Screenreader ausgeblendet.
 *
 * Seit 02.10.2026 (auf Wunsch eine Mischung aus den Entwürfen 2 und 5) sind die Kennzahlenkarten des Dashboards (`StatCard`)
 * kräftige Farbverläufe mit weißer Schrift (`KPI_ACCENT`), die Inhaltskarten getönte Kacheln (`TILE_ACCENT`).
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
 * Getönte Kacheln für die Inhaltskarten des Dashboards (`Widget`, Auswertungen): weicher Schein in der Bereichsfarbe aus der
 * linken oberen Ecke (`tile-tint` in globals.css), Rand in der Farbe und eine Symbolfläche mit feinem Verlauf. Hell höchstens
 * die Stufe 100 hinter Text, damit grauer Text 4,5 : 1 behält.
 */
export const TILE_ACCENT: Record<Accent, { surface: string; chip: string }> = {
  blue: {
    surface:
      "tile-tint ring-blue-200/80 [--tile-tint:var(--color-blue-100)] dark:ring-blue-400/20 dark:[--tile-tint:color-mix(in_oklab,var(--color-blue-500)_18%,transparent)]",
    chip: "bg-linear-135 from-blue-100 to-blue-200/80 text-blue-700 inset-ring inset-ring-blue-300/50 dark:from-blue-400/30 dark:to-blue-600/15 dark:text-blue-200 dark:inset-ring-blue-300/25",
  },
  violet: {
    surface:
      "tile-tint ring-violet-200/80 [--tile-tint:var(--color-violet-100)] dark:ring-violet-400/20 dark:[--tile-tint:color-mix(in_oklab,var(--color-violet-500)_18%,transparent)]",
    chip: "bg-linear-135 from-violet-100 to-violet-200/80 text-violet-700 inset-ring inset-ring-violet-300/50 dark:from-violet-400/30 dark:to-violet-600/15 dark:text-violet-200 dark:inset-ring-violet-300/25",
  },
  emerald: {
    surface:
      "tile-tint ring-emerald-200/80 [--tile-tint:var(--color-emerald-100)] dark:ring-emerald-400/20 dark:[--tile-tint:color-mix(in_oklab,var(--color-emerald-500)_18%,transparent)]",
    chip: "bg-linear-135 from-emerald-100 to-emerald-200/80 text-emerald-700 inset-ring inset-ring-emerald-300/50 dark:from-emerald-400/30 dark:to-emerald-600/15 dark:text-emerald-200 dark:inset-ring-emerald-300/25",
  },
  amber: {
    surface:
      "tile-tint ring-amber-200/80 [--tile-tint:var(--color-amber-100)] dark:ring-amber-400/20 dark:[--tile-tint:color-mix(in_oklab,var(--color-amber-500)_18%,transparent)]",
    chip: "bg-linear-135 from-amber-100 to-amber-200/80 text-amber-700 inset-ring inset-ring-amber-300/50 dark:from-amber-400/30 dark:to-amber-600/15 dark:text-amber-200 dark:inset-ring-amber-300/25",
  },
  rose: {
    surface:
      "tile-tint ring-rose-200/80 [--tile-tint:var(--color-rose-100)] dark:ring-rose-400/20 dark:[--tile-tint:color-mix(in_oklab,var(--color-rose-500)_18%,transparent)]",
    chip: "bg-linear-135 from-rose-100 to-rose-200/80 text-rose-700 inset-ring inset-ring-rose-300/50 dark:from-rose-400/30 dark:to-rose-600/15 dark:text-rose-200 dark:inset-ring-rose-300/25",
  },
  slate: {
    surface:
      "tile-tint ring-slate-200/80 [--tile-tint:var(--color-slate-100)] dark:ring-slate-400/20 dark:[--tile-tint:color-mix(in_oklab,var(--color-slate-500)_18%,transparent)]",
    chip: "bg-linear-135 from-slate-100 to-slate-200/80 text-slate-700 inset-ring inset-ring-slate-300/50 dark:from-slate-400/30 dark:to-slate-600/15 dark:text-slate-200 dark:inset-ring-slate-300/25",
  },
  teal: {
    surface:
      "tile-tint ring-teal-200/80 [--tile-tint:var(--color-teal-100)] dark:ring-teal-400/20 dark:[--tile-tint:color-mix(in_oklab,var(--color-teal-500)_18%,transparent)]",
    chip: "bg-linear-135 from-teal-100 to-teal-200/80 text-teal-700 inset-ring inset-ring-teal-300/50 dark:from-teal-400/30 dark:to-teal-600/15 dark:text-teal-200 dark:inset-ring-teal-300/25",
  },
};

/**
 * Farben der vier Kennzahlenkarten (seit 02.10.2026): kräftige Verläufe mit weißer Schrift, darunter ein farbiger Schein
 * (`--kpi-glow`), beim Überfahren stärker. Die hellste Stelle des Verlaufs liegt oben links – genau dort steht der Text; sie
 * ist so dunkel gewählt, dass weiße Schrift überall mindestens 4,5 : 1 hat (deshalb Grün ab Stufe 700, Orange ab Bernstein
 * 700). `--kpi-ink`: Farbe des Rings um den Endpunkt der Linie (wirkt wie aus der Karte ausgestanzt). Ausgeschriebene
 * Klassen, weil Tailwind nur vollständige Namen im Quelltext findet.
 */
export const KPI_ACCENT = {
  blue: {
    card: "from-blue-600 via-blue-700 to-blue-900 [--kpi-glow:color-mix(in_oklab,var(--color-blue-600)_55%,transparent)] [--kpi-ink:var(--color-blue-700)]",
    hover: "hover:[--kpi-glow:color-mix(in_oklab,var(--color-blue-500)_85%,transparent)]",
  },
  violet: {
    card: "from-violet-600 via-violet-700 to-violet-900 [--kpi-glow:color-mix(in_oklab,var(--color-violet-600)_55%,transparent)] [--kpi-ink:var(--color-violet-700)]",
    hover: "hover:[--kpi-glow:color-mix(in_oklab,var(--color-violet-500)_85%,transparent)]",
  },
  emerald: {
    card: "from-emerald-700 via-emerald-800 to-emerald-950 [--kpi-glow:color-mix(in_oklab,var(--color-emerald-600)_55%,transparent)] [--kpi-ink:var(--color-emerald-800)]",
    hover: "hover:[--kpi-glow:color-mix(in_oklab,var(--color-emerald-500)_85%,transparent)]",
  },
  amber: {
    card: "from-amber-700 via-orange-700 to-orange-900 [--kpi-glow:color-mix(in_oklab,var(--color-orange-600)_55%,transparent)] [--kpi-ink:var(--color-orange-700)]",
    hover: "hover:[--kpi-glow:color-mix(in_oklab,var(--color-orange-500)_85%,transparent)]",
  },
} as const;

export type KpiAccent = keyof typeof KPI_ACCENT;
