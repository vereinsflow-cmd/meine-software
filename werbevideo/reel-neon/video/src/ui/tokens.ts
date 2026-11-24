/**
 * Design-Tokens des UI-Baukastens – nachgebaut aus der echten App. Maße und Aufbau: Aufnahmen vom 07.10.2026
 * (public/screens/, hell). Farben: DUNKLE Darstellung der App (globals.css `.dark`, seit 18.10.2026, und die `dark:`-Klassen
 * der Bausteine) – der Film zeigt die App nur dunkel. oklch() exakt nach sRGB umgerechnet (OKLab, außerhalb geklippt wie
 * die Tailwind-Hexwerte); „X/20“ = Deckkraft wie Tailwinds Deckkraft-Kürzel. Die Vergleichstafeln zeigen rechts weiter
 * die helle Aufnahme – nur als Maßvorlage. Gegengeprüft an echten Dunkel-Aufnahmen der App (16.11.2026,
 * VereinsFlow-Medien/website-entwurf/apple-pro/_bilder/handy-*-dunkel.png): Seitengrund, Karte, Ränder, Reiter, Kalender,
 * Chat, Knöpfe und Schilder treffen den Farbwert (±1).
 *
 * Bildraum („screen space“): 1170 px breit = 390 CSS-px × 3, y = 0 = Oberkante der App-Kopfzeile.
 *
 * WICHTIG – Maßstab: Die Bausteine setzen ihre Maße in CSS-px der App (text-sm = 15, rounded-lg = 10, p-4 = 16) und
 * werden als Ganzes mit scale(3) in den Bildraum gebracht (X3 in primitives.tsx, AppShell). Grund: Die System-Schrift
 * (SF Pro) wählt Laufweite und optische Größe nach der CSS-Schriftgröße – nur mit 15 px statt 45 px laufen die Zeilen
 * exakt so breit wie in den Aufnahmen (gemessen: 275 statt 260 px für „233 Einträge“, echt 273). Nach außen gilt
 * weiter der Bildraum: Positionen/Scroll-Props sind Bildpixel, Tabelle `SCREEN` unten nennt die Umrechnung.
 */

/** Skalierung CSS-px → Bildpixel (deviceScaleFactor 3 der Aufnahmen). */
export const S = 3;
/** CSS-px in Bildpixel: toScreen(16) = 48. */
export const toScreen = (cssPx: number) => cssPx * S;
/** Bildpixel in CSS-px: toCss(48) = 16. */
export const toCss = (screenPx: number) => screenPx / S;

/** Bildschirm im Bildraum (wie die PNG-Aufnahmen). */
export const SCREEN_W = 1170;
export const SCREEN_H = 2532;
/** Derselbe Bildschirm in CSS-px. */
export const CSS_W = 390;
export const CSS_H = 844;

/** Kopfzeile: h-16 = 64 CSS-px (inkl. 1 px Unterkante) = 192 Bildpixel. */
export const HEADER_H = 64;
/** Innenabstand der Seite (main p-4). */
export const PAGE_PAD = 16;
/** Inhaltsbreite in CSS-px (390 − 2 × 16 = 358 → 1074 Bildpixel). */
export const CONTENT_W = CSS_W - 2 * PAGE_PAD;

/** Schrift der App: System-Schrift (in Chrome auf dem Mac = SF Pro). */
export const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Farben der dunklen Darstellung. Namen wie bisher (hell); wo der Name die alte Tailwind-Stufe nennt (emerald50, sky700 …),
 * gilt jetzt die dunkle Klasse der App – sie steht im Kommentar. Kontrast Text ≥ 4,5 : 1 auf seiner Fläche (nachgerechnet).
 */
export const C = {
  /** Markenfarbe dunkel oklch(0.72 0.14 258) – hellblau, 7,2 : 1 auf der Karte */
  primary: "#6BA5FB",
  /** gedrückt: bg-primary/85 (hover der App) – durchscheinend über der Fläche */
  primaryPressed: "rgba(107,165,251,0.85)",
  /** Schrift auf der Markenfarbe oklch(0.17 0.03 258) – dunkles Blau, 7,6 : 1 */
  primaryFg: "#07101C",
  /** bg-primary/10 (Kreis „AA“) – durchscheinend */
  primarySoft: "rgba(107,165,251,0.1)",
  /** Text oklch(0.985 0 0) */
  fg: "#FAFAFA",
  /** gedämpfter Text oklch(0.75 0.008 286) – 8,0 : 1 auf der Karte, 7,1 : 1 auf --muted */
  muted: "#ADADB3",
  /** Füllfläche --muted oklch(0.255 0.005 286) – Reiterleiste, neutrales Schild, Vereinslogo (eine Stufe heller als die Karte) */
  mutedBg: "#222225",
  /** Tabellenkopf bg-muted/50 über der Karte */
  tableHead: "#1C1C1F",
  /** Rand oklch(1 0 0 / 11 %) */
  border: "rgba(255,255,255,0.11)",
  /** Rand der Eingabefelder oklch(0.57 0.008 286) – deckend, 4,0 : 1 auf der Karte */
  field: "#77777C",
  /** Karte oklch(0.205 0.004 286) */
  card: "#171719",
  /** Seitengrund oklch(0.145 0.002 286) – fast schwarz, neutral */
  page: "#0A0A0B",
  /** Kopfzeile bg-card/80 über dem Seitengrund */
  header: "#141416",

  // Schilder (ToneBadge der App): dunkel bg-…-950, Schrift …-200 (alle ≥ 10 : 1)
  greenBg: "#002C22", // emerald-950
  greenFg: "#A4F4CF", // emerald-200
  blueBg: "#162456", // blue-950
  blueFg: "#BEDBFF", // blue-200
  amberBg: "#461901", // amber-950
  amberFg: "#FEE685", // amber-200
  redBg: "#460809", // red-950
  redFg: "#FFC9C9", // red-200

  /** „3 frei“, solange noch niemand eingetragen ist (dark:text-amber-400) */
  orange: "#FFB900",
  /** „voll“, Einnahmen im Kassenbuch, Uhrzeit ungelesener Chats (dark:text-emerald-400) */
  green: "#00D492",
  /** Haken „Du hast zugesagt.“ (text-emerald-600, ohne dark: in der App – 4,9 : 1 auf der Karte) */
  check: "#009966",
  /** „seit 10 Tagen überfällig“ (dark:text-red-400) */
  redText: "#FF6467",
  /** Füllungen der Besetzungsbalken (ohne dark: in der App) */
  emerald500: "#00BC7D",
  amber500: "#FE9A00",
  red500: "#FB2C36",
  /** Kalender: Hintergründe der Einträge (dark:bg-…-950/40, durchscheinend über dem Seitengrund) */
  emerald50: "rgba(0,44,34,0.4)",
  violet50: "rgba(47,13,104,0.4)",
  amber50: "rgba(70,25,1,0.4)",
  blue50: "rgba(22,36,86,0.4)",
  red50: "rgba(70,8,9,0.4)",
  /** alle haben gelesen: Doppelhaken (dark:text-sky-300) */
  sky700: "#74D4FF",

  // Nachrichten wie WhatsApp dunkel (--chat-* der App)
  chatWall: "#0B141A",
  chatOwn: "#005C4B",
  chatOther: "#202C33",
  chatFg: "#E9EDEF",
  /** Uhrzeit und Häkchen: Weiß 80 % */
  chatMeta: "rgba(255,255,255,0.8)",
  /** Senden-Knopf (dark:bg-emerald-600, Symbol weiß) */
  send: "#009966",

  // neu für die dunkle Darstellung
  /** Datumstrenner im Chat --chat-day */
  chatDay: "#182229",
  /** Zähler ungelesener Chats: bg-emerald-700 mit weißer Zahl (ohne dark: in der App – 5,4 : 1) */
  unread: "#007A55",
  /** Kartenrand ring-foreground/15 (dunkel kräftiger als hell) */
  ring: "rgba(250,250,250,0.15)",
  /** Flächen-Rand der Felder und Umriss-Knöpfe --input oklch(1 0 0 / 15 %) */
  input: "rgba(255,255,255,0.15)",
  /** Feld- und Umriss-Knopf-Fläche dark:bg-input/30 */
  inputBg: "rgba(255,255,255,0.045)",
  /** Umriss-Knopf gedrückt dark:bg-input/50 */
  inputBgPressed: "rgba(255,255,255,0.075)",
  /** --accent oklch(0.28 0.006 286) – aktive Zeile (Chatliste) */
  accent: "#28282C",
  /** --secondary oklch(0.27 0.005 286) */
  secondary: "#262629",
  /** --popover oklch(0.23 0.005 286) – Menüs, Dialoge */
  popover: "#1D1D1F",
  /** --success oklch(0.74 0.15 150) mit dunkler Schrift oklch(0.17 0.03 150), 8,8 : 1 */
  success: "#5AC576",
  successFg: "#061308",
  /**
   * gedrückt: color-mix(in oklch, success, foreground 12 %), 9,6 : 1. Chrome mischt den Farbton mit (foreground hat Farbton 0,
   * nicht „none“) – 150° → 132°, daher gelblicher (im Headless-Chrome gemessen).
   */
  successPressed: "#94C66A",
  /** Glocke: Füllung --bell oklch(0.86 0.17 92), Umriss --bell-outline oklch(0.8 0.15 85) */
  bell: "#F9CC21",
  bellOutline: "#EAB532",
  /** --destructive oklch(0.704 0.191 22.216) */
  destructive: "#FF6467",
} as const;

/**
 * Tönung hervorgehobener Tabellenzeilen (Mitglieder, Import, Kassenbuch): Markenfarbe 10 % – dunkel kräftiger als hell (6 %),
 * wie die App ihre Markenfarb-Tönungen im Dunkeln anhebt (Mitgliederliste bg-primary/[0.08] → dark /[0.13]).
 */
export const ROW_TINT = 0.1;

/**
 * Farbe mit Deckkraft: withAlpha("#6BA5FB", 0.1) → „rgba(107,165,251,0.1)“. Nimmt Hex (#RGB/#RRGGBB) und rgb()/rgba() –
 * eine vorhandene Deckkraft wird mit a malgenommen (withAlpha(C.border, 0.5) → Weiß 5,5 %).
 */
export const withAlpha = (color: string, a: number) => {
  const m = color.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  if (m) return `rgba(${Math.round(+m[1])},${Math.round(+m[2])},${Math.round(+m[3])},${round(a * (m[4] === undefined ? 1 : +m[4]))})`;
  const h = color.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${round(a)})`;
};

/** Farben der runden Chat-Bilder (ChatAvatar der App), dunkel: Fläche -950, Symbol -300 (alle ≥ 8 : 1). */
export const AVATAR_TONE = {
  emerald: { bg: "#002C22", fg: "#5EE9B5" },
  amber: { bg: "#461901", fg: "#FFD230" },
  violet: { bg: "#2F0D68", fg: "#C4B4FF" },
  sky: { bg: "#052F4A", fg: "#74D4FF" },
  /** ohne Vorbild in der App (dort kein blauer Chat) – abgeleitet wie die anderen */
  blue: { bg: "#162456", fg: "#8EC5FF" },
} as const;
export type AvatarTone = keyof typeof AVATAR_TONE;

/** Farbverläufe der Kennzahlenkarten (KPI_ACCENT der App: bg-linear-160 in oklab, from/via/to) – dunkel dieselben, nur der Ring wird white/10. */
export const KPI_GRADIENT = {
  blue: {
    stops: ["oklch(54.6% 0.245 262.881)", "oklch(48.8% 0.243 264.376)", "oklch(37.9% 0.146 265.522)"],
    glow: "color-mix(in oklab, oklch(54.6% 0.245 262.881) 55%, transparent)",
    ink: "oklch(48.8% 0.243 264.376)",
  },
  amber: {
    stops: ["oklch(55.5% 0.163 48.998)", "oklch(55.3% 0.195 38.402)", "oklch(40.8% 0.123 38.172)"],
    glow: "color-mix(in oklab, oklch(64.6% 0.222 41.116) 55%, transparent)",
    ink: "oklch(55.3% 0.195 38.402)",
  },
  emerald: {
    stops: ["oklch(50.8% 0.118 165.612)", "oklch(43.2% 0.095 166.913)", "oklch(26.2% 0.051 172.552)"],
    glow: "color-mix(in oklab, oklch(59.6% 0.145 163.225) 55%, transparent)",
    ink: "oklch(43.2% 0.095 166.913)",
  },
  violet: {
    stops: ["oklch(54.1% 0.281 293.009)", "oklch(49.1% 0.27 292.581)", "oklch(38% 0.189 293.745)"],
    glow: "color-mix(in oklab, oklch(54.1% 0.281 293.009) 55%, transparent)",
    ink: "oklch(49.1% 0.27 292.581)",
  },
} as const;
export type KpiAccent = keyof typeof KPI_GRADIENT;

/** Schriftgrößen der App in CSS-px (text-xs/-sm sind dort auf 13/15 px vergrößert). Bildpixel = × 3. */
export const TEXT = {
  xs: { fontSize: 13, lineHeight: "18.2px" },
  sm: { fontSize: 15, lineHeight: "21.75px" },
  base: { fontSize: 16, lineHeight: "24px" },
  lg: { fontSize: 18, lineHeight: "28px" },
  xl: { fontSize: 20, lineHeight: "28px" },
  "2xl": { fontSize: 24, lineHeight: "32px" },
  "3xl": { fontSize: 30, lineHeight: "36px" },
  "4xl": { fontSize: 36, lineHeight: "40px" },
} as const;
export type TextSize = keyof typeof TEXT;

/** Radien in CSS-px (--radius 0.625rem = 10 px). */
export const R = { sm: 6, md: 8, lg: 10, xl: 14, "2xl": 18, "4xl": 26, kpi: 28, full: 9999 } as const;

/**
 * Schatten der App (Tailwind v4) in CSS-px. Die App behält sie im Dunkeln (schwarz, kaum sichtbar) – Tiefe entsteht dort
 * über die Flächenstufen und die hellen Ringe.
 */
export const SHADOW = {
  xs: "0 1px 2px 0 rgba(0,0,0,0.05)",
  sm: "0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)",
  /** Kartenrahmen ring-1 ring-foreground/15 (dunkel) + shadow-sm */
  card: "0 0 0 1px rgba(250,250,250,0.15), 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)",
  lg: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
} as const;

export const W = { normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 } as const;

/** Geschütztes Leerzeichen vor „€“ (wie Intl.NumberFormat de-DE). */
export const NBSP = " ";
