import { describe, expect, it } from "vitest";
import {
  IDLE_WARNING_MS,
  formatCountdown,
  idleLoginUrl,
  idlePingInterval,
  idleStep,
} from "@/lib/idle-session";

/** Automatische Abmeldung wegen Inaktivität (`IdleLogout`): Zeitplan, Countdown und Rücksprung nach der Anmeldung. */
const MINUTE = 60_000;

describe("Hinweis vor der automatischen Abmeldung", () => {
  it("erscheint zwei Minuten vor dem Ende, das der Server nennt – vorher fragt die Seite dann erneut nach", () => {
    expect(IDLE_WARNING_MS).toBe(2 * MINUTE);
    expect(idleStep(60 * MINUTE)).toEqual({ warn: false, askAgainInMs: 58 * MINUTE });
    expect(idleStep(2 * MINUTE + 1)).toEqual({ warn: false, askAgainInMs: 1 });
  });

  it("in den letzten zwei Minuten: Hinweis zeigen und zum Ende erneut nachfragen", () => {
    expect(idleStep(2 * MINUTE)).toEqual({ warn: true, askAgainInMs: 2 * MINUTE });
    expect(idleStep(45_000)).toEqual({ warn: true, askAgainInMs: 45_000 });
    expect(idleStep(0)).toEqual({ warn: true, askAgainInMs: 0 });
    expect(idleStep(-5)).toEqual({ warn: true, askAgainInMs: 0 });
  });

  it("Bedienung geht höchstens alle 5 Minuten an den Server, bei kurzer Frist öfter – nie erst nach dem Hinweis", () => {
    expect(idlePingInterval(60)).toBe(5 * MINUTE);
    expect(idlePingInterval(25)).toBe(5 * MINUTE);
    expect(idlePingInterval(10)).toBe(2 * MINUTE);
    expect(idlePingInterval(5)).toBe(MINUTE);
    // Wer ständig arbeitet, sieht den Hinweis nie: Zwischen zwei Meldungen bleibt bis zum Hinweis Zeit (mit einer Minute
    // Spielraum, weil der Server die letzte Aktivität höchstens einmal pro Minute speichert).
    for (const minutes of [5, 10, 15, 30, 60, 1440]) {
      expect(idlePingInterval(minutes) + MINUTE).toBeLessThan(minutes * MINUTE - IDLE_WARNING_MS);
    }
  });

  it("Countdown in Minuten und Sekunden, aufgerundet", () => {
    expect(formatCountdown(2 * MINUTE)).toBe("2:00");
    expect(formatCountdown(119_001)).toBe("2:00");
    expect(formatCountdown(119_000)).toBe("1:59");
    expect(formatCountdown(9_500)).toBe("0:10");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-1_000)).toBe("0:00");
  });
});

describe("Anmeldung nach der automatischen Abmeldung", () => {
  it("führt zurück zur Seite, auf der man war – samt Suchparametern", () => {
    expect(idleLoginUrl("/kalender")).toBe("/anmelden?expired=1&next=%2Fkalender");
    expect(idleLoginUrl("/finanzen/kassenbuch?konto=bar")).toBe(
      "/anmelden?expired=1&next=%2Ffinanzen%2Fkassenbuch%3Fkonto%3Dbar",
    );
  });

  it("nur interne Pfade (Schutz vor offenen Weiterleitungen) – sonst ohne Rücksprung", () => {
    for (const path of [
      "//boese.example",
      "/\\boese.example",
      "https://boese.example",
      "/anmelden",
    ]) {
      expect(idleLoginUrl(path)).toBe("/anmelden?expired=1");
    }
  });
});
