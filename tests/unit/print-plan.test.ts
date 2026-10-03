import { describe, expect, it } from "vitest";
import {
  eventSpansDays,
  freePlaces,
  needRows,
  openPlaces,
  previewLabel,
  shiftDays,
  shiftEndLabel,
  signUpPlaces,
  slotsOf,
} from "@/modules/shifts/print-plan";

/** Schicht mit `requiredCount` Plätzen und `filled` Eingetragenen; `id` zum Wiedererkennen. */
const shift = (id: string, requiredCount: number, filled: number, closed = false) => ({
  id,
  requiredCount,
  filled,
  closed,
});

describe("freePlaces / openPlaces", () => {
  it("zählt die freien Plätze und summiert sie für „Wir brauchen noch N Helfer“", () => {
    expect(freePlaces(shift("a", 5, 2))).toBe(3);
    expect(openPlaces([shift("a", 5, 2), shift("b", 3, 0), shift("c", 4, 4)])).toBe(6);
  });

  it("mehr Eingetragene als nötig ergeben 0 frei, nicht weniger", () => {
    expect(freePlaces(shift("a", 2, 3))).toBe(0);
    expect(openPlaces([shift("a", 2, 3), shift("b", 2, 1)])).toBe(1);
  });

  it("geschlossene Schichten haben freie Plätze, laden aber nicht zum Eintragen ein", () => {
    const closed = shift("g", 4, 1, true);
    expect(freePlaces(closed)).toBe(3);
    expect(signUpPlaces(closed)).toBe(0);
    expect(openPlaces([closed, shift("b", 2, 0)])).toBe(2);
  });
});

describe("needRows (Kasten „Noch frei“)", () => {
  it("bis acht Schichten stehen alle da – auch die vollen", () => {
    const shifts = [shift("a", 2, 2), shift("b", 3, 1), shift("c", 1, 0)];
    expect(needRows(shifts)).toEqual({
      shown: shifts,
      moreOpen: 0,
      closedFree: 0,
      withoutNeed: 0,
    });
  });

  it("bei vielen Schichten nur die mit freien Plätzen, die vollen als Anzahl", () => {
    const full = Array.from({ length: 6 }, (_, i) => shift(`voll${i}`, 2, 2));
    const open = Array.from({ length: 4 }, (_, i) => shift(`frei${i}`, 3, 1));
    const result = needRows([...full, ...open]);
    expect(result.shown.map((s) => s.id)).toEqual(["frei0", "frei1", "frei2", "frei3"]);
    expect(result).toMatchObject({ moreOpen: 0, withoutNeed: 6 });
  });

  it("mehr offene Schichten als Zeilen: die ersten acht, der Rest als „+ N weitere“", () => {
    const open = Array.from({ length: 11 }, (_, i) => shift(`frei${i}`, 2, 0));
    const result = needRows([shift("voll", 1, 1), ...open]);
    expect(result.shown).toHaveLength(8);
    expect(result.shown[0]!.id).toBe("frei0");
    expect(result).toMatchObject({ moreOpen: 3, withoutNeed: 1 });
  });

  it("bei vielen Schichten stehen geschlossene mit freien Plätzen als eigene Anzahl da, nicht als „ohne freie Plätze“", () => {
    const open = Array.from({ length: 8 }, (_, i) => shift(`frei${i}`, 2, 0));
    const result = needRows([shift("zu", 5, 0, true), shift("zuVoll", 1, 1, true), ...open]);
    expect(result.shown.map((s) => s.id)).not.toContain("zu");
    expect(result).toMatchObject({ moreOpen: 0, closedFree: 1, withoutNeed: 1 });
  });

  it("die Grenze lässt sich setzen (genau so viele Schichten wie Zeilen: alle)", () => {
    const shifts = [shift("a", 1, 1), shift("b", 1, 0)];
    expect(needRows(shifts, 2).shown).toHaveLength(2);
    expect(needRows(shifts, 1)).toMatchObject({ moreOpen: 0, withoutNeed: 1 });
  });
});

describe("slotsOf", () => {
  it("erst die Namen, dann je freiem Platz eine leere Zeile", () => {
    expect(slotsOf({ requiredCount: 4, helperNames: ["Hans Helfer", "Laura Braun"] })).toEqual([
      "Hans Helfer",
      "Laura Braun",
      null,
      null,
    ]);
  });

  it("mehr Eingetragene als nötig: alle Namen bleiben sichtbar", () => {
    expect(slotsOf({ requiredCount: 1, helperNames: ["A", "B"] })).toEqual(["A", "B"]);
  });

  it("ohne Bedarf und ohne Helfer gibt es keine Zeilen", () => {
    expect(slotsOf({ requiredCount: 0, helperNames: [] })).toEqual([]);
  });
});

describe("shiftDays / shiftEndLabel (Berliner Zeit)", () => {
  // 03.10.2026 ist Sommerzeit (UTC+2): 22:00 UTC = 00:00 Uhr am 04.10. in Berlin.
  const event = (shiftStarts: string[]) => ({
    startsAt: new Date("2026-10-03T12:00:00Z"),
    shifts: shiftStarts.map((iso) => ({ startsAt: new Date(iso) })),
  });

  it("alle Schichten am Tag der Veranstaltung: kein Tag an den Schichten", () => {
    expect(shiftDays(event(["2026-10-03T07:00:00Z", "2026-10-03T21:59:00Z"]))).toBe("none");
  });

  it("eine Schicht am nächsten Berliner Tag (auch wenn in UTC noch derselbe): der Wochentag genügt", () => {
    expect(shiftDays(event(["2026-10-03T07:00:00Z", "2026-10-03T22:30:00Z"]))).toBe("weekday");
  });

  it("Schichten eine Woche oder mehr auseinander: das Datum, weil sich Wochentage wiederholen", () => {
    expect(shiftDays(event(["2026-10-09T07:00:00Z"]))).toBe("weekday"); // 6 Tage
    expect(shiftDays(event(["2026-10-10T07:00:00Z"]))).toBe("date"); // 7 Tage, wieder Samstag
  });

  it("mehrtägige Veranstaltung: Beginn und Ende an verschiedenen Berliner Tagen", () => {
    const start = new Date("2026-10-03T12:00:00Z");
    expect(eventSpansDays({ startsAt: start, endsAt: new Date("2026-10-03T21:59:00Z") })).toBe(
      false,
    );
    expect(eventSpansDays({ startsAt: start, endsAt: new Date("2026-10-03T22:00:00Z") })).toBe(
      true,
    );
  });

  it("Ende am selben Tag nur als Uhrzeit, über Mitternacht mit Tag", () => {
    expect(
      shiftEndLabel({
        startsAt: new Date("2026-10-03T16:00:00Z"),
        endsAt: new Date("2026-10-03T18:00:00Z"),
      }),
    ).toBe("20:00");
    expect(
      shiftEndLabel({
        startsAt: new Date("2026-10-03T19:00:00Z"),
        endsAt: new Date("2026-10-04T00:30:00Z"),
      }),
    ).toBe("So., 04.10. 02:30");
  });
});

describe("previewLabel", () => {
  it("nennt Aushänge und Listen in Worten, nicht Seiten", () => {
    expect(previewLabel(2, "beides")).toBe("2 Aushänge und 2 Anwesenheitslisten");
    expect(previewLabel(1, "beides")).toBe("1 Aushang und 1 Anwesenheitsliste");
    expect(previewLabel(3, "aushang")).toBe("3 Aushänge");
    expect(previewLabel(1, "anwesenheit")).toBe("1 Anwesenheitsliste");
  });
});
