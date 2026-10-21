/**
 * Bild der Abteilungskarte – kommt automatisch aus dem Namen der Abteilung (kein Upload, keine Spalte in der Datenbank):
 * Steht eine der vorbereiteten Sportarten im Namen, zeigt die Karte das passende Foto, sonst einen Verlauf in der
 * Abteilungsfarbe. Berechnet bei jedem Aufruf, folgt also auch einer Umbenennung.
 *
 * Die Fotos liegen in `public/bilder/abteilungen/<sportart>-<breite>.webp` (Unsplash-Lizenz, Fotografen in
 * docs/THIRD-PARTY-NOTICES.md), Ausschnitt 4 : 3 um das Motiv, je 480, 800 und 1200 px breit.
 */

export const DEPARTMENT_SPORTS = [
  "fussball",
  "handball",
  "badminton",
  "tennis",
  "tischtennis",
  "dart",
  "volleyball",
  "basketball",
] as const;
export type DepartmentSport = (typeof DEPARTMENT_SPORTS)[number];

export const DEPARTMENT_IMAGE_WIDTHS = [480, 800, 1200] as const;

/**
 * Fokuspunkt je Foto (`object-position` im 4 : 3-Ausschnitt): Die Karten sind schmaler als 4 : 3 und schneiden seitlich ab –
 * so bleibt das Motiv (Ball, Tor, Netz …) im Bild. Werte aus dem Erzeugungsskript (VereinsFlow-Medien/abteilungsbilder).
 */
const FOCUS: Record<DepartmentSport, string> = {
  fussball: "63% 60%",
  handball: "50% 50%",
  badminton: "51% 30%",
  tennis: "50% 36%",
  tischtennis: "58% 62%",
  dart: "50% 45%",
  volleyball: "50% 35%",
  basketball: "50% 48%", // Ausschnitt endet über dem Herstellerschriftzug auf dem Ball
};

/**
 * Erkennung im zusammengeschriebenen Namen („Beach-Volleyball“ → „beachvolleyball“, „Tisch-Tennis“ → „tischtennis“).
 * Reihenfolge zählt: Tischtennis steht vor Tennis (und Tennis schließt „tisch…“ zusätzlich aus); nennt ein Name mehrere
 * Sportarten, gewinnt die erste dieser Liste (Dart als letzte, s. u.). Kleine Tippfehler sind abgedeckt („Fusball“,
 * „Badmiton“, „Badmintion“, „Voleyball“). Fußballtennis wird mit dem Fußball gespielt und bekommt das Fußballfoto.
 */
const RULES: readonly (readonly [DepartmentSport, RegExp])[] = [
  ["tischtennis", /tischtennis|tabletennis|pingpong/],
  ["tennis", /(?<!tisch|fus{1,2}bal{1,2})tennis/],
  // Nicht Tischfußball (Kicker) – dafür gibt es kein passendes Bild.
  ["fussball", /(?<!tisch)fus{1,2}bal{1,2}|soccer/],
  ["handball", /handbal{1,2}/],
  // badminton, badmiton, badmington, badmintion, batminton
  ["badminton", /ba[dt]mi?n?g?ti?on|federball/],
  ["volleyball", /vol{1,2}ey/],
  ["basketball", /bas[ck]etbal{1,2}|streetball/],
];

/**
 * Dart nur am Wortanfang („Dart“, „Darts“, „Dartsport“, „E-Dart“, „Steeldart“, „Soft-Dart“) – zusammengeschrieben passte
 * sonst auch „Standart“.
 */
const DART = /(?:^| )(?:steel|soft)?darts?/;

/** Name in Kleinbuchstaben ohne Umlaute und Sonderzeichen, Wörter durch genau ein Leerzeichen getrennt. */
export function normalizeDepartmentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // übrige Akzente (é → e)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Sportart zum Abteilungsnamen – `null`, wenn keine passt (dann zeigt die Karte den Farbverlauf). */
export function departmentSport(name: string): DepartmentSport | null {
  const spaced = normalizeDepartmentName(name);
  const compact = spaced.replace(/ /g, "");
  for (const [sport, pattern] of RULES) {
    if (pattern.test(compact)) return sport;
  }
  return DART.test(spaced) ? "dart" : null;
}

export interface DepartmentImage {
  sport: DepartmentSport;
  /** Mittlere Größe als `src` (Browser ohne `srcset`). */
  src: string;
  srcSet: string;
  /** `object-position` für `object-cover`. */
  position: string;
}

const imageUrl = (sport: DepartmentSport, width: number) =>
  `/bilder/abteilungen/${sport}-${width}.webp`;

/** Foto zum Abteilungsnamen oder `null`. */
export function departmentImage(name: string): DepartmentImage | null {
  const sport = departmentSport(name);
  if (!sport) return null;
  return {
    sport,
    src: imageUrl(sport, 800),
    srcSet: DEPARTMENT_IMAGE_WIDTHS.map((width) => `${imageUrl(sport, width)} ${width}w`).join(
      ", ",
    ),
    position: FOCUS[sport],
  };
}

/**
 * Dunkle Abdeckung unten auf der Karte, auf der die Schrift steht: darüber ein weicher Übergang ins Bild, hinter der Schrift
 * selbst überall mindestens 60 % Schwarz. Damit hat weiße Schrift (auch zu 90 % deckend) selbst über einer rein weißen
 * Bildstelle mindestens 4,5 : 1 – unabhängig vom Foto (nachgerechnet in tests/unit/department-image.test.ts).
 */
export const CARD_SCRIM = {
  fade: "bg-linear-to-t from-black/60 to-transparent",
  text: "bg-linear-to-t from-black/85 to-black/60",
  /** Schild „Deaktiviert“ oben rechts, direkt auf dem Foto. */
  badge: "bg-black/65",
} as const;

// --- Verlauf ohne Foto ------------------------------------------------------------------------------------------------

type Rgb = [number, number, number];

/** Ohne Farbe: das Grau der Farbauswahl. */
const DEFAULT_COLOR = "#475569";
/** Ziel für weiße Schrift an der hellsten Stelle des Verlaufs – mit Luft über WCAG AA (4,5 : 1). */
export const FALLBACK_MIN_CONTRAST = 5;
/** Höchstens diese Helligkeit (OKLCH) – auch kräftige Farben wirken so satt statt grell. */
const MAX_LIGHTNESS = 0.6;
/** Die dunkle Ecke des Verlaufs: so viel der Helligkeit und Buntheit der hellen. */
const DARK_END = { lightness: 0.6, chroma: 0.8 };
/** Der Schein oben rechts ist um so viel heller als die helle Ecke. */
const GLOW_LIFT = 0.1;

function parseHex(color: string | null): Rgb {
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (rgb: Rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (value: number) => {
  const c = Math.min(1, Math.max(0, value));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};

/** sRGB → OKLCH (Matrizen nach Björn Ottosson): Helligkeit L, Buntheit C, Farbton h (Bogenmaß). */
function toOklch(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** OKLCH → sRGB; liegt die Farbe außerhalb von sRGB, wird die Buntheit verringert, bis sie hineinpasst. */
function fromOklch(L: number, C: number, h: number): Rgb {
  for (let chroma = C; ; chroma = Math.max(0, chroma - 0.004)) {
    const A = chroma * Math.cos(h);
    const B = chroma * Math.sin(h);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (chroma === 0 || linear.every((c) => c >= -0.001 && c <= 1.001)) {
      return linear.map(fromLinear) as Rgb;
    }
  }
}

/** Kontrast von Weiß zu einer Farbe (WCAG 2.x). */
function contrastToWhite(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/**
 * Zwei Farben für den Verlauf einer Karte ohne Foto: die Abteilungsfarbe, abgedunkelt bei gleichem Farbton und möglichst
 * gleicher Buntheit (in OKLCH – in sRGB mit Schwarz gemischt würde Orange schlammig braun) – so hell, wie weiße Schrift mit
 * mindestens 5 : 1 erlaubt (Gelb oder Hellgrün werden dafür kräftig abgedunkelt), die zweite Ecke deutlich dunkler. Der
 * Verlauf läuft von hell (oben links) nach dunkel (unten rechts), dazu ein weicher, hellerer Schein in der Ecke oben rechts
 * (`glow`). Die Schrift steht unten und dort zusätzlich auf `CARD_SCRIM`.
 */
export function departmentFallbackColors(color: string | null): {
  from: string;
  to: string;
  glow: string;
} {
  const [L, C, h] = toOklch(parseHex(color));
  let lightness = Math.min(L, MAX_LIGHTNESS);
  let from = fromOklch(lightness, C, h);
  while (lightness > 0 && contrastToWhite(from) < FALLBACK_MIN_CONTRAST) {
    lightness = Math.max(0, lightness - 0.01);
    from = fromOklch(lightness, C, h);
  }
  const to = fromOklch(lightness * DARK_END.lightness, C * DARK_END.chroma, h);
  // Schein oben rechts, etwas heller (höchstens so hell wie die Farbe selbst) – dort steht keine Schrift.
  const glow = fromOklch(Math.min(L, lightness + GLOW_LIFT), C, h);
  return { from: toHex(from), to: toHex(to), glow: toHex(glow) };
}
