import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { ACCOUNTS_COLUMN } from "@/modules/finance/components/account-card-stack";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";
import { YEAR_FIGURES } from "@/modules/finance/components/finance-year-card";
import { FINANCE_NIGHT } from "@/modules/finance/hero-look";

/** Zwei Spalten ab 1280 px – wie auf der fertigen Seite (`COLUMNS` in page.tsx). */
const COLUMNS = "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]";

/** Breiten der vier Jahreszahlen (Einnahmen, Ausgaben, Überschuss mit seinem Satz, Spenden), gemessen auf der Seite. */
const YEAR_FIGURE_WIDTHS = ["w-32", "w-32", "w-[18.75rem]", "w-[6.7rem]"];

/** Platzhalter auf der Nacht des Kopfs: ein Hauch Weiß statt der Schriftfarbe (die wäre im Hellen auf der Nacht unsichtbar). */
function NightBar({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-white/10 motion-safe:animate-pulse", className)} />;
}

/**
 * Kopf einer Karte: Titel (`CARD_TITLE`, 1,64 rem hoch) und eine Zeile darunter (`text-sm`, 1,36 rem). `phoneLines`: so viele
 * Zeilen kommen am Handy dazu (ein umbrechender Satz oder der Link, der dort unter den Titel rutscht).
 */
function CardHead({
  title,
  subtitle,
  phoneLines = 0,
}: {
  title: string;
  subtitle: string;
  phoneLines?: number;
}) {
  return (
    <div className="grid">
      <Skeleton className={cn("my-[0.2rem] h-[1.24rem] max-w-full", title)} />
      <Skeleton className={cn("my-[0.2rem] h-[0.96rem] max-w-full", subtitle)} />
      {Array.from({ length: phoneLines }, (_, index) => (
        <Skeleton key={index} className="mt-[0.45rem] mb-[0.2rem] h-[0.96rem] w-40 sm:hidden" />
      ))}
    </div>
  );
}

/**
 * Ladezustand der Finanz-Übersicht („Wie eine Banking-App“, seit 21.10.2026): links der Kopf schon auf der Nacht – Kontostand,
 * vier runde Schnellaktionen, Chips und der Verlauf in denselben Höhen und Abständen wie `FinanceHero` –, rechts der Stapel aus
 * zwei Kontokarten mit „Zusammen“; darunter „Zuletzt gebucht“ neben „Das steht an“, die Jahreszahlen mit den Balken und die
 * Abteilungen. Kopf und Leiste der Bereiche stehen schon echt da (`FinanceLoading`). So springt beim Erscheinen nichts: Der Kopf
 * wird nicht erst hell und dann dunkel, und alle Blöcke haben die Höhe des eingerichteten Kassenbuchs.
 *
 * Das gilt – gemessen – nur für Vereine mit Kassenbuch und mit allen vier Schnellaktionen. Ohne Kassenbuch ist die fertige Seite
 * viel kürzer (Kopf mit den Schritten, daneben „Noch keine Konten“), wer nur ansehen darf, hat eine statt vier Aktionen. Das
 * Gerüst kann das nicht wissen (es kommt ohne Abfrage); die Seite ohne Kassenbuch lädt dafür so schnell, dass es kaum zu sehen ist.
 */
export default function FinanzenLoading() {
  return (
    <FinanceLoading label="Finanzen werden geladen …">
      <div className={COLUMNS}>
        <div
          className="@container/finanzkopf self-start rounded-3xl px-5 pt-6 pb-5 ring-1 ring-black/5 sm:px-8 sm:pt-7 sm:pb-6 dark:ring-white/10"
          style={{ backgroundColor: FINANCE_NIGHT }}
        >
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-5">
            <div className="grid gap-2">
              <NightBar className="h-[1.36rem] w-44" />
              <NightBar className="h-[clamp(2.75rem,8cqi,4.5rem)] w-[clamp(12rem,34cqi,16rem)]" />
            </div>
            {/* Am Handy teilen sich die vier Aktionen die Breite wie in `QuickActions` (`FILL`). */}
            <div className="flex w-full justify-between gap-2 max-sm:gap-1 sm:w-auto sm:justify-start sm:pt-1">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="grid w-17 justify-items-center gap-2 max-sm:w-auto max-sm:min-w-0 max-sm:flex-auto"
                >
                  <NightBar className="size-14 rounded-full @max-xs/finanzkopf:size-12" />
                  <NightBar className="h-[1.14rem] w-14" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <NightBar className="h-[2.11rem] w-52 rounded-2xl" />
            <NightBar className="h-[2.11rem] w-80 max-w-full rounded-2xl" />
            {/* Die offenen Rechnungen brechen am Handy meist in zwei Zeilen um („… · davon 2 überfällig“). */}
            <NightBar className="h-[3.6rem] w-96 max-w-full rounded-2xl sm:h-[2.11rem]" />
          </div>
          <div className="mt-6 grid gap-2">
            <div className="flex items-center justify-between">
              <NightBar className="h-4 w-36" />
              <NightBar className="h-[1.64rem] w-24 rounded-full" />
            </div>
            <NightBar className="h-46 rounded-2xl sm:h-50" />
          </div>
        </div>

        <div className={cn("grid grid-cols-1 content-start gap-4", ACCOUNTS_COLUMN)}>
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-[1.64rem] w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Zwei Karten im Stapel: von der hinteren bleibt oben ein Streifen (4,75 rem) sichtbar. */}
          <div className="grid grid-cols-1">
            <Skeleton className="aspect-[1.586] rounded-[1.25rem] [grid-area:1/1]" />
            <Skeleton className="mt-19 aspect-[1.586] rounded-[1.25rem] [grid-area:1/1]" />
          </div>
          <Skeleton className="h-11.5 rounded-2xl" />
          <Skeleton className="h-5 w-56 justify-self-center" />
        </div>
      </div>

      <div className={COLUMNS}>
        {/* „Zuletzt gebucht“: Kopf, dann sechs Tage mit je einer Buchung (Zeile 4 rem wie `RecentEntries`). */}
        <div className={cn(CARD_SURFACE, "grid content-start gap-3 p-5")}>
          <CardHead title="w-44" subtitle="w-60" phoneLines={1} />
          <div className="grid gap-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="grid gap-1">
                <Skeleton className="my-[0.2rem] h-[0.74rem] w-28" />
                <div className="flex h-16 items-center gap-3.5 max-sm:h-[4.66rem]">
                  <Skeleton className="size-11 shrink-0 rounded-full" />
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3.5 w-4/5" />
                  </div>
                  <Skeleton className="h-4 w-20 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* „Das steht an“: Zähler und drei Punkte. Unter 1280 px steht die Karte in voller Breite – die Sätze brechen dann
            seltener um (am Handy dafür öfter). */}
        <div className={cn(CARD_SURFACE, "grid content-start gap-1 self-start p-5")}>
          <Skeleton className="my-[0.2rem] h-[1.24rem] w-36" />
          <Skeleton className="mb-2 h-[1.36rem] w-28" />
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="grid h-[7.9rem] content-center gap-2 border-t first-of-type:border-t-0 sm:h-[6.1rem] xl:h-[7.6rem]"
            >
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-8 w-36 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* Einnahmen und Ausgaben: Kopf, vier Jahreszahlen, Balken samt „Als Tabelle“. Die Jahreszeile ordnet sich wie auf der
          Seite (`YEAR_FIGURES`), die Platzhalter haben die Breiten der echten Zahlen – so bricht „Spenden“ zwischen 640 und
          1280 px hier wie dort in die zweite Zeile. */}
      <div className={cn(CARD_SURFACE, "grid content-start gap-4 p-5")}>
        <CardHead title="w-64" subtitle="w-80" phoneLines={2} />
        <div className={YEAR_FIGURES}>
          {/* Am Handy zwei Reihen: Einnahmen und Ausgaben ohne Satz darunter, Überschuss und Spenden mit umbrechendem Satz. */}
          {YEAR_FIGURE_WIDTHS.map((width, index) => (
            <Skeleton
              key={index}
              className={cn(
                "h-[4.72rem] max-sm:w-auto max-sm:grow max-sm:basis-[calc(50%-0.75rem)]",
                width,
                index < 2 ? "max-sm:h-[3.11rem]" : "max-sm:h-[7.15rem]",
              )}
            />
          ))}
        </div>
        {/* Wie `MonthChart`: Zeile mit „Als Tabelle“ (2 rem + 0,75 rem Lücke) und das Diagramm – 220 px hoch, solange es
            schmaler als 520 px ist (am Handy), sonst 280 px (`TimeChart`, `heights`). */}
        <Skeleton className="h-[calc(220px+2.75rem)] w-full rounded-lg sm:h-[calc(280px+2.75rem)]" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="px-1">
          <CardHead title="w-64" subtitle="w-96" phoneLines={2} />
        </div>
        <div className="-mx-4 flex gap-4 overflow-hidden px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 sm:pb-0 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/3] w-[78%] shrink-0 rounded-3xl sm:w-auto" />
          ))}
        </div>
      </div>
    </FinanceLoading>
  );
}
