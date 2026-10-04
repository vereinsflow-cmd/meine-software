import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/modules/shifts/timeline";

// 17.10.2026 ist Sommerzeit (UTC+2): 12:00 UTC = 14:00 Uhr in Berlin.
const at = (berlinTime: string, day = "2026-10-17") => {
  const [h, m] = berlinTime.split(":").map(Number);
  return new Date(`${day}T${String(h! - 2).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
};
const shift = (from: string, to: string) => ({ startsAt: at(from), endsAt: at(to) });
const fest = { startsAt: at("14:00"), endsAt: at("22:00"), allDay: false };

describe("buildTimeline", () => {
  it("Achse von der vollen Stunde vor dem ersten Beginn bis nach dem letzten Ende, Veranstaltung eingerechnet", () => {
    const timeline = buildTimeline(fest, [shift("09:00", "11:00"), shift("18:00", "20:00")])!;
    expect(timeline.ticks[0]).toEqual({ label: "09:00", left: 0 });
    expect(timeline.ticks.at(-1)).toEqual({ label: "22:00", left: 100 });
    expect(timeline.ticks).toHaveLength(14);
    // 14:00–22:00 von 09:00–22:00 (13 Stunden)
    expect(timeline.band!.left).toBeCloseTo((5 / 13) * 100);
    expect(timeline.band!.width).toBeCloseTo((8 / 13) * 100);
  });

  it("parallele Schichten auf eigenen Bahnen, wie im Sommerfest", () => {
    const shifts = [
      shift("09:00", "11:00"), // Aufbau
      shift("12:00", "15:00"), // Getränkestand
      shift("12:00", "16:00"), // Grillstand
      shift("13:00", "17:00"), // Kuchenbuffet
      shift("18:00", "20:00"), // Abbau
    ];
    const timeline = buildTimeline(fest, shifts)!;
    expect(timeline.bars.map((bar) => bar.lane)).toEqual([0, 0, 1, 2, 0]);
    expect(timeline.lanes).toBe(3);
    expect(timeline.bars[1]!.left).toBeCloseTo((3 / 13) * 100);
    expect(timeline.bars[1]!.width).toBeCloseTo((3 / 13) * 100);
  });

  it("angebrochene Stunden werden auf volle gerundet; eine Schicht, die genau endet, wenn die nächste beginnt, teilt die Bahn", () => {
    const timeline = buildTimeline({ ...fest, allDay: true }, [
      shift("09:30", "10:15"),
      shift("10:15", "11:00"),
    ])!;
    expect(timeline.ticks.map((tick) => tick.label)).toEqual(["09:00", "10:00", "11:00"]);
    expect(timeline.bars.map((bar) => bar.lane)).toEqual([0, 0]);
    expect(timeline.band).toBeNull(); // ganztägig: kein Band der Veranstaltung
  });

  it("über Mitternacht und bei langen Tagen nur jede zweite Stunde beschriftet", () => {
    const timeline = buildTimeline(
      { startsAt: at("08:00"), endsAt: at("02:00", "2026-10-18"), allDay: false },
      [{ startsAt: at("20:00"), endsAt: at("02:00", "2026-10-18") }],
    )!;
    expect(timeline.ticks[0]!.label).toBe("08:00");
    expect(timeline.ticks.at(-1)!.label).toBe("02:00");
    expect(timeline.ticks).toHaveLength(10); // 18 Stunden, jede zweite beschriftet
  });

  it("Veranstaltung länger als die Achse (Zeltlager): Achse nur aus den Schichten, ohne Band", () => {
    const lager = {
      startsAt: at("17:00", "2026-10-16"),
      endsAt: at("13:00", "2026-10-18"),
      allDay: false,
    };
    const timeline = buildTimeline(lager, [shift("10:00", "12:00"), shift("14:00", "18:00")])!;
    expect(timeline.ticks[0]!.label).toBe("10:00");
    expect(timeline.ticks.at(-1)!.label).toBe("18:00");
    expect(timeline.band).toBeNull();
  });

  it("markiert „jetzt“, solange es auf der Achse liegt", () => {
    const shifts = [shift("09:00", "11:00"), shift("18:00", "20:00")];
    // 09:00–22:00 (13 Stunden); 17:30 Uhr liegt bei 8,5 Stunden
    expect(buildTimeline(fest, shifts, at("17:30").getTime())!.now).toBeCloseTo((8.5 / 13) * 100);
    expect(buildTimeline(fest, shifts, at("08:00").getTime())!.now).toBeNull();
    expect(buildTimeline(fest, shifts, at("23:00").getTime())!.now).toBeNull();
  });

  it("nichts zu zeigen: ohne Schichten oder über mehr als einen Tag verteilt", () => {
    expect(buildTimeline(fest, [])).toBeNull();
    expect(
      buildTimeline({ ...fest, allDay: true }, [
        shift("09:00", "11:00"),
        { startsAt: at("09:00", "2026-10-18"), endsAt: at("12:00", "2026-10-18") },
      ]),
    ).toBeNull();
    // Aufbau am Vorabend: zusammen keine 24 Stunden, aber an zwei Tagen – ohne Tag an der Achse wäre das missverständlich.
    expect(
      buildTimeline(fest, [
        { startsAt: at("18:00", "2026-10-16"), endsAt: at("22:00", "2026-10-16") },
        shift("14:00", "16:00"),
      ]),
    ).toBeNull();
  });
});
