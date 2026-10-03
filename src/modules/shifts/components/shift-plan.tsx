"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClockIcon, EllipsisIcon, PencilIcon, TrashIcon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { IconButton } from "@/components/shared/icon-button";
import { useMoreActions } from "@/components/shared/more-actions";
import { formatDateShort, formatDuration, formatTimeRange, toDateInputValue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { assignMemberAction, deleteShiftAction, unassignMemberAction } from "../actions";
import type { ShiftFormInput } from "../schemas";
import type { ShiftDto } from "../service";
import { STAFFING_TONE_CLASS, staffingText } from "../staffing-text";
import type { Timeline } from "../timeline";
import { QuickSignOutButton, QuickSignUpButton } from "./quick-actions";
import { AssignDialog, HoursDialog, ShiftFormDialog } from "./shift-dialogs";

/**
 * Helferplan einer Veranstaltung (seit 03.10.2026, Entwurf 2 „Tagesablauf“): oben eine Zeitleiste, in der jede Schicht als
 * Balken an ihrer Uhrzeit steht (parallele Schichten auf eigenen Bahnen), darunter die Liste aller Schichten. Ein Klick auf
 * einen Balken oder einen Schichtnamen klappt die Schicht auf – mit allen Namen, „×“ zum Austragen, Stunden und
 * „Zuweisen“. Je Schicht ein Hauptknopf (Eintragen/Austragen), alles Weitere im Menü „⋯“. Am Handy fehlt die Zeitleiste;
 * die Liste reicht dort.
 */

export interface PlanTimeline extends Omit<Timeline, "bars"> {
  bars: (Timeline["bars"][number] & { shiftId: string })[];
  /** Beschriftung des Bands der Veranstaltung, z. B. „Sommerfest 2026 · 14:00 – 22:00 Uhr“. */
  bandLabel: string;
}

const rowId = (shiftId: string) => `schicht-${shiftId}`;
const panelId = (shiftId: string) => `schicht-${shiftId}-helfer`;

/** Höhe einer Bahn der Zeitleiste und Platz für das Band der Veranstaltung darüber. */
const LANE = 2.6; // rem
const BAND = 2.2; // rem

export function ShiftPlan({
  eventId,
  eventStartsAt,
  eventStatus,
  shifts,
  timeline,
  editDefaults,
  members,
}: {
  eventId: string;
  /** Beginn der Veranstaltung – liegt eine Schicht an einem anderen Tag, steht bei jeder ihr Tag. */
  eventStartsAt: Date;
  eventStatus: string;
  shifts: ShiftDto[];
  timeline: PlanTimeline | null;
  /** Werte für „Schicht bearbeiten“ je Schicht (`null` = darf nicht bearbeitet werden). */
  editDefaults: Record<string, ShiftFormInput | null>;
  members: { id: string; name: string }[];
}) {
  // Aufgeklappt ist anfangs die eigene Schicht – sie interessiert am meisten.
  const [selectedId, setSelectedId] = useState<string | null>(
    () => shifts.find((shift) => shift.mine)?.id ?? null,
  );
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  // Liegen Schichten an einem anderen Tag als die Veranstaltung beginnt (oder an verschiedenen), steht bei jeder ihr Tag.
  const multiDay =
    new Set([
      toDateInputValue(eventStartsAt),
      ...shifts.map((shift) => toDateInputValue(shift.startsAt)),
    ]).size > 1;

  function select(shiftId: string, scroll: boolean) {
    setSelectedId(shiftId);
    if (!scroll) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(rowId(shiftId))
      ?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <>
      {timeline && (
        <div
          role="group"
          aria-label="Tagesablauf"
          className="hidden px-6 pt-3 pb-5 md:block lg:px-10"
        >
          <div
            aria-hidden="true"
            className="relative h-5 text-xs text-muted-foreground tabular-nums"
          >
            {timeline.ticks.map((tick) => (
              <span
                key={tick.left}
                className="absolute top-0 -translate-x-1/2 leading-none"
                style={{ left: `${tick.left}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          <div aria-hidden="true" className="h-px bg-border" />
          <div
            className="relative"
            style={{
              height: `${(timeline.band ? BAND : 0.5) + timeline.lanes * LANE + 0.5}rem`,
            }}
          >
            {timeline.ticks.map((tick) => (
              <span
                key={tick.left}
                aria-hidden="true"
                className="absolute inset-y-0 w-px bg-border/60"
                style={{ left: `${tick.left}%` }}
              />
            ))}
            {timeline.band && (
              <span
                className="absolute top-1.5 h-6 truncate border-b-2 border-primary pl-2 text-xs font-medium text-primary before:absolute before:bottom-[-2px] before:left-0 before:h-3 before:border-l-2 before:border-primary"
                style={{ left: `${timeline.band.left}%`, width: `${timeline.band.width}%` }}
              >
                {timeline.bandLabel}
              </span>
            )}
            {timeline.bars.map((bar) => {
              const shift = byId.get(bar.shiftId);
              if (!shift) return null;
              const staffing = staffingText(shift);
              const selected = selectedId === shift.id;
              return (
                <button
                  key={shift.id}
                  type="button"
                  aria-expanded={selected}
                  aria-controls={panelId(shift.id)}
                  aria-label={`${shift.title}, ${formatTimeRange(shift.startsAt, shift.endsAt)}, ${staffing.count} besetzt, ${staffing.note}${shift.mine ? ", du bist dabei" : ""}`}
                  onClick={() => select(shift.id, true)}
                  className={cn(
                    "@container/bar absolute flex h-9 items-center gap-1.5 overflow-hidden rounded-lg border bg-card px-2.5 text-left text-sm whitespace-nowrap shadow-xs transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected &&
                      "border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5",
                  )}
                  style={{
                    left: `calc(${bar.left}% + 2px)`,
                    width: `calc(${bar.width}% - 4px)`,
                    top: `${(timeline.band ? BAND : 0.5) + bar.lane * LANE}rem`,
                  }}
                >
                  <span className="truncate font-semibold">{shift.title}</span>
                  {shift.mine && <YouChip />}
                  <span
                    className={cn(
                      // Schmale Balken zeigen nur den Namen (die Zahl steht in der Liste und im Namen des Knopfs).
                      "ml-auto hidden shrink-0 tabular-nums @min-[9rem]/bar:inline",
                      staffing.tone === "none"
                        ? "text-muted-foreground"
                        : STAFFING_TONE_CLASS[staffing.tone],
                      staffing.tone !== "none" && "font-medium",
                    )}
                  >
                    {staffing.note === "voll" ? "voll" : staffing.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ul className="border-t">
        {shifts.map((shift) => (
          <ShiftRow
            key={shift.id}
            shift={shift}
            eventId={eventId}
            eventStatus={eventStatus}
            multiDay={multiDay}
            selected={selectedId === shift.id}
            onToggle={() => setSelectedId((current) => (current === shift.id ? null : shift.id))}
            onSelect={() => select(shift.id, false)}
            editDefaults={editDefaults[shift.id] ?? null}
            members={members}
          />
        ))}
      </ul>
    </>
  );
}

function YouChip() {
  return (
    <span className="rounded-md bg-primary/10 px-1.5 text-xs leading-5 font-semibold text-primary">
      Du
    </span>
  );
}

/**
 * Eine Schicht: Zeit · Name, Aufgabe, Treffpunkt, Verantwortlich · Besetzung und Namen · Hauptknopf und „⋯“. Aufgeklappt
 * stehen die Namen untereinander (mit „×“ bzw. Stunden), dazu Beschreibung, Anforderungen und interne Hinweise.
 */
function ShiftRow({
  shift,
  eventId,
  eventStatus,
  multiDay,
  selected,
  onToggle,
  onSelect,
  editDefaults,
  members,
}: {
  shift: ShiftDto;
  eventId: string;
  eventStatus: string;
  multiDay: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  editDefaults: ShiftFormInput | null;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { triggerRef, show, dialog } = useMoreActions<"assign" | "edit" | "delete">();
  const cancelled = shift.status === "CANCELLED";
  const staffing = staffingText(shift);
  const planned = Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000);
  const free = shift.health.freeSpots;
  const canAssign = shift.can.assign && !cancelled;
  const canHours = shift.can.hours && shift.started;
  const canEdit = shift.can.manage && editDefaults !== null && !cancelled;
  const hasMenu = canAssign || canHours || canEdit || shift.can.manage;
  // Warum man sich nicht eintragen kann – nur, wenn es nicht ohnehin dasteht (voll, läuft, geschlossen, abgesagt).
  const showReason =
    !shift.signup.allowed &&
    !shift.mine &&
    shift.signup.reason &&
    eventStatus === "PUBLISHED" &&
    shift.health.fill !== "FULL" &&
    !shift.started &&
    shift.status === "OPEN";

  type Run = () => Promise<{ ok: boolean; error?: { message: string } }>;
  /** Führt die Aktion aus und meldet das Ergebnis; mit `undo` bietet die Meldung „Rückgängig“ an. */
  function run(action: Run, success: string, undo?: { action: Run; success: string }) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error?.message ?? "Aktion fehlgeschlagen.");
      else
        toast.success(success, {
          action: undo && { label: "Rückgängig", onClick: () => run(undo.action, undo.success) },
        });
      router.refresh();
    });
  }

  // „Stunden erfassen“ klappt die Schicht auf; wenn das Menü zu ist, springt der Fokus zum ersten Stunden-Knopf (statt
  // wie sonst zurück zu „⋯“).
  const focusHours = useRef(false);
  function recordHours() {
    focusHours.current = true;
    onSelect();
  }

  return (
    <li
      id={rowId(shift.id)}
      aria-label={`Schicht ${shift.title}`}
      className={cn(
        "grid scroll-mt-24 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 sm:px-6 xl:grid-cols-[8.5rem_minmax(10rem,1fr)_minmax(0,16rem)_9.5rem] xl:gap-x-6 [&+&]:border-t",
        selected && "bg-primary/5",
        cancelled && "text-muted-foreground",
      )}
    >
      <p className="col-start-1 row-start-1 text-sm tabular-nums xl:pt-0.5">
        {multiDay && <span className="block">{formatDateShort(shift.startsAt)}</span>}
        {formatTimeRange(shift.startsAt, shift.endsAt)}
      </p>

      <div className="col-span-2 min-w-0 xl:col-span-1 xl:col-start-2 xl:row-start-1">
        <h3 className={cn("text-base font-semibold", cancelled && "line-through")}>
          <button
            type="button"
            aria-expanded={selected}
            aria-controls={panelId(shift.id)}
            onClick={onToggle}
            className="rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
          >
            {shift.title}
          </button>
          {shift.minAge !== null && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ab {shift.minAge} Jahren
            </span>
          )}
          {shift.status === "CLOSED" && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">· nur Zuweisung</span>
          )}
        </h3>
        {shift.taskName && <p className="text-sm text-foreground/80">{shift.taskName}</p>}
        {(shift.meetingPoint || shift.responsible) && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            {shift.meetingPoint && <span className="block">Treffpunkt: {shift.meetingPoint}</span>}
            {shift.responsible && (
              <span className="block">Verantwortlich: {shift.responsible.name}</span>
            )}
          </p>
        )}
        {showReason && (
          <p className="mt-1.5 text-sm text-muted-foreground" role="note">
            {shift.signup.reason}
          </p>
        )}
        {selected && (shift.description || shift.requirements || shift.internalNotes) && (
          <div className="mt-2 grid gap-1.5 text-sm">
            {shift.description && <p className="whitespace-pre-wrap">{shift.description}</p>}
            {shift.requirements && <p>Anforderung: {shift.requirements}</p>}
            {shift.internalNotes && (
              <p className="rounded-md bg-muted px-2.5 py-1.5">Intern: {shift.internalNotes}</p>
            )}
          </div>
        )}
      </div>

      <div className="col-span-2 min-w-0 xl:col-span-1 xl:col-start-3 xl:row-start-1">
        <p className="text-sm font-medium tabular-nums">
          {staffing.count}{" "}
          <span
            className={cn(
              staffing.tone === "none"
                ? "font-normal text-muted-foreground"
                : STAFFING_TONE_CLASS[staffing.tone],
            )}
          >
            · {staffing.note}
          </span>
        </p>
        <div id={panelId(shift.id)}>
          {!selected ? (
            <p className="mt-0.5 text-sm text-foreground/80">
              {shift.assignments.length === 0 ? (
                <span className="text-muted-foreground">Noch niemand eingetragen</span>
              ) : (
                shift.assignments.map((a, index) => (
                  <span key={a.id}>
                    {index > 0 && ", "}
                    {a.name}
                    {a.isMe && " (du)"}
                  </span>
                ))
              )}
            </p>
          ) : (
            <ul aria-label="Eingetragen" className="mt-2">
              {shift.assignments.map((a) => (
                <li
                  key={a.id}
                  className="flex min-h-10 items-center gap-2 border-t border-primary/15 text-sm"
                >
                  <span className="flex flex-1 items-center gap-2">
                    {a.name}
                    {a.isMe && <YouChip />}
                    {!canHours && a.isMe && a.workedMinutes !== null && (
                      <span className="text-muted-foreground">
                        · {formatDuration(a.workedMinutes)}
                      </span>
                    )}
                  </span>
                  {canHours && (
                    <HoursDialog
                      assignmentId={a.id}
                      eventId={eventId}
                      name={a.name}
                      plannedMinutes={planned}
                      currentMinutes={a.workedMinutes}
                    />
                  )}
                  {shift.can.assign && !shift.started && !cancelled && (
                    // Trefferfläche 32 px; verklickt? „Rückgängig“ in der Meldung.
                    <IconButton
                      className="-mr-1.5 size-8 text-muted-foreground max-sm:size-11"
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
                          `${a.name} ausgetragen.`,
                          {
                            action: () =>
                              assignMemberAction({
                                shiftId: shift.id,
                                memberId: a.memberId,
                                eventId,
                              }),
                            success: `${a.name} ist wieder eingetragen.`,
                          },
                        )
                      }
                    >
                      <XIcon />
                    </IconButton>
                  )}
                </li>
              ))}
              {free > 0 && !cancelled && (
                <li className="flex min-h-10 items-center gap-2 border-t border-primary/15 text-sm">
                  <span className="flex-1 text-muted-foreground">
                    {free === 1 ? "1 Platz frei" : `${free} Plätze frei`}
                  </span>
                  {canAssign && (
                    // Eigener Dialog mit eigenem Knopf: Nach dem Schließen kehrt der Fokus hierher zurück (nicht zu „⋯“).
                    <AssignDialog
                      shiftId={shift.id}
                      eventId={eventId}
                      title={shift.title}
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
                  )}
                </li>
              )}
              {shift.assignments.length === 0 && free === 0 && (
                <li className="border-t border-primary/15 py-2 text-sm text-muted-foreground">
                  Für diese Schicht sind keine Helfer nötig.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="col-start-2 row-start-1 -mt-1 -mr-2 flex items-start justify-end gap-0.5 xl:col-start-4">
        {shift.signup.allowed && !shift.mine && (
          <QuickSignUpButton
            shiftId={shift.id}
            eventId={eventId}
            variant="ghost"
            label={shift.title}
            className="text-primary hover:text-primary max-sm:h-11"
          />
        )}
        {shift.mine && shift.can.signOut && (
          <QuickSignOutButton
            shiftId={shift.id}
            eventId={eventId}
            label={shift.title}
            quiet
            className="max-sm:h-11"
          />
        )}
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={triggerRef}
                variant="ghost"
                size="icon-sm"
                className="max-sm:size-11"
                aria-label={`Weitere Aktionen für „${shift.title}“`}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              collisionPadding={16}
              onCloseAutoFocus={(event) => {
                if (!focusHours.current) return;
                focusHours.current = false;
                event.preventDefault();
                document
                  .querySelector<HTMLElement>(`#${CSS.escape(panelId(shift.id))} [data-hours]`)
                  ?.focus();
              }}
              className="min-w-52 [&>[data-slot=dropdown-menu-item]]:gap-2 [&>[data-slot=dropdown-menu-item]]:py-2"
            >
              {canAssign && (
                <DropdownMenuItem onSelect={() => show("assign")}>
                  <UserPlusIcon /> Helfer zuweisen
                </DropdownMenuItem>
              )}
              {canHours && (
                <DropdownMenuItem onSelect={recordHours}>
                  <ClockIcon /> Stunden erfassen
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onSelect={() => show("edit")}>
                  <PencilIcon /> Schicht bearbeiten
                </DropdownMenuItem>
              )}
              {shift.can.manage && (
                <>
                  {(canAssign || canHours || canEdit) && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant="destructive" onSelect={() => show("delete")}>
                    <TrashIcon /> Schicht löschen
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {canAssign && (
        <AssignDialog
          shiftId={shift.id}
          eventId={eventId}
          title={shift.title}
          {...dialog("assign")}
        />
      )}
      {canEdit && editDefaults && (
        <ShiftFormDialog
          eventId={eventId}
          shiftId={shift.id}
          defaults={editDefaults}
          members={members}
          {...dialog("edit")}
        />
      )}
      {shift.can.manage && (
        <ConfirmAction
          destructive
          {...dialog("delete")}
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
    </li>
  );
}
