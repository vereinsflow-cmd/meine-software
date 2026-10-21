import { departmentImage } from "@/modules/departments/department-image";
import type { DashboardData } from "./service";

/**
 * Reine Hilfen für den Kopf des Dashboards, die „Vereins-Bühne“ (`components/dashboard-hero.tsx`, seit 21.10.2026, Entwurf D):
 * Begrüßung, Auswahl der Abteilungsfotos, Zahlen der Glas-Chips, Form der Fotostreifen und die Farben, auf denen weiße Schrift
 * steht. Ohne Datenbank und ohne React – im Browser und auf dem Server gleich, einzeln testbar (tests/unit/dashboard-hero.test.ts).
 */

/**
 * Gruß nach der Tageszeit in Deutschland (wie „Good morning“ der Vorlage „Vertix“): 5–11 Uhr Morgen, 11–18 Uhr Tag, sonst Abend.
 * Die Stunde kommt aus `formatToParts`: Neuere ICU-Fassungen (Node 24) formatieren „de-DE“ als „11 Uhr“ – `Number("11 Uhr")`
 * wäre `NaN`, und es hieß bis 21.10.2026 rund um die Uhr „Guten Abend“.
 */
export function greetingFor(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/Berlin",
    })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value,
  );
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  return "Guten Abend";
}

// --- Fotos der Abteilungen ----------------------------------------------------------------------------------------------

/** Eine Abteilung auf der Bühne – nur, was Bild und Namensschild brauchen (`DashboardData["departments"]`). */
export type HeroDepartment = NonNullable<DashboardData["departments"]>[number];

/** So viele Fotostreifen zeigt die Bühne höchstens. */
export const HERO_MAX_STRIPS = 4;

/**
 * Welche Abteilungen auf die Bühne kommen und in welcher Reihenfolge: die mit Foto zuerst (Reihenfolge wie geliefert, also nach
 * Namen wie auf /abteilungen), dann die mit Farbverlauf – höchstens `max`. `main` ist das EINE Bild am Handy: die größte
 * Abteilung mit Foto (bei Gleichstand die erste), ohne Fotos die erste Abteilung. Es ist immer einer der Streifen – am Handy
 * bleibt genau dieser Streifen stehen und füllt die Breite; so lädt der Browser für beide Ansichten dasselbe Bild.
 */
export function heroStage(
  departments: readonly HeroDepartment[],
  max: number = HERO_MAX_STRIPS,
): { strips: HeroDepartment[]; main: HeroDepartment | null } {
  const withPhoto = departments.filter((department) => departmentImage(department.name));
  const ordered = [
    ...withPhoto,
    ...departments.filter((department) => !departmentImage(department.name)),
  ];
  // `sort` ist stabil: Bei gleicher Größe gewinnt die erste (nach Namen).
  const main =
    [...withPhoto].sort((a, b) => b.memberCount - a.memberCount)[0] ?? ordered[0] ?? null;
  if (!main) return { strips: [], main: null };
  const picked = new Set([main, ...ordered.filter((d) => d !== main).slice(0, max - 1)]);
  return { strips: ordered.filter((department) => picked.has(department)), main };
}

/** Wie weit jeder Streifen oben nach rechts versetzt ist (px) – und wie breit die schräge Fuge zum Nachbarn bleibt. */
export const HERO_SLANT = 56;
export const HERO_GAP = 6;

/**
 * Form eines Streifens: ein Parallelogramm, das sich so weit unter den linken Nachbarn schiebt, dass nur eine schmale, schräge
 * Fuge bleibt (durch sie scheint das Licht). Der letzte Streifen ist rechts gerade – dort ist der Rand des Banners.
 */
export function heroStripShape(
  index: number,
  count: number,
): { marginLeft: string; clipPath: string } {
  const last = index === count - 1;
  return {
    marginLeft: index === 0 ? "0px" : `${-(HERO_SLANT - HERO_GAP)}px`,
    clipPath: last
      ? `polygon(${HERO_SLANT}px 0, 100% 0, 100% 100%, 0 100%)`
      : `polygon(${HERO_SLANT}px 0, 100% 0, calc(100% - ${HERO_SLANT}px) 100%, 0 100%)`,
  };
}

/**
 * Angezeigte Breite eines Streifens fürs `srcset`. Die Streifen stehen rechts im Banner, sobald der Kopf 40 rem breit ist – das
 * ist ab 688 px Fenster (640 px Kopf + 2 × 24 px Seitenrand). Schmaler, auch quer am Handy (667 px), steht das eine Foto über
 * die ganze Breite. Die Reihe ist rund 66 % des Banners breit, das Banner rund das Fenster ohne Symbolleiste und Ränder
 * (≈ 100vw − 164 px); jeder Streifen überlappt seinen Nachbarn um 50 px. Das eine Foto füllt die Breite des Banners (Fenster
 * − 2 × 16 px; ab 640 px ist der Rand 24 px, das Bild also eher etwas größer als nötig). In px, weil `rem` in `sizes` die
 * Grundgröße des Browsers meint, nicht die mitwachsende Schrift der App.
 */
export function heroStripSizes(count: number): string {
  const n = Math.max(1, count);
  // 0,66 × (100vw − 164 px) + (n − 1) × 50 px, geteilt durch n
  const offset = (n - 1) * (HERO_SLANT - HERO_GAP) - 108;
  const sign = offset < 0 ? "-" : "+";
  return `(min-width: 688px) calc((66vw ${sign} ${Math.abs(offset)}px) / ${n}), calc(100vw - 32px)`;
}

// --- Feste Höhe: Das Banner springt nicht ---------------------------------------------------------------------------------

/**
 * Höhe des Banners – fest, unabhängig vom Inhalt, und dieselbe Klasse im Ladegerüst (`app/(app)/dashboard/loading.tsx`): am
 * Handy 17,125 rem (mit Foto wie ohne), ab 40 rem Kopfbreite 17 rem (bei 1440 px Fenster rund 300 px). Damit der Inhalt immer
 * hineinpasst, bleibt jede Zeile darin einzeilig: Die Begrüßung wird bei langen Namen kleiner (`heroTitleEms`), Rolle, Datum
 * und Vereinsname kürzen sich notfalls mit „…“, die Chips zeigen Symbol und lange Form nur, wo sie passen (`heroFigureSteps`).
 * Vorher wuchs das Banner etwa bei „Guten Morgen, Sebastian“ um eine Zeile, und der Inhalt sprang beim Erscheinen um bis zu
 * 85 px.
 */
export const HERO_BANNER_HEIGHT = "h-[17.125rem] @[40rem]/buehne:h-[17rem]";

/**
 * Geschätzte Breite eines Zeichens der Begrüßung in em (halbfett, Laufweite −0,035 em). Gemessen mit den Systemschriften der
 * App: SF Pro (Mac, iPhone) 0,46–0,48, Arial 0,49–0,51, Tahoma (ähnlich breit wie Segoe UI) 0,52–0,54 – mit Reserve 0,55.
 */
export const HERO_TITLE_EM_PER_CHAR = 0.55;

/**
 * Geschätzte Breite der Begrüßung in em. Die Komponente teilt die Breite der Schriftspalte dadurch und nimmt das als
 * Schriftgröße, wenn es kleiner ist als die übliche – so bleibt auch „Guten Morgen, Anna-Katharina“ in EINER Zeile. Kurze
 * Namen („Anna“) behalten die volle Größe.
 */
export function heroTitleEms(text: string): number {
  return Math.round([...text].length * HERO_TITLE_EM_PER_CHAR * 100) / 100;
}

// --- Zahlen der Glas-Chips ----------------------------------------------------------------------------------------------

/**
 * Eine Zahl als Glas-Chip unten im Banner. `before` und `after` stehen nur auf breiten Bannern da (`heroFigureSteps`), für
 * Screenreader immer – der Name des Links ist so auf jeder Breite derselbe („2 Termine in 30 Tagen“).
 */
export interface HeroFigure {
  key: "mitglieder" | "termine" | "helferplaetze";
  href: string;
  value: number;
  before: string;
  word: string;
  after: string;
}

/**
 * Die Chips – aus denselben Blöcken wie die Kennzahlkarten (`getDashboard` prüft die Rechte): Mitglieder nur mit
 * `members:read` für den Verein oder die eigenen Abteilungen, Termine mit `events:read`, offene Helferplätze mit `shifts:read`.
 * Fehlt ein Recht, ist der Block `null` und der Chip entfällt.
 */
export function heroFigures(
  data: Pick<DashboardData, "members" | "events" | "shifts">,
): HeroFigure[] {
  const figures: HeroFigure[] = [];
  if (data.members) {
    const n = data.members.total;
    figures.push({
      key: "mitglieder",
      href: "/mitglieder",
      value: n,
      before: "",
      word: n === 1 ? "Mitglied" : "Mitglieder",
      after: data.members.scope === "DEPARTMENT" ? " in deiner Abteilung" : "",
    });
  }
  if (data.events) {
    const n = data.events.countNext30Days;
    figures.push({
      key: "termine",
      href: "/veranstaltungen",
      value: n,
      before: "",
      word: n === 1 ? "Termin" : "Termine",
      after: " in 30 Tagen",
    });
  }
  if (data.shifts) {
    const n = data.shifts.freeSpots;
    figures.push({
      key: "helferplaetze",
      href: "/helferplanung",
      value: n,
      before: n === 1 ? "offener " : "offene ",
      word: n === 1 ? "Helferplatz" : "Helferplätze",
      after: "",
    });
  }
  return figures;
}

/**
 * Stufen der Kopfbreite (rem), ab denen die Chips neben den Knöpfen ihr Symbol bzw. ihre lange Form zeigen – je Stufe eine feste
 * Klasse in der Komponente.
 */
export const HERO_FIGURE_STEPS = [62, 66, 70, 74, 78, 84, 90] as const;
export type HeroFigureStep = (typeof HERO_FIGURE_STEPS)[number];

/** Geschätzte Breite der Chips (rem, Schrift `text-sm`): je Zeichen, Rand je Chip, Symbol samt Abstand, Lücke dazwischen. */
const CHIP_REM_PER_CHAR = 0.42;
const CHIP_FRAME_REM = 2.25;
const CHIP_ICON_REM = 1.75;
const CHIP_GAP_REM = 0.5;
/** Ab 62 rem teilen sich Chips und Knöpfe die untere Zeile: Für die Chips bleibt die Kopfbreite − 2 × 2 rem Rand − 29 rem. */
const CHIP_ROW_RESERVED_REM = 33;

/** Sichtbarer Text eines Chips – kurz („7 Termine“) oder lang („7 Termine in 30 Tagen“). */
function chipText(figure: HeroFigure, long: boolean): string {
  const word = long ? `${figure.before}${figure.word}${figure.after}` : figure.word;
  return `${figure.value.toLocaleString("de-DE")} ${word}`;
}

/** Geschätzte Breite der Chip-Reihe in rem. */
export function heroFigureRowRem(
  figures: readonly HeroFigure[],
  { icon, long }: { icon: boolean; long: boolean },
): number {
  const chips = figures.reduce(
    (sum, figure) =>
      sum +
      CHIP_FRAME_REM +
      (icon ? CHIP_ICON_REM : 0) +
      CHIP_REM_PER_CHAR * [...chipText(figure, long)].length,
    0,
  );
  return chips + CHIP_GAP_REM * Math.max(0, figures.length - 1);
}

/**
 * Ab welcher Kopfbreite die Chips im Banner ihr Symbol (`icon`) und ihre lange Form (`long`, frühestens ab 70 rem) zeigen; `null`
 * = nie. Unter 62 rem haben die Chips die ganze Breite des Banners für sich (Symbol ja, lange Form nein). Ab 62 rem stehen die
 * Knöpfe in derselben Zeile – dann zeigt der Chip Symbol und lange Form erst ab der Stufe, ab der die ganze Reihe nach der
 * Schätzung hineinpasst; schmaler ohne Symbol bzw. kurz. So bleibt die Reihe auch bei vierstelligen Zahlen oder „… in deiner
 * Abteilung“ einzeilig und das Banner gleich hoch (vorher brach sie bei der Abteilungsleitung mit 1440 px in zwei Zeilen um).
 * Geschätzt mit der breitesten gemessenen Systemschrift (SF Pro Text am Mac; Arial und Tahoma, ähnlich Segoe UI, sind in dieser
 * Größe etwas schmaler), notfalls kürzt sich ein Chip mit „…“ – sein Name für Screenreader bleibt vollständig.
 */
export function heroFigureSteps(figures: readonly HeroFigure[]): {
  icon: HeroFigureStep | null;
  long: HeroFigureStep | null;
} {
  const from = (needed: number, earliest: number) =>
    HERO_FIGURE_STEPS.find((step) => step >= earliest && step - CHIP_ROW_RESERVED_REM >= needed) ??
    null;
  return {
    icon: from(heroFigureRowRem(figures, { icon: true, long: false }), 62),
    long: from(heroFigureRowRem(figures, { icon: true, long: true }), 70),
  };
}

// --- Farben: Nacht, Verlauf, Glas ---------------------------------------------------------------------------------------

/** Grundfarbe der Bühne: Nachtblau, fast schwarz – hell wie dunkel dieselbe. */
export const HERO_NIGHT = "#060a16";
const NIGHT_RGB = "6 10 22";

/**
 * Nachtverlauf von links über den Fotos: [Stelle in % der Bannerbreite, Deckkraft der Nacht]. Die Schrift links (Verein,
 * Begrüßung, Rolle · Datum) steht in einer Spalte, die höchstens bis `HERO_TEXT_END` reicht – bis dorthin ist die Nacht so
 * dicht, dass Weiß selbst über einer rein weißen Bildstelle mindestens 4,5 : 1 hat (nachgerechnet im Unit-Test).
 */
export const HERO_SCRIM: readonly (readonly [number, number])[] = [
  [0, 1],
  [30, 1],
  [40, 0.9],
  [50, 0.68],
  [62, 0.26],
  [76, 0],
];

/** Rechter Rand der Schriftspalte in % der Bannerbreite (Spalte `max-w-[46%]` plus Rand links, s. Komponente). */
export const HERO_TEXT_END = 48;

/** Deckkraft der Nacht an einer Stelle des Verlaufs (linear zwischen den Stützstellen, wie der Browser). */
export function heroScrimAt(percent: number): number {
  const stops = HERO_SCRIM;
  if (percent <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, a1] = stops[i]!;
    const [x0, a0] = stops[i - 1]!;
    if (percent <= x1) return a0 + ((a1 - a0) * (percent - x0)) / (x1 - x0);
  }
  return stops[stops.length - 1]![1];
}

/** Der Nachtverlauf als CSS (dazu unten ein leichter Schatten, auf dem Chips und Knöpfe stehen). */
export function heroScrimGradient(): string {
  const stops = HERO_SCRIM.map(([at, alpha]) => `rgb(${NIGHT_RGB} / ${alpha}) ${at}%`).join(", ");
  return `linear-gradient(90deg, ${stops}), linear-gradient(0deg, rgb(0 0 0 / 0.5), rgb(0 0 0 / 0) 50%)`;
}

/**
 * Glas auf der Bühne: Nacht mit dieser Deckkraft, leicht weichgezeichnet. `text` für alles mit Schrift (Chips, Namensschilder,
 * Vereinsschild am Handy, „Kalender“), `icon` für den runden Knopf „Anpassen“ (nur Symbol, verlangt 3 : 1), `hover` beim
 * Darüberfahren – dunkler, nie heller, damit die Schrift auch dann reicht.
 */
export const HERO_GLASS_ALPHA = { text: 0.62, icon: 0.55, hover: 0.78 } as const;

/** Deckkraft der Schrift auf der Bühne (Weiß): Überschrift voll, Rolle · Datum und Vereinsname etwas zurückgenommen. */
export const HERO_TEXT_ALPHA = { title: 1, meta: 0.82, club: 0.9, chip: 0.9 } as const;

/**
 * Die Knöpfe auf der Bühne sind hell wie dunkel dieselben: kräftiges Blau und kräftiges Grün mit weißer Schrift – die Werte von
 * `--primary`/`--success` aus `:root` in globals.css (im Dunkeln wären es helle Töne mit dunkler Schrift). Der Unit-Test prüft,
 * dass sie mit globals.css übereinstimmen.
 */
export const HERO_BUTTON_TOKENS = {
  "--primary": "oklch(0.47 0.17 258)",
  "--primary-foreground": "oklch(0.985 0 0)",
  "--success": "oklch(0.52 0.14 150)",
  "--success-foreground": "oklch(0.985 0 0)",
} as const;

/** CSS-Variablen für die Bühne (an ihrer Wurzel gesetzt, von den Klassen der Teile gelesen). */
export function heroCssVariables(): Record<string, string> {
  return {
    "--hero-night": HERO_NIGHT,
    "--hero-glass": `rgb(${NIGHT_RGB} / ${HERO_GLASS_ALPHA.text})`,
    "--hero-glass-icon": `rgb(${NIGHT_RGB} / ${HERO_GLASS_ALPHA.icon})`,
    "--hero-glass-hover": `rgb(${NIGHT_RGB} / ${HERO_GLASS_ALPHA.hover})`,
    "--hero-meta": `rgb(255 255 255 / ${HERO_TEXT_ALPHA.meta})`,
    "--hero-club": `rgb(255 255 255 / ${HERO_TEXT_ALPHA.club})`,
    "--hero-chip": `rgb(255 255 255 / ${HERO_TEXT_ALPHA.chip})`,
  };
}
