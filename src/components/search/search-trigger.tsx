"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommandPalette } from "./search-provider";

/** Suchfeld-Schaltfläche im Kopfbereich: volle Pille ab `sm`, reines Symbol darunter (siehe MobileNav). */
export function SearchTrigger() {
  const { setOpen } = useCommandPalette();
  const [shortcut, setShortcut] = React.useState("Strg K");

  React.useEffect(() => {
    // Echte Synchronisation mit einer browserseitigen, serverseitig nicht lesbaren Angabe (kein aus
    // Props/State ableitbarer Zustand) – die einmalige setState-Zuweisung beim Einhängen ist hier der
    // vorgesehene Fall (siehe sidebar-collapse.tsx für dasselbe Muster).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)) setShortcut("⌘K");
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={`Suche öffnen (${shortcut})`}
        className="hidden h-9 w-full max-w-sm items-center justify-start gap-2.5 px-3 font-normal text-muted-foreground shadow-none sm:flex"
      >
        <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Suchen …</span>
        <span
          aria-hidden="true"
          className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {shortcut}
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Suche öffnen"
        className="sm:hidden"
      >
        <SearchIcon />
      </Button>
    </>
  );
}
