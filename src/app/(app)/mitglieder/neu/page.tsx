import type { Metadata } from "next";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { toDateInputValue } from "@/lib/dates";
import { MemberForm } from "@/modules/members/components/member-form";
import { listDepartmentOptions, suggestNextMemberNumber } from "@/modules/members/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Neues Mitglied" };

export default async function NewMemberPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "members:create")) return <NoAccess what="das Anlegen von Mitgliedern" />;

  const [departments, memberNumber] = await Promise.all([
    listDepartmentOptions(ctx, "members:create"),
    suggestNextMemberNumber(ctx),
  ]);

  return (
    <>
      <PageHeader title="Neues Mitglied" description="Felder mit * sind Pflichtfelder." />
      <MemberForm
        mode="create"
        departments={departments.filter((d) => d.isActive)}
        editable={{
          contact: can(ctx, "members:read_contact"),
          private: can(ctx, "members:read_private"),
          leaders: can(ctx, "departments:manage"),
        }}
        defaultValues={{
          memberNumber,
          firstName: "",
          lastName: "",
          status: "ACTIVE",
          clubFunction: "",
          joinedAt: toDateInputValue(new Date()),
          leftAt: "",
          email: "",
          phone: "",
          street: "",
          postalCode: "",
          city: "",
          country: "DE",
          birthDate: "",
          internalNotes: "",
          departmentIds: [],
          leaderDepartmentIds: [],
        }}
      />
    </>
  );
}
