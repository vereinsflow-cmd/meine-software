import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, ClockIcon, HandHeartIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDateShort, formatTimeRange } from "@/lib/dates";
import { URGENCY_LABEL, shiftHealth } from "@/lib/shift-health";
import { cn } from "@/lib/utils";
import { QuickSignOutButton, QuickSignUpButton } from "@/modules/shifts/components/quick-actions";
import { FillBar, ShiftFillBadge, UrgencyBadge } from "@/modules/shifts/components/shift-status";
import { getStaffingOverview, listMyAssignments, listOpenShifts } from "@/modules/shifts/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferplanung" };

export default async function HelperPlanningPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "shifts:read")) return <NoAccess what="die Helferplanung" />;

  const [mine, open, staffing] = await Promise.all([
    listMyAssignments(ctx, { limit: 20 }),
    listOpenShifts(ctx, { limit: 30 }),
    getStaffingOverview(ctx),
  ]);
  const warnings = staffing.filter(
    (e) => e.worstUrgency === "CRITICAL" || e.worstUrgency === "OVERDUE",
  );
  const canManage = can(ctx, "shifts:manage");

  return (
    <>
      <PageHeader
        title="Helferplanung"
        description="Trage dich in offene Schichten ein und behalte den Überblick über deine Einsätze."
        actions={
          <Button asChild variant="outline">
            <Link href="/helferplanung/stunden">
              <ClockIcon /> Helferstunden
            </Link>
          </Button>
        }
      />

      {canManage && warnings.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlertIcon />
          <AlertTitle>Dringend: Schichten sind nicht besetzt</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 grid gap-1">
              {warnings.map((event) => (
                <li key={event.eventId}>
                  <Link
                    href={`/helferplanung/${event.eventId}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {event.title}
                  </Link>{" "}
                  ({formatDateShort(event.startsAt)}): {event.openShifts}{" "}
                  {event.openShifts === 1 ? "Schicht" : "Schichten"} nicht voll besetzt –{" "}
                  {URGENCY_LABEL[event.worstUrgency].toLowerCase()}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="meine-einsaetze">
          <Card className="h-full">
            <CardHeader>
              <CardTitle
                id="meine-einsaetze"
                role="heading"
                aria-level={2}
                className="flex items-center gap-2"
              >
                <CalendarClockIcon className="size-4" aria-hidden="true" /> Meine Einsätze
              </CardTitle>
              <CardDescription>Deine kommenden Helferschichten.</CardDescription>
            </CardHeader>
            <CardContent>
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Du bist aktuell für keine Schicht eingetragen.
                </p>
              ) : (
                <ul className="divide-y">
                  {mine.map((a) => (
                    <li
                      key={a.assignmentId}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/helferplanung/${a.event.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {a.title}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {a.event.title} · {formatDateShort(a.startsAt)},{" "}
                          {formatTimeRange(a.startsAt, a.endsAt)}
                        </p>
                        {a.meetingPoint && (
                          <p className="text-xs text-muted-foreground">
                            Treffpunkt: {a.meetingPoint}
                          </p>
                        )}
                      </div>
                      {a.canSignOut && (
                        <QuickSignOutButton
                          shiftId={a.shiftId}
                          eventId={a.event.id}
                          label={a.title}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="offene-schichten">
          <Card className="h-full">
            <CardHeader>
              <CardTitle
                id="offene-schichten"
                role="heading"
                aria-level={2}
                className="flex items-center gap-2"
              >
                <HandHeartIcon className="size-4" aria-hidden="true" /> Offene Schichten
              </CardTitle>
              <CardDescription>Hier werden noch Helfer gesucht.</CardDescription>
            </CardHeader>
            <CardContent>
              {open.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Im Moment sind alle Schichten besetzt. Danke!
                </p>
              ) : (
                <ul className="divide-y">
                  {open.map((item) => (
                    <li key={item.shiftId} className="grid gap-2 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/helferplanung/${item.event.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {item.title}
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            {item.event.title} · {formatDateShort(item.startsAt)},{" "}
                            {formatTimeRange(item.startsAt, item.endsAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <UrgencyBadge health={item.health} />
                          {item.signup.allowed && (
                            <QuickSignUpButton shiftId={item.shiftId} eventId={item.event.id} />
                          )}
                        </div>
                      </div>
                      <FillBar
                        filled={item.filled}
                        required={item.requiredCount}
                        health={item.health}
                      />
                      {!item.signup.allowed && item.signup.reason && (
                        <p className="text-xs text-muted-foreground">{item.signup.reason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="veranstaltungen-mit-schichten" className="mt-8">
        <h2 id="veranstaltungen-mit-schichten" className="mb-3 text-lg font-semibold">
          Veranstaltungen mit Helferplanung
        </h2>
        {staffing.length === 0 ? (
          <EmptyState
            icon={<HandHeartIcon />}
            title="Keine kommenden Schichten"
            description="Sobald für eine veröffentlichte Veranstaltung Schichten geplant sind, erscheinen sie hier."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {staffing.map((event) => {
              const health = shiftHealth({
                status: "OPEN",
                startsAt: event.startsAt,
                endsAt: event.startsAt,
                requiredCount: event.required,
                filled: event.filled,
              });
              return (
                <li key={event.eventId}>
                  <Link
                    href={`/helferplanung/${event.eventId}`}
                    className={cn(
                      "grid gap-2 rounded-xl border p-4 transition-colors hover:bg-accent/50",
                      (event.worstUrgency === "CRITICAL" || event.worstUrgency === "OVERDUE") &&
                        "border-red-300 dark:border-red-900",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{event.title}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDateShort(event.startsAt)}
                      </span>
                    </div>
                    <FillBar filled={event.filled} required={event.required} health={health} />
                    <div className="flex flex-wrap gap-1.5">
                      <ToneBadge tone="neutral">
                        {event.shifts} {event.shifts === 1 ? "Schicht" : "Schichten"}
                      </ToneBadge>
                      {event.openShifts === 0 ? (
                        <ShiftFillBadge health={{ ...health, fill: "FULL" }} />
                      ) : (
                        <ToneBadge tone={event.worstUrgency === "CRITICAL" ? "danger" : "warning"}>
                          {event.openShifts} nicht voll besetzt
                        </ToneBadge>
                      )}
                      {event.worstUrgency !== "NONE" && event.openShifts > 0 && (
                        <ToneBadge tone={event.worstUrgency === "SOON" ? "warning" : "danger"}>
                          {URGENCY_LABEL[event.worstUrgency]}
                        </ToneBadge>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
