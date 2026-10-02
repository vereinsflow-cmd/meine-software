import Link from "next/link";
import { ArrowRightIcon, CircleCheckIcon, CircleIcon, RocketIcon } from "lucide-react";
import type { BlockSize } from "../layout-prefs";
import type { OnboardingStep } from "../onboarding";
import { HideBlockButton } from "./hide-block-button";
import { Widget } from "./widgets";

/**
 * Karte „Erste Schritte“: Offene Schritte als Kacheln (ganz anklickbar, mit kurzem Hinweis), erledigte kompakt in einer
 * Zeile mit Häkchen; darüber der Fortschritt. So bleibt die Karte niedrig – die Kennzahlen darunter rücken ins Bild – und
 * zeigt auf einen Blick, was als Nächstes zu tun ist.
 */
export function OnboardingCard({
  steps,
  size,
}: {
  steps: OnboardingStep[];
  /** Eigene Größe der Karte („Anpassen“). */
  size?: BlockSize;
}) {
  const done = steps.filter((step) => step.done);
  const open = steps.filter((step) => !step.done);
  return (
    <Widget
      id="w-erste-schritte"
      size={size}
      title="Erste Schritte"
      icon={<RocketIcon />}
      accent="blue"
      description={`${done.length} von ${steps.length} erledigt – so ist dein Verein schnell startklar.`}
      action={<HideBlockButton tab="uebersicht" block="erste-schritte" />}
    >
      <div className="grid gap-4">
        <div
          role="progressbar"
          aria-label="Fortschritt der ersten Schritte"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done.length}
          className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(done.length / steps.length) * 100}%` }}
          />
        </div>
        {open.length > 0 && (
          <ol className="grid gap-2.5 md:grid-cols-2">
            {open.map((step) => (
              <li
                key={step.id}
                className="relative flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 transition-colors hover:bg-primary/10 motion-reduce:transition-none"
              >
                <CircleIcon className="mt-0.5 size-5 shrink-0 text-primary/70" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {/* Der Link deckt die ganze Kachel ab (after:inset-0); sein Name bleibt der Schritt selbst. */}
                  <Link
                    href={step.href}
                    className="font-semibold text-primary underline-offset-4 after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    {step.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">{step.hint}</p>
                </div>
                <ArrowRightIcon
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
              </li>
            ))}
          </ol>
        )}
        {done.length > 0 && (
          <ul
            aria-label="Erledigt"
            className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground"
          >
            {done.map((step) => (
              <li key={step.id} className="inline-flex items-center gap-1.5">
                <CircleCheckIcon
                  className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                {step.title}
                <span className="sr-only"> (erledigt)</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  );
}
