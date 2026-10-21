import Link from "next/link";
import { cn } from "@/lib/utils";

export interface FilterChip {
  /** Eindeutig innerhalb der Reihe (z. B. „kategorie:Satzung“) – Beschriftungen können sich doppeln. */
  key: string;
  label: string;
  /** Wie viele Einträge ein Klick zeigt. */
  count: number;
  href: string;
  active: boolean;
  /** Farbpunkt vor der Beschriftung (Hintergrundklasse, z. B. die Farbe der Kategorie) – rein schmückend. */
  dot?: string;
  /** Kleines Symbol vor der Beschriftung (statt eines Punkts), z. B. für eine andere Art von Filter. */
  icon?: React.ReactNode;
}

/**
 * Filter als runde Knöpfe mit Anzahl („Alle 12 · Protokolle 4 · Satzung 1“, seit 20.10.2026 auf der Dokumentenliste): Jeder
 * Knopf ist ein Link mit den Filtern in der Adresse – ohne Skript bedienbar, teilbar, mit der Zurück-Taste rückgängig. Ein Tipp
 * filtert, der gewählte ist dunkel gefüllt und trägt `aria-current="page"`. Zu viele für eine Zeile brechen in die nächste um;
 * eine Beschriftung, die allein nicht in die Zeile passt, endet mit „…“ (die Anzahl bleibt stehen).
 */
export function FilterChips({
  label,
  chips,
  className,
}: {
  /** Name der Gruppe für Screenreader („Nach Kategorie filtern“). */
  label: string;
  chips: FilterChip[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          // Höchstens so breit wie die Reihe: Erst dann endet eine zu lange Beschriftung mit „…“ statt überzustehen.
          <li key={chip.key} className="max-w-full min-w-0">
            <Link
              href={chip.href}
              aria-current={chip.active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ring-foreground/10 transition-colors ring-inset hover:bg-muted motion-reduce:transition-none pointer-coarse:h-9 [&_svg]:size-3.5 [&_svg]:shrink-0",
                chip.active &&
                  "bg-foreground text-background ring-foreground hover:bg-foreground/90",
              )}
            >
              {chip.dot && (
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", chip.dot)} />
              )}
              {chip.icon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex",
                    chip.active ? "text-background/75" : "text-muted-foreground",
                  )}
                >
                  {chip.icon}
                </span>
              )}
              <span className="truncate">{chip.label}</span>
              <span
                className={cn(
                  "tabular-nums",
                  chip.active ? "text-background/75" : "text-muted-foreground",
                )}
              >
                {chip.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
