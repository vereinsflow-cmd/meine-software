import { describe, expect, it } from "vitest";
import { parseBerlinDateTime } from "@/lib/dates";
import {
  chatKeyOf,
  chatListTime,
  chatPreview,
  chatTitle,
  dayLabel,
  nameTone,
  parseChatKey,
  showSubject,
  subjectFromBody,
  withRuns,
} from "@/modules/messages/chat-format";

const at = (date: string, time = "12:00") => parseBerlinDateTime(date, time)!;
const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("Chats: Schlüssel je Zielgruppe", () => {
  it("bildet Schlüssel und liest sie wieder ein", () => {
    const targets = [
      { audience: "ALL_MEMBERS", departmentId: null, eventId: null },
      { audience: "DEPARTMENT", departmentId: ID, eventId: null },
      { audience: "EVENT_HELPERS", departmentId: null, eventId: ID },
      { audience: "EVENT_PARTICIPANTS", departmentId: null, eventId: ID },
    ] as const;
    expect(targets.map(chatKeyOf)).toEqual([
      "alle",
      `abteilung-${ID}`,
      `helfer-${ID}`,
      `teilnehmer-${ID}`,
    ]);
    for (const target of targets) expect(parseChatKey(chatKeyOf(target))).toEqual(target);
  });

  it("lehnt Unsinn ab", () => {
    for (const bad of [
      undefined,
      "",
      "alles",
      "abteilung-",
      "helfer-../../x",
      "gruppe-1",
      `abteilung-${"a".repeat(65)}`,
    ])
      expect(parseChatKey(bad)).toBeNull();
  });

  it("benennt Chats verständlich", () => {
    expect(chatTitle("ALL_MEMBERS", {})).toBe("Alle Mitglieder");
    expect(chatTitle("DEPARTMENT", { department: "Fußball" })).toBe("Abteilung Fußball");
    expect(chatTitle("EVENT_HELPERS", { event: "Sommerfest 2026" })).toBe(
      "Helfer · Sommerfest 2026",
    );
    expect(chatTitle("EVENT_PARTICIPANTS", { event: "Sommerfest 2026" })).toBe(
      "Teilnehmer · Sommerfest 2026",
    );
  });
});

describe("Chats: Betreff aus dem Text", () => {
  it("nimmt die erste Zeile, kürzt lange an einer Wortgrenze und ersetzt Einzelzeichen", () => {
    expect(subjectFromBody("Hallo zusammen,\nam Samstag …")).toBe("Hallo zusammen,");
    expect(subjectFromBody("\n\n  Training   fällt aus  \nGrund: Regen")).toBe(
      "Training fällt aus",
    );
    const long = subjectFromBody(`${"Wort ".repeat(30)}Ende`);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("Wort…")).toBe(true);
    expect(subjectFromBody("!")).toBe("Nachricht");
    expect(subjectFromBody("")).toBe("Nachricht");
  });

  it("zeigt den Betreff nur, wenn er mehr ist als der Anfang des Textes", () => {
    const body = "Hallo zusammen,\nam Samstag ist Arbeitseinsatz.";
    expect(showSubject(subjectFromBody(body), body)).toBe(false);
    const longBody = `${"Wort ".repeat(30)}Ende`;
    expect(showSubject(subjectFromBody(longBody), longBody)).toBe(false);
    expect(showSubject("Willkommen bei VereinsFlow!", "Liebe Mitglieder, …")).toBe(true);
  });

  it("Vorschau: eigener Betreff, sonst der Textanfang – auf eine Zeile gekürzt", () => {
    expect(chatPreview("Willkommen!", "Liebe Mitglieder,\nab sofort …")).toBe("Willkommen!");
    expect(chatPreview("Hallo zusammen,", "Hallo zusammen,\nam Samstag")).toBe(
      "Hallo zusammen, am Samstag",
    );
    const long = chatPreview("a a", "a ".repeat(200), 20); // Betreff = Textanfang → Text, gekürzt
    expect(long).toHaveLength(20);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("Chats: Zeitangaben wie bei WhatsApp", () => {
  const now = at("2026-09-27", "15:00"); // Sonntag

  it("Chatliste: Uhrzeit, Gestern, Wochentag, Datum", () => {
    expect(chatListTime(at("2026-09-27", "09:05"), now)).toBe("09:05");
    expect(chatListTime(at("2026-09-26", "23:59"), now)).toBe("Gestern");
    expect(chatListTime(at("2026-09-22"), now)).toBe("Dienstag");
    expect(chatListTime(at("2026-09-20"), now)).toBe("20.09.2026");
  });

  it("Trenner im Verlauf: Heute, Gestern, Wochentag, langes Datum", () => {
    expect(dayLabel(at("2026-09-27", "00:30"), now)).toBe("Heute");
    expect(dayLabel(at("2026-09-26"), now)).toBe("Gestern");
    expect(dayLabel(at("2026-09-21"), now)).toBe("Montag");
    expect(dayLabel(at("2026-09-20"), now)).toBe("Sonntag, 20. September 2026");
  });

  it("Blöcke: neuer Tag oder andere Person beginnt einen neuen Block", () => {
    const runs = withRuns([
      { sentAt: at("2026-09-26", "10:00"), authorKey: "anna" },
      { sentAt: at("2026-09-26", "10:05"), authorKey: "anna" },
      { sentAt: at("2026-09-26", "11:00"), authorKey: "ich" },
      { sentAt: at("2026-09-27", "08:00"), authorKey: "ich" },
    ]);
    expect(runs.map((run) => [run.newDay, run.firstOfRun])).toEqual([
      [true, true],
      [false, false],
      [false, true],
      [true, true],
    ]);
  });

  it("gleiche Person, gleiche Namensfarbe", () => {
    expect(nameTone("Anna Admin")).toBe(nameTone("Anna Admin"));
    expect(nameTone("Anna Admin")).toMatch(/^text-\w+-800 dark:text-\w+-300$/);
  });
});
