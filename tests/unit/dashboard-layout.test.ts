import { describe, expect, it } from "vitest";
import {
  arrangeBlocks,
  parseDashboardLayout,
  segmentBlocks,
} from "@/modules/dashboard/layout-prefs";

const ALL = ["kennzahlen", "zahlungen", "aufgaben", "einsaetze", "benachrichtigungen"];

describe("Dashboard selbst einstellen", () => {
  it("ohne Einstellung: Standard-Reihenfolge, nur erlaubte Karten", () => {
    expect(arrangeBlocks("uebersicht", ["benachrichtigungen", "kennzahlen"])).toEqual({
      shown: ["kennzahlen", "benachrichtigungen"],
      hidden: [],
    });
  });

  it("eigene Reihenfolge und ausgeblendete Karten; neue Karten kommen ans Ende", () => {
    const prefs = { order: ["benachrichtigungen", "aufgaben", "kennzahlen"], hidden: ["aufgaben"] };
    expect(arrangeBlocks("uebersicht", ALL, prefs)).toEqual({
      shown: ["benachrichtigungen", "kennzahlen", "zahlungen", "einsaetze"],
      hidden: ["aufgaben"],
    });
    // Eine gespeicherte, aber nicht (mehr) erlaubte Karte taucht nicht auf
    expect(arrangeBlocks("uebersicht", ["kennzahlen"], prefs).shown).toEqual(["kennzahlen"]);
  });

  it("aufeinanderfolgende Karten derselben Gruppe stehen unter einer Überschrift", () => {
    expect(
      segmentBlocks("uebersicht", ["kennzahlen", "zahlungen", "aufgaben", "einsaetze"]),
    ).toEqual([
      { kind: "single", id: "kennzahlen" },
      { kind: "group", group: "finanzen", ids: ["zahlungen"] },
      { kind: "group", group: "fuer-dich", ids: ["aufgaben", "einsaetze"] },
    ]);
    // Dazwischen eine andere Gruppe: zwei Abschnitte „Für dich“
    expect(
      segmentBlocks("uebersicht", ["aufgaben", "zahlungen", "benachrichtigungen"]).map((s) =>
        s.kind === "group" ? s.group : s.id,
      ),
    ).toEqual(["fuer-dich", "finanzen", "fuer-dich"]);
  });

  it("liest gespeicherte Einstellungen tolerant: Unbekanntes fällt weg, Ungültiges ergibt die Standard-Ansicht", () => {
    expect(
      parseDashboardLayout({
        v: 1,
        tabs: { uebersicht: { order: ["aufgaben", "gibt-es-nicht", "aufgaben"], hidden: ["x"] } },
      }),
    ).toEqual({ v: 1, tabs: { uebersicht: { order: ["aufgaben"], hidden: [] } } });
    expect(parseDashboardLayout(null)).toBeNull();
    expect(parseDashboardLayout({ v: 2, tabs: {} })).toBeNull();
    expect(parseDashboardLayout("kaputt")).toBeNull();
  });
});
