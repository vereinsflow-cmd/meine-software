import { describe, expect, it } from "vitest";
import {
  arrangeBlocks,
  blockSize,
  initialRows,
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

  it("Größe je Karte: nur Klein/Groß werden gespeichert, Unbekanntes fällt weg, ohne Angabe gilt Mittel", () => {
    const layout = parseDashboardLayout({
      v: 1,
      tabs: {
        uebersicht: {
          order: [],
          hidden: [],
          sizes: {
            kennzahlen: "s",
            aufgaben: "l",
            einsaetze: "m",
            "gibt-es-nicht": "l",
            zahlungen: "xl",
          },
        },
      },
    });
    expect(layout).toEqual({
      v: 1,
      tabs: { uebersicht: { order: [], hidden: [], sizes: { kennzahlen: "s", aufgaben: "l" } } },
    });
    const prefs = layout!.tabs.uebersicht;
    expect(blockSize(prefs, "kennzahlen")).toBe("s");
    expect(blockSize(prefs, "aufgaben")).toBe("l");
    expect(blockSize(prefs, "einsaetze")).toBe("m");
    expect(blockSize(undefined, "aufgaben")).toBe("m");
    // Ältere Einstellungen ohne Größen bleiben gültig und bekommen kein leeres Feld dazu
    expect(
      parseDashboardLayout({ v: 1, tabs: { termine: { order: ["schichten"], hidden: [] } } }),
    ).toEqual({ v: 1, tabs: { termine: { order: ["schichten"], hidden: [] } } });
  });

  it("Listenkarten zeigen klein einen Eintrag weniger, groß zwei mehr – nie weniger als einen", () => {
    expect(initialRows("s", 3)).toBe(2);
    expect(initialRows("m", 3)).toBe(3);
    expect(initialRows("l", 3)).toBe(5);
    expect(initialRows("s", 1)).toBe(1);
  });
});
