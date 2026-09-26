import { cn } from "@/lib/utils";

/**
 * Natives Auswahlfeld im Stil der übrigen Eingabefelder: zuverlässig auf Smartphones und per Tastatur bedienbar.
 * Rand, Fläche, Schriftgröße (16 px am Smartphone, sonst zoomt iOS beim Antippen) sowie Fehler- und gesperrter Zustand wie
 * bei `Input`. Die Einträge bekommen eine eigene, deckende Fläche: Die Feldfläche ist durchscheinend, und die aufklappende
 * Liste (Windows, Firefox) könnte sonst im Dunkeln hellen Text auf hellem Grund zeigen.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-lg border border-field bg-transparent px-2.5 text-base transition-colors outline-none *:bg-popover *:text-popover-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}
