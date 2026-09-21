import { cn } from "@/lib/utils";

export interface TooltipRow {
  /** Farbe des Schlüssels (CSS-Wert, z. B. `var(--chart-1)`). */
  color: string;
  /** Name der Reihe; leer bei nur einer Reihe (dann nennt der Titel, worum es geht). */
  label: string;
  value: string;
}

/**
 * Anzeige der Werte am Zeiger oder Tastaturfokus. Der Wert steht vorn und fett, der Name dahinter (der Leser hat die Reihe
 * schon und will die Zahl); der Schlüssel ist ein kurzer Strich in der Reihenfarbe. Der Tooltip ergänzt nur – alle Werte
 * stehen auch in der Tabellenansicht, und Screenreader bekommen sie über eine Ansage. Er klappt zur anderen Seite, wenn
 * rechts kein Platz mehr ist.
 */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  title,
  note,
  rows,
}: {
  x: number;
  y: number;
  containerWidth: number;
  title: string;
  note?: string;
  rows: TooltipRow[];
}) {
  const flip = x > containerWidth * 0.55;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-10 min-w-36 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md",
        flip && "-translate-x-full",
      )}
      style={{ left: flip ? x - 12 : x + 12, top: y }}
    >
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <ul className="mt-1 grid gap-0.5">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            <span
              className="h-[3px] w-3 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="font-semibold tabular-nums">{row.value}</span>
            {row.label && <span className="text-muted-foreground">{row.label}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
