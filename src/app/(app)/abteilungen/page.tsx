import type { Metadata } from "next";
import Link from "next/link";
import { NetworkIcon, UsersIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
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
    <>
      <PageHeader
        title="Abteilungen"
        description="Abteilungen und Gruppen des Vereins."
        actions={clubWide ? <DepartmentDialog /> : undefined}
      />
      {departments.length === 0 ? (
        <EmptyState
          icon={<NetworkIcon />}
          title="Noch keine Abteilungen"
          description="Lege Abteilungen an, um Mitglieder, Veranstaltungen und Verantwortlichkeiten zu gliedern."
          action={clubWide ? <DepartmentDialog /> : undefined}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((department) => (
            <li key={department.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: department.color ?? "var(--muted-foreground)" }}
                      aria-hidden="true"
                    />
                    <Link
                      href={`/abteilungen/${department.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {department.name}
                    </Link>
                    {!department.isActive && <ToneBadge tone="neutral">Deaktiviert</ToneBadge>}
                  </CardTitle>
                  {department.description && (
                    <CardDescription>{department.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="grid gap-1.5 text-sm">
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <UsersIcon className="size-4" aria-hidden="true" />
                    {department.memberCount}{" "}
                    {department.memberCount === 1 ? "Mitglied" : "Mitglieder"}
                    {department.groupCount > 0 &&
                      ` · ${department.groupCount} ${department.groupCount === 1 ? "Gruppe" : "Gruppen"}`}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Leitung: </span>
                    {department.leaders.length > 0
                      ? department.leaders.map((l) => l.name).join(", ")
                      : "–"}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
