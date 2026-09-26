import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import {
  AddDepartmentMemberControls,
  DepartmentActions,
  GroupControls,
  LeaderToggle,
  RemoveGroupMemberButton,
} from "@/modules/departments/components/department-controls";
import { DepartmentDialog, GroupDialog } from "@/modules/departments/components/department-dialog";
import { getDepartment, listAddableMembers } from "@/modules/departments/service";
import { isAppError } from "@/server/errors";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Abteilung" };

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext();
  if (!can(ctx, "departments:read")) return <NoAccess what="die Abteilungen" />;

  const department = await getDepartment(ctx, id).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!department) notFound();

  const candidates = (department.members ?? []).map((m) => ({ id: m.id, name: m.name }));
  const addableMembers = department.canManageClubWide ? await listAddableMembers(ctx, id) : [];

  return (
    <>
      <p className="mb-3">
        <Link
          href="/abteilungen"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Alle Abteilungen
        </Link>
      </p>
      <PageHeader
        title={department.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {department.description ?? "Abteilung"}
            {!department.isActive && <ToneBadge tone="neutral">Deaktiviert</ToneBadge>}
          </span>
        }
        actions={
          <>
            {/* Häufiges als Knöpfe, Seltenes (Deaktivieren, Löschen) in „Weitere Aktionen“. */}
            {department.canManage && <DepartmentDialog department={department} />}
            {can(ctx, "events:read") && (
              <Button asChild variant="outline">
                <Link href={`/veranstaltungen?abteilung=${id}`}>
                  <AREA_ICON.veranstaltungen /> Veranstaltungen
                </Link>
              </Button>
            )}
            <DepartmentActions
              id={id}
              name={department.name}
              isActive={department.isActive}
              canClubWide={department.canManageClubWide}
            />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle role="heading" aria-level={2}>
                Mitglieder ({department.memberCount})
              </CardTitle>
              <CardDescription>
                Leitung:{" "}
                {department.leaders.length > 0
                  ? department.leaders.map((l) => l.name).join(", ")
                  : "nicht festgelegt"}
              </CardDescription>
            </div>
            {department.canManageClubWide && (
              <AddDepartmentMemberControls departmentId={id} candidates={addableMembers} />
            )}
          </CardHeader>
          <CardContent>
            {department.members === null ? (
              <p className="text-sm text-muted-foreground">
                Die Mitgliederliste ist für deine Rolle nicht sichtbar.
              </p>
            ) : department.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine (für dich sichtbaren) Mitglieder.
              </p>
            ) : (
              <ul className="divide-y">
                {department.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/mitglieder/${member.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {member.name}
                      </Link>
                      {member.clubFunction && (
                        <span className="text-muted-foreground"> · {member.clubFunction}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {member.isLeader && <ToneBadge tone="info">Leitung</ToneBadge>}
                      {department.canManageClubWide && (
                        <LeaderToggle
                          departmentId={id}
                          memberId={member.id}
                          isLeader={member.isLeader}
                          name={member.name}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle role="heading" aria-level={2}>
                Gruppen und Teams
              </CardTitle>
              <CardDescription>Untergliederungen dieser Abteilung.</CardDescription>
            </div>
            {department.canManage && <GroupDialog departmentId={id} />}
          </CardHeader>
          <CardContent>
            {department.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Gruppen.</p>
            ) : (
              <ul className="grid gap-5">
                {department.groups.map((group) => (
                  <li key={group.id} className="grid gap-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium">{group.name}</h3>
                        {group.description && (
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        )}
                      </div>
                      {department.canManage && <GroupDialog departmentId={id} group={group} />}
                    </div>
                    {group.members.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Keine Mitglieder.</p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {group.members.map((m) => (
                          <li
                            key={m.id}
                            className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-sm"
                          >
                            {m.name}
                            {department.canManage && (
                              <RemoveGroupMemberButton
                                groupId={group.id}
                                departmentId={id}
                                memberId={m.id}
                                name={m.name}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {department.canManage && (
                      <GroupControls
                        groupId={group.id}
                        departmentId={id}
                        name={group.name}
                        candidates={candidates}
                        memberIds={group.members.map((m) => m.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
