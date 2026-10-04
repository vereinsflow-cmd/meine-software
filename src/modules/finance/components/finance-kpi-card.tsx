"use client";

import { QuoteChart, type QuoteChartPoint } from "@/components/charts/quote-chart";
import type { KpiAccent } from "@/components/shared/accent";
import { KpiShell, KpiValue } from "@/modules/dashboard/components/kpi-cards";
import { formatEuroFromCents } from "@/lib/dates";
import { formatSignedEuro } from "../ledger-format";

const fitSize = (chars: number) =>
  `clamp(1.25rem, calc((100cqi - 2.5rem) / ${(0.64 * chars).toFixed(2)}), 2.15rem)`;

/**
 * Kennzahl der Finanzen im Stil der Dashboard-Karten (Farbverlauf, weiße Schrift, kleiner Kurs unten). Beträge kommen in
 * Cent; der Kurs (`points`) ebenfalls. Die Karte ist rein darstellend – was sie zeigt, steht auch als Text darauf.
 */
export function FinanceKpiCard({
  label,
  accent,
  icon,
  valueCents,
  signed = false,
  lines,
  points,
  href,
}: {
  label: string;
  accent: KpiAccent;
  icon: React.ReactNode;
  valueCents: number;
  /** Mit Vorzeichen anzeigen („+7.325,00 €“), z. B. beim Überschuss. */
  signed?: boolean;
  /** Ein bis zwei kurze Sätze unter der Zahl (der zweite fett, z. B. „davon 7 überfällig: 312,00 €“). */
  lines: React.ReactNode[];
  points?: QuoteChartPoint[];
  href?: string;
}) {
  const value = signed ? formatSignedEuro(valueCents) : formatEuroFromCents(valueCents);
  return (
    <KpiShell
      label={label}
      accent={accent}
      icon={icon}
      href={href}
      density="m"
      extra={
        points && points.length > 1 ? (
          <div className="-mx-5 mt-auto pt-3">
            <QuoteChart
              points={points}
              format={(value) => formatEuroFromCents(Math.round(value))}
              describe={(value) => formatEuroFromCents(Math.round(value))}
              className="h-14"
            />
          </div>
        ) : undefined
      }
    >
      {/* Lange Beträge werden kleiner, damit sie auch in schmalen Karten (vier nebeneinander) ganz zu sehen sind: Die Karte
          ist ein Container (`@container/kpi`), 100cqi ist ihre Breite, 2,5rem der Innenabstand, ein Zeichen etwa 0,64em. */}
      <div className="mt-3" style={{ fontSize: fitSize(value.length) }}>
        <KpiValue className="whitespace-nowrap">{value}</KpiValue>
      </div>
      <div className="mt-2.5 grid gap-0.5 text-sm text-white/95">
        {lines.map((line, index) => (
          <p key={index} className={index === 1 ? "font-semibold" : "font-medium"}>
            {line}
          </p>
        ))}
      </div>
    </KpiShell>
  );
}
