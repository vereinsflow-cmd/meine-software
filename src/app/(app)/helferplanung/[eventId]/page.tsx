import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
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
import { buildTimeline } from "@/modules/shifts/timeline";
import { isAppError } from "@/server/errors";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferplan" };

export default async function EventShiftsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ctx = await requirePageContext();
  if (!can(ctx, "shifts:read")) return <NoAccess what="die Helferplanung" />;

  const plan = await listShiftsForEvent(ctx, eventId).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!plan) notFound();

  const members = await listResponsibleOptions(ctx);
  const active = plan.shifts.filter((s) => s.status !== "CANCELLED");
  const required = active.reduce((sum, s) => sum + s.requiredCount, 0);
  const filled = active.reduce((sum, s) => sum + Math.min(s.filled, s.requiredCount), 0);
  const canPlan = plan.canManage || plan.canAssign;
  const when = plan.event.allDay
    ? "ganztägig"
    : formatTimeRange(plan.event.startsAt, plan.event.endsAt);

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
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{formatDateLong(plan.event.startsAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{when}</span>
            {plan.event.locationName && (
              <>
                <span aria-hidden="true">·</span>
                <span>{plan.event.locationName}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <Link
              href={`/veranstaltungen/${eventId}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Zur Veranstaltung
            </Link>
          </span>
        }
        actions={
          <>
            {plan.canManage && plan.event.status !== "CANCELLED" && (
              <ShiftFormDialog eventId={eventId} defaults={newDefaults} members={members} />
            )}
            <Button asChild variant="outline">
              <Link href={`/helferplanung/drucken?event=${eventId}`}>
                <PrinterIcon /> Drucken
              </Link>
            </Button>
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

      {plan.shifts.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.helferplanung />}
          title="Noch keine Schichten"
          description={
            plan.canManage
              ? "Lege Schichten an, z. B. Aufbau, Getränkestand und Abbau – mit der Zahl der benötigten Helfer."
              : "Für diese Veranstaltung sind noch keine Helferschichten geplant."
          }
          action={
            plan.canManage ? (
              <ShiftFormDialog eventId={eventId} defaults={newDefaults} members={members} />
            ) : undefined
          }
        />
      ) : (
        <section
          aria-labelledby="tagesablauf"
          className="overflow-hidden rounded-xl border bg-card shadow-xs"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 sm:px-6">
            <h2 id="tagesablauf" className="text-lg font-semibold">
              Tagesablauf
            </h2>
            <p className="text-sm tabular-nums">
              <span className="font-semibold">
                {filled} von {required}
              </span>{" "}
              Plätzen besetzt
              <span className="text-muted-foreground"> · {required - filled} frei</span>
            </p>
          </header>
          <ShiftPlan
            eventId={eventId}
            eventStartsAt={plan.event.startsAt}
            eventStatus={plan.event.status}
            shifts={plan.shifts}
            timeline={timeline}
            editDefaults={editDefaults}
            members={members}
          />
        </section>
      )}
    </>
  );
}
