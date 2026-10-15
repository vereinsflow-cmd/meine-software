import Link from "next/link";
import { formatEuroFromCents } from "@/lib/dates";
import { FREE_PURPOSE } from "../format";
import type { DonationsPageData } from "../summary";

/** So viele feste Zwecke stehen einzeln da – der Rest kommt in eine Zeile „Weitere feste Zwecke“. */
const SHOWN = 5;

type Purpose = DonationsPageData["purposes"][number];

const countText = (purpose: Pick<Purpose, "count" | "bound">) =>
  `${purpose.count === 1 ? "1 Spende" : `${purpose.count} Spenden`}, ${
    purpose.bound ? "fester Zweck" : "für alles nutzbar"
  }`;

/**
 * „Wofür gespendet wurde“: je Zweck ein Balken (fester Zweck blau, „Frei verwendbar“ grau und immer zuletzt), Betrag und
 * Anzahl als Text daneben – der Balken ist schmückend. Ein Klick auf den Zweck zeigt seine Spenden in „Alle Spenden“.
 */
export function PurposeBars({ purposes, year }: { purposes: Purpose[]; year: number }) {
  const bound = purposes.filter((purpose) => purpose.bound);
  const free = purposes.filter((purpose) => !purpose.bound);
  const rest = bound.slice(SHOWN);
  const rows: (Purpose & { href?: string })[] = [
    ...bound.slice(0, SHOWN).map((purpose) => ({
      ...purpose,
      href: `/finanzen/spenden/alle?jahr=${year}&zweck=${encodeURIComponent(purpose.key)}`,
    })),
    ...(rest.length > 0
      ? [
          {
            key: "weitere",
            label:
              rest.length === 1 ? "1 weiterer fester Zweck" : `${rest.length} weitere feste Zwecke`,
            cents: rest.reduce((sum, purpose) => sum + purpose.cents, 0),
            count: rest.reduce((sum, purpose) => sum + purpose.count, 0),
            bound: true,
          },
        ]
      : []),
    ...free.map((purpose) => ({
      ...purpose,
      href: `/finanzen/spenden/alle?jahr=${year}&zweck=${FREE_PURPOSE}`,
    })),
  ];
  const max = Math.max(1, ...rows.map((row) => row.cents));
  return (
    <ul className="grid gap-4">
      {rows.map((row) => (
        <li key={row.key} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            {row.href ? (
              <Link
                href={row.href}
                className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
              >
                {row.label}
              </Link>
            ) : (
              <span className="min-w-0 font-medium break-words">{row.label}</span>
            )}
            <span className="font-semibold whitespace-nowrap tabular-nums">
              {formatEuroFromCents(row.cents)}
            </span>
          </div>
          <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(2, Math.round((row.cents / max) * 1000) / 10)}%`,
                backgroundColor: row.bound ? "var(--primary)" : "var(--chart-neutral)",
              }}
            />
          </span>
          <span className="text-muted-foreground">{countText(row)}</span>
        </li>
      ))}
    </ul>
  );
}
