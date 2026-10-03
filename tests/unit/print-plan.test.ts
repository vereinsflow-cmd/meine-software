import { describe, expect, it } from "vitest";
import {
  contactSentence,
  endSentence,
  eventSpansDays,
  eventWhenText,
  freePlaces,
  openPlaces,
  previewLabel,
  shiftEndLabel,
  shiftStatusText,
  shiftTimeText,
  shiftsSpanDays,
  signUpHint,
  signUpPlaces,
  slotsOf,
} from "@/modules/shifts/print-plan";

/** Schicht mit `requiredCount` Plätzen und `filled` Eingetragenen. */
const shift = (
  requiredCount: number,
  filled: number,
  closed = false,
  minAge: number | null = null,
) => ({
  requiredCount,
  filled,
  closed,
  minAge,
});

describe("freie Plätze", () => {
  it("zählt die freien Plätze; mehr Eingetragene als nötig ergeben 0, nicht weniger", () => {
    expect(freePlaces(shift(5, 2))).toBe(3);
    expect(freePlaces(shift(2, 3))).toBe(0);
    expect(openPlaces([shift(5, 2), shift(3, 0), shift(4, 4), shift(2, 3)])).toBe(6);
  });

  it("geschlossene Schichten haben freie Plätze, zählen aber nicht zum Eintragen", () => {
    expect(freePlaces(shift(4, 1, true))).toBe(3);
    expect(signUpPlaces(shift(4, 1, true))).toBe(0);
    expect(openPlaces([shift(4, 1, true), shift(2, 0)])).toBe(2);
  });
});

describe("shiftStatusText (Stand als Satz)", () => {
  it("teilweise besetzt, mit Mindestalter", () => {
    expect(shiftStatusText(shift(4, 2, false, 16))).toEqual({
      emphasis: null,
      text: "4 Plätze, noch 2 frei. Ab 16 Jahren.",
    });
  });

  it("noch niemand eingetragen: fetter Satz davor", () => {
    expect(shiftStatusText(shift(3, 0, false, 18))).toEqual({
      emphasis: "Hier hat sich noch niemand eingetragen.",
      text: "3 Plätze frei. Ab 18 Jahren.",
    });
    expect(shiftStatusText(shift(1, 0)).text).toBe("1 Platz frei.");
  });

  it("voll besetzt (auch überbucht) und ein einzelner Platz", () => {
    expect(shiftStatusText(shift(5, 5)).text).toBe("5 Plätze, alle besetzt.");
    expect(shiftStatusText(shift(2, 3)).text).toBe("2 Plätze, alle besetzt.");
    expect(shiftStatusText(shift(1, 1)).text).toBe("1 Platz, besetzt.");
  });

  it("geschlossen: kein Aufruf, sondern der Hinweis auf den Veranstalter – auch wenn noch niemand drin ist", () => {
    const status = shiftStatusText(shift(4, 0, true));
    expect(status.emphasis).toBeNull();
    expect(status.text).toBe(
      "4 Plätze, noch 4 frei. Die Plätze vergibt der Veranstalter, bitte nicht selbst eintragen.",
    );
  });

  it("ohne Bedarf", () => {
    expect(shiftStatusText(shift(0, 0)).text).toBe("Für diese Schicht sind keine Helfer nötig.");
  });
});

describe("signUpHint / contactSentence", () => {
  it("nennt die Zahl der freien Plätze (Einzahl und Mehrzahl)", () => {
    expect(signUpHint([shift(4, 2), shift(3, 0)])).toBe(
      "Wer helfen kann, trägt sich bitte mit Vor- und Nachnamen in eine freie Zeile ein, eine Zeile pro Person. Es sind noch 5 Plätze frei.",
    );
    expect(signUpHint([shift(2, 1)])).toMatch(/Es ist noch 1 Platz frei\.$/);
  });

  it("nur noch Plätze in geschlossenen Schichten bzw. alles besetzt", () => {
    expect(signUpHint([shift(3, 1, true), shift(2, 2)])).toBe(
      "Die freien Plätze vergibt der Veranstalter, bitte nicht selbst eintragen.",
    );
    expect(signUpHint([shift(2, 2)])).toBe(
      "Alle Plätze sind besetzt. Vielen Dank an alle, die helfen.",
    );
  });

  it("Ansprechpartner mit Telefon und E-Mail der Veranstaltung; ohne Angaben kein Satz", () => {
    const none = { contactName: null, contactPhone: null, contactEmail: null };
    expect(contactSentence({ ...none, contactName: "Bernd Vorstand" })).toBe(
      "Fragen an Bernd Vorstand.",
    );
    expect(
      contactSentence({
        contactName: "Bernd Vorstand",
        contactPhone: "0170 1234567",
        contactEmail: "bernd@example.org",
      }),
    ).toBe("Fragen an Bernd Vorstand (Tel. 0170 1234567, bernd@example.org).");
    expect(contactSentence({ ...none, contactEmail: "info@example.org" })).toBe(
      "Fragen: info@example.org.",
    );
    expect(contactSentence(none)).toBeNull();
  });

  it("kein doppelter Punkt, wenn eine Angabe schon mit einem endet („e.V.“, „Lindenstr.“)", () => {
    expect(
      contactSentence({
        contactName: "Förderverein TSV e.V.",
        contactPhone: null,
        contactEmail: null,
      }),
    ).toBe("Fragen an Förderverein TSV e.V.");
    expect(endSentence("Treffpunkt: Parkplatz Lindenstr.")).toBe(
      "Treffpunkt: Parkplatz Lindenstr.",
    );
    expect(endSentence("Treffpunkt: Grillzelt")).toBe("Treffpunkt: Grillzelt.");
  });
});

describe("slotsOf", () => {
  it("erst die Namen, dann je freiem Platz eine leere Zeile; Überbuchte bleiben sichtbar", () => {
    expect(slotsOf({ requiredCount: 4, helperNames: ["Hans Helfer", "Laura Braun"] })).toEqual([
      "Hans Helfer",
      "Laura Braun",
      null,
      null,
    ]);
    expect(slotsOf({ requiredCount: 1, helperNames: ["A", "B"] })).toEqual(["A", "B"]);
    expect(slotsOf({ requiredCount: 0, helperNames: [] })).toEqual([]);
  });
});

describe("Tage und Zeiten (Berliner Zeit)", () => {
  // 03.10.2026 ist Sommerzeit (UTC+2): 22:00 UTC = 00:00 Uhr am 04.10. in Berlin.
  const start = new Date("2026-10-03T12:00:00Z");
  const event = (shiftStarts: string[]) => ({
    startsAt: start,
    shifts: shiftStarts.map((iso) => ({ startsAt: new Date(iso) })),
  });

  it("Schichten an einem anderen Berliner Tag als die Veranstaltung (auch wenn in UTC noch derselbe)", () => {
    expect(shiftsSpanDays(event(["2026-10-03T07:00:00Z", "2026-10-03T21:59:00Z"]))).toBe(false);
    expect(shiftsSpanDays(event(["2026-10-03T22:30:00Z"]))).toBe(true);
  });

  it("mehrtägige Veranstaltung", () => {
    expect(eventSpansDays({ startsAt: start, endsAt: new Date("2026-10-03T21:59:00Z") })).toBe(
      false,
    );
    expect(eventSpansDays({ startsAt: start, endsAt: new Date("2026-10-03T22:00:00Z") })).toBe(
      true,
    );
  });

  it("Zeit der Schicht, über Mitternacht mit Tag", () => {
    expect(
      shiftTimeText({
        startsAt: new Date("2026-10-03T10:00:00Z"),
        endsAt: new Date("2026-10-03T13:00:00Z"),
      }),
    ).toBe("12:00 – 15:00 Uhr");
    expect(
      shiftEndLabel({
        startsAt: new Date("2026-10-03T19:00:00Z"),
        endsAt: new Date("2026-10-04T00:30:00Z"),
      }),
    ).toBe("So., 04.10. 02:30");
  });

  it("Datum und Uhrzeit der Veranstaltung: ein Tag, ganztägig, mehrtägig", () => {
    const end = new Date("2026-10-03T20:00:00Z");
    expect(eventWhenText({ startsAt: start, endsAt: end, allDay: false })).toBe(
      "Samstag, 3. Oktober 2026, 14:00 – 22:00 Uhr",
    );
    expect(eventWhenText({ startsAt: start, endsAt: end, allDay: true })).toBe(
      "Samstag, 3. Oktober 2026, ganztägig",
    );
    const later = new Date("2026-10-04T16:00:00Z");
    expect(eventWhenText({ startsAt: start, endsAt: later, allDay: false })).toBe(
      "Samstag, 3. Oktober 2026, 14:00 Uhr bis Sonntag, 4. Oktober 2026, 18:00 Uhr",
    );
    expect(eventWhenText({ startsAt: start, endsAt: later, allDay: true })).toBe(
      "Samstag, 3. Oktober 2026 bis Sonntag, 4. Oktober 2026",
    );
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
