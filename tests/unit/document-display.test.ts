import { describe, expect, it } from "vitest";
import { ACCENT } from "@/components/shared/accent";
import {
  categoryAccent,
  categoryAccents,
  fileTypeLabel,
  invoiceState,
  splitFileName,
} from "@/modules/documents/display";
import type { DocumentInvoice } from "@/modules/documents/service";
import { contrastRgb, mix, oklchToRgb, tailwindColor, tokens } from "./contrast-helpers";

/**
 * Dokumentenliste „Ruhige Liste“ (20.10.2026): Name ohne Endung, Dateityp-Kachel in der Farbe der Kategorie, Schild zum
 * Zahlungsstand – und die Kontraste der neuen Farben, hell und dunkel (axe misst Text auf getönten Flächen nicht immer).
 */
const invoice = (over: Partial<DocumentInvoice>): DocumentInvoice => ({
  id: "r1",
  status: "OPEN",
  amountCents: 34_950,
  invoiceDate: new Date("2026-09-15T00:00:00Z"),
  dueDate: null,
  dueInDays: null,
  overdue: false,
  paidAt: null,
  ...over,
});

describe("Name und Dateityp", () => {
  it("trennt die Endung ab – auch bei Punkten im Namen; ohne Endung bleibt der Name ganz", () => {
    expect(splitFileName("Rechnung vom 15.09.2026.pdf")).toEqual({
      base: "Rechnung vom 15.09.2026",
      ext: "pdf",
    });
    expect(splitFileName("Satzung 2026.DOCX")).toEqual({ base: "Satzung 2026", ext: "docx" });
    expect(splitFileName("Notizen")).toEqual({ base: "Notizen", ext: "" });
    expect(splitFileName(".pdf")).toEqual({ base: ".pdf", ext: "" }); // nichts als die Endung: lieber alles zeigen
  });

  it("Kachel: Endung in Großbuchstaben, sonst der Dateityp, notfalls „DATEI“", () => {
    expect(fileTypeLabel("Satzung.pdf", "application/pdf")).toBe("PDF");
    expect(fileTypeLabel("Liste.xlsx", "application/vnd.ms-excel")).toBe("XLSX");
    expect(fileTypeLabel("Foto.jpeg", "image/jpeg")).toBe("JPEG");
    expect(fileTypeLabel("Notizen", "text/plain")).toBe("DATEI"); // „plain“ ist zu lang für die Kachel
    expect(fileTypeLabel("Bild", "image/png")).toBe("PNG");
    expect(
      fileTypeLabel("Folien", "application/vnd.openxmlformats-officedocument.presentationml"),
    ).toBe("DATEI");
  });
});

describe("Farbe der Kategorie", () => {
  // Wie `listCategories` sie liefert: alphabetisch.
  const categories = [
    "Finanzen",
    "Formulare",
    "Protokolle",
    "Rechnungen",
    "Satzung",
    "Veranstaltungen",
    "Vorlagen",
  ];

  it("die ersten sechs Kategorien bekommen sechs verschiedene Farben, danach beginnt die Reihe von vorn", () => {
    const accents = categoryAccents(categories);
    const firstSix = categories.slice(0, 6).map((name) => categoryAccent(name, accents));
    expect(new Set(firstSix).size).toBe(6);
    expect(firstSix).not.toContain("slate");
    expect(categoryAccent("Vorlagen", accents)).toBe(categoryAccent("Finanzen", accents));
    // Rosa (nah am Rot von „überfällig“) erst als sechste Farbe.
    expect(firstSix.indexOf("rose")).toBe(5);
  });

  it("die sechs Farben sehen auch verschieden aus: Farbton paarweise mindestens 30° auseinander, im Alphabet benachbarte mindestens 60°", () => {
    // Gemessen an Punkt (Stufe 500) und Kachel (Stufe 100). Grün und Türkis lagen nur rund 20° auseinander und waren auf den
    // Fotos kaum zu unterscheiden – deshalb Cyan statt Türkis.
    const palette = [...new Set([...categoryAccents(categories).values()])];
    expect(palette).toHaveLength(6);
    const hue = (color: string) => Number(tailwindColor(color).match(/ ([\d.]+)\)$/)![1]);
    const apart = (first: number, second: number) => {
      const difference = Math.abs(first - second) % 360;
      return Math.min(difference, 360 - difference);
    };
    for (const step of [500, 100]) {
      const hues = palette.map((accent) => hue(`${accent}-${step}`));
      hues.forEach((own, index) => {
        for (const other of hues.slice(index + 1))
          expect(apart(own, other), `${palette[index]}-${step}`).toBeGreaterThanOrEqual(30);
        const next = hues[(index + 1) % hues.length]!;
        expect(
          apart(own, next),
          `${palette[index]}-${step} neben dem nächsten`,
        ).toBeGreaterThanOrEqual(60);
      });
    }
  });

  it("ohne Kategorie grau; eine unbekannte (nur über die Adresse gewählte) bekommt eine feste Farbe aus dem Namen", () => {
    const accents = categoryAccents(categories);
    expect(categoryAccent(null, accents)).toBe("slate");
    expect(categoryAccent("Gibt es nicht", accents)).toBe(categoryAccent("Gibt es nicht"));
    expect(categoryAccent("Gibt es nicht")).not.toBe("slate");
  });
});

describe("Schild zum Zahlungsstand", () => {
  it("überfällig zuerst genannt und rot, bald fällig und ohne Fälligkeit bernstein, bezahlt grün", () => {
    expect(invoiceState(invoice({ dueInDays: -9, overdue: true }))).toEqual({
      amount: "349,50\u00a0€", // geschütztes Leerzeichen vor „€“
      tone: "danger",
      text: "überfällig seit 9 Tagen",
    });
    expect(invoiceState(invoice({ dueInDays: -1, overdue: true })).text).toBe(
      "überfällig seit gestern",
    );
    expect(invoiceState(invoice({ dueInDays: 0 }))).toMatchObject({
      tone: "warning",
      text: "heute fällig",
    });
    expect(invoiceState(invoice({ dueInDays: 1 })).text).toBe("morgen fällig");
    expect(invoiceState(invoice({ dueInDays: 14 })).text).toBe("fällig in 14 Tagen");
    expect(invoiceState(invoice({}))).toMatchObject({ tone: "warning", text: "offen" });
    expect(
      invoiceState(
        invoice({ status: "PAID", amountCents: null, paidAt: new Date("2026-08-18T16:00:00Z") }),
      ),
    ).toEqual({ amount: null, tone: "success", text: "bezahlt am 18.08.2026" });
    expect(invoiceState(invoice({ status: "PAID" })).text).toBe("bezahlt");
  });
});

const AA = 4.5;
const tw = (name: string) => oklchToRgb(tailwindColor(name));
const light = tokens(":root");
const dark = tokens(".dark");
const token = (set: Record<string, string>, name: string) => oklchToRgb(set[name]!);

/** Farbname aus einer Klasse wie „text-teal-700“ bzw. „dark:text-teal-300“. */
function shade(classes: string, prefix: string): string {
  const match = classes.match(new RegExp(`(?:^|\\s)${prefix}-([a-z]+-\\d+)(?=[\\s/]|$)`));
  if (!match) throw new Error(`${prefix} fehlt in „${classes}“`);
  return match[1]!;
}

describe("Kontraste der Dokumentenliste (mindestens 4,5 : 1)", () => {
  it.each(["blue", "violet", "emerald", "amber", "rose", "cyan", "slate"] as const)(
    "Dateityp-Kachel „%s“: Schrift auf der Tönung, hell und dunkel",
    (accent) => {
      const tile = ACCENT[accent].tile;
      expect(contrastRgb(tw(shade(tile, "text")), tw(shade(tile, "bg")))).toBeGreaterThanOrEqual(
        AA,
      );
      // Dunkel: Stufe 400 zu 15 % über der Karte.
      const darkTile = mix(tw(`${accent}-400`), 0.15, token(dark, "--card"));
      expect(contrastRgb(tw(shade(tile, "dark:text")), darkTile)).toBeGreaterThanOrEqual(AA);
    },
  );

  it("„Bezahlt“ zartgrün: hell Emerald 800 auf 50, dunkel Emerald 300 auf 10 % Emerald 400 über der Karte", () => {
    expect(contrastRgb(tw("emerald-800"), tw("emerald-50"))).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(tw("emerald-800"), tw("emerald-100"))).toBeGreaterThanOrEqual(AA); // überfahren
    const darkButton = mix(tw("emerald-400"), 0.1, token(dark, "--card"));
    expect(contrastRgb(tw("emerald-300"), darkButton)).toBeGreaterThanOrEqual(AA);
  });

  it.each([
    ["überfällig", "red"],
    ["offen", "amber"],
    ["bezahlt", "emerald"],
  ] as const)("Schild „%s“ (kleine Schrift): hell 900 auf 100, dunkel 200 auf 950", (_, hue) => {
    expect(contrastRgb(tw(`${hue}-900`), tw(`${hue}-100`))).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(tw(`${hue}-200`), tw(`${hue}-950`))).toBeGreaterThanOrEqual(AA);
  });

  it("graue Zeile unter dem Namen auch auf der überfahrenen Zeile (--muted)", () => {
    for (const set of [light, dark]) {
      expect(
        contrastRgb(token(set, "--muted-foreground"), token(set, "--card")),
      ).toBeGreaterThanOrEqual(AA);
      expect(
        contrastRgb(token(set, "--muted-foreground"), token(set, "--muted")),
      ).toBeGreaterThanOrEqual(AA);
    }
  });

  it("gewählter Filterknopf: Anzahl (Grundfarbe zu 75 %) auf der dunklen Füllung, hell und dunkel", () => {
    for (const set of [light, dark]) {
      const fill = token(set, "--foreground");
      const count = mix(token(set, "--background"), 0.75, fill);
      expect(contrastRgb(count, fill)).toBeGreaterThanOrEqual(AA);
    }
  });
});
