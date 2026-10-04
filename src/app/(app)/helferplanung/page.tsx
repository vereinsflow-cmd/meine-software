import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import {
  daysUntil,
  formatDayMonth,
  formatTime,
  formatTimeRange,
  inDaysLabel,
  toDateInputValue,
} from "@/lib/dates";
import { URGENCY_LABEL } from "@/lib/shift-health";
import { cn } from "@/lib/utils";
import { QuickSignOutButton, QuickSignUpButton } from "@/modules/shifts/components/quick-actions";
import { AssignDialog } from "@/modules/shifts/components/shift-dialogs";
import {
  listMyAssignments,
  listUpcomingShiftPlans,
  type PlanningEvent,
  type PlanningShift,
} from "@/modules/shifts/service";
import { STAFFING_TONE_CLASS, joinTitles, staffingText } from "@/modules/shifts/staffing-text";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferplanung" };

/** So viele eigene Einsätze zeigt die Übersicht (die Zahl daneben sagt, ob es mehr sind). */
const MINE_SHOWN = 20;

/**
 * Übersicht der Helferplanung (seit 03.10.2026, Entwurf 2 „Tagesablauf“): ein ruhiger Hinweis auf bald unbesetzte
 * Schichten (nur für Veranstalter), die eigenen Einsätze und je kommender Veranstaltung die Schichten mit freien Plätzen –
 * mit „Eintragen“ bzw. „Zuweisen“; volle Schichten stehen in einer Zeile darunter. Keine Abzeichen und Balken: Besetzung
 * als Text („3 von 4 · 1 frei“), Farbe nur, wo sie etwas bedeutet.
 */
export default async function HelperPlanningPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "shifts:read")) return <NoAccess what="die Helferplanung" />;

  const [mineAll, events] = await Promise.all([
    listMyAssignments(ctx, { limit: MINE_SHOWN + 1 }),
    listUpcomingShiftPlans(ctx),
  ]);
  const mine = mineAll.slice(0, MINE_SHOWN);
  const mineCount = mineAll.length > MINE_SHOWN ? `mehr als ${MINE_SHOWN}` : String(mine.length);
  const signupFree = events.reduce((sum, event) => sum + event.signupFreeSpots, 0);

  // Bald (in den nächsten 7 Tagen) und nicht voll besetzt – nur, wo man selbst einteilen kann.
  const urgent = events
    .filter((event) => event.canAssign || event.canManage)
    .map((event) => ({
      event,
      shifts: event.shifts.filter(
        (shift) =>
          shift.health.fill !== "FULL" &&
          (shift.health.urgency === "CRITICAL" || shift.health.urgency === "SOON"),
      ),
    }))
    .filter((entry) => entry.shifts.length > 0);

  return (
    <>
      <PageHeader
        title="Helferplanung"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/helferplanung/stunden">
                <AREA_ICON.helferstunden /> Helferstunden
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/helferplanung/drucken">
                <PrinterIcon /> Helferplan drucken
              </Link>
            </Button>
          </>
        }
      />

      {urgent.length > 0 && (
        <section
          aria-label="Bald und noch nicht besetzt"
          className="mb-8 grid rounded-xl border bg-card shadow-xs"
        >
          {urgent.map(({ event, shifts }) => (
            <UrgentLine key={event.eventId} event={event} shifts={shifts} />
          ))}
        </section>
      )}

      <section aria-labelledby="meine-einsaetze" className="mb-9">
        <SectionHeading id="meine-einsaetze" title="Meine Einsätze" focusable>
          {mine.length > 0 && `${mineCount} ${mine.length === 1 ? "kommender" : "kommende"}`}
        </SectionHeading>
        <div className="rounded-xl border bg-card shadow-xs">
          {mine.length === 0 ? (
            <p className="px-4 py-3.5 text-sm text-muted-foreground sm:px-6">
              Du bist für keine kommende Schicht eingetragen.
            </p>
          ) : (
            <ul>
              {mine.map((a) => (
                <li
                  key={a.assignmentId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-0.5 px-4 py-3 sm:px-6 xl:grid-cols-[8rem_9.5rem_minmax(0,1fr)_minmax(0,16rem)_auto] [&+&]:border-t"
                >
                  <span className="font-semibold tabular-nums">{formatDayMonth(a.startsAt)}</span>
                  <span className="text-sm text-muted-foreground tabular-nums max-xl:col-start-1">
                    {formatTimeRange(a.startsAt, a.endsAt)}
                  </span>
                  <span className="min-w-0 max-xl:col-start-1">
                    <Link
                      href={`/helferplanung/${a.event.id}?schicht=${a.shiftId}`}
                      className="block font-medium underline-offset-4 hover:underline"
                    >
                      {a.title}
                    </Link>
                    <span className="block text-sm text-muted-foreground">{a.event.title}</span>
                  </span>
                  <span className="text-sm text-muted-foreground max-xl:col-start-1">
                    {a.meetingPoint && `Treffpunkt: ${a.meetingPoint}`}
                  </span>
                  <span className="justify-self-end max-xl:col-start-2 max-xl:row-span-4 max-xl:row-start-1">
                    {a.canSignOut ? (
                      <QuickSignOutButton
                        shiftId={a.shiftId}
                        eventId={a.event.id}
                        label={a.title}
                        quiet
                        focusAfter="meine-einsaetze"
                        className="-mr-2 max-sm:h-11"
                      />
                    ) : (
                      // Hat schon begonnen (vorbei ist hier nichts): Austragen geht nicht mehr.
                      <span className="text-sm text-muted-foreground">läuft</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="veranstaltungen-mit-schichten">
        <SectionHeading
          id="veranstaltungen-mit-schichten"
          title="Veranstaltungen mit Helferplanung"
        >
          {events.length > 0 &&
            `${events.length} kommende · ${signupFree} ${
              signupFree === 1 ? "Platz" : "Plätze"
            } zum Eintragen frei`}
        </SectionHeading>
        {events.length === 0 ? (
          <EmptyState
            icon={<AREA_ICON.helferplanung />}
            title="Keine kommenden Schichten"
            description="Sobald für eine veröffentlichte Veranstaltung Schichten geplant sind, erscheinen sie hier."
          />
        ) : (
          <div className="rounded-xl border bg-card shadow-xs">
            {events.map((event) => (
              <EventBlock key={event.eventId} event={event} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function SectionHeading({
  id,
  title,
  focusable = false,
  children,
}: {
  id: string;
  title: string;
  /** Fokus-Ziel nach einer Aktion, deren Knopf danach verschwindet (z. B. „Austragen“ in „Meine Einsätze“). */
  focusable?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2
        id={id}
        tabIndex={focusable ? -1 : undefined}
        className="text-lg font-semibold outline-none"
      >
        {title}
      </h2>
      {children && <span className="text-sm text-muted-foreground tabular-nums">{children}</span>}
    </div>
  );
}

/** „heute um 18:00 Uhr“, „morgen um 9:00 Uhr“, „Sa., 10. Okt. (in 7 Tagen)“ – oder „läuft seit 12:00 Uhr“. */
function whenText(shift: Pick<PlanningShift, "startsAt" | "started">) {
  const time = `${formatTime(shift.startsAt)} Uhr`;
  if (shift.started) return `läuft seit ${time}`;
  const days = Math.max(0, daysUntil(shift.startsAt));
  if (days <= 1) return `${inDaysLabel(days)} um ${time}`;
  return `${formatDayMonth(shift.startsAt)} (${inDaysLabel(days)})`;
}

function UrgentLine({ event, shifts }: { event: PlanningEvent; shifts: PlanningShift[] }) {
  const critical = shifts.some((shift) => shift.health.urgency === "CRITICAL");
  const allEmpty = shifts.every((shift) => shift.filled === 0);
  const first = shifts[0]!;
  // Gleichnamige Schichten (z. B. zwei „Getränkestand“ zu verschiedenen Zeiten) nur einmal nennen.
  const titles = [...new Set(shifts.map((shift) => shift.title))];
  return (
    <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 py-3 text-sm sm:px-5 [&+&]:border-t">
      <span className="min-w-0 flex-1 basis-full sm:basis-0">
        {/* Der Punkt steht im Text – so bleibt er bei mehrzeiligen Hinweisen auf der ersten Zeile. */}
        <span
          aria-hidden="true"
          className={cn(
            "mr-2.5 inline-block size-2 rounded-full align-[0.0625rem]",
            critical ? "bg-red-600" : "bg-amber-500",
          )}
        />
        <span
          className={cn(
            "font-semibold",
            critical ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400",
          )}
        >
          {URGENCY_LABEL[critical ? "CRITICAL" : "SOON"]}:
        </span>{" "}
        {joinTitles(titles)} bei „{event.title}“ {titles.length === 1 ? "ist" : "sind"} noch{" "}
        {allEmpty ? "unbesetzt" : "nicht voll besetzt"} – {whenText(first)}.
      </span>
      <Link
        href={`/helferplanung/${event.eventId}`}
        className="-ml-2.5 inline-flex h-8 items-center rounded-lg px-2.5 font-medium text-primary hover:bg-muted max-sm:h-11 sm:ml-auto"
      >
        Zum Helferplan
      </Link>
    </p>
  );
}

/** Eine kommende Veranstaltung: Datum links, rechts Name, Eckdaten und die Schichten mit freien Plätzen. */
function EventBlock({ event }: { event: PlanningEvent }) {
  const headingId = `veranstaltung-${event.eventId}`;
  const open = event.shifts.filter((shift) => shift.health.fill !== "FULL");
  const full = event.shifts.filter((shift) => shift.health.fill === "FULL");
  const days = daysUntil(event.startsAt);
  const href = `/helferplanung/${event.eventId}`;
  // Vor heute begonnen: „läuft“, solange die Veranstaltung dauert – danach nichts (z. B. nur noch der Abbau am Folgetag).
  const dayLabel = days >= 0 ? inDaysLabel(days) : event.running ? "läuft" : null;
  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-x-5 gap-y-2 px-4 pt-5 pb-4 sm:px-6 lg:grid-cols-[7.5rem_minmax(0,1fr)] [&+&]:border-t"
    >
      <p className="font-semibold tabular-nums">
        {formatDayMonth(event.startsAt)}
        {dayLabel && (
          <span className="ml-2 font-normal text-muted-foreground lg:ml-0 lg:block lg:text-sm">
            {dayLabel}
          </span>
        )}
      </p>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
          {/* tabIndex -1: Fokus-Ziel nach „Eintragen“/„Zuweisen“ in den Zeilen darunter (deren Knopf dann verschwindet). */}
          <h3 id={headingId} tabIndex={-1} className="text-base font-semibold outline-none">
            <Link href={href} className="underline-offset-4 hover:underline">
              {event.title}
            </Link>
          </h3>
          <Link
            href={href}
            className="inline-flex items-center gap-0.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Helferplan <span className="sr-only">{event.title}</span>
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt)} ·{" "}
          {/* Sind schon Schichten vorbei, zählt die Übersicht nur die übrigen – „noch“ sagt das (der Helferplan zählt alle). */}
          {event.endedShifts > 0 && "noch "}
          {event.shifts.length} {event.shifts.length === 1 ? "Schicht" : "Schichten"} ·{" "}
          {event.filled} von {event.required} {event.required === 1 ? "Platz" : "Plätzen"} besetzt
          {event.required > event.filled && `, ${event.required - event.filled} frei`}
        </p>

        {open.length > 0 && (
          <ul className="mt-3" aria-label={`Freie Plätze: ${event.title}`}>
            {open.map((shift) => (
              <OpenShiftRow key={shift.id} event={event} shift={shift} />
            ))}
          </ul>
        )}
        {full.length > 0 && (
          <p
            className={cn(
              "border-t pt-2.5 text-sm text-muted-foreground",
              open.length === 0 && "mt-3",
            )}
          >
            {open.length === 0 ? "Alle Schichten voll besetzt" : "Außerdem voll besetzt"}:{" "}
            {full.map((shift, index) => (
              <span key={shift.id}>
                {index > 0 && ", "}
                {shift.title}
                {shift.mine && " (du bist dabei)"}
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

/** Eine Schicht mit freien Plätzen in der Übersicht: Zeit · Name · Besetzung · Eintragen, „Du bist dabei“ oder Zuweisen. */
function OpenShiftRow({ event, shift }: { event: PlanningEvent; shift: PlanningShift }) {
  const staffing = staffingText(shift);
  // Warum man sich nicht eintragen kann – nur, wenn es nicht ohnehin dasteht (läuft, geschlossen).
  const reason =
    !shift.signup.allowed && !shift.mine && !shift.started && shift.status === "OPEN"
      ? shift.signup.reason
      : null;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-0.5 border-t py-2 sm:min-h-11 xl:grid-cols-[8.5rem_minmax(0,1fr)_10.5rem_7rem]">
      <span className="text-sm text-muted-foreground tabular-nums max-xl:col-start-1 max-xl:row-start-2">
        {/* Schichten an einem anderen Tag als die Veranstaltung beginnt (Aufbau am Vortag …) tragen ihr Datum. */}
        {toDateInputValue(shift.startsAt) !== toDateInputValue(event.startsAt) &&
          `${formatDayMonth(shift.startsAt)}, `}
        {formatTimeRange(shift.startsAt, shift.endsAt)}
      </span>
      <span className="min-w-0 max-xl:col-start-1 max-xl:row-start-1">
        <span className="font-medium">{shift.title}</span>
        {shift.minAge !== null && (
          <span className="ml-2 text-sm text-muted-foreground">ab {shift.minAge} Jahren</span>
        )}
        {shift.status === "CLOSED" && (
          <span className="ml-2 text-sm text-muted-foreground">· nur Zuweisung</span>
        )}
        {reason && (
          <span className="block text-sm text-muted-foreground" role="note">
            {reason}
          </span>
        )}
      </span>
      <span className="text-sm tabular-nums max-xl:col-start-1 max-xl:row-start-3">
        <span className={cn(staffing.tone !== "none" && STAFFING_TONE_CLASS[staffing.tone])}>
          {staffing.count}
          {staffing.tone !== "none" && ` · ${staffing.note}`}
        </span>
        {staffing.tone === "none" && (
          <span className="text-muted-foreground"> · {staffing.note}</span>
        )}
      </span>
      <span className="justify-self-end max-xl:col-start-2 max-xl:row-span-3 max-xl:row-start-1">
        {shift.mine ? (
          // Bündig mit dem Text der Knöpfe darüber und darunter (die haben Innenabstand und -mr-2).
          <span className="pr-1 text-sm text-muted-foreground">Du bist dabei</span>
        ) : shift.signup.allowed ? (
          <QuickSignUpButton
            shiftId={shift.id}
            eventId={event.eventId}
            variant="ghost"
            label={shift.title}
            focusAfter={`veranstaltung-${event.eventId}`}
            className="-mr-2 text-primary hover:text-primary max-sm:h-11"
          />
        ) : event.canAssign ? (
          <AssignDialog
            shiftId={shift.id}
            eventId={event.eventId}
            title={shift.title}
            focusAfter={`veranstaltung-${event.eventId}`}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="-mr-2 text-primary hover:text-primary max-sm:h-11"
                aria-label={`Helfer für ${shift.title} zuweisen`}
              >
                Zuweisen
              </Button>
            }
          />
        ) : null}
      </span>
    </li>
  );
}
