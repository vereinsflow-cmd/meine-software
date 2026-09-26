import { describe, expect, it } from "vitest";
import { eventOptions } from "@/lib/event-options";

const event = (id: string, title: string, startsAt: string) => ({
  id,
  title,
  startsAt: new Date(startsAt),
});

describe("eventOptions", () => {
  it("beschriftet mit Titel und Datum, damit wöchentliche Termine unterscheidbar sind", () => {
    expect(
      eventOptions([
        event("a", "Fußball-Training Herren", "2026-09-29T16:00:00Z"), // Di., 18:00 Uhr Berlin
        event("b", "Fußball-Training Herren", "2026-10-06T16:00:00Z"),
      ]),
    ).toEqual([
      { value: "a", label: "Fußball-Training Herren · Di., 29.09.2026" },
      { value: "b", label: "Fußball-Training Herren · Di., 06.10.2026" },
    ]);
  });

  it("nimmt den Tag in Berliner Zeit, nicht in UTC", () => {
    // 22:30 UTC am 04.10. ist in Berlin (Sommerzeit) schon Montag, 00:30 Uhr.
    expect(eventOptions([event("a", "Nachtwanderung", "2026-10-04T22:30:00Z")])[0]?.label).toBe(
      "Nachtwanderung · Mo., 05.10.2026",
    );
  });

  it("ergänzt die Uhrzeit nur bei gleichem Titel am selben Tag", () => {
    expect(
      eventOptions([
        event("a", "Jugendturnier", "2026-10-03T08:00:00Z"), // 10:00 Uhr Berlin
        event("b", "JUGENDTURNIER", "2026-10-03T12:30:00Z"), // 14:30 Uhr – Schreibweise egal
        event("c", "Vorstandssitzung", "2026-10-03T17:00:00Z"), // anderer Titel am selben Tag
        event("d", "Jugendturnier", "2026-10-10T08:00:00Z"), // gleicher Titel, anderer Tag
      ]).map((option) => option.label),
    ).toEqual([
      "Jugendturnier · Sa., 03.10.2026, 10:00 Uhr",
      "JUGENDTURNIER · Sa., 03.10.2026, 14:30 Uhr",
      "Vorstandssitzung · Sa., 03.10.2026",
      "Jugendturnier · Sa., 10.10.2026",
    ]);
  });

  it("behält die Reihenfolge des Dienstes und kommt mit leeren Listen zurecht", () => {
    expect(
      eventOptions([
        event("spaet", "Sommerfest", "2026-10-10T12:00:00Z"),
        event("frueh", "Arbeitseinsatz", "2026-10-01T07:00:00Z"),
      ]).map((option) => option.value),
    ).toEqual(["spaet", "frueh"]);
    expect(eventOptions([])).toEqual([]);
  });
});
