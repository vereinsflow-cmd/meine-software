"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ResultIcon } from "@/lib/search/icon-map";
import { useCommandPalette } from "./search-provider";

/** Die eigentliche Strg/⌘+K-Suche: wird einmal im Anwendungsrahmen gerendert (siehe AppLayout). */
export function CommandPalette() {
  const { open, setOpen, query, setQuery, groups, isSearchingEntities, select } =
    useCommandPalette();
  const trimmedQuery = query.trim();
  const hasResults = groups.some((group) => group.items.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} loop>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Suchen … (z. B. „Mitglied hinzufügen“)"
        aria-label="Suchen"
      />
      {isSearchingEntities && trimmedQuery.length >= 2 && (
        <p
          className="px-4 pt-2 text-xs text-muted-foreground motion-safe:animate-pulse"
          role="status"
        >
          Suche …
        </p>
      )}
      <CommandList aria-label="Suchergebnisse">
        {!hasResults && (
          <CommandEmpty>
            {trimmedQuery
              ? `Keine Ergebnisse für „${trimmedQuery}“ gefunden.`
              : "Keine Ergebnisse gefunden."}
          </CommandEmpty>
        )}
        {groups.map((group) => (
          <CommandGroup key={group.category} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem key={item.id} value={item.id} onSelect={() => select(item)}>
                <ResultIcon iconKey={item.iconKey} className="text-muted-foreground" />
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate">{item.title}</span>
                  {item.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
