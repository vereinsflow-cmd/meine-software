import type { PermissionKey } from "@/server/permissions/catalog";
import type { SearchIconKey } from "./icon-map";

/**
 * Typen für die zentrale Suche (Strg/⌘+K): Aktionen, Seiten und die durchsuchbaren Datensätze
 * (Mitglieder, Veranstaltungen, Dokumente). Reine Typen ohne Datenbankzugriff – dürfen deshalb
 * auch im Browser-Code importiert werden.
 */
export type SearchCategory = "aktionen" | "seiten" | "mitglieder" | "veranstaltungen" | "dokumente";

export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  aktionen: "Aktionen",
  seiten: "Seiten",
  mitglieder: "Mitglieder",
  veranstaltungen: "Veranstaltungen",
  dokumente: "Dokumente",
};

/** Reihenfolge, in der die Ergebnisgruppen angezeigt werden. */
export const CATEGORY_ORDER: SearchCategory[] = [
  "aktionen",
  "seiten",
  "mitglieder",
  "veranstaltungen",
  "dokumente",
];

/** Ein einzelnes, bereits berechtigungsgeprüftes Suchergebnis. */
export interface SearchResultItem {
  /** Eindeutig je Eintrag, z. B. "action:mitglied-hinzufuegen" oder "member:<id>". */
  id: string;
  category: SearchCategory;
  title: string;
  description?: string;
  href: string;
  /** Schlüssel in ICON_MAP (src/lib/search/icon-map.tsx) – kein React-Knoten, bleibt serialisierbar. */
  iconKey: SearchIconKey;
  /** Zusätzliche Suchbegriffe (Synonyme), z. B. ["csv", "import"]. */
  keywords?: string[];
}

export interface SearchGroup {
  category: SearchCategory;
  label: string;
  items: SearchResultItem[];
}

/** Katalogeintrag vor der Berechtigungsprüfung – reine Daten, kein JSX. */
export interface StaticRegistryEntry {
  id: string;
  category: Extract<SearchCategory, "aktionen" | "seiten">;
  title: string;
  description: string;
  href: string;
  /** Wie bei SearchResultItem; Seiten tragen das Symbol ihres Bereichs (dasselbe wie in der Seitenleiste). */
  iconKey: SearchIconKey;
  /** Ohne Angabe: für jedes angemeldete Vereinsmitglied sichtbar. */
  permission?: PermissionKey;
  /** Wie NavDefinition.notOwnOnly (nav.tsx): bei reiner OWN-Reichweite nicht sichtbar. */
  notOwnOnly?: boolean;
  /** Nur für Superadministratoren (siehe requirePlatformAdminPage). */
  platformAdminOnly?: boolean;
  keywords?: string[];
}

export interface EntitySearchResult {
  mitglieder: SearchResultItem[];
  veranstaltungen: SearchResultItem[];
  dokumente: SearchResultItem[];
}

/** In localStorage gespeicherte Nutzung einer Aktion/Seite (siehe recent-store.ts). */
export interface RecentUsageEntry {
  id: string;
  count: number;
  lastUsedAt: number;
}
