import type { SearchResultItem } from "./types";

const UMLAUT_MAP: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** Kleinschreibung, Umlaute zu ae/oe/ue/ss und übrige Diakritika entfernt – "München" und "Muenchen" gleichen sich an. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, (ch) => UMLAUT_MAP[ch] ?? ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Bewertet, wie gut `query` zu `item` passt: 0 = kein Treffer, sonst höher = besser (exakter Titel
 * > Titel beginnt damit > Wortanfang im Titel > Titel enthält es > Suchbegriff-Treffer > Beschreibung
 * enthält es). Reine Funktion ohne DOM-Zugriff – einzeln testbar.
 */
export function scoreMatch(query: string, item: SearchResultItem): number {
  const q = normalize(query.trim());
  if (!q) return 1;

  const title = normalize(item.title);
  const description = item.description ? normalize(item.description) : "";
  const keywords = (item.keywords ?? []).map(normalize);

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (new RegExp(`(^|\\s)${escapeRegExp(q)}`).test(title)) return 65;
  if (title.includes(q)) return 50;
  if (keywords.some((keyword) => keyword === q)) return 45;
  if (keywords.some((keyword) => keyword.includes(q))) return 35;
  if (description.includes(q)) return 20;
  return 0;
}
