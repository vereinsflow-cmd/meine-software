import Link from "next/link";
import { CheckIcon, LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SETUP_STEPS, type SetupStepId, type SetupTaskId } from "../steps";

/**
 * Schrittfolge des Assistenten: auf großen Bildschirmen als Liste links, auf dem Handy als Reihe nummerierter Kreise.
 * `locked`: Die Pflichtangaben (Schritt 1) fehlen noch – bis dahin sind die übrigen Schritte gesperrt.
 */
export function SetupStepper({
  current,
  done,
  locked,
}: {
  current: SetupStepId;
  done: Record<SetupTaskId, boolean>;
  locked: boolean;
}) {
  return (
    <nav aria-label="Schritte der Einrichtung" className="lg:sticky lg:top-24">
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
        {SETUP_STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const isDone = step.id !== "abschluss" && done[step.id];
          const isLocked = locked && step.id !== "verein";
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  !isCurrent &&
                    isDone &&
                    "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950",
                  !isCurrent && !isDone && "bg-card text-muted-foreground",
                )}
              >
                {isDone && !isCurrent ? (
                  <CheckIcon className="size-4" />
                ) : isLocked ? (
                  <LockIcon className="size-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="sr-only lg:not-sr-only lg:min-w-0">
                <span className={cn("block text-sm", isCurrent && "font-semibold")}>
                  {step.title}
                  {isDone && <span className="sr-only"> (erledigt)</span>}
                  {isLocked && <span className="sr-only"> (erst nach den Pflichtangaben)</span>}
                </span>
                <span className="hidden text-xs text-muted-foreground lg:block">{step.hint}</span>
              </span>
            </>
          );
          const itemClass = "flex items-center gap-3 rounded-lg p-1.5 lg:px-3 lg:py-2";
          if (isLocked) {
            return (
              <li key={step.id} className="shrink-0">
                <span aria-disabled="true" className={cn(itemClass, "opacity-60")}>
                  {content}
                </span>
              </li>
            );
          }
          return (
            <li key={step.id} className="shrink-0">
              <Link
                href={`/einrichtung?schritt=${step.id}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  itemClass,
                  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isCurrent ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                {content}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
