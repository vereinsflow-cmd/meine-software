import { cn } from "@/lib/utils";

/**
 * Einheitlicher Seitenkopf mit Titel, Beschreibung und Aktionen.
 * Ab `sm` stehen die Aktionen rechts neben dem Titel, solange der Titel dort seine natürliche Breite behält, höchstens
 * aber 18 rem braucht (ein längerer Titel darf dann umbrechen). Reicht der Platz nicht, rutscht die ganze Leiste als
 * eigene Zeile unter Titel und Beschreibung (`flex-wrap`) – der Titel wird nie zusammengedrückt, nichts läuft seitlich
 * über. Auf dem Smartphone stehen die Aktionen wie bisher immer darunter.
 * `inline`: Beschreibung steht neben dem Titel statt darunter – kompakter, z. B. für die Begrüßung auf dem Dashboard.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  inline = false,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between",
        inline ? "mb-5 sm:items-center" : "mb-7 sm:items-start",
        className,
      )}
    >
      {/* Mindestbreite des Titelbereichs = seine Mindestbreite aus dem Inhalt (kein `min-w-0`): Dafür sorgt die
          unsichtbare, 0 px hohe Kopie des Titels in `::after` – ohne Umbruch, auf 18 rem gekappt (für Screenreader
          unsichtbar). Lange Wörter zählen mit und werden neben den Aktionen nie getrennt; nur ein Wort, das breiter
          als die ganze Seite ist, bricht um (`break-words`). `max-w-full` hält den Bereich innerhalb der Seite. */}
      <div
        className={cn(
          "max-w-full sm:flex-1",
          inline && "sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-0",
        )}
      >
        <h1
          data-title={title}
          className="text-3xl font-bold tracking-tight break-words after:invisible after:block after:h-0 after:max-w-72 after:overflow-hidden after:whitespace-nowrap after:content-[attr(data-title)]"
        >
          {title}
        </h1>
        {description && (
          <p className={cn("text-base text-muted-foreground", inline ? "mt-1 sm:mt-0" : "mt-1.5")}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
