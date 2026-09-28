import { ACCENT, type Accent } from "@/components/shared/accent";
import { cn } from "@/lib/utils";

/**
 * Leerer Bereich in einer Karte: freundlich statt wie ein Fehler – Symbol im Farbton des Bereichs, kurze Überschrift, ein
 * Satz dazu, nebeneinander (so wirken leere Karten nicht hoch und leer). Kein gestrichelter Rahmen; „nichts zu tun“ ist
 * meist eine gute Nachricht. Genutzt auf dem Dashboard und in der Helferplanung.
 */
export function CompactEmpty({
  icon,
  accent,
  title,
  children,
}: {
  icon: React.ReactNode;
  accent: Accent;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-muted/50 px-4 py-4">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
          ACCENT[accent].tile,
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
