import Link from "next/link";
import { ChartColumnIcon } from "lucide-react";
import { CompactEmpty } from "@/components/shared/compact-empty";
import { CARD_TITLE, Card, CardContent } from "@/components/ui/card";
import { formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { YearSummary } from "../ledger";
import { formatSignedEuro } from "../ledger-format";
import type { FinanceOverview } from "../overview";
import { MonthChart } from "./month-chart";

/**
 * Eine Zahl der Jahreszeile: Bezeichnung (mit Farbfeld der Reihe), Betrag, ein kurzer Satz darunter. Der Betrag bricht nie um
 * (kein „€“ allein in der nächsten Zeile) und ist am Handy etwas kleiner. Am Handy stehen zwei Zahlen nebeneinander (je die
 * halbe Breite); ist ein Betrag dafür zu breit (ab etwa sieben Stellen), rutscht die Zahl in eine eigene Zeile, statt über den
 * Rand zu laufen – deshalb kein `min-w-0`: Die Mindestbreite ist der Betrag.
 */
function Figure({
  label,
  swatch,
  value,
  note,
  className,
}: {
  label: React.ReactNode;
  swatch?: string;
  value: string;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-sm:grow max-sm:basis-[calc(50%-0.75rem)]", className)}>
      <dt className="flex items-center gap-2 text-sm">
        {swatch && <span className={cn("size-2.5 rounded-xs", swatch)} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="text-xl font-bold whitespace-nowrap tabular-nums sm:text-2xl">{value}</dd>
      {note && <dd className="text-sm text-muted-foreground">{note}</dd>}
    </div>
  );
}

/**
 * Anordnung der Jahreszeile (auch im Ladegerüst, `loading.tsx`): fließend mit Umbruch. `overflow-hidden` schneidet den Strich vor
 * den Spenden ab, wenn sie am Zeilenanfang stehen; der Rand von 0,375 rem (innen, außen zurückgenommen) lässt dem Fokusrahmen
 * des Links „Spenden …“ Platz.
 */
export const YEAR_FIGURES =
  "-m-1.5 flex flex-wrap gap-x-6 gap-y-4 overflow-hidden p-1.5 sm:gap-x-10";

/** Strich vor den Spenden: mitten in der Lücke davor (2,5 rem ab 640 px), am Handy keiner (dort stehen je zwei Zahlen). */
const SPENDEN_STRICH =
  "relative sm:before:absolute sm:before:inset-y-0 sm:before:-left-5 sm:before:border-l sm:before:border-border";

/**
 * „Einnahmen und Ausgaben“ des Jahres auf der Übersicht: oben die Jahreszahlen – Einnahmen, Ausgaben, der Überschuss
 * (Einnahmen minus Ausgaben, mit Vorzeichen, seit Jahresbeginn bzw. Beginn des Kassenbuchs) und die Spenden des Jahres
 * (dieselben Zahlen wie die Seite „Spenden“, auch Sach- und Aufwandsspenden ohne Buchung) –, darunter die Monate als Balken,
 * umschaltbar „Als Tabelle“ (`MonthChart`). Seit 21.10.2026 stehen Überschuss und Spenden hier statt als eigene Kennzahlkarten.
 *
 * Die Jahreszeile fließt und bricht um, wo der Platz nicht reicht (am Handy je zwei Zahlen nebeneinander, zwischen 640 und
 * 1280 px rutschen meist die Spenden in die zweite Zeile). Der Strich vor den Spenden steht in der Lücke davor und wird am
 * Zeilenanfang abgeschnitten (`SPENDEN_STRICH`) – so steht er nur zwischen zwei Zahlen, nie eingerückt am Anfang einer Zeile.
 */
export function FinanceYearCard({
  year,
  summary,
  surplusSince,
  donations,
}: {
  year: number;
  summary: YearSummary;
  surplusSince: Date;
  donations: FinanceOverview["donations"];
}) {
  const booked = summary.months.some((m) => m.incomeCents > 0 || m.expenseCents > 0);
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className={CARD_TITLE}>Einnahmen und Ausgaben {year}</h2>
            <p className="text-sm text-muted-foreground">
              Je Monat, ohne Umbuchungen und Anfangsbestände
            </p>
          </div>
          <Link
            href="/finanzen/kassenbuch"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Kassenbuch öffnen
          </Link>
        </div>
        <dl className={YEAR_FIGURES}>
          <Figure
            label="Einnahmen"
            swatch="bg-chart-1"
            value={formatEuroFromCents(summary.incomeCents)}
          />
          <Figure
            label="Ausgaben"
            swatch="bg-chart-2"
            value={formatEuroFromCents(summary.expenseCents)}
          />
          <Figure
            label={`Überschuss ${year}`}
            value={formatSignedEuro(summary.surplusCents)}
            note={`Einnahmen minus Ausgaben seit ${formatCalendarDate(surplusSince)}`}
          />
          {/* Dieselben Zahlen wie die Seite „Spenden“ (getDonationsPage) – auch Sach- und Aufwandsspenden ohne Buchung. */}
          <Figure
            className={SPENDEN_STRICH}
            label={
              <Link
                href="/finanzen/spenden"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Spenden {year}
              </Link>
            }
            value={formatEuroFromCents(donations.totalCents)}
            note={
              <>
                {donations.count === 0
                  ? `Noch keine Spenden in ${year}`
                  : `${donations.count === 1 ? "1 Spende" : `${donations.count} Spenden`}${
                      donations.donors > 0
                        ? ` von ${donations.donors === 1 ? "1 Spender" : `${donations.donors} Spendern`}`
                        : ""
                    }`}
                {donations.withoutEntryCents > 0 && (
                  <span className="block">
                    davon {formatEuroFromCents(donations.withoutEntryCents)} ohne Buchung (Sach- und
                    Aufwandsspenden)
                  </span>
                )}
              </>
            }
          />
        </dl>
        {booked ? (
          <MonthChart year={year} months={summary.months} legend={false} />
        ) : (
          <CompactEmpty
            icon={<ChartColumnIcon />}
            accent="slate"
            title={`Noch keine Einnahmen oder Ausgaben in ${year}`}
          >
            Sobald gebucht ist, stehen hier die Monate als Balken.
          </CompactEmpty>
        )}
      </CardContent>
    </Card>
  );
}
