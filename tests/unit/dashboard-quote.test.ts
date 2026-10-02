import { describe, expect, it } from "vitest";
import {
  eventsQuote,
  filledAt,
  formatPercentSigned,
  formatSigned,
  hoursQuote,
  membersQuote,
  quoteChange,
  quoteStats,
  samplesBack,
  staffingQuote,
  type QuotePoint,
} from "@/modules/dashboard/quote";

const NOW = new Date("2026-10-02T10:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const pts = (...values: number[]): QuotePoint[] =>
  values.map((value, index) => ({ label: `P${index}`, fullLabel: `Punkt ${index}`, value }));

describe("Kennzahlen wie eine Aktie: Veränderung und Kennwerte", () => {
  it("Veränderung vom ersten zum letzten Punkt, bei Beständen mit Prozent", () => {
    expect(quoteChange(pts(19, 21, 24), "level")).toEqual({
      diff: 5,
      percent: (5 / 19) * 100,
      direction: "up",
    });
    expect(quoteChange(pts(25, 23), "level").direction).toBe("down");
    expect(quoteChange(pts(24, 24), "level")).toEqual({ diff: 0, percent: 0, direction: "flat" });
    // Startwert 0 und Summen: kein Prozent (von 0 aus ist jeder Zuwachs „unendlich“)
    expect(quoteChange(pts(0, 3), "level").percent).toBeNull();
    expect(quoteChange(pts(0, 9), "total").percent).toBeNull();
    // Gerundet auf die Nachkommastellen der Einheit – Rechenreste ergeben kein „+0,0“
    expect(quoteChange(pts(0.1 + 0.2, 0.3), "level", 1).direction).toBe("flat");
  });

  it("Hoch/Tief/Ø: bei Beständen über die Punkte, bei Summen über den Zuwachs je Abschnitt (ohne Startpunkt)", () => {
    expect(quoteStats(pts(19, 24, 22), "level")).toEqual({ high: 24, low: 19, average: 65 / 3 });
    // Summe 0 → 2 → 2 → 9: Zuwächse 2, 0, 7
    expect(quoteStats(pts(0, 2, 2, 9), "total")).toEqual({ high: 7, low: 0, average: 3 });
  });

  it("Zahlen mit Vorzeichen und Prozent im deutschen Format", () => {
    expect(formatSigned(5)).toBe("+5");
    expect(formatSigned(-2)).toBe("−2");
    expect(formatSigned(0)).toBe("±0");
    expect(formatSigned(4.5, 1)).toBe("+4,5");
    expect(formatPercentSigned(26.315)).toBe("+26,3 %");
    expect(formatPercentSigned(-8)).toBe("−8,0 %");
    expect(formatPercentSigned(0.01)).toBe("±0,0 %");
  });
});

describe("Kursverläufe aus den Vereinsdaten", () => {
  it("Stichtage ab heute zurück: gleicher Kalendertag, am Monatsende der letzte Tag des kürzeren Monats", () => {
    expect(samplesBack(NOW, "Woche", 2).map((date) => date.toISOString())).toEqual([
      "2026-09-18T10:00:00.000Z",
      "2026-09-25T10:00:00.000Z",
      "2026-10-02T10:00:00.000Z",
    ]);
    expect(samplesBack(new Date("2026-03-31T10:00:00Z"), "Monat", 1)[0]!.toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(samplesBack(NOW, "Jahr", 5)[0]!.toISOString()).toBe("2021-10-02T10:00:00.000Z");
  });

  it("Mitglieder: gezählt wie die Zahl auf der Karte – ab Eintritt (oder Anlegen) bis Archiv bzw. Papierkorb", () => {
    const old = daysAgo(500);
    const quote = membersQuote(
      [
        { joinedAt: daysAgo(400), createdAt: old, archivedAt: null, deletedAt: null }, // lange dabei
        { joinedAt: daysAgo(40), createdAt: daysAgo(40), archivedAt: null, deletedAt: null }, // im August eingetreten
        { joinedAt: daysAgo(300), createdAt: old, archivedAt: daysAgo(10), deletedAt: null }, // vor zehn Tagen archiviert
        { joinedAt: null, createdAt: daysAgo(70), archivedAt: null, deletedAt: null }, // ohne Eintrittsdatum: ab dem Anlegen
        { joinedAt: daysAgo(-30), createdAt: daysAgo(5), archivedAt: null, deletedAt: null }, // Eintritt steht bevor
        { joinedAt: daysAgo(200), createdAt: old, archivedAt: null, deletedAt: daysAgo(100) }, // im Papierkorb
      ],
      NOW,
    );
    const year = quote.periods.find((period) => period.id === "12M")!;
    expect(year.points).toHaveLength(13); // vom 02.10.2025 bis heute, ein Punkt je Monat
    expect(year.points[0]).toMatchObject({ label: "Okt 25", fullLabel: "02.10.2025", value: 1 });
    // Jetzt: alle außer Archiv und Papierkorb – wie die Karte (auch der bevorstehende Eintritt zählt schon, wie dort)
    expect(year.points.at(-1)).toMatchObject({ fullLabel: "Heute", value: 4 });
    const up = year.volume!.up.reduce((a, b) => a + b, 0);
    const down = year.volume!.down.reduce((a, b) => a + b, 0);
    expect([up, down]).toEqual([5, 2]); // Zugänge: vier Eintritte und ein Anlegen; Abgänge: Archiv und Papierkorb
    // Zu- minus Abgänge ist genau die Veränderung im Zeitraum
    expect(up - down).toBe(quoteChange(year.points, "level").diff);
    expect(year.volume!.up[0]).toBe(0);
    expect(quote.periods.map((period) => period.id)).toEqual(["6M", "12M", "5J"]);
    expect(quote.periods.find((period) => period.id === "6M")!.points).toHaveLength(7);
    expect(quote.periods.find((period) => period.id === "5J")!.points.at(-1)!.value).toBe(4);
  });

  it("Termine: zu jedem Stichtag die Termine der folgenden 30 Tage; der letzte Punkt ist die Zahl der Karte", () => {
    const quote = eventsQuote([daysAgo(20), daysAgo(-3), daysAgo(-12)], NOW, 2);
    const weeks = quote.periods.find((period) => period.id === "12W")!.points;
    expect(weeks).toHaveLength(13);
    expect(weeks.at(-1)).toMatchObject({ value: 2, fullLabel: "Heute" });
    // Stichtage nach Berliner Datum (nicht einen Tag zu früh): 12 Wochen vor dem 02.10.2026
    expect(weeks[0]).toMatchObject({ label: "KW 28", fullLabel: "10.07.2026" });
    // Ein Termin genau 30 Tage nach dem Stichtag zählt nicht mehr mit, einer am Stichtag schon
    const edge = eventsQuote([weeks.length ? daysAgo(84) : NOW, daysAgo(54)], NOW, 0);
    expect(edge.periods[0]!.points[0]!.value).toBe(1);
    // Vor drei Wochen lag der Termin von vor 20 Tagen in den folgenden 30 Tagen
    expect(weeks.at(-4)!.value).toBeGreaterThanOrEqual(1);
    // Vor elf Wochen war noch keiner davon in Sicht
    expect(weeks[0]!.value).toBe(0);
  });

  it("Helferstunden: im Zeitraum aufsummiert ab 0; das laufende Jahr endet bei der Zahl der Karte", () => {
    const rows = [
      { at: daysAgo(30), minutes: 180 },
      { at: daysAgo(3), minutes: 60 },
      { at: new Date("2025-06-01T10:00:00Z"), minutes: 600 },
    ];
    const quote = hoursQuote(rows, NOW, 2026, 240);
    const year = quote.periods.find((period) => period.id === "Y0")!;
    expect(year.label).toBe("2026");
    expect(year.since).toBe("seit 01.01.2026");
    expect(year.points[0]!.value).toBe(0);
    expect(year.points).toHaveLength(1 + 10); // Start + Januar bis Oktober
    expect(year.points[0]).toMatchObject({ label: "Start", fullLabel: "01.01.2026" });
    expect(year.points.at(-1)!.value).toBe(4); // 240 Minuten
    const years = quote.periods.find((period) => period.id === "5J")!;
    expect(years.points.at(-1)!.value).toBe(14); // 600 + 180 + 60 Minuten über fünf Jahre
    expect(quote.showPercent).toBe(false);
    // Anfang Januar: Start und der laufende Monat
    const january = hoursQuote(rows, new Date("2027-01-03T10:00:00Z"), 2027, 60);
    expect(
      january.periods.find((period) => period.id === "Y0")!.points.map((p) => p.value),
    ).toEqual([0, 1]);
  });

  it("Besetzung: Eintragungen zählen ab ihrem Zeitpunkt bis zur Absage, je Schicht höchstens wie benötigt", () => {
    const shifts = [
      {
        requiredCount: 2,
        assignments: [
          { assignedAt: daysAgo(30), cancelledAt: null, status: "CONFIRMED" as const },
          { assignedAt: daysAgo(20), cancelledAt: daysAgo(5), status: "CANCELLED" as const },
          { assignedAt: daysAgo(10), cancelledAt: null, status: "CONFIRMED" as const },
          { assignedAt: daysAgo(8), cancelledAt: null, status: "CONFIRMED" as const },
          { assignedAt: daysAgo(40), cancelledAt: null, status: "CANCELLED" as const }, // Absage ohne Zeitpunkt
        ],
      },
    ];
    expect(filledAt(shifts, daysAgo(35))).toBe(0);
    expect(filledAt(shifts, daysAgo(25))).toBe(1);
    expect(filledAt(shifts, daysAgo(15))).toBe(2);
    expect(filledAt(shifts, daysAgo(7))).toBe(2); // drei gültige, aber nur zwei benötigt
    const quote = staffingQuote(shifts, NOW, 2);
    expect(quote.periods.map((period) => period.id)).toEqual(["6W", "12W"]);
    expect(quote.periods[0]!.points).toHaveLength(7);
    expect(quote.periods[0]!.points.at(-1)!.value).toBe(2);
    // Auf der Karte steht die Zahl der FREIEN Plätze – die Veränderung heißt deshalb ausdrücklich „besetzt“
    expect(quote.unit.plural).toBe("besetzt");
  });
});
