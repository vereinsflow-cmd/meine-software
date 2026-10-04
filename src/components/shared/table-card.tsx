import { cn } from "@/lib/utils";

/**
 * Hülle für Tabellen: sieht aus wie die Karten der übrigen Seiten (Kartenfläche, feiner Rand, leichter Schatten) statt
 * direkt auf dem grauen Seitengrund zu liegen – so heben sich Tabelle, Kopfzeile und Trennlinien ab. Breite Tabellen
 * scrollen darin seitlich.
 */
export function TableCard({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "overflow-x-auto rounded-xl bg-card shadow-sm ring-1 ring-foreground/10 dark:ring-foreground/15",
        className,
      )}
    >
      {children}
    </div>
  );
}
