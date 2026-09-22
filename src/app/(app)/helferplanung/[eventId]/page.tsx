import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCheckIcon,
  ChevronLeftIcon,
  DownloadIcon,
  HandHeartIcon,
  PrinterIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDateLong, formatTimeRange, toDateInputValue, toTimeInputValue } from "@/lib/dates";
import { ShiftCard } from "@/modules/shifts/components/shift-card";
import { ShiftFormDialog } from "@/modules/shifts/components/shift-dialogs";
import { listResponsibleOptions, listShiftsForEvent } from "@/modules/shifts/service";
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
      <p className="mb-3 print:hidden">
        <Link
          href="/helferplanung"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Helferplanung
        </Link>
      </p>
      <PageHeader
        title={`Helferplan: ${plan.event.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDateLong(plan.event.startsAt)} ·{" "}
            {formatTimeRange(plan.event.startsAt, plan.event.endsAt)}
            <ToneBadge tone={filled >= required && required > 0 ? "success" : "warning"}>
              {filled} von {required} Helfern
            </ToneBadge>
            <Link
              href={`/veranstaltungen/${eventId}`}
              className="text-primary underline-offset-4 hover:underline"
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
            {canPlan && (
              <Button asChild variant="outline">
                <a href={`/api/helferplanung/${eventId}/export`}>
                  <DownloadIcon /> CSV-Export
                </a>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/helferplanung/drucken?event=${eventId}`}>
                <PrinterIcon /> Drucken
              </Link>
            </Button>
          </>
        }
      />

      {plan.shifts.length === 0 ? (
        <EmptyState
          icon={<HandHeartIcon />}
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
        <ul className="grid gap-4">
          {plan.shifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              eventId={eventId}
              eventStatus={plan.event.status}
              members={members}
              editDefaults={
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
                  : null
              }
            />
          ))}
        </ul>
      )}
      {plan.canRecordHours && plan.shifts.some((s) => s.started) && (
        <p className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCheckIcon className="size-4" aria-hidden="true" /> Nach Beginn der Schicht kannst du
          bei jedem Helfer die geleisteten Stunden erfassen.
        </p>
      )}
    </>
  );
}
