import { describe, expect, it } from "vitest";
import { rankResults, recordUsage } from "@/lib/search/ranking";
import type { RecentUsageEntry, SearchResultItem } from "@/lib/search/types";

const items: SearchResultItem[] = [
  { id: "a", category: "seiten", title: "Alpha", href: "/a", iconKey: "dokument" },
  { id: "b", category: "seiten", title: "Beta", href: "/b", iconKey: "dokument" },
  { id: "c", category: "seiten", title: "Gamma", href: "/c", iconKey: "dokument" },
];

describe("rankResults", () => {
  it("ohne Suchtext stehen häufig genutzte Einträge zuerst (bei Gleichstand: zuletzt genutzt zuerst)", () => {
    const usage: RecentUsageEntry[] = [
      { id: "b", count: 3, lastUsedAt: 100 },
      { id: "a", count: 1, lastUsedAt: 50 },
    ];
    expect(rankResults(items, usage, "", 1000).map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("unbenutzte Einträge behalten ohne Suchtext ihre ursprüngliche Reihenfolge", () => {
    expect(rankResults(items, [], "", 1000).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("mit Suchtext gewinnt ein genauer Titel-Treffer gegen einen schwachen, aber häufig genutzten Treffer", () => {
    const query = "Mitglied hinzufügen";
    const candidates: SearchResultItem[] = [
      {
        id: "exact",
        category: "aktionen",
        title: "Mitglied hinzufügen",
        href: "/mitglieder/neu",
        iconKey: "plus",
      },
      {
        id: "weak",
        category: "seiten",
        title: "Xy Mitglied hinzufügen Za",
        href: "/irgendwo",
        iconKey: "dokument",
      },
    ];
    const usage: RecentUsageEntry[] = [{ id: "weak", count: 10, lastUsedAt: 999 }];
    expect(rankResults(candidates, usage, query, 1000)[0]?.id).toBe("exact");
  });

  it("blendet Einträge ohne Treffer aus", () => {
    expect(rankResults(items, [], "passt-zu-nichts", 1000)).toEqual([]);
  });
});

describe("recordUsage", () => {
  it("legt einen neuen Eintrag mit Zähler 1 an", () => {
    expect(recordUsage([], "action:x", 100)).toEqual([
      { id: "action:x", count: 1, lastUsedAt: 100 },
    ]);
  });

  it("erhöht den Zähler bei erneuter Nutzung und aktualisiert den Zeitpunkt", () => {
    const first = recordUsage([], "action:x", 100);
    const second = recordUsage(first, "action:x", 200);
    expect(second).toEqual([{ id: "action:x", count: 2, lastUsedAt: 200 }]);
  });

  it("behält höchstens die 20 zuletzt genutzten Einträge (der älteste fällt heraus)", () => {
    let state: RecentUsageEntry[] = [];
    for (let i = 0; i < 21; i += 1) {
      state = recordUsage(state, `action:${i}`, i);
    }
    expect(state).toHaveLength(20);
    expect(state.some((entry) => entry.id === "action:0")).toBe(false);
    expect(state.some((entry) => entry.id === "action:20")).toBe(true);
  });
});
