import { describe, expect, it } from "vitest";
import {
  hoursCompare,
  memberCompare,
  nextEventCompare,
  staffingCompare,
} from "@/modules/dashboard/compare";

describe("memberCompare (Mitglieder-Kennzahlenkarte)", () => {
  it("Zuwachs: „+N gegenüber dem Vormonat“, Ton „success“", () => {
    expect(memberCompare([20, 22, 25])).toEqual({
      text: "+3 gegenüber dem Vormonat",
      tone: "success",
    });
  });

  it("Rückgang: mit Minuszeichen, aber kein Alarm-Ton (nur „neutral“, kein Fehler)", () => {
    expect(memberCompare([25, 23])).toEqual({ text: "-2 gegenüber dem Vormonat", tone: "neutral" });
  });

  it("unverändert: eigener Satz statt „+0“", () => {
    expect(memberCompare([25, 25])).toEqual({
      text: "Unverändert gegenüber dem Vormonat",
      tone: "neutral",
    });
  });

  it("unter zwei Werten gibt es nichts zu vergleichen", () => {
    expect(memberCompare([25])).toBeNull();
    expect(memberCompare([])).toBeNull();
  });
});

describe("hoursCompare (Helferstunden-Kennzahlenkarte)", () => {
  it("Prozent gegenüber der Vorwoche, wenn diese nicht 0 war", () => {
    expect(hoursCompare([10, 10, 11.2])).toEqual({
      text: "+12 % gegenüber letzter Woche",
      tone: "success",
    });
  });

  it("Rückgang in Prozent, kein Alarm-Ton", () => {
    expect(hoursCompare([10, 8])).toEqual({
      text: "-20 % gegenüber letzter Woche",
      tone: "neutral",
    });
  });

  it("war die Vorwoche 0 Std., wären Prozente irreführend – stattdessen die absolute Zunahme", () => {
    expect(hoursCompare([0, 2.5])).toEqual({
      text: "+2,5 Std. gegenüber letzter Woche",
      tone: "success",
    });
  });

  it("0 Std. in beiden Wochen: eigener Hinweis statt „0 % gegenüber …“", () => {
    expect(hoursCompare([0, 0])).toEqual({ text: "Noch keine Stunden erfasst", tone: "neutral" });
  });

  it("unverändert (ungleich 0): eigener Satz statt „0 %“", () => {
    expect(hoursCompare([5, 5])).toEqual({
      text: "Unverändert gegenüber letzter Woche",
      tone: "neutral",
    });
  });

  it("unter zwei Werten gibt es nichts zu vergleichen", () => {
    expect(hoursCompare([5])).toBeNull();
  });
});

describe("staffingCompare (Freie-Helferplätze-Kennzahlenkarte)", () => {
  it("teilweise besetzt: Ton „warning“ wie bei einzelnen Schichten", () => {
    expect(staffingCompare(35, 50)).toEqual({
      text: "35 von 50 Schichten besetzt",
      tone: "warning",
    });
  });

  it("voll besetzt: Ton „success“", () => {
    expect(staffingCompare(50, 50)).toEqual({
      text: "50 von 50 Schichten besetzt",
      tone: "success",
    });
  });

  it("unbesetzt: Ton „danger“ (wie die Ampel einer leeren Schicht anderswo im Verein)", () => {
    expect(staffingCompare(0, 10)).toEqual({ text: "0 von 10 Schichten besetzt", tone: "danger" });
  });

  it("keine Schichten geplant: eigener, neutraler Satz statt „0 von 0“", () => {
    expect(staffingCompare(0, 0)).toEqual({ text: "Keine Schichten geplant", tone: "neutral" });
  });
});

describe("nextEventCompare (Termine-Kennzahlenkarte)", () => {
  it("nennt den Abstand in Tagen, neutral (kein Auf/Ab)", () => {
    expect(nextEventCompare(4)).toEqual({ text: "Nächster Termin in 4 Tagen", tone: "neutral" });
    expect(nextEventCompare(1)).toEqual({ text: "Nächster Termin morgen", tone: "neutral" });
    expect(nextEventCompare(0)).toEqual({ text: "Nächster Termin heute", tone: "neutral" });
  });

  it("ohne kommenden Termin gibt es nichts zu vergleichen", () => {
    expect(nextEventCompare(null)).toBeNull();
  });
});
