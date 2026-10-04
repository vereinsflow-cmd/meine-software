import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { BackLink } from "@/components/shared/back-link";
import { formatDateLong, formatTimeRange, toDateInputValue, toTimeInputValue } from "@/lib/dates";
import { ShiftFormDialog } from "@/modules/shifts/components/shift-dialogs";
import { ShiftPlan, type PlanTimeline } from "@/modules/shifts/components/shift-plan";
import type { ShiftFormInput } from "@/modules/shifts/schemas";
import { listResponsibleOptions, listShiftsForEvent } from "@/modules/shifts/service";
import { staffingTotals } from "@/modules/shifts/staffing-text";
import { buildTimeline } from "@/modules/shifts/timeline";
import { isAppError } from "@/server/errors";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferplan" };

/** Hinweis über dem Plan, wenn die Veranstaltung nicht (mehr) veröffentlicht ist – dann geht kein Eintragen und Zuweisen. */
const STATUS_NOTE: Partial<Record<string, { title: string; text: string }>> = {
  DRAFT: {
    title: "Entwurf",
    text: "Die Veranstaltung ist noch nicht veröffentlicht. Eintragen und Zuweisen sind erst danach möglich.",
  },
  COMPLETED: {
    title: "Abgeschlossen",
    text: "Die Veranstaltung ist abgeschlossen. Helferstunden lassen sich weiter erfassen.",
  },
  ARCHIVED: { title: "Archiviert", text: "Die Veranstaltung ist archiviert." },
};

export default async function EventShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ schicht?: string | string[] }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const ctx = await requirePageContext();
  if (!can(ctx, "shifts:read")) return <NoAccess what="die Helferplanung" />;

  const plan = await listShiftsForEvent(ctx, eventId).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!plan) notFound();

  const members = await listResponsibleOptions(ctx);
  const status = plan.event.status;
  const cancelled = status === "CANCELLED";
  const active = plan.shifts.filter((s) => s.status !== "CANCELLED");
  const totals = staffingTotals(plan.shifts);
  const canPlan = plan.canManage || plan.canAssign;
  // Neue Schichten nur, solange die Veranstaltung nicht abgesagt oder archiviert ist (wie `createShift`).
  const canCreate = plan.canManage && !cancelled && status !== "ARCHIVED";
  const when = plan.event.allDay
    ? "ganztägig"
    : formatTimeRange(plan.event.startsAt, plan.event.endsAt);
  const facts = [formatDateLong(plan.event.startsAt), when, plan.event.locationName].filter(
    (fact): fact is string => Boolean(fact),
  );
  // Aus „Meine Einsätze“, Benachrichtigungen und Dashboard: `?schicht=<id>` öffnet genau diese Schicht.
  const linkedShift = typeof query.schicht === "string" ? query.schicht : undefined;
  const note = STATUS_NOTE[status];

  // Tagesablauf: Lage der (nicht abgesagten) Schichten auf der Zeitachse, berechnet hier – die Seite rechnet in Berliner
  // Zeit, der Browser zeigt nur an.
  const raw = buildTimeline(plan.event, active);
  const timeline: PlanTimeline | null = raw && {
    ...raw,
    bars: raw.bars.map((bar) => ({ ...bar, shiftId: active[bar.index]!.id })),
    bandLabel: `${plan.event.title} · ${when}`,
  };
  const editDefaults: Record<string, ShiftFormInput | null> = Object.fromEntries(
    plan.shifts.map((shift) => [
      shift.id,
      shift.can.manage
        ? {
            title: shift.title,
            taskName: shift.taskName ?? "",
            description: shift.description ?? "",
            date: toDateInputValue(shift.startsAt),
            startTime: toTimeInputValue(shift.startsAt),
            endTime: toTimeInputValue(shift.endsAt),
            meetingPoint: shift.meetingPoint ?? "",
            requiredCount: shift.requiredCount,
            minAge: shift.minAge ?? undefined,
            requirements: shift.requirements ?? "",
            internalNotes: shift.internalNotes ?? "",
            responsibleMemberId: shift.responsible?.id ?? "",
            status: shift.status === "CLOSED" ? "CLOSED" : "OPEN",
          }
        : null,
    ]),
  );
  const newDefaults = {
    title: "",
    taskName: "",
    description: "",
    date: toDateInputValue(plan.event.startsAt),
    startTime: toTimeInputValue(plan.event.startsAt),
    endTime: toTimeInputValue(plan.event.endsAt),
    meetingPoint: "",
    requiredCount: 3,
    minAge: undefined,
    requirements: "",
    internalNotes: "",
    responsibleMemberId: "",
    status: "OPEN" as const,
  };

  return (
    <>
      <BackLink href="/helferplanung" className="print:hidden">
        Helferplanung
      </BackLink>
      <PageHeader
        title={plan.event.title}
        description={
          <>
            {/* Eckdaten mit „·“ dazwischen. Jeder Punkt steht VOR seiner Angabe; am Zeilenanfang liegt er im
                abgeschnittenen Rand links – so bleibt beim Umbruch kein Punkt allein am Zeilenende stehen. */}
            <span className="block overflow-hidden">
              <span className="-ml-5 flex flex-wrap gap-y-0.5">
                {facts.map((fact) => (
                  <span key={fact} className="flex min-w-0">
                    <span aria-hidden="true" className="w-5 shrink-0 text-center">
                      ·
                    </span>
                    <span className="min-w-0">{fact}</span>
                  </span>
                ))}
              </span>
            </span>
            <Link
              href={`/veranstaltungen/${eventId}`}
              className="mt-1 inline-block font-medium text-primary underline-offset-4 hover:underline"
            >
              Zur Veranstaltung
            </Link>
          </>
        }
        actions={
          <>
            {canCreate && (
              <ShiftFormDialog eventId={eventId} defaults={newDefaults} members={members} />
            )}
            {/* Die Druckansicht zeigt nur veröffentlichte Veranstaltungen. */}
            {status === "PUBLISHED" && (
              <Button asChild variant="outline">
                <Link href={`/helferplanung/drucken?event=${eventId}`}>
                  <PrinterIcon /> Drucken
                </Link>
              </Button>
            )}
            {canPlan && (
              <Button asChild variant="outline">
                <a href={`/api/helferplanung/${eventId}/export`}>
                  <DownloadIcon /> CSV-Export
                </a>
              </Button>
            )}
          </>
        }
      />

      {cancelled ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Diese Veranstaltung wurde abgesagt</AlertTitle>
          {plan.event.cancelReason && (
            <AlertDescription>{plan.event.cancelReason}</AlertDescription>
          )}
        </Alert>
      ) : (
        note && (
          <Alert className="mb-6">
            <AlertTitle>{note.title}</AlertTitle>
            <AlertDescription>{note.text}</AlertDescription>
          </Alert>
        )
      )}

      {plan.shifts.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.helferplanung />}
          title="Noch keine Schichten"
          description={
            canCreate
              ? "Lege Schichten an, z. B. Aufbau, Getränkestand und Abbau – mit der Zahl der benötigten Helfer."
              : "Für diese Veranstaltung sind keine Helferschichten geplant."
          }
          action={
            canCreate ? (
              <ShiftFormDialog eventId={eventId} defaults={newDefaults} members={members} />
            ) : undefined
          }
        />
      ) : (
        <section
          aria-labelledby="tagesablauf"
          className="overflow-hidden rounded-xl border bg-card shadow-xs"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 pb-3 sm:px-6">
            {/* tabIndex -1: Nach dem Löschen einer Schicht landet der Fokus hier (die Zeile ist dann weg). */}
            <h2 id="tagesablauf" tabIndex={-1} className="text-lg font-semibold outline-none">
              Tagesablauf
            </h2>
            {active.length > 0 && (
              <p className="text-sm tabular-nums">
                <span className="font-semibold">
                  {totals.filled} von {totals.required}
                </span>{" "}
                {totals.required === 1 ? "Platz" : "Plätzen"} besetzt
                {totals.free && <span className="text-muted-foreground"> · {totals.free}</span>}
              </p>
            )}
          </header>
          <ShiftPlan
            eventId={eventId}
            eventStartsAt={plan.event.startsAt}
            eventStatus={status}
            shifts={plan.shifts}
            timeline={timeline}
            editDefaults={editDefaults}
            members={members}
            linkedShiftId={linkedShift}
          />
        </section>
      )}
    </>
  );
}
