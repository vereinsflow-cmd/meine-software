import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { EventForm } from "@/modules/events/components/event-form";
import { getEventForEdit, getEventFormOptions } from "@/modules/events/service";
import { isAppError } from "@/server/errors";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Veranstaltung bearbeiten" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext();

  const values = await getEventForEdit(ctx, id).catch((error: unknown) => {
    if (isAppError(error) && ["NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"].includes(error.code))
      return null;
    throw error;
  });
  if (!values) notFound();
  const options = await getEventFormOptions(ctx);

  return (
    <>
      <PageHeader
        title={`${values.title} bearbeiten`}
        description="Bei Änderungen an Zeit oder Ort werden Teilnehmer und Helfer benachrichtigt."
      />
      <EventForm
        mode="edit"
        eventId={id}
        departments={options.departments}
        members={options.members}
        departmentRequired={options.departmentRequired}
        defaultValues={values}
      />
    </>
  );
}
