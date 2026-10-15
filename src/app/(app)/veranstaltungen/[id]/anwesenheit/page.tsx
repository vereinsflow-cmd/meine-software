import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BackLink } from "@/components/shared/back-link";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { formatDateLong, formatDateTime, formatTimeRange } from "@/lib/dates";
import { getAttendanceSheet } from "@/modules/events/attendance";
import { AttendanceSheet } from "@/modules/events/components/attendance-sheet";
import { isAppError } from "@/server/errors";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Anwesenheit" };

/**
 * Anwesenheit eines Termins erfassen – fürs Handy am Spielfeldrand gebaut. Recht und Zeitfenster prüft der Dienst; vor dem
 * Fenster (bzw. bei Entwurf, Absage, Archiv) zeigt die Seite einen Hinweis und das bisher Gespeicherte nur zum Lesen.
 */
export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext();

  const sheet = await getAttendanceSheet(ctx, id).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    if (isAppError(error) && error.code === "FORBIDDEN") return "forbidden" as const;
    throw error;
  });
  if (!sheet) notFound();
  if (sheet === "forbidden") return <NoAccess what="die Anwesenheit dieser Veranstaltung" />;

  const { event, window } = sheet;
  const when = event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt);

  return (
    <PageStack>
      <BackLink href={`/veranstaltungen/${id}`}>{event.title}</BackLink>
      <PageHeader
        title="Anwesenheit"
        description={`${event.title} · ${formatDateLong(event.startsAt)} · ${when}${event.departmentName ? ` · ${event.departmentName}` : ""}`}
      />

      {!window.open && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertDescription>
            {window.reason}
            {event.status === "PUBLISHED" && ` Das geht ab ${formatDateTime(window.opensAt)} Uhr.`}
          </AlertDescription>
        </Alert>
      )}

      <AttendanceSheet
        eventId={id}
        editable={window.open}
        rows={sheet.rows}
        people={sheet.people}
        groups={sheet.groups}
      />
    </PageStack>
  );
}
