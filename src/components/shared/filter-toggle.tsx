import { SlidersHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Filterleisten am Handy: Unter 640 px stehen nur das Suchfeld und der Knopf „Filter“ (mit der Zahl aktiver Filter); die
 * Auswahlfelder samt „Filtern“ klappen erst auf einen Tipp darunter auf. So beginnt die Liste rund 200 px früher. Ab 640 px
 * gehören sie wie gewohnt zur Zeile (`sm:contents`), der Knopf fehlt dort.
 *
 * Reines CSS – ein unsichtbares Kästchen ohne Namen (es wird nicht mitgeschickt) und seine Beschriftung als Knopf. Das
 * klappt auch, bevor die Skripte geladen sind. `FilterToggle` steht im Formular direkt vor `FilterFields` (Geschwister).
 */
export function FilterToggle({ id, active }: { id: string; active: number }) {
  return (
    <>
      <input
        id={id}
        type="checkbox"
        aria-controls={`${id}-felder`}
        className="peer/filter sr-only sm:hidden"
      />
      <label
        htmlFor={id}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 self-end rounded-lg border bg-background px-3 text-sm font-medium whitespace-nowrap shadow-xs select-none peer-checked/filter:bg-muted peer-focus-visible/filter:ring-3 peer-focus-visible/filter:ring-ring/50 hover:bg-muted sm:hidden dark:bg-input/30"
      >
        <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
        Filter
        {active > 0 && (
          <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs text-primary-foreground tabular-nums">
            <span className="sr-only">, aktiv: </span>
            {active}
          </span>
        )}
      </label>
    </>
  );
}

/**
 * Aufbau einer Filterleiste mit Suche und Auswahlfeldern: am Handy Suche und Knopf „Filter“ nebeneinander; ab 640 px eine
 * umbrechende Zeile – die Suche zuerst über die ganze Breite, ab 1400 px daneben (mind. 14 rem; bei vielen Feldern bleibt
 * sie mit `FILTER_SEARCH_ROW` in eigener Zeile). Auswahlfelder sind fest 10 rem breit („Alle Abteilungen“ bleibt lesbar,
 * nichts streckt sich); was nicht passt, rückt in die nächste Zeile.
 */
export const FILTER_FORM =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center";
export const FILTER_SEARCH =
  "sm:max-[1399px]:basis-full min-[1400px]:min-w-56 min-[1400px]:flex-[2_1_0%]";
export const FILTER_SEARCH_ROW = "sm:basis-full";
export const FILTER_SELECT = "sm:w-40 sm:flex-none";

/** Die Felder hinter dem Knopf `FilterToggle` (gleiche `id`): am Handy zu- und aufklappbar, ab 640 px Teil der Zeile. */
export function FilterFields({
  id,
  className,
  children,
}: {
  id: string;
  /** Anordnung am Handy im aufgeklappten Zustand (Vorgabe: untereinander). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`${id}-felder`}
      className={cn(
        "col-span-full gap-2 max-sm:hidden max-sm:peer-checked/filter:grid sm:contents",
        className,
      )}
    >
      {children}
    </div>
  );
}
