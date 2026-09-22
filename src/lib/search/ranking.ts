import { scoreMatch } from "./fuzzy";
import type { RecentUsageEntry, SearchResultItem } from "./types";

const MAX_RECENT_ENTRIES = 20;
const RECENT_BONUS_WINDOW_MS = 60 * 60 * 1000;

/** Verbucht eine Nutzung; behält höchstens die 20 zuletzt verwendeten Einträge. Reine Funktion (kein localStorage). */
export function recordUsage(
  state: RecentUsageEntry[],
  id: string,
  now: number,
): RecentUsageEntry[] {
  const existing = state.find((entry) => entry.id === id);
  const updated: RecentUsageEntry = { id, count: (existing?.count ?? 0) + 1, lastUsedAt: now };
  const rest = state.filter((entry) => entry.id !== id);
  return [updated, ...rest]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_RECENT_ENTRIES);
}

function usageOf(usage: RecentUsageEntry[], id: string): RecentUsageEntry | undefined {
  return usage.find((entry) => entry.id === id);
}

/**
 * Ordnet Ergebnisse: ohne Suchtext nach Nutzung (häufig/zuletzt verwendet zuerst, sonst
 * Katalogreihenfolge); mit Suchtext nach Textähnlichkeit, mit einem kleinen Bonus für häufig bzw.
 * kürzlich verwendete Einträge (bricht knappe Textunentschieden zugunsten der Gewohnheit).
 */
export function rankResults(
  items: SearchResultItem[],
  usage: RecentUsageEntry[],
  query: string,
  now: number = Date.now(),
): SearchResultItem[] {
  const trimmed = query.trim();

  if (!trimmed) {
    return [...items].sort((a, b) => {
      const ua = usageOf(usage, a.id);
      const ub = usageOf(usage, b.id);
      if (ua && !ub) return -1;
      if (!ua && ub) return 1;
      if (ua && ub) return ub.count - ua.count || ub.lastUsedAt - ua.lastUsedAt;
      return 0;
    });
  }

  return items
    .map((item) => {
      const base = scoreMatch(trimmed, item);
      if (base <= 0) return null;
      const used = usageOf(usage, item.id);
      const bonus = used
        ? Math.min(used.count, 5) * 2 + (now - used.lastUsedAt <= RECENT_BONUS_WINDOW_MS ? 3 : 0)
        : 0;
      return { item, score: base + bonus };
    })
    .filter((entry): entry is { item: SearchResultItem; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
