import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Hülle für Tabellen: sieht aus wie die Karten der übrigen Seiten (Kartenfläche, feiner Rand, leichter Schatten) statt
 * direkt auf dem grauen Seitengrund zu liegen – so heben sich Tabelle, Kopfzeile und Trennlinien ab. Breite Tabellen
 * scrollen darin seitlich; mit `<Table stack>` werden sie am Handy stattdessen zu gestapelten Karten (siehe ui/table.tsx).
 */
export function TableCard({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div {...props} className={cn(CARD_SURFACE, "overflow-x-auto", className)}>
      {children}
    </div>
  );
}
