import Link from "next/link";
import { HandHeartIcon, MapPinIcon, UsersIcon } from "lucide-react";
import { EventStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { berlinParts, formatDateShort, formatTimeRange, MONTH_NAMES } from "@/lib/dates";
import { EVENT_TYPE_LABEL, PARTICIPANT_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { EventListItem } from "../service";

/** Eine Veranstaltung in der Liste: Datumsfeld, Titel, Zeit, Ort und Kennzahlen zu Teilnehmern und Helfern. */
export function EventListItemView({ event }: { event: EventListItem }) {
  const start = berlinParts(event.startsAt);
  const cancelled = event.status === "CANCELLED";
  const openShifts = event.shiftSummary.required - event.shiftSummary.filled;

  return (
    <li>
      <Link
        href={`/veranstaltungen/${event.id}`}
        className="flex gap-4 rounded-xl border p-4 transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center leading-tight"
          style={
            event.department?.color
              ? { borderLeft: `4px solid ${event.department.color}` }
              : undefined
          }
          aria-hidden="true"
        >
          <span className="text-xl font-semibold">{start.day}</span>
          <span className="text-xs text-muted-foreground uppercase">
            {MONTH_NAMES[start.month - 1]?.slice(0, 3)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2
              className={cn(
                "text-base font-medium",
                cancelled && "text-muted-foreground line-through",
              )}
            >
              {event.title}
            </h2>
            {event.status !== "PUBLISHED" && <EventStatusBadge status={event.status} />}
            {event.myStatus && event.myStatus !== "DECLINED" && (
              <ToneBadge tone={event.myStatus === "ACCEPTED" ? "success" : "warning"}>
                {PARTICIPANT_STATUS_LABEL[event.myStatus]}
              </ToneBadge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDateShort(event.startsAt)} ·{" "}
            {event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{EVENT_TYPE_LABEL[event.type]}</span>
            {event.department && <span>{event.department.name}</span>}
            {event.locationName && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden="true" /> {event.locationName}
              </span>
            )}
            {(event.registrationRequired || event.acceptedCount > 0) && (
              <span className="inline-flex items-center gap-1">
                <UsersIcon className="size-3.5" aria-hidden="true" />
                {event.acceptedCount}
                {event.maxParticipants !== null ? ` von ${event.maxParticipants}` : ""} Zusagen
                {event.waitlistCount > 0 && ` (+${event.waitlistCount} Warteliste)`}
              </span>
            )}
            {event.shiftSummary.shifts > 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  openShifts > 0 && !cancelled && "font-medium text-amber-700 dark:text-amber-400",
                )}
              >
                <HandHeartIcon className="size-3.5" aria-hidden="true" />
                {event.shiftSummary.filled} von {event.shiftSummary.required} Helfern
                {openShifts > 0 && !cancelled && ` – ${openShifts} fehlen`}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
