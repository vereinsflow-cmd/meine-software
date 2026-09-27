import { describe, expect, it } from "vitest";
import {
  TASK_TAB_PARAMS,
  activeTaskTab,
  dueGroup,
  dueHint,
  groupByDue,
} from "@/modules/tasks/list-view";

describe("Aufgabenliste: Reiter", () => {
  it("erkennt den Reiter an den bisherigen Parametern – auch alte Links", () => {
    expect(activeTaskTab({})).toBe("offen");
    expect(activeTaskTab({ ansicht: "offen" })).toBe("offen");
    expect(activeTaskTab({ zustaendig: "me" })).toBe("mir");
    expect(activeTaskTab({ zustaendig: "none" })).toBe("niemand");
    expect(activeTaskTab({ ueberfaellig: "1" })).toBe("ueberfaellig");
    expect(activeTaskTab({ ansicht: "erledigt" })).toBe("erledigt");
    expect(activeTaskTab({ ansicht: "alle" })).toBe("alle"); // „Aufgaben zu dieser Veranstaltung“
    // Alte Kombinationen: der speziellere Reiter gewinnt.
    expect(activeTaskTab({ zustaendig: "me", ueberfaellig: "1" })).toBe("ueberfaellig");
    expect(activeTaskTab({ ansicht: "erledigt", zustaendig: "me" })).toBe("erledigt");
  });

  it("jeder Reiter setzt alle drei Parameter, damit ein Wechsel die übrigen zurücksetzt – und passt zu sich selbst", () => {
    for (const [tab, params] of Object.entries(TASK_TAB_PARAMS)) {
      expect(Object.keys(params).sort()).toEqual(["ansicht", "ueberfaellig", "zustaendig"]);
      const set = Object.fromEntries(Object.entries(params).filter(([, value]) => value));
      expect(activeTaskTab(set)).toBe(tab);
    }
  });
});

describe("Aufgabenliste: Gruppen nach Frist", () => {
  const task = (dueInDays: number | null, status: "OPEN" | "DONE" | "BLOCKED" = "OPEN") => ({
    status,
    dueInDays,
  });

  it("überfällig, nächste 7 Tage (inklusive heute), später, ohne Datum, erledigt", () => {
    expect(dueGroup(task(-1))).toBe("ueberfaellig");
    expect(dueGroup(task(0))).toBe("bald");
    expect(dueGroup(task(7))).toBe("bald");
    expect(dueGroup(task(8))).toBe("spaeter");
    expect(dueGroup(task(null))).toBe("ohne");
    expect(dueGroup(task(-30, "BLOCKED"))).toBe("ueberfaellig");
    expect(dueGroup(task(-30, "DONE"))).toBe("erledigt"); // Erledigtes ist nie überfällig
  });

  it("ordnet in fester Reihenfolge, lässt leere Gruppen weg und behält die Reihenfolge innerhalb", () => {
    const tasks = [
      { id: "a", ...task(20) },
      { id: "b", ...task(null) },
      { id: "c", ...task(-2) },
      { id: "d", ...task(3) },
      { id: "e", ...task(1) },
    ];
    expect(
      groupByDue(tasks).map((group) => [group.label, group.tasks.map((entry) => entry.id)]),
    ).toEqual([
      ["Überfällig", ["c"]],
      ["Nächste 7 Tage", ["d", "e"]],
      ["Später", ["a"]],
      ["Ohne Datum", ["b"]],
    ]);
    expect(groupByDue([])).toEqual([]);
  });
});

describe("Aufgabenliste: Fristhinweis", () => {
  it("nennt nahe Fristen in Worten, ferne gar nicht", () => {
    expect(dueHint(0, false)).toBe("heute");
    expect(dueHint(1, false)).toBe("morgen");
    expect(dueHint(5, false)).toBe("in 5 Tagen");
    expect(dueHint(14, false)).toBe("in 14 Tagen");
    expect(dueHint(15, false)).toBeNull();
  });

  it("sagt, wie lange eine Frist schon überschritten ist – aber nicht bei Erledigtem oder ohne Frist", () => {
    expect(dueHint(-1, false)).toBe("seit gestern überfällig");
    expect(dueHint(-4, false)).toBe("seit 4 Tagen überfällig");
    expect(dueHint(-4, true)).toBeNull();
    expect(dueHint(null, false)).toBeNull();
  });
});
