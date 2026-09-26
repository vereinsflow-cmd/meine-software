import Link from "next/link";
import { CalendarOffIcon, MapPinIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import type { EventType } from "@/generated/prisma/enums";
import { EmptyState } from "@/components/shared/empty-state";
import { ToneBadge } from "@/components/shared/status-badge";
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  berlinParts,
  formatDateLong,
  formatTime,
  formatTimeRange,
  toDateInputValue,
} from "@/lib/dates";
import { EVENT_TYPE_LABEL, PARTICIPANT_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { CalendarEntry } from "../service";

/**
 * Darstellung der Kalenderansichten. Reine Server-Komponenten: Blättern, Ansicht und Filter laufen über Links und ein
 * GET-Formular – die Seite funktioniert ohne JavaScript und ist per Tastatur und Screenreader bedienbar.
 * Bedeutung steckt nie nur in der Farbe: Art, "abgesagt" und "Entwurf" stehen zusätzlich als Text da.
 */
const TYPE_STYLE: Record<EventType, string> = {
  EVENT: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/40",
  TRAINING: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
  MEETING: "border-l-violet-500 bg-violet-50 dark:bg-violet-950/40",
  COMPETITION: "border-l-orange-500 bg-orange-50 dark:bg-orange-950/40",
  WORK_ASSIGNMENT: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/40",
  OTHER: "border-l-slate-500 bg-slate-100 dark:bg-slate-800/60",
};
const SHIFT_STYLE = "border-l-sky-500 bg-sky-50 dark:bg-sky-950/40";

const styleOf = (entry: CalendarEntry) =>
  entry.kind === "shift" ? SHIFT_STYLE : TYPE_STYLE[entry.type ?? "OTHER"];
const accent = (entry: CalendarEntry): React.CSSProperties | undefined =>
  entry.color && /^#[0-9a-fA-F]{6}$/.test(entry.color)
    ? { borderLeftColor: entry.color }
    : undefined;
const kindLabel = (entry: CalendarEntry) =>
  entry.kind === "shift" ? "Helferschicht" : EVENT_TYPE_LABEL[entry.type ?? "OTHER"];

/** Uhrzeit-Text eines Eintrags an einem bestimmten Tag (mehrtägige Einträge: "ab …", "bis …", "ganztägig"). */
export function timeLabel(entry: CalendarEntry, dayKey: string): string {
  const startsToday = toDateInputValue(entry.startsAt) === dayKey;
  const endsToday = toDateInputValue(entry.endsAt) === dayKey;
  if (entry.allDay) return "ganztägig";
  if (startsToday && endsToday)
    return formatTimeRange(entry.startsAt, entry.endsAt).replace(" Uhr", "");
  if (startsToday) return `ab ${formatTime(entry.startsAt)}`;
  if (endsToday) return `bis ${formatTime(entry.endsAt)}`;
  return "ganztägig";
}

function shortTime(entry: CalendarEntry, dayKey: string): string | null {
  if (entry.allDay) return null;
  if (toDateInputValue(entry.startsAt) === dayKey) return formatTime(entry.startsAt);
  return null;
}

export function CalendarChip({ entry, dayKey }: { entry: CalendarEntry; dayKey: string }) {
  const cancelled = entry.status === "CANCELLED";
  const time = shortTime(entry, dayKey);
  return (
    <Link
      href={entry.href}
      style={accent(entry)}
      className={cn(
        "block rounded-md border border-l-4 px-1.5 py-1 text-xs leading-tight transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        styleOf(entry),
        entry.status === "DRAFT" && "border-dashed",
        cancelled && "opacity-70",
      )}
    >
      <span className="sr-only">{kindLabel(entry)}: </span>
      {time && <span className="font-medium tabular-nums">{time} </span>}
      <span className={cn(cancelled && "line-through")}>{entry.title}</span>
      {cancelled && <span className="sr-only"> (abgesagt)</span>}
      {entry.status === "DRAFT" && <span className="text-muted-foreground"> (Entwurf)</span>}
    </Link>
  );
}

interface DayCellProps {
  day: Date;
  byDay: Map<string, CalendarEntry[]>;
  todayKey: string;
  hrefForDay: (day: Date) => string;
}

const MAX_CHIPS_IN_MONTH = 3;

/** Monatsansicht als Tabelle (ab Tablet-Breite). Auf dem Smartphone übernimmt die Terminliste darunter. */
export function MonthGrid({
  days,
  month,
  ...cell
}: { days: Date[]; month: number } & Omit<DayCellProps, "day">) {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">Monatsübersicht der Termine</caption>
        <thead>
          <tr className="bg-muted/50">
            {WEEKDAY_SHORT.map((weekday, index) => (
              <th key={weekday} scope="col" className="border-b p-2 text-left text-xs font-medium">
                <abbr title={WEEKDAY_LONG[index]} className="no-underline">
                  {weekday}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={toDateInputValue(week[0]!)}>
              {week.map((day) => {
                const key = toDateInputValue(day);
                const entries = cell.byDay.get(key) ?? [];
                const parts = berlinParts(day);
                const inMonth = parts.month === month;
                const isToday = key === cell.todayKey;
                return (
                  <td
                    key={key}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "h-32 border-t border-l p-1 align-top first:border-l-0",
                      !inMonth && "bg-muted/30",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Link
                        href={cell.hrefForDay(day)}
                        aria-label={`${formatDateLong(day)} öffnen`}
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-full text-xs hover:bg-accent",
                          !inMonth && "text-muted-foreground",
                          isToday &&
                            "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                        )}
                      >
                        {parts.day}
                      </Link>
                    </div>
                    <ul className="grid gap-1">
                      {entries.slice(0, MAX_CHIPS_IN_MONTH).map((entry) => (
                        <li key={entry.key}>
                          <CalendarChip entry={entry} dayKey={key} />
                        </li>
                      ))}
                    </ul>
                    {entries.length > MAX_CHIPS_IN_MONTH && (
                      <Link
                        href={cell.hrefForDay(day)}
                        className="mt-1 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        + {entries.length - MAX_CHIPS_IN_MONTH} weitere
                      </Link>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Wochenansicht: sieben Spalten ab Tablet-Breite; darunter (Smartphone) die Terminliste der Woche. */
export function WeekColumns({
  days,
  byDay,
  todayKey,
  hrefForDay,
}: { days: Date[] } & Omit<DayCellProps, "day">) {
  return (
    <div className="hidden gap-2 md:grid md:grid-cols-7">
      {days.map((day) => {
        const key = toDateInputValue(day);
        const entries = byDay.get(key) ?? [];
        const isToday = key === todayKey;
        return (
          <section
            key={key}
            aria-label={formatDateLong(day)}
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "min-h-40 rounded-xl border p-2",
              isToday && "border-primary ring-1 ring-primary/30",
            )}
          >
            <h3 className="mb-2 text-xs font-medium">
              <Link href={hrefForDay(day)} className="hover:underline">
                {WEEKDAY_SHORT[days.indexOf(day)]}, {berlinParts(day).day}.
                {String(berlinParts(day).month).padStart(2, "0")}.
              </Link>
              {isToday && <span className="ml-1 text-primary">Heute</span>}
            </h3>
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">–</p>
            ) : (
              <ul className="grid gap-1">
                {entries.map((entry) => (
                  <li key={entry.key}>
                    <CalendarChip entry={entry} dayKey={key} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Ausführliche Zeile für Tages-, Listen- und Smartphone-Ansicht. */
export function EntryRow({ entry, dayKey }: { entry: CalendarEntry; dayKey: string }) {
  const cancelled = entry.status === "CANCELLED";
  return (
    <li>
      <Link
        href={entry.href}
        style={accent(entry)}
        className={cn(
          "flex flex-col gap-1 rounded-lg border border-l-4 p-3 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-row sm:gap-4",
          styleOf(entry),
          entry.status === "DRAFT" && "border-dashed",
          cancelled && "opacity-75",
        )}
      >
        <span className="w-28 shrink-0 text-sm font-medium tabular-nums">
          {timeLabel(entry, dayKey)}
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("font-medium", cancelled && "line-through")}>{entry.title}</span>
            {entry.kind === "shift" && (
              <ToneBadge tone="info">
                <AREA_ICON.helferplanung className="size-3" aria-hidden="true" /> Helferschicht
              </ToneBadge>
            )}
            {cancelled && <ToneBadge tone="danger">Abgesagt</ToneBadge>}
            {entry.status === "DRAFT" && <ToneBadge tone="neutral">Entwurf</ToneBadge>}
            {entry.myStatus && entry.myStatus !== "DECLINED" && (
              <ToneBadge tone={entry.myStatus === "ACCEPTED" ? "success" : "warning"}>
                {PARTICIPANT_STATUS_LABEL[entry.myStatus]}
              </ToneBadge>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span>{kindLabel(entry)}</span>
            {entry.subtitle && <span>{entry.subtitle}</span>}
            {entry.departmentName && <span>{entry.departmentName}</span>}
            {entry.location && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden="true" /> {entry.location}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Terminliste gruppiert nach Tagen. Standardmäßig nur Tage mit Terminen. */
export function Agenda({
  days,
  byDay,
  todayKey,
  hrefForDay,
  className,
  emptyHint,
}: { days: Date[]; className?: string; emptyHint?: string } & Omit<DayCellProps, "day">) {
  const filled = days.filter((day) => (byDay.get(toDateInputValue(day)) ?? []).length > 0);
  if (filled.length === 0) {
    return (
      <EmptyState
        icon={<CalendarOffIcon />}
        title="Keine Termine"
        description={
          emptyHint ??
          "In diesem Zeitraum gibt es keine Termine, die zu den gewählten Filtern passen."
        }
        className={className}
      />
    );
  }
  return (
    <ol className={cn("grid gap-5", className)}>
      {filled.map((day) => {
        const key = toDateInputValue(day);
        return (
          <li key={key} aria-current={key === todayKey ? "date" : undefined}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Link href={hrefForDay(day)} className="hover:underline">
                {formatDateLong(day)}
              </Link>
              {key === todayKey && <ToneBadge tone="info">Heute</ToneBadge>}
            </h3>
            <ul className="grid gap-2">
              {(byDay.get(key) ?? []).map((entry) => (
                <EntryRow key={`${entry.key}-${key}`} entry={entry} dayKey={key} />
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
