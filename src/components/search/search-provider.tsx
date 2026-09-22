"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { rankResults } from "@/lib/search/ranking";
import { readRecentUsage, recordUsage } from "@/lib/search/recent-store";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/search/types";
import type { RecentUsageEntry, SearchGroup, SearchResultItem } from "@/lib/search/types";
import { searchEntitiesAction } from "@/modules/search/actions";

const ENTITY_SEARCH_DEBOUNCE_MS = 150;
const ENTITY_SEARCH_MIN_QUERY_LENGTH = 2;

export interface UseCommandPalette {
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  groups: SearchGroup[];
  isSearchingEntities: boolean;
  select: (item: SearchResultItem) => void;
}

const SearchContext = React.createContext<UseCommandPalette | null>(null);

/** Zugriff auf die zentrale Suche (öffnen/schließen, Eingabe, Ergebnisse, Auswahl) – nur innerhalb von SearchProvider. */
export function useCommandPalette(): UseCommandPalette {
  const ctx = React.useContext(SearchContext);
  if (!ctx)
    throw new Error("useCommandPalette muss innerhalb von SearchProvider verwendet werden.");
  return ctx;
}

function groupByCategory(items: SearchResultItem[]): SearchGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}

/**
 * Stellt die zentrale Suche für den angemeldeten Bereich bereit: hält Offen-Zustand, Eingabe und
 * Ergebnisse, hört global auf Strg/⌘+K. `staticEntries` kommt bereits berechtigungsgeprüft vom
 * Server (AppLayout); Mitglieder/Veranstaltungen/Dokumente werden bei Eingabe (ab 2 Zeichen, mit
 * kurzer Verzögerung) über eine Server Action nachgeladen.
 */
export function SearchProvider({
  staticEntries,
  children,
}: {
  staticEntries: SearchResultItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpenState] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [recent, setRecent] = React.useState<RecentUsageEntry[]>([]);
  const [entityResults, setEntityResults] = React.useState<SearchResultItem[]>([]);
  const [isSearchingEntities, setIsSearchingEntities] = React.useState(false);
  const requestIdRef = React.useRef(0);
  // Der Auslöser (Kopfzeile) liegt außerhalb des Dialog-Baums (mehrere mögliche Auslöser: Klick auf
  // die Schaltfläche, Strg/⌘+K von irgendwo). Radix' eigene Fokus-Rückgabe kennt daher nicht
  // zuverlässig das richtige Element – wir merken es uns selbst und stellen es beim Schließen wieder her.
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  const setOpen = React.useCallback((next: boolean) => {
    if (next) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setEntityResults([]);
      setRecent(readRecentUsage());
    }
    setOpenState(next);
    if (!next) {
      // Erst nach dem Aushängen des Dialogs (samt Radix-Fokusfalle) fokussieren, sonst greift die
      // Falle noch und wirft den Fokus sofort wieder zurück in den (bereits schließenden) Dialog.
      requestAnimationFrame(() => previouslyFocusedRef.current?.focus());
    }
  }, []);

  // Strg/⌘+K öffnet bzw. schließt unabhängig vom Fokus (kein anderes Element belegt diese Kombination,
  // siehe Vorab-Recherche); Esc schließt bereits über den Dialog selbst (Radix).
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  // Synchronisiert die Ergebnisse aus der Datenbank mit der Eingabe (externes System, verzögerter
  // Netzwerkabruf) – die setState-Aufrufe hier sind der vorgesehene Fall, kein vermeidbarer Effekt.
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < ENTITY_SEARCH_MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntityResults([]);
      setIsSearchingEntities(false);
      return;
    }
    setIsSearchingEntities(true);
    const requestId = ++requestIdRef.current;
    const timeout = setTimeout(() => {
      void searchEntitiesAction(trimmed).then((result) => {
        if (requestId !== requestIdRef.current) return; // veraltete Antwort einer früheren Eingabe
        if (result.ok) {
          setEntityResults([
            ...result.data.mitglieder,
            ...result.data.veranstaltungen,
            ...result.data.dokumente,
          ]);
        }
        setIsSearchingEntities(false);
      });
    }, ENTITY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const rankedStatic = React.useMemo(
    () => rankResults(staticEntries, recent, query),
    [staticEntries, recent, query],
  );
  const groups = React.useMemo(
    () => groupByCategory([...rankedStatic, ...entityResults]),
    [rankedStatic, entityResults],
  );

  const select = React.useCallback(
    (item: SearchResultItem) => {
      if (item.id.startsWith("action:") || item.id.startsWith("page:")) {
        setRecent(recordUsage(item.id));
      }
      setOpen(false);
      router.push(item.href);
    },
    [router, setOpen],
  );

  const value = React.useMemo<UseCommandPalette>(
    () => ({ open, setOpen, query, setQuery, groups, isSearchingEntities, select }),
    [open, setOpen, query, groups, isSearchingEntities, select],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}
