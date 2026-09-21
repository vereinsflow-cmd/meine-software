import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlusIcon, ChevronLeftIcon, HandHeartIcon, MapPinIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList } from "@/components/shared/description-list";
import { EventStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateLong, formatDateTime, formatTimeRange } from "@/lib/dates";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import { EventDocumentsCard } from "@/modules/documents/components/event-documents-card";
import { EventActions } from "@/modules/events/components/event-actions";
import { ParticipantsPanel } from "@/modules/events/components/participants-panel";
import { RsvpPanel } from "@/modules/events/components/rsvp-panel";
import { listParticipantCandidates, listParticipants } from "@/modules/events/participants";
import { getEvent } from "@/modules/events/service";
import { EventTasksCard } from "@/modules/tasks/components/event-tasks-card";
import { isAppError } from "@/server/errors";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Veranstaltung" };

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext();

  const event = await getEvent(ctx, id).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!event) notFound();

  const participants = await listParticipants(ctx, id);
  const candidates =
    participants && event.can.manageParticipants
      ? await listParticipantCandidates(ctx, id).catch(() => [])
      : [];
  const full = event.maxParticipants !== null && event.acceptedCount >= event.maxParticipants;
  const openShifts = event.shiftSummary.required - event.shiftSummary.filled;
  const whenLong = event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt);

  return (
    <>
      <p className="mb-3">
        <Link
          href="/veranstaltungen"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Alle Veranstaltungen
        </Link>
      </p>
      <PageHeader
        title={event.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDateLong(event.startsAt)} · {whenLong}
            <EventStatusBadge status={event.status} />
            <ToneBadge tone="neutral">{EVENT_TYPE_LABEL[event.type]}</ToneBadge>
            {event.visibility === "PUBLIC" && <ToneBadge tone="info">Öffentlich</ToneBadge>}
          </span>
        }
        actions={<EventActions id={id} title={event.title} status={event.status} can={event.can} />}
      />

      {event.status === "CANCELLED" && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Diese Veranstaltung wurde abgesagt</AlertTitle>
          <AlertDescription>{event.cancelReason}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              {event.description && (
                <p className="text-sm whitespace-pre-wrap">{event.description}</p>
              )}
              <DescriptionList
                items={[
                  { label: "Beginn", value: `${formatDateTime(event.startsAt)} Uhr` },
                  { label: "Ende", value: `${formatDateTime(event.endsAt)} Uhr` },
                  {
                    label: "Ort",
                    value: (event.locationName || event.address) && (
                      <span className="inline-flex items-start gap-1">
                        <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                          {event.locationName}
                          {event.address && (
                            <span className="block text-muted-foreground">{event.address}</span>
                          )}
                        </span>
                      </span>
                    ),
                  },
                  { label: "Abteilung", value: event.department?.name ?? "Ganzer Verein" },
                  { label: "Zielgruppe", value: event.targetAudience },
                  {
                    label: "Ansprechpartner",
                    value: event.contact.name && (
                      <span>
                        {event.contact.name}
                        {event.contact.email && (
                          <a
                            className="block text-primary underline-offset-4 hover:underline"
                            href={`mailto:${event.contact.email}`}
                          >
                            {event.contact.email}
                          </a>
                        )}
                        {event.contact.phone && (
                          <span className="block text-muted-foreground">{event.contact.phone}</span>
                        )}
                      </span>
                    ),
                  },
                ]}
              />
              {event.status !== "DRAFT" && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a href={`/api/calendar/event/${id}`} download>
                    <CalendarPlusIcon /> Zum Kalender hinzufügen (.ics)
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          {event.internalNotes && (
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Interne Notizen
                </CardTitle>
                <CardDescription>Nur für Veranstalter sichtbar.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{event.internalNotes}</p>
              </CardContent>
            </Card>
          )}

          <EventTasksCard ctx={ctx} eventId={id} />
          <EventDocumentsCard ctx={ctx} eventId={id} />

          {participants && (
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Teilnehmer
                </CardTitle>
                <CardDescription>
                  {event.acceptedCount} Zusagen
                  {event.maxParticipants !== null ? ` von ${event.maxParticipants}` : ""}
                  {event.waitlistCount > 0 ? ` · ${event.waitlistCount} auf der Warteliste` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ParticipantsPanel
                  eventId={id}
                  editable={
                    event.can.manageParticipants &&
                    event.status !== "CANCELLED" &&
                    event.status !== "ARCHIVED"
                  }
                  candidates={candidates}
                  rows={participants.map((p) => ({
                    ...p,
                    respondedAt: p.respondedAt.toISOString(),
                  }))}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-6">
          {event.can.participate && event.status !== "DRAFT" && (
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Deine Teilnahme
                </CardTitle>
                <CardDescription>
                  {event.registrationRequired ? "Anmeldung erforderlich" : "Anmeldung optional"}
                  {event.registrationDeadline &&
                    ` bis ${formatDateTime(event.registrationDeadline)} Uhr`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RsvpPanel
                  eventId={id}
                  myStatus={event.myStatus}
                  open={event.registration.open}
                  reason={event.registration.reason}
                  full={full}
                  waitlistEnabled={event.waitlistEnabled}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Teilnehmerzahl
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>
                <span className="text-2xl font-semibold tabular-nums">{event.acceptedCount}</span>
                {event.maxParticipants !== null && (
                  <span className="text-muted-foreground">
                    {" "}
                    von {event.maxParticipants} Plätzen
                  </span>
                )}
              </p>
              {event.waitlistCount > 0 && (
                <p className="text-muted-foreground">{event.waitlistCount} auf der Warteliste</p>
              )}
              {full && (
                <ToneBadge tone="warning" className="w-fit">
                  Ausgebucht
                </ToneBadge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Helfer
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {event.shiftSummary.shifts === 0 ? (
                <p className="text-muted-foreground">
                  Für diese Veranstaltung sind keine Helferschichten geplant.
                </p>
              ) : (
                <p>
                  <span className="text-2xl font-semibold tabular-nums">
                    {event.shiftSummary.filled}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    von {event.shiftSummary.required} Helfern in {event.shiftSummary.shifts}{" "}
                    Schichten
                  </span>
                </p>
              )}
              {openShifts > 0 && event.status === "PUBLISHED" && (
                <ToneBadge tone="warning" className="w-fit">
                  {openShifts} Plätze noch frei
                </ToneBadge>
              )}
              <Button asChild variant="outline">
                <Link href={`/helferplanung/${id}`}>
                  <HandHeartIcon />{" "}
                  {event.can.manageShifts ? "Helferplanung öffnen" : "Schichten ansehen"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
