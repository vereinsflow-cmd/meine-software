import { describe, expect, it } from "vitest";
import { scoreMatch } from "@/lib/search/fuzzy";
import type { SearchResultItem } from "@/lib/search/types";

const item = (overrides: Partial<SearchResultItem> = {}): SearchResultItem => ({
  id: "action:mitglied-hinzufuegen",
  category: "aktionen",
  title: "Mitglied hinzufügen",
  description: "Neues Mitglied anlegen",
  href: "/mitglieder/neu",
  iconKey: "plus",
  keywords: ["neu", "anlegen"],
  ...overrides,
});

describe("scoreMatch", () => {
  it("ein exakter Titel-Treffer erhält die höchste Bewertung", () => {
    expect(scoreMatch("Mitglied hinzufügen", item())).toBe(100);
  });

  it("ein Präfix-Treffer wird höher bewertet als ein Treffer mitten im Wort", () => {
    const prefix = scoreMatch("Mitglied", item());
    const middle = scoreMatch("glied", item()); // mitten in "Mitglied", kein Wortanfang
    expect(prefix).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(0);
  });

  it("ein Treffer am Wortanfang (nicht am Titelanfang) wird höher bewertet als mitten im Wort", () => {
    const wordStart = scoreMatch("hinzufügen", item());
    const middle = scoreMatch("glied", item());
    expect(wordStart).toBeGreaterThan(middle);
  });

  it("ist Groß-/Kleinschreibung egal", () => {
    expect(scoreMatch("MITGLIED HINZUFÜGEN", item())).toBe(100);
  });

  it("findet Umlaute auch ohne Umlaut-Schreibweise (und umgekehrt)", () => {
    const target = item({ title: "Prüfung", description: undefined, keywords: undefined });
    expect(scoreMatch("pruefung", target)).toBe(100);
    expect(
      scoreMatch(
        "Prüfung",
        item({ title: "pruefung", description: undefined, keywords: undefined }),
      ),
    ).toBe(100);
  });

  it("Suchbegriffe (keywords) tragen zum Treffer bei, auch wenn der Titel nicht passt", () => {
    const importItem = item({
      title: "Mitglieder importieren",
      keywords: ["csv", "import"],
    });
    expect(scoreMatch("csv", importItem)).toBeGreaterThan(0);
  });

  it("ein Treffer nur in der Beschreibung zählt weniger als ein Titel- oder Suchbegriff-Treffer", () => {
    const target = item({
      title: "Etwas anderes",
      description: "betrifft das Mitglied",
      keywords: [],
    });
    const descriptionScore = scoreMatch("mitglied", target);
    expect(descriptionScore).toBeGreaterThan(0);
    expect(descriptionScore).toBeLessThan(scoreMatch("Mitglied", item()));
  });

  it("kein Treffer ergibt 0", () => {
    expect(
      scoreMatch(
        "xyz123",
        item({ title: "Dashboard", description: undefined, keywords: undefined }),
      ),
    ).toBe(0);
  });

  it("eine leere Anfrage ergibt für jeden Eintrag einen (positiven) Basiswert", () => {
    expect(scoreMatch("", item())).toBeGreaterThan(0);
    expect(scoreMatch("   ", item())).toBeGreaterThan(0);
  });
});
