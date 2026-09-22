"use client";

import { recordUsage as recordUsagePure } from "./ranking";
import type { RecentUsageEntry } from "./types";

const STORAGE_KEY = "vf:search-recent";

function isRecentUsageEntry(value: unknown): value is RecentUsageEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.count === "number" &&
    typeof entry.lastUsedAt === "number"
  );
}

/** Liest den Nutzungsverlauf der Suche aus localStorage – leer, wenn keiner besteht oder kein Zugriff möglich ist. */
export function readRecentUsage(): RecentUsageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentUsageEntry) : [];
  } catch {
    // z. B. privates Fenster ohne Speicherzugriff – die Suche merkt sich die Nutzung dann nicht.
    return [];
  }
}

/** Verbucht eine Nutzung und schreibt sie zurück; gibt den neuen Stand zurück (auch wenn das Schreiben fehlschlägt). */
export function recordUsage(id: string): RecentUsageEntry[] {
  const next = recordUsagePure(readRecentUsage(), id, Date.now());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // s. o.
  }
  return next;
}
