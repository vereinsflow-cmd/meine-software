import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { EventType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import {
  CALENDAR_VIEWS,
  VIEW_LABEL,
  calendarRange,
  entriesByDay,
  parseAnchor,
  parseView,
  shiftAnchor,
  viewTitle,
} from "@/lib/calendar-grid";
import { berlinParts, formatDateTime, startOfBerlinDay, toDateInputValue } from "@/lib/dates";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import { buildQuery, enumParam, param, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { Agenda, MonthGrid, WeekColumns } from "@/modules/calendar/components/calendar-views";
import { FeedDialog } from "@/modules/calendar/components/feed-dialog";
import { getFeedStatus } from "@/modules/calendar/feed";
import { listCalendarDepartments, listCalendarEntries } from "@/modules/calendar/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Kalender" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "events:read")) return <NoAccess what="den Kalender" />;

  const view = parseView(param(params, "ansicht"));
  const anchor = parseAnchor(param(params, "datum"));
  const type = enumParam(params, "art", Object.values(EventType));
  const departmentId = param(params, "abteilung");
  const mine = param(params, "meine") === "1";
  const filtered = Boolean(type || departmentId || mine);

  const range = calendarRange(view, anchor);
  const [{ entries, truncated }, departments, feed] = await Promise.all([
    listCalendarEntries(ctx, range, { type, departmentId, mine }),
    listCalendarDepartments(ctx),
    getFeedStatus(ctx),
  ]);
  const byDay = entriesByDay(entries, range.days);
  const todayKey = toDateInputValue(new Date());
  const title = viewTitle(view, anchor);

  // Links behalten Filter und Ansicht; nur Ansicht und Datum ändern sich.
  const href = (changes: Record<string, string | undefined>) =>
    `/kalender${buildQuery(params, changes)}`;
  const dateHref = (view_: string, day: Date) =>
    href({ ansicht: view_, datum: toDateInputValue(day) });
  const hrefForDay = (day: Date) => dateHref("tag", day);
  const prev = shiftAnchor(view, anchor, -1);
  const next = shiftAnchor(view, anchor, 1);
  const cell = { byDay, todayKey, hrefForDay };
  const noun = { monat: "Monat", liste: "Monat", woche: "Woche", tag: "Tag" }[view];

  return (
    <>
      <PageHeader
        title="Kalender"
        description="Alle Termine des Vereins und deine Helferschichten."
        actions={
          <>
            <FeedDialog
              active={feed.active}
              createdLabel={feed.createdAt ? formatDateTime(feed.createdAt) : null}
              lastUsedLabel={feed.lastUsedAt ? formatDateTime(feed.lastUsedAt) : null}
            />
            <Button asChild variant="outline">
              <Link href="/veranstaltungen">Veranstaltungen</Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label={`Vorheriger ${noun}`}>
            <Link href={dateHref(view, prev)} scroll={false}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label={`Nächster ${noun}`}>
            <Link href={dateHref(view, next)} scroll={false}>
              <ChevronRightIcon />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={dateHref(view, startOfBerlinDay(new Date()))} scroll={false}>
              Heute
            </Link>
          </Button>
          <h2 className="ml-1 text-lg font-semibold" aria-live="polite">
            {title}
          </h2>
        </div>

        <nav aria-label="Ansicht wählen" className="inline-flex rounded-lg bg-muted p-0.5">
          {CALENDAR_VIEWS.map((option) => (
            <Link
              key={option}
              href={dateHref(option, anchor)}
              aria-current={option === view ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                option === view
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_LABEL[option]}
            </Link>
          ))}
        </nav>
      </div>

      <form
        key={JSON.stringify(params)}
        method="get"
        action="/kalender"
        role="search"
        aria-label="Kalender filtern"
        className="mb-5 flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="ansicht" value={view} />
        <input type="hidden" name="datum" value={toDateInputValue(anchor)} />
        <div className="grid gap-1.5">
          <Label htmlFor="kal-art">Art</Label>
          <NativeSelect id="kal-art" name="art" defaultValue={type ?? ""} className="w-44">
            <option value="">Alle Arten</option>
            {Object.values(EventType).map((value) => (
              <option key={value} value={value}>
                {EVENT_TYPE_LABEL[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kal-abteilung">Abteilung</Label>
          <NativeSelect
            id="kal-abteilung"
            name="abteilung"
            defaultValue={departmentId ?? ""}
            className="w-48"
          >
            <option value="">Alle Abteilungen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {ctx.memberId && (
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="meine"
              value="1"
              defaultChecked={mine}
              className="size-4"
            />{" "}
            Nur meine Termine
          </label>
        )}
        <Button type="submit">Filtern</Button>
        {filtered && (
          <Button asChild variant="ghost">
            <Link
              href={`/kalender${buildQuery({ ansicht: view, datum: toDateInputValue(anchor) }, {})}`}
            >
              Zurücksetzen
            </Link>
          </Button>
        )}
      </form>

      {truncated && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          Es gibt sehr viele Termine in diesem Zeitraum – angezeigt werden die ersten 500. Wähle
          eine kürzere Ansicht oder filtere nach Art oder Abteilung.
        </p>
      )}

      {view === "monat" && (
        <>
          <MonthGrid days={range.days} month={berlinParts(anchor).month} {...cell} />
          <Agenda
            days={range.days.filter((day) => berlinParts(day).month === berlinParts(anchor).month)}
            className="md:hidden"
            {...cell}
            emptyHint="In diesem Monat gibt es keine Termine, die zu den gewählten Filtern passen."
          />
        </>
      )}
      {view === "woche" && (
        <>
          <WeekColumns days={range.days} {...cell} />
          <Agenda
            days={range.days}
            className="md:hidden"
            {...cell}
            emptyHint="In dieser Woche gibt es keine Termine, die zu den gewählten Filtern passen."
          />
        </>
      )}
      {view === "tag" && (
        <Agenda
          days={range.days}
          {...cell}
          emptyHint="An diesem Tag gibt es keine Termine, die zu den gewählten Filtern passen."
        />
      )}
      {view === "liste" && (
        <Agenda
          days={range.days}
          {...cell}
          emptyHint="In diesem Monat gibt es keine Termine, die zu den gewählten Filtern passen."
        />
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarCheckIcon className="size-3.5" aria-hidden="true" /> {entries.length}{" "}
        {entries.length === 1 ? "Eintrag" : "Einträge"} im sichtbaren Zeitraum. Zeiten in Ortszeit
        (Europe/Berlin).
      </p>
    </>
  );
}
