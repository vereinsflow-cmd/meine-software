import { describe, expect, it } from "vitest";
import {
  HERO_BANNER_HEIGHT,
  HERO_BUTTON_TOKENS,
  HERO_FIGURE_STEPS,
  HERO_GLASS_ALPHA,
  HERO_NIGHT,
  HERO_SCRIM,
  HERO_TEXT_ALPHA,
  HERO_TEXT_END,
  greetingFor,
  heroCssVariables,
  heroFigureRowRem,
  heroFigureSteps,
  heroFigures,
  heroScrimAt,
  heroScrimGradient,
  heroStage,
  heroStripShape,
  heroStripSizes,
  heroTitleEms,
  type HeroDepartment,
} from "@/modules/dashboard/hero";
import type { DashboardData } from "@/modules/dashboard/service";
import { contrastRgb, mix, oklchToRgb, tokens, type Rgb } from "./contrast-helpers";

/** Kopf des Dashboards („Vereins-Bühne“): Begrüßung, Auswahl der Fotos, Zahlen der Chips, Form der Streifen, Kontraste. */

/** Zeitpunkt zu einer Berliner Uhrzeit am 21.10.2026 (Sommerzeit, UTC+2). */
const berlin = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 21, hour - 2, minute));

describe("Begrüßung nach der Tageszeit (Berlin)", () => {
  it.each([
    [4, 59, "Guten Abend"],
    [5, 0, "Guten Morgen"],
    [10, 59, "Guten Morgen"],
    [11, 0, "Guten Tag"],
    [17, 59, "Guten Tag"],
    [18, 0, "Guten Abend"],
    [23, 30, "Guten Abend"],
    [0, 15, "Guten Abend"],
  ])("%i:%i Uhr → %s", (hour, minute, expected) => {
    expect(greetingFor(berlin(hour, minute))).toBe(expected);
  });

  it("rechnet in Berliner Zeit, nicht in der des Servers (Winterzeit, UTC+1)", () => {
    // 10:30 UTC am 15.01. = 11:30 in Berlin
    expect(greetingFor(new Date(Date.UTC(2026, 0, 15, 10, 30)))).toBe("Guten Tag");
  });
});

const dept = (name: string, memberCount = 0, color: string | null = null): HeroDepartment => ({
  id: `id-${name}`,
  name,
  color,
  memberCount,
});

describe("Welche Abteilungen auf die Bühne kommen", () => {
  it("Fotos zuerst (in der gelieferten Reihenfolge), dann Farbverläufe – höchstens vier", () => {
    const { strips } = heroStage([
      dept("Jugendarbeit", 30),
      dept("Badminton", 5),
      dept("Turnen", 40),
      dept("Fußball", 20),
      dept("Handball", 12),
      dept("Tischtennis", 8),
    ]);
    expect(strips.map((d) => d.name)).toEqual(["Badminton", "Fußball", "Handball", "Tischtennis"]);
  });

  it("am Handy das Foto der größten Abteilung mit Foto – auch wenn eine ohne Foto größer ist", () => {
    const { main } = heroStage([dept("Turnen", 99), dept("Dart", 3), dept("Fußball", 20)]);
    expect(main?.name).toBe("Fußball");
  });

  it("Gleichstand: die erste gewinnt (nach Namen, wie geliefert)", () => {
    const { main } = heroStage([dept("Dart", 7), dept("Fußball", 7)]);
    expect(main?.name).toBe("Dart");
  });

  it("das Handyfoto ist immer einer der Streifen – auch bei mehr als vier Fotos", () => {
    const { strips, main } = heroStage([
      dept("Badminton", 1),
      dept("Basketball", 1),
      dept("Dart", 1),
      dept("Fußball", 1),
      dept("Volleyball", 50),
    ]);
    expect(main?.name).toBe("Volleyball");
    expect(strips.map((d) => d.name)).toEqual(["Badminton", "Basketball", "Dart", "Volleyball"]);
  });

  it("ohne passendes Foto: Farbverläufe, am Handy die erste Abteilung", () => {
    const { strips, main } = heroStage([dept("Jugendarbeit", 3), dept("Turnen", 9)]);
    expect(strips.map((d) => d.name)).toEqual(["Jugendarbeit", "Turnen"]);
    expect(main?.name).toBe("Jugendarbeit");
  });

  it("keine Abteilungen (oder kein Recht): keine Streifen, kein Handyfoto – nur Nacht und Licht", () => {
    expect(heroStage([])).toEqual({ strips: [], main: null });
  });
});

describe("Form der Streifen", () => {
  it("der erste ohne Versatz, die übrigen schieben sich unter den linken Nachbarn (Fuge 6 px)", () => {
    expect(heroStripShape(0, 3).marginLeft).toBe("0px");
    expect(heroStripShape(1, 3).marginLeft).toBe("-50px");
  });

  it("schräg links und rechts; der letzte rechts gerade (Rand des Banners)", () => {
    expect(heroStripShape(0, 3).clipPath).toBe(
      "polygon(56px 0, 100% 0, calc(100% - 56px) 100%, 0 100%)",
    );
    expect(heroStripShape(2, 3).clipPath).toBe("polygon(56px 0, 100% 0, 100% 100%, 0 100%)");
  });

  it("Bildbreite fürs srcset: ab 688 px (Kopf 40 rem) ein Anteil der Reihe, schmaler die Breite des Banners", () => {
    // 688 px = 40 rem Kopf + 2 × 24 px Seitenrand: Erst dann stehen die Streifen nebeneinander. Bei 640–687 px (Handy quer)
    // steht das eine Foto über die ganze Breite – mit der alten Schwelle 640 px lud der Browser dort ein viel zu kleines Bild.
    expect(heroStripSizes(4)).toBe(
      "(min-width: 688px) calc((66vw + 42px) / 4), calc(100vw - 32px)",
    );
    expect(heroStripSizes(1)).toBe(
      "(min-width: 688px) calc((66vw - 108px) / 1), calc(100vw - 32px)",
    );
    expect(heroStripSizes(0)).toBe(heroStripSizes(1));
  });
});

describe("Feste Höhe: Das Banner ist so hoch wie sein Ladegerüst, egal was drinsteht", () => {
  it("Handy 17,125 rem, ab 40 rem Kopfbreite 17 rem – eine Klasse für Banner und Ladegerüst", () => {
    expect(HERO_BANNER_HEIGHT).toBe("h-[17.125rem] @[40rem]/buehne:h-[17rem]");
  });

  it("Begrüßung: geschätzte Breite in em (Zeichen × 0,55, Umlaute zählen einfach)", () => {
    expect(heroTitleEms("Guten Abend, Anna")).toBe(9.35);
    expect(heroTitleEms("Guten Tag, Jürgen")).toBe(9.35);
    expect(heroTitleEms("Guten Morgen, Sebastian")).toBe(12.65);
  });
});

/** Nur die Felder, die die Chips lesen. */
function blocks({
  members = null as { total: number; scope: "CLUB" | "DEPARTMENT" } | null,
  events = null as { countNext30Days: number } | null,
  shifts = null as { freeSpots: number } | null,
} = {}) {
  return { members, events, shifts } as unknown as Pick<
    DashboardData,
    "members" | "events" | "shifts"
  >;
}

/** Name des Links, wie ihn ein Screenreader liest (alle Teile, auch die nur breit sichtbaren). */
const names = (data: ReturnType<typeof blocks>) =>
  heroFigures(data).map((f) => `${f.value} ${f.before}${f.word}${f.after}`);

describe("Glas-Chips – nur, was die Rolle sehen darf", () => {
  it("alle drei Rechte: Mitglieder, Termine in 30 Tagen, offene Helferplätze – mit Ziel", () => {
    const data = blocks({
      members: { total: 24, scope: "CLUB" },
      events: { countNext30Days: 2 },
      shifts: { freeSpots: 0 },
    });
    expect(names(data)).toEqual([
      "24 Mitglieder",
      "2 Termine in 30 Tagen",
      "0 offene Helferplätze",
    ]);
    expect(heroFigures(data).map((f) => f.href)).toEqual([
      "/mitglieder",
      "/veranstaltungen",
      "/helferplanung",
    ]);
  });

  it("ohne Mitgliederzahlen (Helfer, Mitglied: `members` ist null) kein Mitglieder-Chip", () => {
    expect(names(blocks({ events: { countNext30Days: 7 }, shifts: { freeSpots: 16 } }))).toEqual([
      "7 Termine in 30 Tagen",
      "16 offene Helferplätze",
    ]);
  });

  it("ohne Termine bzw. ohne Schichten entfällt der jeweilige Chip; ohne alles: keine Chips", () => {
    expect(names(blocks({ shifts: { freeSpots: 3 } }))).toEqual(["3 offene Helferplätze"]);
    expect(names(blocks({ events: { countNext30Days: 3 } }))).toEqual(["3 Termine in 30 Tagen"]);
    expect(heroFigures(blocks())).toEqual([]);
  });

  it("Einzahl und eigene Abteilung", () => {
    expect(
      names(
        blocks({
          members: { total: 1, scope: "DEPARTMENT" },
          events: { countNext30Days: 1 },
          shifts: { freeSpots: 1 },
        }),
      ),
    ).toEqual(["1 Mitglied in deiner Abteilung", "1 Termin in 30 Tagen", "1 offener Helferplatz"]);
  });
});

/** Chips wie im Banner (`heroFigures`), aus den drei Zahlen. */
const chips = (
  members: number | null,
  events: number,
  spots: number,
  scope: "CLUB" | "DEPARTMENT" = "CLUB",
) =>
  heroFigures(
    blocks({
      members: members === null ? null : { total: members, scope },
      events: { countNext30Days: events },
      shifts: { freeSpots: spots },
    }),
  );

describe("Glas-Chips bleiben in EINER Reihe (Symbol und lange Form nur, wo sie passen)", () => {
  it("Demo-Verein (Vereinsadministrator): Symbole ab 62 rem, lange Form ab 70 rem – wie bisher", () => {
    expect(heroFigureSteps(chips(24, 7, 16))).toEqual({ icon: 62, long: 70 });
  });

  it("Abteilungsleitung: „… in deiner Abteilung“ erst ab 78 rem (vorher brach die Reihe bei 1440 px um)", () => {
    expect(heroFigureSteps(chips(6, 7, 16, "DEPARTMENT"))).toEqual({ icon: 62, long: 78 });
  });

  it("großer Verein (vierstellig): neben den Knöpfen erst ohne Symbol, Symbol ab 66 rem, lange Form ab 74 rem", () => {
    expect(heroFigureSteps(chips(1245, 12, 138))).toEqual({ icon: 66, long: 74 });
  });

  it("ohne Symbol passt selbst ein sehr großer Verein an der engsten Stelle (62 rem: 29 rem für die Chips)", () => {
    expect(
      heroFigureRowRem(chips(12345, 123, 1234), { icon: false, long: false }),
    ).toBeLessThanOrEqual(62 - 33);
  });

  it("die gewählte Stufe passt nach der Schätzung immer; lange Form nie vor dem Symbol", () => {
    for (const figures of [
      chips(24, 7, 16),
      chips(1245, 12, 138),
      chips(null, 3, 0),
      chips(99999, 999, 9999),
    ]) {
      const { icon, long } = heroFigureSteps(figures);
      if (icon !== null)
        expect(icon - 33).toBeGreaterThanOrEqual(
          heroFigureRowRem(figures, { icon: true, long: false }),
        );
      if (long !== null) {
        expect(long - 33).toBeGreaterThanOrEqual(
          heroFigureRowRem(figures, { icon: true, long: true }),
        );
        expect(long).toBeGreaterThanOrEqual(Math.max(70, icon ?? Infinity));
      }
      for (const step of [icon, long]) if (step !== null) expect(HERO_FIGURE_STEPS).toContain(step);
    }
  });

  it("keine Chips: nichts zu tun", () => {
    expect(heroFigureSteps([])).toEqual({ icon: 62, long: 70 });
  });
});

const AA = 4.5;
const WHITE: Rgb = [255, 255, 255];
const NIGHT: Rgb = [1, 3, 5].map((i) => parseInt(HERO_NIGHT.slice(i, i + 2), 16)) as Rgb;
/** Nacht mit Deckkraft `alpha` über der ungünstigsten Bildstelle: rein weiß. */
const overWhite = (alpha: number) => mix(NIGHT, alpha, WHITE);
const text = (alpha: number, behind: Rgb) => mix(WHITE, alpha, behind);

describe("Weiße Schrift auf der Bühne (ungünstigster Fall: rein weiße Stelle im Foto)", () => {
  it("der Nachtverlauf wird nach rechts nur heller, links ist er voll", () => {
    expect(heroScrimAt(0)).toBe(1);
    expect(heroScrimAt(30)).toBe(1);
    const alphas = HERO_SCRIM.map(([, alpha]) => alpha);
    expect([...alphas].sort((a, b) => b - a)).toEqual(alphas);
    expect(heroScrimAt(100)).toBe(0);
    expect(heroScrimGradient()).toContain("rgb(6 10 22 / 0.68) 50%");
  });

  it("Schriftspalte bis zu ihrem rechten Rand: Begrüßung (Weiß) mindestens 4,5 : 1", () => {
    const behind = overWhite(heroScrimAt(HERO_TEXT_END));
    expect(contrastRgb(text(HERO_TEXT_ALPHA.title, behind), behind)).toBeGreaterThanOrEqual(AA);
  });

  it("Rolle · Datum (Weiß zu 82 %) und Vereinsname (90 %) am rechten Rand der Spalte: mindestens 4,5 : 1", () => {
    const behind = overWhite(heroScrimAt(HERO_TEXT_END));
    expect(contrastRgb(text(HERO_TEXT_ALPHA.meta, behind), behind)).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(text(HERO_TEXT_ALPHA.club, behind), behind)).toBeGreaterThanOrEqual(AA);
  });

  it("Glas-Chips, Namensschilder, Vereinsschild am Handy und „Kalender“ – auch direkt auf dem Foto", () => {
    for (const alpha of [HERO_GLASS_ALPHA.text, HERO_GLASS_ALPHA.hover]) {
      const glass = overWhite(alpha);
      expect(contrastRgb(text(HERO_TEXT_ALPHA.chip, glass), glass)).toBeGreaterThanOrEqual(AA);
      expect(contrastRgb(text(HERO_TEXT_ALPHA.club, glass), glass)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("Symbol „Anpassen“ (Weiß) auf seinem Glas: mindestens 3 : 1 (WCAG 1.4.11)", () => {
    expect(contrastRgb(WHITE, overWhite(HERO_GLASS_ALPHA.icon))).toBeGreaterThanOrEqual(3);
  });

  it("die CSS-Variablen tragen genau diese Werte", () => {
    expect(heroCssVariables()).toMatchObject({
      "--hero-night": HERO_NIGHT,
      "--hero-glass": `rgb(6 10 22 / ${HERO_GLASS_ALPHA.text})`,
      "--hero-glass-icon": `rgb(6 10 22 / ${HERO_GLASS_ALPHA.icon})`,
      "--hero-meta": `rgb(255 255 255 / ${HERO_TEXT_ALPHA.meta})`,
    });
  });
});

describe("Knöpfe auf der Bühne: hell wie dunkel kräftiges Blau und Grün", () => {
  const light = tokens(":root");

  it("dieselben Werte wie --primary/--success der hellen Darstellung (globals.css)", () => {
    for (const [name, value] of Object.entries(HERO_BUTTON_TOKENS)) {
      expect(value, name).toBe(light[name]);
    }
  });

  it("weiße Schrift auf Blau und Grün – auch beim Darüberfahren (14 % dunkler): mindestens 4,5 : 1", () => {
    const BLACK: Rgb = [0, 0, 0];
    for (const [bg, fg] of [
      ["--primary", "--primary-foreground"],
      ["--success", "--success-foreground"],
    ] as const) {
      const base = oklchToRgb(HERO_BUTTON_TOKENS[bg]);
      const label = oklchToRgb(HERO_BUTTON_TOKENS[fg]);
      expect(contrastRgb(label, base), bg).toBeGreaterThanOrEqual(AA);
      expect(contrastRgb(label, mix(BLACK, 0.14, base)), `${bg} (hover)`).toBeGreaterThanOrEqual(
        AA,
      );
    }
  });
});
