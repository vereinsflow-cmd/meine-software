import Link from "next/link";
import {
  ArrowRightIcon,
  CircleCheckIcon,
  MinusIcon,
  ReceiptTextIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { formatEuroFromCents, MONTH_NAMES } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { dayMonthLabel, monthStartChange, splitEuro, type BalanceCurve } from "../balance-curve";
import {
  FINANCE_GLASS,
  FINANCE_GLASS_HOVER,
  FINANCE_NIGHT,
  FINANCE_TONE,
  financeGlowBackground,
} from "../hero-look";
import { formatSignedEuro } from "../ledger-format";
import type { OpenPayments } from "../service";
import { BalanceChart } from "./balance-chart";

/**
 * Glas-Chip auf der Nacht: Nacht zu 62 % (wie die Chips der Vereins-Bühne), weiße Schrift. Einzeilig eine Pille; wird es am
 * Handy zu eng, bricht der Chip zwischen ganzen Teilen um (jeder Teil bleibt beisammen, `whitespace-nowrap`).
 */
const CHIP =
  "inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-2xl bg-(--finance-glass) px-3 py-1.5 text-sm font-medium text-white/90 ring-1 ring-white/12 backdrop-blur-md [&>span]:whitespace-nowrap";

/** Farbe eines Betrags mit Vorzeichen auf der Nacht: mehr Geld grün, weniger rosé, null ohne Farbe. */
function signedTone(cents: number): string | undefined {
  return cents > 0 ? FINANCE_TONE.up : cents < 0 ? FINANCE_TONE.down : undefined;
}

/**
 * Kopf der Finanz-Übersicht (seit 21.10.2026, Entwurf 1 „Wie eine Banking-App“): auf der Nacht der Vereins-Bühne – hell wie
 * dunkel gleich – groß der Kontostand aller Konten (Cent kleiner), daneben die Schnellaktionen; darunter Glas-Chips mit der
 * Veränderung seit Monatsbeginn, Einnahmen und Ausgaben des Monats und den offenen Rechnungen, unten der Kontoverlauf je Tag.
 *
 * Der Kopf ist ein Container: Der Betrag wächst mit seiner Breite (8 % davon, 2,75–4,5 rem), damit Betrag und die vier
 * Schnellaktionen schon bei 1280 px Fensterbreite (Kopf rund 680 px) nebeneinander passen; schmaler rutschen die Knöpfe darunter.
 *
 * Ohne Kassenbuch steht statt Zahl und Verlauf ein ehrlicher Leerzustand: „Kassenbuch noch nicht eingerichtet“, was danach
 * hier steht, die drei Schritte des Einrichtens und – mit „Finanzen bearbeiten“ – der Weg dorthin. Keine 0,00 € und kein
 * leeres Diagramm. Die offenen Rechnungen stehen auch dann da (sie gibt es ohne Kassenbuch).
 */
export function FinanceHero({
  ledgerReady,
  totalCents,
  curve,
  month,
  today,
  payments,
  canManage,
  actions,
}: {
  ledgerReady: boolean;
  totalCents: number;
  curve: BalanceCurve | null;
  /** Einnahmen und Ausgaben des laufenden Monats (ohne Umbuchungen und Anfangsbestände). */
  month: { incomeCents: number; expenseCents: number } | null;
  today: Date;
  payments: Pick<OpenPayments, "count" | "totalCents" | "overdueCount">;
  canManage: boolean;
  /** Die Schnellaktionen (Client-Komponente, von der Seite gebaut). */
  actions: React.ReactNode;
}) {
  const change = curve ? monthStartChange(curve, today) : null;
  const [euros, cents] = splitEuro(totalCents);
  const style = {
    backgroundColor: FINANCE_NIGHT,
    "--finance-night": FINANCE_NIGHT,
    "--finance-glass": FINANCE_GLASS,
    "--finance-glass-hover": FINANCE_GLASS_HOVER,
  } as React.CSSProperties;

  return (
    <section
      aria-labelledby="finanzen-stand"
      data-slot="finance-hero"
      className="@container/finanzkopf relative isolate self-start overflow-hidden rounded-3xl text-white shadow-[0_30px_60px_-30px_rgb(6_10_22/0.55)] ring-1 ring-black/5 dark:ring-white/10"
      style={style}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ backgroundImage: financeGlowBackground() }}
      />
      {/* Feines Punkteraster oben, nach unten ausgeblendet – nur Zierde. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_75%)] [background-size:18px_18px] opacity-[0.07]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),inset_0_0_0_1px_rgb(255_255_255/0.06)]"
      />

      <div className="px-5 pt-6 sm:px-8 sm:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-5">
          <div className="min-w-0">
            <h2
              id="finanzen-stand"
              className="flex items-center gap-2 text-sm font-medium text-white/85"
            >
              <WalletIcon aria-hidden="true" className="size-4" />
              Kontostand · alle Konten
            </h2>
            {ledgerReady ? (
              <p className="mt-2 font-heading leading-none font-bold tracking-[-0.035em] tabular-nums">
                <span className="sr-only">{formatEuroFromCents(totalCents)}</span>
                <span aria-hidden="true" className="text-[clamp(2.75rem,8cqi,4.5rem)]">
                  {euros}
                </span>
                <span
                  aria-hidden="true"
                  className="text-[clamp(1.5rem,4cqi,2.25rem)] text-white/85"
                >
                  {cents}
                </span>
              </p>
            ) : (
              <p className="mt-3 font-heading text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
                Kassenbuch noch nicht eingerichtet
              </p>
            )}
          </div>
          {actions}
        </div>

        <ul aria-label="Auf einen Blick" className="mt-5 flex flex-wrap items-center gap-2">
          {change && (
            <li className={cn(CHIP, "font-semibold tabular-nums")}>
              {change.cents > 0 ? (
                <TrendingUpIcon aria-hidden="true" className={cn("size-4", FINANCE_TONE.up)} />
              ) : change.cents < 0 ? (
                <TrendingDownIcon aria-hidden="true" className={cn("size-4", FINANCE_TONE.down)} />
              ) : (
                <MinusIcon aria-hidden="true" className="size-4" />
              )}
              <span className={signedTone(change.cents)}>{formatSignedEuro(change.cents)}</span>
              <span className="font-medium text-white/85">seit {dayMonthLabel(change.since)}</span>
            </li>
          )}
          {ledgerReady && month && (
            <li className={cn(CHIP, "gap-x-2 tabular-nums")}>
              <span className="text-white/85">{MONTH_NAMES[today.getUTCMonth()]}</span>
              {/* Vorzeichen und Farbe nach dem Geld: rein „+“ grün, raus „−“ rosé – ohne Betrag keines von beiden
                  („0,00 € rein“, nicht „−0,00 € raus“). */}
              <span>
                <span className={cn("font-semibold", signedTone(month.incomeCents))}>
                  {formatSignedEuro(month.incomeCents)}
                </span>{" "}
                rein
              </span>
              <span>
                <span className={cn("font-semibold", signedTone(-month.expenseCents))}>
                  {formatSignedEuro(-month.expenseCents)}
                </span>{" "}
                raus
              </span>
            </li>
          )}
          <li>
            <Link
              href="/finanzen/rechnungen?stand=offen"
              className={cn(
                CHIP,
                "transition-colors outline-none hover:bg-(--finance-glass-hover) focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none",
              )}
            >
              {payments.count === 0 ? (
                <>
                  <CircleCheckIcon aria-hidden="true" className={cn("size-4", FINANCE_TONE.up)} />
                  <span>Keine Rechnung offen</span>
                </>
              ) : (
                <>
                  <ReceiptTextIcon
                    aria-hidden="true"
                    className={cn("size-4", FINANCE_TONE.invoice)}
                  />
                  <span>
                    {payments.count === 1
                      ? "1 Rechnung offen"
                      : `${payments.count} Rechnungen offen`}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatEuroFromCents(payments.totalCents)}
                  </span>
                  {payments.overdueCount > 0 && (
                    <span className={cn("font-semibold", FINANCE_TONE.down)}>
                      · davon {payments.overdueCount} überfällig
                    </span>
                  )}
                </>
              )}
            </Link>
          </li>
        </ul>
      </div>

      <div className="mt-6 px-5 pb-5 sm:px-8 sm:pb-6">
        {ledgerReady ? (
          curve && curve.values.length > 1 ? (
            <BalanceChart curve={curve} />
          ) : (
            // So hoch wie Verlauf, Achse und die Zeile darüber (`BalanceChart`) – der Kopf wirkt in beiden Fällen gleich.
            <p className="grid h-54 place-items-center rounded-2xl bg-white/5 px-4 text-center text-sm text-white/85 ring-1 ring-white/10 sm:h-58">
              Sobald das Kassenbuch ein paar Tage läuft, steht hier, wie sich der Kontostand
              entwickelt.
            </p>
          )
        ) : (
          <SetupSteps canManage={canManage} />
        )}
      </div>
    </section>
  );
}

const STEPS = [
  ["Beginn festlegen", "ab welchem Tag das Kassenbuch zählt, meist der 1. Januar"],
  ["Konten anlegen", "das Girokonto mit seiner Bank und, wenn es eine gibt, die Barkasse"],
  ["Anfangsbestände eintragen", "was an diesem Tag auf dem Konto und in der Kasse war"],
] as const;

/**
 * Leerzustand unten im Kopf (statt des Verlaufs): was nach dem Einrichten hier steht, die drei Schritte des Einrichtens als
 * Liste auf Glas und – mit „Finanzen bearbeiten“ – der Knopf dorthin (weiß auf der Nacht; der blaue Knopf der Seite bleibt
 * „Das steht an“ vorbehalten). Ohne das Recht ein Satz, wer es einrichten kann.
 */
function SetupSteps({ canManage }: { canManage: boolean }) {
  return (
    <div className="grid gap-5">
      <p className="max-w-prose text-sm text-white/85 sm:text-base">
        Danach siehst du hier, wie viel Geld auf allen Konten liegt, wie sich der Stand Tag für Tag
        entwickelt und was diesen Monat rein- und rausging.
      </p>
      <ol
        aria-label="So wird das Kassenbuch eingerichtet"
        className="grid divide-y divide-white/10 rounded-2xl bg-(--finance-glass) ring-1 ring-white/12"
      >
        {STEPS.map(([title, text], index) => (
          <li key={title} className="flex items-start gap-3 px-4 py-3">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-semibold"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">
              <span className="font-semibold">{title}</span>
              <span className="text-white/85"> – {text}</span>
            </span>
          </li>
        ))}
      </ol>
      {canManage ? (
        <Link
          href="/finanzen/kassenbuch"
          className="inline-flex h-10 items-center gap-2 justify-self-start rounded-full bg-white px-5 text-sm font-semibold text-slate-900 shadow-lg transition-transform outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-4 focus-visible:ring-offset-(--finance-night) motion-reduce:transition-none"
        >
          Kassenbuch einrichten
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <p className="text-sm text-white/85">
          Einrichten kann es, wer im Verein die Finanzen bearbeiten darf – meist der Kassenwart.
        </p>
      )}
    </div>
  );
}
