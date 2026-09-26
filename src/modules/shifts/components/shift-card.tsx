"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  InfoIcon,
  MapPinIcon,
  ShieldAlertIcon,
  TrashIcon,
  UserMinusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { IconButton } from "@/components/shared/icon-button";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDateLong, formatDuration, formatTimeRange } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteShiftAction, signOutAction, signUpAction, unassignMemberAction } from "../actions";
import type { ShiftFormInput } from "../schemas";
import type { ShiftDto } from "../service";
import { AssignDialog, HoursDialog, ShiftFormDialog } from "./shift-dialogs";
import { FillBar, ShiftFillBadge, UrgencyBadge } from "./shift-status";

/** Eine Schicht: Besetzung, Details, Eintragen/Austragen und (für Veranstalter) Verwaltung. */
export function ShiftCard({
  shift,
  eventId,
  eventStatus,
  editDefaults,
  members,
}: {
  shift: ShiftDto;
  eventId: string;
  eventStatus: string;
  editDefaults: ShiftFormInput | null;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const started = shift.started;
  const cancelled = shift.status === "CANCELLED";
  const planned = Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000);

  function run(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error?.message ?? "Aktion fehlgeschlagen.");
      else toast.success(success);
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "grid gap-4 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_16rem]",
        shift.mine && "border-primary/60 bg-primary/5 ring-1 ring-primary/20",
        cancelled && "opacity-70",
        shift.health.urgency === "CRITICAL" || shift.health.urgency === "OVERDUE"
          ? "border-red-300 dark:border-red-900"
          : null,
      )}
      aria-label={`Schicht ${shift.title}`}
    >
      <div className="grid content-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("text-base font-semibold", cancelled && "line-through")}>
            {shift.title}
          </h3>
          <ShiftFillBadge health={shift.health} />
          <UrgencyBadge health={shift.health} />
          {shift.mine && <ToneBadge tone="info">Mein Einsatz</ToneBadge>}
          {shift.status === "CLOSED" && <ToneBadge tone="neutral">Anmeldung geschlossen</ToneBadge>}
        </div>
        {shift.taskName && <p className="text-sm">{shift.taskName}</p>}
        <p className="text-sm text-muted-foreground">
          {formatDateLong(shift.startsAt)} · {formatTimeRange(shift.startsAt, shift.endsAt)} (
          {formatDuration(planned)})
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {shift.meetingPoint && (
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="size-3.5" aria-hidden="true" /> Treffpunkt:{" "}
              {shift.meetingPoint}
            </span>
          )}
          {shift.minAge !== null && (
            <span className="inline-flex items-center gap-1">
              <ShieldAlertIcon className="size-3.5" aria-hidden="true" /> ab {shift.minAge} Jahren
            </span>
          )}
          {shift.responsible && <span>Verantwortlich: {shift.responsible.name}</span>}
        </div>
        {shift.description && <p className="text-sm whitespace-pre-wrap">{shift.description}</p>}
        {shift.requirements && (
          <p className="inline-flex items-start gap-1.5 text-sm">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Anforderung:{" "}
            {shift.requirements}
          </p>
        )}
        {shift.internalNotes && (
          <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm">Intern: {shift.internalNotes}</p>
        )}

        <div className="mt-1">
          <p className="mb-1 text-xs font-medium">Eingetragen ({shift.assignments.length})</p>
          {shift.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch niemand.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {shift.assignments.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-sm",
                    a.isMe ? "bg-primary/15 font-medium" : "bg-muted",
                  )}
                >
                  {a.name}
                  {a.isMe && <span className="text-xs">(ich)</span>}
                  {shift.can.hours && started && (
                    <HoursDialog
                      assignmentId={a.id}
                      eventId={eventId}
                      name={a.name}
                      plannedMinutes={planned}
                      currentMinutes={a.workedMinutes}
                    />
                  )}
                  {!shift.can.hours && a.workedMinutes !== null && a.isMe && (
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(a.workedMinutes)}
                    </span>
                  )}
                  {shift.can.assign && !started && (
                    <IconButton
                      className="size-6"
                      disabled={pending}
                      label={`${a.name} austragen`}
                      onClick={() =>
                        run(
                          () =>
                            unassignMemberAction({
                              shiftId: shift.id,
                              memberId: a.memberId,
                              eventId,
                            }),
                          "Helfer ausgetragen.",
                        )
                      }
                    >
                      <XIcon />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid content-start gap-3">
        <FillBar filled={shift.filled} required={shift.requiredCount} health={shift.health} />

        {shift.signup.allowed && !shift.mine && (
          <Button
            disabled={pending}
            onClick={() =>
              run(() => signUpAction({ shiftId: shift.id, eventId }), "Du bist eingetragen.")
            }
          >
            {pending ? "Einen Moment …" : "Eintragen"}
          </Button>
        )}
        {shift.mine && shift.can.signOut && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => signOutAction({ shiftId: shift.id, eventId }), "Du hast dich ausgetragen.")
            }
          >
            <UserMinusIcon /> Austragen
          </Button>
        )}
        {!shift.signup.allowed &&
          !shift.mine &&
          shift.signup.reason &&
          eventStatus === "PUBLISHED" && (
            <p className="text-sm text-muted-foreground" role="note">
              {shift.signup.reason}
            </p>
          )}

        {(shift.can.manage || shift.can.assign) && !cancelled && (
          <div className="flex flex-wrap items-center gap-1 border-t pt-3">
            {shift.can.assign && (
              <AssignDialog shiftId={shift.id} eventId={eventId} title={shift.title} />
            )}
            {shift.can.manage && editDefaults && (
              <ShiftFormDialog
                eventId={eventId}
                shiftId={shift.id}
                defaults={editDefaults}
                members={members}
              />
            )}
            {shift.can.manage && (
              <ConfirmAction
                destructive
                trigger={
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <TrashIcon /> Löschen
                  </Button>
                }
                title="Schicht löschen?"
                description={
                  shift.assignments.length > 0
                    ? `Die ${shift.assignments.length} Eingetragenen werden ausgetragen und benachrichtigt.`
                    : "Die Schicht wird gelöscht."
                }
                confirmLabel="Löschen"
                action={() => deleteShiftAction({ id: shift.id, eventId })}
                successMessage="Schicht gelöscht."
                onSuccess={() => router.refresh()}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}
