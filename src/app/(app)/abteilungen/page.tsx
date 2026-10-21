import type { Metadata } from "next";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { DepartmentCard } from "@/modules/departments/components/department-card";
import { DepartmentDialog } from "@/modules/departments/components/department-dialog";
import { listDepartments } from "@/modules/departments/service";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Abteilungen" };

export default async function DepartmentsPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "departments:read")) return <NoAccess what="die Abteilungen" />;

  const clubWide = scopeOf(ctx, "departments:manage") === "CLUB";
  const departments = await listDepartments(ctx, { includeInactive: clubWide });

  return (
    <PageStack>
      <PageHeader
        title="Abteilungen"
        description="Abteilungen und Gruppen des Vereins."
        actions={clubWide ? <DepartmentDialog /> : undefined}
      />
      {departments.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.abteilungen />}
          title="Noch keine Abteilungen"
          description="Lege Abteilungen an, um Mitglieder, Veranstaltungen und Verantwortlichkeiten zu gliedern."
          action={clubWide ? <DepartmentDialog /> : undefined}
        />
      ) : (
        // `grid-cols-1` statt der impliziten Spalte `auto` – die wüchse am Handy mit dem längsten Wort im Namen über den Rand.
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((department, index) => (
            <li key={department.id}>
              {/* Die Karten der ersten Reihe laden ihr Bild sofort, alle weiteren erst beim Scrollen. */}
              <DepartmentCard department={department} eager={index < 3} />
            </li>
          ))}
        </ul>
      )}
    </PageStack>
  );
}
