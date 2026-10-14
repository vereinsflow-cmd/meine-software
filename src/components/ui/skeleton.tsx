import { cn } from "@/lib/utils";

/**
 * Platzhalterfläche im Ladezustand; pulsiert nur ohne „Bewegung reduzieren“. Ganze Seiten: `shared/page-skeletons.tsx`.
 * Die Farbe ist ein Hauch der Schriftfarbe (8 %) statt `bg-muted`: Die Flächen sind so auf der Karte UND auf dem bläulichen
 * Seitengrund zu sehen – `bg-muted` war dort im Hellen praktisch unsichtbar.
 *
 * `as="span"` für Platzhalter mitten im Text (etwa in einem Absatz, in dem kein `div` stehen darf): dann als Inline-Block
 * auf der Mitte der Zeile.
 */
function Skeleton({
  as: Comp = "div",
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "span" }) {
  return (
    <Comp
      data-slot="skeleton"
      aria-hidden={Comp === "span" ? true : undefined}
      className={cn(
        "rounded-md bg-foreground/8 motion-safe:animate-pulse",
        Comp === "span" && "inline-block max-w-full align-middle",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
