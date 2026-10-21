import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARD_SCRIM,
  DEPARTMENT_IMAGE_WIDTHS,
  DEPARTMENT_SPORTS,
  departmentFallbackColors,
  departmentImage,
  departmentSport,
  normalizeDepartmentName,
} from "@/modules/departments/department-image";
import { DEPARTMENT_COLORS } from "@/modules/departments/schemas";
import { contrastRgb, mix, type Rgb } from "./contrast-helpers";

/** Bild der Abteilungskarte aus dem Namen (`department-image.ts`) und Lesbarkeit der weißen Schrift darauf. */

describe("Zuordnung Name → Sportart", () => {
  it.each([
    ["Fußball", "fussball"],
    ["Handball", "handball"],
    ["Badminton", "badminton"],
    ["Tennis", "tennis"],
    ["Tischtennis", "tischtennis"],
    ["Dart", "dart"],
    ["Volleyball", "volleyball"],
    ["Basketball", "basketball"],
  ] as const)("„%s“ → %s", (name, sport) => {
    expect(departmentSport(name)).toBe(sport);
  });

  it.each([
    ["Fußball Jugend", "fussball"],
    ["Fussball", "fussball"],
    ["FUSSBALL", "fussball"],
    ["Damenfußball", "fussball"],
    ["Fusball", "fussball"],
    ["Abteilung Tennis", "tennis"],
    ["Tennis-Club", "tennis"],
    ["Beach-Volleyball", "volleyball"],
    ["Beachvolleyball", "volleyball"],
    ["Voleyball", "volleyball"],
    ["Darts", "dart"],
    ["E-Dart", "dart"],
    ["Steeldart", "dart"],
    ["Dartsport", "dart"],
    ["Basketball-Damen", "basketball"],
    ["Basket Ball", "basketball"],
    ["Badmintion", "badminton"],
    ["Badmiton", "badminton"],
    ["Batminton", "badminton"],
    ["Badmington", "badminton"],
    ["Federball", "badminton"],
    ["Minihandball", "handball"],
    ["Fußballtennis", "fussball"], // mit dem Fußball gespielt
    ["Tischtennis Senioren", "tischtennis"],
    ["Tisch-Tennis", "tischtennis"],
    ["  tischtennis  ", "tischtennis"],
  ] as const)("Variante „%s“ → %s", (name, sport) => {
    expect(departmentSport(name)).toBe(sport);
  });

  it("Tischtennis ist nicht Tennis – auch zusammen mit anderen Wörtern", () => {
    for (const name of ["Tischtennis", "TT Tischtennis", "Tisch-Tennis", "Abteilung Tischtennis"]) {
      expect(departmentSport(name)).toBe("tischtennis");
    }
    expect(departmentSport("Tennis")).toBe("tennis");
  });

  it.each([
    "Jugendarbeit",
    "Turnen",
    "Ballsport",
    "Leichtathletik",
    "Tischfußball", // Kicker – das Fußballfoto passte nicht
    "Standart-Tanz", // „dart“ steckt mitten im Wort
    "Vorstand",
    "",
  ])("kein Treffer für „%s“ → Farbverlauf", (name) => {
    expect(departmentSport(name)).toBeNull();
    expect(departmentImage(name)).toBeNull();
  });

  it("normalisiert Groß-/Kleinschreibung, ß, Umlaute und Trennzeichen", () => {
    expect(normalizeDepartmentName("Fußball-Jugend (Ü40)")).toBe("fussball jugend ue40");
    expect(normalizeDepartmentName("Pétanque & Boule")).toBe("petanque boule");
  });
});

describe("Bilddateien", () => {
  it("jede Sportart hat ihr Foto in allen Breiten unter public/bilder/abteilungen", () => {
    for (const sport of DEPARTMENT_SPORTS) {
      for (const width of DEPARTMENT_IMAGE_WIDTHS) {
        const file = path.resolve(
          __dirname,
          `../../public/bilder/abteilungen/${sport}-${width}.webp`,
        );
        expect(existsSync(file), file).toBe(true);
      }
    }
  });

  it("Basketball: srcset mit allen Breiten, mittlere Größe als src, Fokuspunkt", () => {
    expect(departmentImage("Basketball-Damen")).toEqual({
      sport: "basketball",
      src: "/bilder/abteilungen/basketball-800.webp",
      srcSet:
        "/bilder/abteilungen/basketball-480.webp 480w, /bilder/abteilungen/basketball-800.webp 800w, /bilder/abteilungen/basketball-1200.webp 1200w",
      position: "50% 48%",
    });
  });
});

const AA = 4.5;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const hex = (value: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
/** Kleinste Deckkraft von Schwarz in den Klassen (`from-black/85 to-black/60` → 0,6). */
const minBlack = (classes: string) =>
  Math.min(...[...classes.matchAll(/black\/(\d+)/g)].map(([, value]) => Number(value) / 100));

describe("Weiße Schrift auf dem Foto", () => {
  // Ungünstigster Fall: eine rein weiße Stelle im Foto, darüber die schwächste Stelle der Abdeckung.
  const scrim = minBlack(CARD_SCRIM.text);
  const worst = mix(BLACK, scrim, WHITE);

  it("hinter der Schrift überall mindestens 60 % Schwarz", () => {
    expect(scrim).toBeGreaterThanOrEqual(0.6);
  });

  it("Name und „Leitung“ (Weiß) über einer weißen Bildstelle: mindestens 4,5 : 1", () => {
    expect(contrastRgb(WHITE, worst)).toBeGreaterThanOrEqual(AA);
  });

  it("Beschreibung, Mitglieder, „Leitung:“ (Weiß zu 90 %) über einer weißen Bildstelle: mindestens 4,5 : 1", () => {
    expect(contrastRgb(mix(WHITE, 0.9, worst), worst)).toBeGreaterThanOrEqual(AA);
  });

  it("Schild „Deaktiviert“ direkt auf einer weißen Bildstelle: mindestens 4,5 : 1", () => {
    const badge = mix(BLACK, minBlack(CARD_SCRIM.badge), WHITE);
    expect(contrastRgb(WHITE, badge)).toBeGreaterThanOrEqual(AA);
  });
});

describe("Farbverlauf ohne Foto: weiße Schrift auch bei hellen Abteilungsfarben", () => {
  const light = [
    ["Gelb", "#facc15"],
    ["Reingelb", "#ffff00"],
    ["Hellgelb", "#fef08a"],
    ["Weiß", "#ffffff"],
    ["Limette", "#a3e635"],
    ["Hellcyan", "#67e8f9"],
    ["Rosa", "#fbcfe8"],
    ["Hellorange", "#fdba74"],
  ] as const;
  const palette = DEPARTMENT_COLORS.map((c) => [c.label, c.value] as const);
  const cases = [...light, ...palette, ["ohne Farbe", null] as const];

  it.each(cases)("%s (%s): hellste und dunkelste Stelle mindestens 4,5 : 1", (_, color) => {
    const { from, to } = departmentFallbackColors(color);
    expect(contrastRgb(WHITE, hex(from))).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(WHITE, hex(to))).toBeGreaterThanOrEqual(AA);
  });

  it.each(cases)(
    "%s (%s): Weiß zu 90 % auf Verlauf und Abdeckung mindestens 4,5 : 1",
    (_, color) => {
      const { from } = departmentFallbackColors(color);
      const behind = mix(BLACK, minBlack(CARD_SCRIM.text), hex(from));
      expect(contrastRgb(mix(WHITE, 0.9, behind), behind)).toBeGreaterThanOrEqual(AA);
    },
  );

  it("bleibt in der Abteilungsfarbe: Gelb wird dunkles Gelb, nicht Grau", () => {
    const [r, g, b] = hex(departmentFallbackColors("#facc15").from);
    expect(r).toBeGreaterThan(b + 60);
    expect(g).toBeGreaterThan(b + 40);
  });

  it("dunkle Palettenfarben bleiben unverändert (Blau, Violett)", () => {
    expect(departmentFallbackColors("#2563eb").from).toBe("#2563eb");
    expect(departmentFallbackColors("#7c3aed").from).toBe("#7c3aed");
  });

  it("ungültige Farbe → Grau der Palette", () => {
    expect(departmentFallbackColors("rot")).toEqual(departmentFallbackColors(null));
  });
});
