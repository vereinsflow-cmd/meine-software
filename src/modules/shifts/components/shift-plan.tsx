"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { deleteShiftAction, undoUnassignAction, unassignMemberAction } from "../actions";
import type { ShiftFormInput } from "../schemas";
import type { ShiftDto } from "../service";
import { STAFFING_TONE_CLASS, staffingText } from "../staffing-text";
import type { Timeline } from "../timeline";
import { QuickSignOutButton, QuickSignUpButton } from "./quick-actions";
import { AssignDialog, HoursDialog, ShiftFormDialog } from "./shift-dialogs";

/**
 * Helferplan einer Veranstaltung (seit 03.10.2026, Entwurf 2 „Tagesablauf“): oben eine Zeitleiste, in der jede Schicht als
 * Balken an ihrer Uhrzeit steht (parallele Schichten auf eigenen Bahnen, Vorbeies blass, eine Linie für „jetzt“), darunter
 * die Liste aller Schichten. Ein Klick auf einen Balken oder einen Schichtnamen klappt die Schicht auf (ein zweiter wieder
 * zu) – mit allen Namen, „×“ zum Austragen, Stunden und „Zuweisen“. Je Schicht ein Hauptknopf (Eintragen/Austragen),
 * alles Weitere im Menü „⋯“. Am Handy fehlt die Zeitleiste; die Liste reicht dort.
 */

export interface PlanTimeline extends Omit<Timeline, "bars"> {
  bars: (Timeline["bars"][number] & { shiftId: string })[];
  /** Beschriftung des Bands der Veranstaltung, z. B. „Sommerfest 2026 · 14:00 – 22:00 Uhr“. */
  bandLabel: string;
}

const rowId = (shiftId: string) => `schicht-${shiftId}`;
const panelId = (shiftId: string) => `schicht-${shiftId}-helfer`;
/** Der Name der Schicht in der Liste – fester Platz für den Fokus, wenn ein Knopf nach einer Aktion verschwindet. */
const titleId = (shiftId: string) => `schicht-${shiftId}-titel`;
const focusById = (id: string) => document.getElementById(id)?.focus();

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
  linkedShiftId,
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
  /** Aus einem Link mit `?schicht=` – diese Schicht ist aufgeklappt und wird angezeigt. */
  linkedShiftId?: string;
}) {
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  const linked = linkedShiftId && byId.has(linkedShiftId) ? linkedShiftId : null;
  // Aufgeklappt ist anfangs die verlinkte Schicht, sonst die nächste eigene, die noch nicht vorbei ist.
  const [selectedId, setSelectedId] = useState<string | null>(
    () => linked ?? shifts.find((shift) => shift.mine && !shift.ended)?.id ?? null,
  );
  // Nach einem Klick auf einen Balken: erst aufklappen, dann (nach dem Zeichnen) die ganze Zeile ins Bild holen.
  const scrollTo = useRef<string | null>(linked);
  useEffect(() => {
    const id = scrollTo.current;
    if (!id || id !== selectedId) return;
    scrollTo.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(rowId(id))
      ?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selectedId]);
  // Liegen Schichten an einem anderen Tag als die Veranstaltung beginnt (oder an verschiedenen), steht bei jeder ihr Tag.
  const multiDay =
    new Set([
      toDateInputValue(eventStartsAt),
      ...shifts.map((shift) => toDateInputValue(shift.startsAt)),
    ]).size > 1;

  /** Balken: auf- und wieder zuklappen; beim Aufklappen geht der Fokus zur Zeile (sie liegt meist weiter unten). */
  function toggleFromBar(shiftId: string) {
    if (selectedId === shiftId) {
      setSelectedId(null);
      return;
    }
    scrollTo.current = shiftId;
    setSelectedId(shiftId);
    document.getElementById(titleId(shiftId))?.focus({ preventScroll: true });
  }

  return (
    <>
      {timeline && (
        <div role="group" aria-label="Tagesablauf" className="hidden px-6 pb-5 md:block lg:px-10">
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
              height: `${(timeline.band ? BAND : 0.5) + timeline.lanes * LANE + (timeline.now === null ? 0.5 : 1.5)}rem`,
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
            {timeline.now !== null && (
              // Hinter den Balken (sie sind deckend): sichtbar zwischen den Schichten, ohne Text zu durchstreichen.
              <span
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/70"
                style={{ left: `${timeline.now}%` }}
              >
                <span className="absolute bottom-0 left-1.5 text-xs leading-4 font-medium text-foreground">
                  jetzt
                </span>
              </span>
            )}
            {timeline.band && (
              <span
                className="absolute top-1.5 h-6 truncate border-b-2 border-primary pl-2 text-xs font-medium text-primary before:absolute before:bottom-[-2px] before:left-0 before:h-3 before:border-l-2 before:border-primary"
                style={{ left: `${timeline.band.left}%`, width: `${timeline.band.width}%` }}
              >
                {/* Grund hinter dem Text: Rasterlinien und „jetzt“ laufen nicht durch die Beschriftung. */}
                <span className="bg-card pr-1.5">{timeline.bandLabel}</span>
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
                  title={shift.title}
                  onClick={() => toggleFromBar(shift.id)}
                  className={cn(
                    // Was nicht mehr neben den Namen passt, rutscht in eine zweite, abgeschnittene Zeile: erst die Zahl, dann
                    // „Du“ – der Name bleibt am längsten lesbar.
                    "absolute flex h-9 flex-wrap content-start items-center gap-x-1.5 overflow-hidden rounded-lg border bg-card px-2.5 text-left text-sm shadow-xs transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    shift.ended && "bg-muted text-muted-foreground shadow-none",
                    selected &&
                      "border-primary bg-[color-mix(in_oklab,var(--color-primary)_6%,var(--color-card))] ring-1 ring-primary hover:bg-[color-mix(in_oklab,var(--color-primary)_6%,var(--color-card))]",
                  )}
                  style={{
                    left: `calc(${bar.left}% + 2px)`,
                    width: `calc(${bar.width}% - 4px)`,
                    top: `${(timeline.band ? BAND : 0.5) + bar.lane * LANE}rem`,
                  }}
                >
                  <span className="max-w-full min-w-0 truncate leading-[2.125rem] font-semibold whitespace-nowrap">
                    {shift.title}
                  </span>
                  {shift.mine && <YouChip />}
                  <span
                    className={cn(
                      "ml-auto shrink-0 leading-[2.125rem] whitespace-nowrap tabular-nums",
                      staffing.tone === "none"
                        ? "text-muted-foreground"
                        : cn(STAFFING_TONE_CLASS[staffing.tone], "font-medium"),
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
            onSelect={() => setSelectedId(shift.id)}
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
    <span className="shrink-0 rounded-md bg-primary/10 px-1.5 text-xs leading-5 font-semibold text-primary">
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
  const published = eventStatus === "PUBLISHED";
  const ownTitleId = titleId(shift.id);
  // Austragen („×“) bis zum Beginn; „Zuweisen“ nur, solange es geht (nicht voll, nicht vorbei, veröffentlicht).
  const canUnassign = shift.can.assign && !shift.started && !cancelled;
  const canAssignMore = shift.can.assignMore;
  const canHours = shift.can.hours && shift.started && !cancelled && shift.assignments.length > 0;
  const canEdit = shift.can.manage && editDefaults !== null && !cancelled;
  const canDelete = shift.can.delete;
  const hasMenu = canAssignMore || canHours || canEdit || canDelete;
  const emptyText = cancelled ? "Die Schicht wurde abgesagt." : "Noch niemand eingetragen";
  // Warum man sich nicht eintragen kann – nur, wenn es nicht ohnehin dasteht (voll, läuft, geschlossen, abgesagt).
  const showReason =
    !shift.signup.allowed &&
    !shift.mine &&
    shift.signup.reason &&
    published &&
    shift.health.fill !== "FULL" &&
    !shift.started &&
    shift.status === "OPEN";
  const helpers = shift.assignments.length;

  type Run = () => Promise<{ ok: boolean; error?: { message: string } }>;
  /**
   * Führt die Aktion aus und meldet das Ergebnis; mit `undo` bietet die Meldung „Rückgängig“ an. Danach steht der Fokus auf
   * dem Namen der Schicht – der Knopf, der ihn hatte (z. B. „×“), ist dann womöglich weg.
   */
  function run(action: Run, success: string, undo?: { action: Run; success: string }) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error?.message ?? "Aktion fehlgeschlagen.");
      else
        toast.success(success, {
          action: undo && { label: "Rückgängig", onClick: () => run(undo.action, undo.success) },
        });
      focusById(ownTitleId);
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
  // Nach dem Löschen ist die Zeile samt „⋯“ weg – der Fokus geht zur Überschrift „Tagesablauf“.
  const deleted = useRef(false);
  const deleteDialog = dialog("delete");

  return (
    <li
      id={rowId(shift.id)}
      aria-label={`Schicht ${shift.title}`}
      className={cn(
        "grid scroll-mt-24 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 sm:px-6 xl:grid-cols-[8.5rem_minmax(10rem,1fr)_minmax(0,16rem)_9.5rem] xl:gap-x-6 [&+&]:border-t",
        selected && "bg-primary/5",
        (cancelled || shift.ended) && "text-muted-foreground",
      )}
    >
      <p className="col-start-1 row-start-1 self-center text-sm tabular-nums xl:self-start xl:pt-0.5">
        {multiDay && <span className="block">{formatDateShort(shift.startsAt)}</span>}
        {formatTimeRange(shift.startsAt, shift.endsAt)}
      </p>

      <div className="col-span-2 min-w-0 xl:col-span-1 xl:col-start-2 xl:row-start-1">
        <h3 className={cn("text-base font-semibold", cancelled && "line-through")}>
          <button
            id={ownTitleId}
            type="button"
            aria-expanded={selected}
            aria-controls={panelId(shift.id)}
            onClick={onToggle}
            // Am Handy 44 px hoch treffbar, ohne die Zeile höher zu machen (unsichtbare Fläche ober- und unterhalb).
            className="relative rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:before:absolute max-sm:before:inset-x-0 max-sm:before:-inset-y-2.5"
          >
            {shift.title}
          </button>
          {shift.minAge !== null && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ab {shift.minAge} Jahren
            </span>
          )}
          {shift.status === "CLOSED" && !shift.ended && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">· nur Zuweisung</span>
          )}
        </h3>
        {shift.taskName && (
          <p className={cn("text-sm", !shift.ended && !cancelled && "text-foreground/80")}>
            {shift.taskName}
          </p>
        )}
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
            <p className={cn("mt-0.5 text-sm", !shift.ended && !cancelled && "text-foreground/80")}>
              {helpers === 0 ? (
                <span className="text-muted-foreground">{emptyText}</span>
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
            <div className="mt-2">
              {helpers === 0 ? (
                <p className="border-t border-primary/15 py-2 text-sm text-muted-foreground">
                  {emptyText}
                </p>
              ) : (
                <ul aria-label="Eingetragen">
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
                      {canUnassign && (
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
                              // Rückgängig geht nur, wo auch Zuweisen geht (veröffentlichte Veranstaltung).
                              published
                                ? {
                                    action: () =>
                                      undoUnassignAction({
                                        shiftId: shift.id,
                                        memberId: a.memberId,
                                        eventId,
                                      }),
                                    success: `${a.name} ist wieder eingetragen.`,
                                  }
                                : undefined,
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
              {/* Freie Plätze nur, solange sie sich noch füllen lassen (nicht bei vorbeien oder abgesagten Schichten). */}
              {free > 0 && !cancelled && !shift.ended && (
                <div className="flex min-h-10 items-center gap-2 border-t border-primary/15 text-sm">
                  <span className="flex-1 text-muted-foreground">
                    {free === 1 ? "1 Platz frei" : `${free} Plätze frei`}
                  </span>
                  {canAssignMore && (
                    // Eigener Dialog mit eigenem Knopf: Nach dem Schließen kehrt der Fokus hierher zurück (nicht zu „⋯“).
                    <AssignDialog
                      shiftId={shift.id}
                      eventId={eventId}
                      title={shift.title}
                      focusAfter={ownTitleId}
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
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="col-start-2 row-start-1 -mt-1 -mr-2 flex items-start justify-end gap-0.5 max-sm:-my-1.5 xl:col-start-4">
        {shift.signup.allowed && !shift.mine && (
          <QuickSignUpButton
            shiftId={shift.id}
            eventId={eventId}
            variant="ghost"
            label={shift.title}
            focusAfter={ownTitleId}
            className="text-primary hover:text-primary max-sm:h-11"
          />
        )}
        {shift.mine && shift.can.signOut && (
          <QuickSignOutButton
            shiftId={shift.id}
            eventId={eventId}
            label={shift.title}
            quiet
            focusAfter={ownTitleId}
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
                const target = document.querySelector<HTMLElement>(
                  `#${CSS.escape(panelId(shift.id))} [data-hours]`,
                );
                if (!target) return;
                event.preventDefault();
                target.focus();
              }}
              className="min-w-52 [&>[data-slot=dropdown-menu-item]]:gap-2 [&>[data-slot=dropdown-menu-item]]:py-2"
            >
              {canAssignMore && (
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
              {canDelete && (
                <>
                  {(canAssignMore || canHours || canEdit) && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant="destructive" onSelect={() => show("delete")}>
                    <TrashIcon /> Schicht löschen
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {canAssignMore && (
        <AssignDialog
          shiftId={shift.id}
          eventId={eventId}
          title={shift.title}
          focusAfter={ownTitleId}
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
      {canDelete && (
        <ConfirmAction
          destructive
          {...deleteDialog}
          onCloseAutoFocus={(event) => {
            if (!deleted.current) return deleteDialog.onCloseAutoFocus(event);
            event.preventDefault();
            focusById("tagesablauf");
          }}
          title={`„${shift.title}“ löschen?`}
          description={
            helpers === 0
              ? "Die Schicht wird gelöscht."
              : `${helpers === 1 ? "Die eingetragene Person wird" : `Die ${helpers} Eingetragenen werden`} ausgetragen${published ? " und benachrichtigt" : ""}.`
          }
          confirmLabel="Löschen"
          action={() => deleteShiftAction({ id: shift.id, eventId })}
          successMessage="Schicht gelöscht."
          onSuccess={() => {
            deleted.current = true;
            router.refresh();
          }}
        />
      )}
    </li>
  );
}
