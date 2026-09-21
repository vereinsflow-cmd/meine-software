import { describe, expect, it } from "vitest";
import { parseBerlinDateTime } from "@/lib/dates";
import { buildIcs, type IcsEntry } from "@/modules/calendar/ics";

const at = (date: string, time: string) => parseBerlinDateTime(date, time)!;
const now = new Date("2026-09-20T10:00:00Z");

const entry = (overrides: Partial<IcsEntry> = {}): IcsEntry => ({
  uid: "event-1",
  title: "Sommerfest",
  startsAt: at("2026-09-26", "14:00"),
  endsAt: at("2026-09-26", "22:00"),
  allDay: false,
  status: "PUBLISHED",
  updatedAt: new Date("2026-09-01T08:00:00Z"),
  ...overrides,
});

/** Entfaltet umgebrochene Zeilen (RFC 5545: Fortsetzungszeilen beginnen mit einem Leerzeichen). */
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, "");
const build = (entries: IcsEntry[]) =>
  unfold(buildIcs({ name: "TSV Musterstadt", entries, uidDomain: "vereinsflow.example", now }));
const lines = (text: string) => text.split("\r\n");

describe("iCal-Ausgabe", () => {
  it("erzeugt einen gültigen Kalender mit Namen und stabiler UID", () => {
    const ics = build([entry()]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(lines(ics)).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("X-WR-CALNAME:TSV Musterstadt");
    expect(lines(ics)).toContain("UID:event-1@vereinsflow.example");
    expect(lines(ics)).toContain("DTSTAMP:20260920T100000Z");
    expect(lines(ics)).toContain("SUMMARY:Sommerfest");
  });

  it("gibt Zeitpunkte als UTC aus (Sommerzeit: Berlin = UTC+2)", () => {
    const ics = build([entry()]);
    expect(lines(ics)).toContain("DTSTART:20260926T120000Z");
    expect(lines(ics)).toContain("DTEND:20260926T200000Z");
  });

  it("gibt Zeitpunkte im Winter korrekt aus (Berlin = UTC+1)", () => {
    const ics = build([
      entry({ startsAt: at("2026-12-05", "18:30"), endsAt: at("2026-12-05", "21:00") }),
    ]);
    expect(lines(ics)).toContain("DTSTART:20261205T173000Z");
    expect(lines(ics)).toContain("DTEND:20261205T200000Z");
  });

  it("ganztägig: reine Kalendertage, Ende exklusiv (Ende 23:59 des letzten Tages → Folgetag)", () => {
    const ics = build([
      entry({
        allDay: true,
        startsAt: at("2026-09-26", "00:00"),
        endsAt: at("2026-09-27", "23:59"),
      }),
    ]);
    expect(lines(ics)).toContain("DTSTART;VALUE=DATE:20260926");
    expect(lines(ics)).toContain("DTEND;VALUE=DATE:20260928");
  });

  it("ganztägig an einem einzigen Tag dauert genau einen Tag", () => {
    const ics = build([
      entry({
        allDay: true,
        startsAt: at("2026-10-25", "00:00"),
        endsAt: at("2026-10-25", "23:59"),
      }),
    ]); // Tag der Zeitumstellung
    expect(lines(ics)).toContain("DTSTART;VALUE=DATE:20261025");
    expect(lines(ics)).toContain("DTEND;VALUE=DATE:20261026");
  });

  it("Ende nicht nach Beginn: Standarddauer eine Stunde", () => {
    const start = at("2026-09-26", "10:00");
    const ics = build([entry({ startsAt: start, endsAt: start })]);
    expect(lines(ics)).toContain("DTEND:20260926T090000Z");
  });

  it("bildet den Status ab: abgesagt und Entwurf", () => {
    expect(build([entry({ status: "CANCELLED" })])).toContain("STATUS:CANCELLED");
    expect(build([entry({ status: "DRAFT" })])).toContain("STATUS:TENTATIVE");
    expect(build([entry({ status: "PUBLISHED" })])).toContain("STATUS:CONFIRMED");
    expect(build([entry({ status: "COMPLETED" })])).toContain("STATUS:CONFIRMED");
  });

  it("maskiert Sonderzeichen und bricht lange Zeilen um (keine Zeile über 75 Byte)", () => {
    const description = `Grillen; Kuchen, Musik\nBitte Geschirr mitbringen. ${"Ein sehr langer Satz mit Umlauten äöü. ".repeat(12)}`;
    const raw = buildIcs({
      name: "Verein",
      entries: [entry({ title: "Fest; mit, Komma", description })],
      uidDomain: "x.example",
      now,
    });
    for (const line of raw.split("\r\n"))
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    const ics = unfold(raw);
    expect(ics).toContain("SUMMARY:Fest\\; mit\\, Komma");
    expect(ics).toContain("DESCRIPTION:Grillen\\; Kuchen\\, Musik\\nBitte Geschirr mitbringen.");
    // Mehrbyte-Zeichen (Umlaute) bleiben beim Umbrechen heil.
    expect(ics).toContain("Umlauten äöü.");
    expect(ics).not.toContain("�");
  });

  it("schreibt Ort, Adresse und Link nur, wenn vorhanden", () => {
    const plain = build([entry()]);
    expect(plain).not.toContain("LOCATION:");
    expect(plain).not.toContain("URL:");
    const full = build([
      entry({
        location: "Sportplatz, Vereinsweg 1",
        url: "https://verein.example/veranstaltungen/1",
      }),
    ]);
    expect(full).toContain("LOCATION:Sportplatz\\, Vereinsweg 1");
    expect(full).toContain("URL;VALUE=URI:https://verein.example/veranstaltungen/1");
  });

  it("mehrere Einträge, jeder mit eigener UID; leerer Kalender bleibt gültig", () => {
    const ics = build([
      entry({ uid: "event-1" }),
      entry({ uid: "shift-9", title: "Helferschicht: Aufbau" }),
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:shift-9@vereinsflow.example");
    const empty = build([]);
    expect(empty).toContain("BEGIN:VCALENDAR");
    expect(empty).not.toContain("BEGIN:VEVENT");
  });

  it("ändert sich ein Termin, ändert sich SEQUENCE und LAST-MODIFIED", () => {
    const a = build([entry({ updatedAt: new Date("2026-09-01T08:00:00Z") })]);
    const b = build([entry({ updatedAt: new Date("2026-09-02T08:00:00Z") })]);
    const seq = (text: string) => Number(/SEQUENCE:(\d+)/.exec(text)?.[1]);
    expect(seq(b)).toBeGreaterThan(seq(a));
    expect(a).toContain("LAST-MODIFIED:20260901T080000Z");
  });
});
