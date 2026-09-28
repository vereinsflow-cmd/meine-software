import { cn } from "@/lib/utils";

/**
 * Aussehen der Umschaltleisten – eine Quelle für alle: die Auswahlgruppe `SegmentedControl` und Leisten aus Links, die
 * die Ansicht über die Adresse wechseln (Kalender „Monat | Woche | Tag | Liste“, Benachrichtigungen, Meldungen, Aufgaben).
 * Die Leiste hebt sich mit einem feinen Rand vom Seitengrund ab; der gewählte Eintrag ist hell eine Kachel in Kartenfarbe
 * mit Schatten, dunkel die hellere Stufe (`bg-secondary`) – vorher war er hell kaum von der Leiste zu unterscheiden.
 * (Eigene Datei ohne „use client“, damit auch Server-Komponenten die Klassen nutzen können.)
 */
export const SEGMENT_BAR =
  "inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1 ring-1 ring-foreground/5 dark:ring-foreground/10";

export const SEGMENT_ITEM =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0";

export const SEGMENT_ITEM_ACTIVE = "bg-card text-foreground shadow-sm dark:bg-secondary";

/** Klassen eines Eintrags der Leiste (gewählt oder nicht). */
export function segmentItem(active: boolean, className?: string): string {
  return cn(SEGMENT_ITEM, active && SEGMENT_ITEM_ACTIVE, className);
}
