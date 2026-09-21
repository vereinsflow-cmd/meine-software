import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { isAppError } from "@/server/errors";
import { MemberForm } from "@/modules/members/components/member-form";
import { getMemberForEdit, listDepartmentOptions } from "@/modules/members/service";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Mitglied bearbeiten" };

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext();

  const edit = await getMemberForEdit(ctx, id).catch((error: unknown) => {
    // "Nicht gefunden" und "verboten" sehen für den Benutzer gleich aus – es wird nichts über fremde Daten verraten.
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN"))
      return null;
    throw error;
  });
  if (!edit) notFound();

  const departments = await listDepartmentOptions(ctx, "members:update");
  const { values, editable } = edit;

  return (
    <>
      <PageHeader
        title={`${values.firstName} ${values.lastName} bearbeiten`}
        description="Felder mit * sind Pflichtfelder."
      />
      <MemberForm
        mode="edit"
        memberId={id}
        departments={departments.filter((d) => d.isActive || values.departmentIds.includes(d.id))}
        editable={editable}
        defaultValues={values}
      />
    </>
  );
}
