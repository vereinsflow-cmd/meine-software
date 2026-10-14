import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Seitenrhythmus – damit jede Seite gleich „atmet“: Die Seite ist ein `PageStack` (Spalte mit 1,5 rem Lücke); darin zuerst
 * der `PageHeader` (er ergänzt die Lücke auf seine gewohnten 1,75 rem), dann die Blöcke – Karten, Tabellen, Filterleisten
 * oder `PageSection`s. Die Blöcke tragen keine eigenen Außenabstände (`mb-6`, `mt-8` …); den Abstand macht die Spalte.
 */
export const PAGE_STACK = "flex flex-col gap-6";

/**
 * Überschrift eines Abschnitts (Ebene 2) auf dem Seitengrund – wo `PageSection` nicht passt (Kalenderleiste, Abschnitt mit
 * Zahl daneben), dieselben Klassen. In Karten gilt `CardTitle` bzw. `CARD_TITLE` (components/ui/card.tsx).
 */
export const SECTION_TITLE = "text-lg font-semibold";

/** Wurzel einer Seite: Spalte mit 1,5 rem zwischen den Blöcken (`data-slot="page-stack"`, siehe `PageHeader`). */
export function PageStack({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="page-stack" className={cn(PAGE_STACK, className)} {...props} />;
}

/**
 * Ein Abschnitt der Seite mit Überschrift der Ebene 2, optional einem Satz darunter und Knöpfen rechts (am Handy unter der
 * Überschrift). Der Abschnitt ist über seine Überschrift benannt (`aria-labelledby`), Screenreader springen von Abschnitt
 * zu Abschnitt. Zwischen Kopf und Inhalt 0,75 rem.
 */
export function PageSection({
  id,
  title,
  description,
  actions,
  focusTarget = false,
  className,
  children,
}: {
  /** Kennung der Überschrift (sonst automatisch) – etwa, um nach einer Aktion den Fokus dorthin zu setzen. */
  id?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Überschrift per Skript fokussierbar (`tabIndex={-1}`, ohne Fokusrahmen) – Ziel nach Löschen o. Ä. */
  focusTarget?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const autoId = useId();
  const headingId = id ?? autoId;
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id={headingId}
            tabIndex={focusTarget ? -1 : undefined}
            className={cn(SECTION_TITLE, focusTarget && "outline-none")}
          >
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
