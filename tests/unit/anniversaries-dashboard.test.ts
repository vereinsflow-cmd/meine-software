import { describe, expect, it } from "vitest";
import {
  DASHBOARD_BLOCKS,
  arrangeBlocks,
  blockLabel,
  parseDashboardLayout,
  segmentBlocks,
} from "@/modules/dashboard/layout-prefs";

describe("Dashboard-Karte „Jubiläen“", () => {
  it("steht im Reiter „Mitglieder“ nach den Geburtstagen, unter derselben Überschrift „Anstehend“", () => {
    expect(DASHBOARD_BLOCKS.mitglieder.map((block) => block.id)).toEqual([
      "geburtstage",
      "jubilaeen",
      "auswertungen",
    ]);
    expect(blockLabel("mitglieder", "jubilaeen")).toBe("Jubiläen");
    expect(segmentBlocks("mitglieder", ["geburtstage", "jubilaeen", "auswertungen"])).toEqual([
      { kind: "group", group: "geburtstage", ids: ["geburtstage", "jubilaeen"] },
      { kind: "single", id: "auswertungen" },
    ]);
  });

  it("lässt sich über „Anpassen“ ausblenden; ältere Einstellungen ohne die Karte bleiben gültig", () => {
    const layout = parseDashboardLayout({
      v: 1,
      tabs: { mitglieder: { order: ["auswertungen", "geburtstage"], hidden: ["jubilaeen"] } },
    });
    expect(layout?.tabs.mitglieder).toEqual({
      order: ["auswertungen", "geburtstage"],
      hidden: ["jubilaeen"],
    });
    expect(
      arrangeBlocks(
        "mitglieder",
        ["geburtstage", "jubilaeen", "auswertungen"],
        layout!.tabs.mitglieder,
      ),
    ).toEqual({ shown: ["auswertungen", "geburtstage"], hidden: ["jubilaeen"] });

    // Gespeichert, bevor es die Karte gab: Sie erscheint am Ende ihres Reiters.
    expect(
      arrangeBlocks("mitglieder", ["geburtstage", "jubilaeen", "auswertungen"], {
        order: ["auswertungen", "geburtstage"],
        hidden: [],
      }).shown,
    ).toEqual(["auswertungen", "geburtstage", "jubilaeen"]);
  });

  it("ohne Recht (die Seite reicht die Karte nicht herein) gibt es sie nicht", () => {
    expect(arrangeBlocks("mitglieder", ["geburtstage", "auswertungen"]).shown).toEqual([
      "geburtstage",
      "auswertungen",
    ]);
  });
});
