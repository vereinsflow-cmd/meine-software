import { describe, expect, it } from "vitest";
import { followStartDate, isDateKey, quickEventDefaults } from "@/modules/calendar/quick-event";
import { eventFormSchema } from "@/modules/events/schemas";

const departments = [
  { id: "fussball", name: "Fußball", selectable: true },
  { id: "handball", name: "Handball", selectable: false },
];

describe("„Neuer Termin“ im Kalender: Startwerte", () => {
  it("belegt Beginn und Ende mit dem gewählten Tag, abends 18–20 Uhr, einmalig und intern", () => {
    const values = quickEventDefaults("2026-10-03", { departments, departmentRequired: false });
    expect(values).toMatchObject({
      startDate: "2026-10-03",
      startTime: "18:00",
      endDate: "2026-10-03",
      endTime: "20:00",
      allDay: false,
      type: "EVENT",
      visibility: "INTERNAL",
      repeat: "none",
      departmentId: "",
    });
  });

  it("mit Titel ergeben die Startwerte eine gültige Veranstaltung", () => {
    const values = quickEventDefaults("2026-10-03", { departments, departmentRequired: false });
    expect(eventFormSchema.safeParse({ ...values, title: "Vorstandssitzung" }).success).toBe(true);
    expect(eventFormSchema.safeParse(values).success).toBe(false); // ohne Titel nicht
  });

  it("wählt die Abteilung vor, wenn man wählen muss und genau eine leitet", () => {
    expect(
      quickEventDefaults("2026-10-03", { departments, departmentRequired: true }).departmentId,
    ).toBe("fussball");
    const two = [...departments, { id: "turnen", name: "Turnen", selectable: true }];
    expect(
      quickEventDefaults("2026-10-03", { departments: two, departmentRequired: true }).departmentId,
    ).toBe("");
  });
});

describe("„Neuer Termin“ im Kalender: Ende folgt dem Beginn", () => {
  it("ein eintägiger Termin bleibt eintägig – vorwärts wie rückwärts", () => {
    expect(followStartDate("2026-10-03", "2026-10-05", "2026-10-03")).toBe("2026-10-05");
    expect(followStartDate("2026-10-03", "2026-10-01", "2026-10-03")).toBe("2026-10-01");
  });

  it("ein mehrtägiger Termin behält sein Ende, solange es nicht vor dem Beginn liegt", () => {
    expect(followStartDate("2026-10-03", "2026-10-04", "2026-10-06")).toBe("2026-10-06");
    expect(followStartDate("2026-10-03", "2026-10-09", "2026-10-06")).toBe("2026-10-09");
  });

  it("unvollständige oder leere Eingaben ändern das Ende nicht; ein leeres Ende wird gefüllt", () => {
    expect(followStartDate("2026-10-03", "", "2026-10-03")).toBe("2026-10-03");
    expect(followStartDate("2026-10-03", "2026-10", "2026-10-03")).toBe("2026-10-03");
    expect(followStartDate("2026-10-03", "2026-10-04", "")).toBe("2026-10-04");
  });

  it("erkennt Tagesschlüssel (JJJJ-MM-TT)", () => {
    expect(isDateKey("2026-10-03")).toBe(true);
    for (const bad of [undefined, "", "03.10.2026", "2026-10-3", "2026-10-03T00:00"])
      expect(isDateKey(bad)).toBe(false);
  });
});
