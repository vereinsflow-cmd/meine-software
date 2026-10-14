import { ACCENT, type Accent } from "@/components/shared/accent";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Leerer Bereich in einer Karte: freundlich statt wie ein Fehler – Symbol im Farbton des Bereichs, kurze Überschrift, ein
 * Satz dazu, nebeneinander (so wirken leere Karten nicht hoch und leer). Kein gestrichelter Rahmen; „nichts zu tun“ ist
 * meist eine gute Nachricht. Genutzt auf dem Dashboard, in der Helferplanung, den Finanzen und vielen Abschnitten.
 *
 * Steht der Bereich direkt auf dem Seitengrund (ein leerer Abschnitt einer Seite), bringt `card` die Karte mit
 * (`CARD_SURFACE`, 1 rem Innenabstand) – die gedämpfte Fläche allein wäre auf dem hellen, bläulichen Seitengrund kaum zu
 * sehen. Dieselbe Hülle für alle leeren Abschnitte, statt jedes Mal eine eigene Karte darum zu bauen.
 */
export function CompactEmpty({
  icon,
  accent,
  title,
  card = false,
  children,
}: {
  icon: React.ReactNode;
  accent: Accent;
  title: string;
  /** In eine eigene Karte legen (für leere Abschnitte auf dem Seitengrund). */
  card?: boolean;
  children: React.ReactNode;
}) {
  const block = (
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
  return card ? <div className={cn(CARD_SURFACE, "p-4")}>{block}</div> : block;
}
