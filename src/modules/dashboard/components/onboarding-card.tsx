import Link from "next/link";
import { CircleCheckIcon, CircleIcon, RocketIcon } from "lucide-react";
import type { OnboardingStep } from "../onboarding";
import { HideBlockButton } from "./hide-block-button";
import { Widget } from "./widgets";

/** Karte „Erste Schritte“: offene Schritte als Links mit kurzem Hinweis, erledigte abgehakt; Fortschritt als Balken. */
export function OnboardingCard({ steps }: { steps: OnboardingStep[] }) {
  const done = steps.filter((step) => step.done).length;
  return (
    <Widget
      id="w-erste-schritte"
      title="Erste Schritte"
      icon={<RocketIcon />}
      accent="blue"
      description={`${done} von ${steps.length} erledigt – so ist dein Verein schnell startklar.`}
    >
      <div className="grid gap-4">
        <div
          role="progressbar"
          aria-label="Fortschritt der ersten Schritte"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <ol className="grid gap-3">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3">
              {step.done ? (
                <CircleCheckIcon
                  className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <CircleIcon
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                {step.done ? (
                  <p className="text-muted-foreground line-through">
                    {step.title}
                    <span className="sr-only"> (erledigt)</span>
                  </p>
                ) : (
                  <>
                    <Link
                      href={step.href}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {step.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">{step.hint}</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="flex justify-end">
          <HideBlockButton tab="uebersicht" block="erste-schritte" />
        </div>
      </div>
    </Widget>
  );
}
