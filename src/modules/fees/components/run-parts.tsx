import { CheckIcon } from "lucide-react";
import { formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Bausteine des Beitragslaufs im Cockpit-Stil: die drei Schritte (Prüfen – Vorschau – Erstellen) und die Kacheln mit den
 * Summen. Ruhig gehalten: Zahl, kurze Zeile darunter, keine Symbole außer dem Haken für erledigte Schritte.
 */

export type StepState = "done" | "current" | "todo";

const STEP_HINT: Record<StepState, string> = {
  done: "erledigt",
  current: "du bist hier",
  todo: "noch offen",
};

export function RunSteps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-3" aria-label="Schritte des Beitragslaufs">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-3">
          {index > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                "hidden h-0.5 w-8 rounded sm:block",
                step.state === "todo" ? "bg-border" : "bg-emerald-600",
              )}
            />
          )}
          <span
            className="flex items-center gap-2.5"
            aria-current={step.state === "current" ? "step" : undefined}
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full border-[1.5px] text-sm font-bold",
                step.state === "done" && "border-emerald-600 bg-emerald-600 text-white",
                step.state === "current" && "border-foreground bg-foreground text-background",
                step.state === "todo" && "border-border bg-card text-muted-foreground",
              )}
            >
              {step.state === "done" ? (
                <CheckIcon className="size-4" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <span className="leading-tight">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  step.state === "todo" && "font-medium text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  "block text-xs text-muted-foreground",
                  step.state === "done" && "font-semibold text-emerald-700 dark:text-emerald-400",
                )}
              >
                {STEP_HINT[step.state]}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Tile({
  label,
  value,
  unit,
  detail,
  compact = false,
}: {
  label: string;
  value: string;
  /** Kleiner hinter der Zahl („Mitglieder“). */
  unit?: string;
  detail?: string;
  /** Für lange Werte (Nummern): kleiner und ohne Umbruch. */
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-bold tabular-nums",
          compact ? "text-lg whitespace-nowrap" : "text-2xl",
        )}
      >
        {value}
        {unit && <span className="ml-1.5 text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** Erklärung ohne den Betrag am Ende („Erwachsene → 36,00 €“ → „Erwachsene“) – der steht in der eigenen Spalte. */
export const withoutAmount = (explanation: string) => explanation.replace(/ → [^→]+$/, "");

/**
 * „So wird gerechnet“ für die Vorschau: Eine einzige Zeile über den ganzen Zeitraum als Rechnung („3 Monate × 12,00 €“),
 * sonst die Erklärung ohne den Betrag am Ende.
 */
export function calculationText(
  charge: {
    explanation: string;
    lines: { fromDate: Date; toDate: Date; amountCents: number }[];
  },
  period: { start: Date; end: Date },
): string {
  const months =
    (period.end.getUTCFullYear() - period.start.getUTCFullYear()) * 12 +
    period.end.getUTCMonth() -
    period.start.getUTCMonth() +
    1;
  const [line] = charge.lines;
  if (
    charge.lines.length === 1 &&
    line &&
    months > 1 &&
    line.fromDate.getTime() === period.start.getTime() &&
    line.toDate.getTime() === period.end.getTime() &&
    line.amountCents % months === 0
  )
    return `${months} Monate × ${formatEuroFromCents(line.amountCents / months)}`;
  return withoutAmount(charge.explanation);
}
