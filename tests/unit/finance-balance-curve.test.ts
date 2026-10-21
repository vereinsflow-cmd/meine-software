import { describe, expect, it } from "vitest";
import {
  CURVE_MIN_DAYS,
  curveDay,
  curveExtremes,
  curveStart,
  curveTicks,
  dailyBalances,
  dayHeading,
  dayMonthLabel,
  describeCurve,
  monthEndRows,
  monthStartChange,
  splitEuro,
  weekdayLabel,
  type BalanceCurve,
} from "@/modules/finance/balance-curve";

/** Kalendertag um Mitternacht UTC (wie `bookingDate` und `todayCalendarDate()`). */
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const curve = (from: string, values: number[]): BalanceCurve => ({ from: d(from), values });
/** Beträge mit geschütztem Leerzeichen vor „€“ (Intl) – für den Vergleich als gewöhnliches Leerzeichen. */
const plain = (text: string) => text.replace(/\s/g, " ");

/** Kontoverlauf der Finanz-Übersicht: Beginn, Stand je Tag, Hoch/Tief, Veränderung, Achse, Tabelle, Satz für Screenreader. */
describe("Beginn des Verlaufs", () => {
  it("im Herbst ab 1. Januar – oder ab Beginn des Kassenbuchs, wenn es später begann", () => {
    expect(curveStart(d("2026-10-21"), d("2025-01-01"))).toEqual(d("2026-01-01"));
    expect(curveStart(d("2026-10-21"), d("2026-07-01"))).toEqual(d("2026-07-01"));
  });

  it("im Januar mindestens 90 Tage zurück (ins Vorjahr), aber nie vor dem Kassenbuch", () => {
    const start = curveStart(d("2027-01-05"), d("2025-01-01"));
    expect(start).toEqual(d("2026-10-08"));
    expect((d("2027-01-05").getTime() - start.getTime()) / 86_400_000 + 1).toBe(CURVE_MIN_DAYS);
    expect(curveStart(d("2027-01-05"), d("2026-12-01"))).toEqual(d("2026-12-01"));
  });
});

describe("Stand am Ende jedes Tages", () => {
  const sums = [
    { date: d("2026-06-30"), cents: 100_000 }, // vor dem Verlauf: Stand am Morgen des ersten Tages
    { date: d("2026-07-01"), cents: 5_000 },
    { date: d("2026-07-03"), cents: -2_500 },
    { date: d("2026-07-03"), cents: 500 }, // zweimal derselbe Tag zählt zusammen
    { date: d("2026-07-06"), cents: 99_999 }, // nach dem Ende: zählt nicht
  ];

  it("Anfangsstand plus jeder Tag, ein Wert je Kalendertag bis einschließlich zum Ende", () => {
    expect(dailyBalances(sums, d("2026-07-01"), d("2026-07-04"))).toEqual({
      from: d("2026-07-01"),
      values: [105_000, 105_000, 103_000, 103_000],
    });
  });

  it("Ende vor dem Beginn: kein Verlauf", () => {
    expect(dailyBalances(sums, d("2026-07-05"), d("2026-07-04")).values).toEqual([]);
  });

  it("der Tag eines Punkts", () => {
    expect(curveDay(curve("2026-02-27", [1, 2, 3]), 2)).toEqual(d("2026-03-01"));
  });
});

describe("Hoch und Tief", () => {
  it("jeweils der erste Tag mit dem höchsten bzw. niedrigsten Stand", () => {
    const extremes = curveExtremes(curve("2026-07-01", [500, 900, 300, 900, 300]));
    expect(extremes).toEqual({
      high: { index: 1, date: d("2026-07-02"), cents: 900 },
      low: { index: 2, date: d("2026-07-03"), cents: 300 },
    });
  });

  it("gleichbleibender Stand oder nur ein Tag: nichts zu markieren", () => {
    expect(curveExtremes(curve("2026-07-01", [500, 500, 500]))).toBeNull();
    expect(curveExtremes(curve("2026-07-01", [500]))).toBeNull();
  });
});

describe("Veränderung seit Monatsbeginn", () => {
  it("heute minus Stand am Ende des Vormonats", () => {
    // 29.09. bis 03.10.: Ende September 1.000,00 €, heute 1.250,00 €
    const c = curve("2026-09-29", [80_000, 100_000, 110_000, 90_000, 125_000]);
    expect(monthStartChange(c, d("2026-10-03"))).toEqual({
      cents: 25_000,
      since: d("2026-10-01"),
    });
  });

  it("am Monatsersten: gegen gestern", () => {
    const c = curve("2026-09-29", [1, 2, 7]);
    expect(monthStartChange(c, d("2026-10-01"))).toEqual({ cents: 5, since: d("2026-10-01") });
  });

  it("Verlauf beginnt erst in diesem Monat: kein Vergleich", () => {
    expect(monthStartChange(curve("2026-10-01", [1, 2, 3]), d("2026-10-03"))).toBeNull();
    expect(monthStartChange(curve("2026-10-02", [1, 2]), d("2026-10-03"))).toBeNull();
  });

  it("Beschriftung „seit 1. Oktober“", () => {
    expect(dayMonthLabel(d("2026-10-01"))).toBe("1. Oktober");
  });
});

describe("Achse", () => {
  it("erster Tag und Monatsanfänge, zu nah an „Heute“ fällt weg", () => {
    // 01.07. bis 21.10.: Jul, Aug, Sep, Okt (Okt bei 0,82 – noch vor dem Rand für „Heute“)
    const values = Array.from({ length: 113 }, () => 0);
    const ticks = curveTicks(curve("2026-07-01", values));
    expect(ticks.map((t) => t.label)).toEqual(["Jul", "Aug", "Sep", "Okt"]);
    expect(ticks[0]).toMatchObject({ index: 0, position: 0, minor: false });
    // „Okt“ steht kurz vor „Heute“ – am Handy ausgeblendet, am Computer da.
    expect(ticks.map((t) => t.minor)).toEqual([false, false, false, true]);
    // Bis 03.10.: Der 1. Oktober läge bei 0,98 – „Okt“ fiele auf „Heute“ und entfällt.
    const short = curveTicks(curve("2026-07-01", values.slice(0, 95)));
    expect(short.map((t) => t.label)).toEqual(["Jul", "Aug", "Sep"]);
  });

  it("ein Beginn kurz vor einem Monatsanfang: der zu nahe Name entfällt", () => {
    const ticks = curveTicks(
      curve(
        "2026-06-28",
        Array.from({ length: 100 }, () => 0),
      ),
    );
    expect(ticks.map((t) => t.label)).toEqual(["Jun", "Aug", "Sep"]);
  });

  it("mehr als sechs Namen: jeder zweite ist am Handy ausgeblendet", () => {
    const ticks = curveTicks(
      curve(
        "2026-01-01",
        Array.from({ length: 294 }, () => 0),
      ),
    );
    expect(ticks.map((t) => t.label)).toEqual([
      "Jan",
      "Feb",
      "Mär",
      "Apr",
      "Mai",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
    ]);
    expect(ticks.filter((t) => t.minor).map((t) => t.label)).toEqual([
      "Feb",
      "Apr",
      "Jun",
      "Aug",
      "Sep",
    ]);
  });

  it("weniger als zwei Punkte: keine Achse", () => {
    expect(curveTicks(curve("2026-07-01", [5]))).toEqual([]);
  });
});

describe("Tabelle statt Diagramm und Satz für Screenreader", () => {
  const c = curve("2026-08-30", [100, 200, 300, 400, 350]); // 30.08. bis 03.09.

  it("Stand am Ende jedes Monats, der laufende mit dem Stand von heute", () => {
    expect(monthEndRows(c)).toEqual([
      { key: "2026-08", label: "August 2026", cents: 200, current: false },
      { key: "2026-09", label: "September 2026", cents: 350, current: true },
    ]);
  });

  it("von – auf, Hoch und Tief mit Datum", () => {
    expect(plain(describeCurve(c))).toBe(
      "Kontostand vom 30.08.2026 bis heute: von 1,00 € auf 3,50 €. Höchster Stand 4,00 € am 02.09.2026, niedrigster 1,00 € am 30.08.2026.",
    );
  });

  it("gleichbleibend bzw. ohne Verlauf", () => {
    expect(plain(describeCurve(curve("2026-08-30", [100, 100])))).toBe(
      "Kontostand vom 30.08.2026 bis heute: von 1,00 € auf 1,00 €. Der Stand blieb in dieser Zeit gleich.",
    );
    expect(describeCurve(curve("2026-08-30", [100]))).toBe("Noch kein Verlauf des Kontostands.");
  });
});

describe("Beträge und Tage", () => {
  it("Cent getrennt (kleiner dargestellt) – auch im Minus", () => {
    expect(splitEuro(1_394_447).map(plain)).toEqual(["13.944", ",47 €"]);
    expect(splitEuro(-123_450).map(plain)).toEqual(["−1.234", ",50 €"]);
    expect(splitEuro(0).map(plain)).toEqual(["0", ",00 €"]);
  });

  it("„Heute“, „Gestern“, sonst Wochentag und Datum – mit Jahr nur, wenn es nicht dieses ist", () => {
    const today = d("2026-10-21");
    expect(dayHeading(d("2026-10-21"), today)).toBe("Heute");
    expect(dayHeading(d("2026-10-20"), today)).toBe("Gestern");
    expect(dayHeading(d("2026-10-05"), today)).toBe("Mo., 5. Oktober");
    expect(dayHeading(d("2025-12-30"), today)).toBe("Di., 30. Dezember 2025");
    expect(weekdayLabel(d("2026-10-05"))).toBe("Mo., 5. Oktober");
  });
});
