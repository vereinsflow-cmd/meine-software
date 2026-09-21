import type { Metadata } from "next";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { toDateInputValue } from "@/lib/dates";
import { addBerlinDays } from "@/lib/dates";
import { EventForm } from "@/modules/events/components/event-form";
import { getEventFormOptions } from "@/modules/events/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Neue Veranstaltung" };

export default async function NewEventPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "events:create")) return <NoAccess what="das Erstellen von Veranstaltungen" />;
  const options = await getEventFormOptions(ctx);
  const nextWeek = toDateInputValue(addBerlinDays(new Date(), 7));

  return (
    <>
      <PageHeader
        title="Neue Veranstaltung"
        description="Die Veranstaltung wird zunächst als Entwurf gespeichert und ist erst nach dem Veröffentlichen für Mitglieder sichtbar."
      />
      <EventForm
        mode="create"
        departments={options.departments}
        members={options.members}
        departmentRequired={options.departmentRequired}
        defaultValues={{
          title: "",
          description: "",
          type: "EVENT",
          visibility: "INTERNAL",
          startDate: nextWeek,
          startTime: "18:00",
          endDate: nextWeek,
          endTime: "20:00",
          allDay: false,
          locationName: "",
          address: "",
          contactMemberId: "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          targetAudience: "",
          departmentId: "",
          maxParticipants: undefined,
          registrationRequired: false,
          registrationDeadlineDate: "",
          registrationDeadlineTime: "",
          waitlistEnabled: false,
          internalNotes: "",
          repeat: "none",
          repeatCount: undefined,
        }}
      />
    </>
  );
}
