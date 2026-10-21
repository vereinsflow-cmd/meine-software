import { formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { DepartmentCover } from "@/modules/departments/components/department-card";
import { CARD_SCRIM } from "@/modules/departments/department-image";
import type { DepartmentSpending } from "../overview";
import { SwipeList } from "./swipe-list";

/**
 * Ausgaben je Abteilung als „Töpfe“ (wie die Unterkonten einer Banking-App, seit 21.10.2026 statt der Balkenliste): Foto der
 * Abteilung (ohne passendes Foto der Verlauf in der Abteilungsfarbe) mit dunklem Verlauf und weißer Schrift – dieselbe Optik
 * wie die Abteilungskarten. Darauf Ausgegeben, Eingenommen und der Saldo; der Balken zeigt den Anteil an der größten Ausgabe
 * (die Zahl steht daneben). Der Saldo steht in Grün-100 bzw. Rosé-100 – auf der Abdeckung (mindestens 60 % Schwarz) auch
 * über einer weißen Bildstelle 4,5 : 1 (tests/unit/finance-hero-look.test.ts); das Vorzeichen sagt dasselbe ohne Farbe.
 * Zahlen aus `getFinanceOverview` (Buchungen mit Abteilung, nur „Finanzen ansehen“ nötig). Am Handy wischt man sie seitlich
 * durch; die Reihe ist dafür mit der Tastatur erreichbar und scrollbar (`SwipeList` – nur solange sie überläuft, auf breiten
 * Fenstern ist sie kein leerer Tabstopp).
 */
export function DepartmentPots({ departments }: { departments: readonly DepartmentSpending[] }) {
  const max = Math.max(...departments.map((d) => d.expenseCents), 1);
  return (
    <SwipeList
      aria-label="Abteilungen"
      className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:rounded-3xl sm:px-0 sm:pb-0 xl:grid-cols-4"
    >
      {departments.map((department) => {
        const net = department.incomeCents - department.expenseCents;
        return (
          <li
            key={department.departmentId}
            className="relative isolate aspect-[4/3] w-[78%] shrink-0 snap-start overflow-hidden rounded-3xl text-white shadow-[0_20px_40px_-24px_rgb(6_10_22/0.6)] ring-1 ring-black/5 sm:w-auto dark:ring-white/10"
          >
            <DepartmentCover
              name={department.name}
              color={null}
              sizes="(min-width: 80rem) 20rem, (min-width: 40rem) 50vw, 80vw"
              className="-z-10"
            />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 -z-10 h-1/2 bg-linear-to-b from-black/45 to-transparent"
            />
            <div className="absolute top-0 left-0 max-w-full p-4">
              <h3 className="truncate rounded-full bg-black/60 px-3 py-1 text-sm font-semibold backdrop-blur-sm">
                {department.name}
              </h3>
            </div>
            <div className="absolute inset-x-0 bottom-0">
              <span aria-hidden="true" className={cn("block h-12", CARD_SCRIM.fade)} />
              <div className={cn("grid gap-1 px-4 pb-4", CARD_SCRIM.text)}>
                <dl>
                  <div className="grid gap-1">
                    <dt className="text-xs font-semibold tracking-wide text-white/90 uppercase">
                      Ausgegeben
                    </dt>
                    <dd className="text-2xl leading-tight font-bold tracking-tight tabular-nums">
                      {formatEuroFromCents(department.expenseCents)}
                    </dd>
                  </div>
                </dl>
                <span
                  aria-hidden="true"
                  className="my-1.5 block h-1.5 overflow-hidden rounded-full bg-white/20"
                >
                  <span
                    className="block h-full rounded-full bg-white"
                    style={{
                      width: `${Math.max(3, Math.round((department.expenseCents / max) * 100))}%`,
                    }}
                  />
                </span>
                <dl className="flex flex-wrap justify-between gap-x-3 text-sm font-medium text-white/90 tabular-nums">
                  <div>
                    <dt className="sr-only">Eingenommen</dt>
                    <dd>
                      {formatEuroFromCents(department.incomeCents)}{" "}
                      <span aria-hidden="true">rein</span>
                    </dd>
                  </div>
                  <div
                    className={cn(
                      "flex gap-1 font-semibold",
                      net >= 0 ? "text-emerald-100" : "text-rose-100",
                    )}
                  >
                    <dt>Saldo</dt>
                    <dd>
                      {net > 0 ? "+" : net < 0 ? "−" : ""}
                      {formatEuroFromCents(Math.abs(net))}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </li>
        );
      })}
    </SwipeList>
  );
}
