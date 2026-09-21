import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDate, formatDateTime } from "@/lib/dates";
import { PERMISSION_SCOPE_LABEL } from "@/lib/labels";
import { enumParam, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import {
  InvitationActions,
  InviteDialog,
  RoleSelect,
  UserActions,
} from "@/modules/users/components/user-controls";
import {
  listClubUsers,
  listInvitableMembers,
  listInvitations,
  listRoles,
} from "@/modules/users/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Benutzer und Rollen" };

const TABS = [
  { id: "benutzer", label: "Benutzer" },
  { id: "einladungen", label: "Einladungen" },
  { id: "rollen", label: "Rollen und Rechte" },
] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "users:read")) return <NoAccess what="die Benutzerverwaltung" />;

  const tab =
    enumParam(
      params,
      "tab",
      TABS.map((t) => t.id),
    ) ?? "benutzer";
  const canManage = can(ctx, "users:manage");
  const canInvite = can(ctx, "users:invite");

  const [roles, users, invitations, invitable] = await Promise.all([
    listRoles(ctx),
    listClubUsers(ctx),
    canInvite || canManage ? listInvitations(ctx) : Promise.resolve([]),
    listInvitableMembers(ctx),
  ]);
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name, assignable: r.assignable }));

  return (
    <>
      <PageHeader
        title="Benutzer und Rollen"
        description="Wer hat Zugang zum Verein und welche Rechte hat er?"
        actions={canInvite ? <InviteDialog roles={roleOptions} members={invitable} /> : undefined}
      />

      <nav aria-label="Bereiche" className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/benutzer?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "einladungen" && invitations.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
                {invitations.length}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "benutzer" && (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <caption className="sr-only">Benutzer des Vereins</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Letzte Anmeldung</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.membershipId}>
                  <TableCell>
                    {user.memberId ? (
                      <Link
                        href={`/mitglieder/${user.memberId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {user.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{user.name}</span>
                    )}
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <RoleSelect
                        membershipId={user.membershipId}
                        roleId={user.roleId}
                        roles={roleOptions}
                        name={user.name}
                        disabled={user.isSelf}
                      />
                    ) : (
                      user.roleName
                    )}
                  </TableCell>
                  <TableCell>
                    {user.status === "ACTIVE" ? (
                      <ToneBadge tone="success">Aktiv</ToneBadge>
                    ) : (
                      <ToneBadge tone="danger">Gesperrt</ToneBadge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {user.lastLoginAt ? `${formatDateTime(user.lastLoginAt)} Uhr` : "–"}
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <UserActions
                        membershipId={user.membershipId}
                        name={user.name}
                        status={user.status}
                        isSelf={user.isSelf}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "einladungen" &&
        (invitations.length === 0 ? (
          <EmptyState
            title="Keine offenen Einladungen"
            description="Eingeladene Personen erscheinen hier, bis sie ihr Konto angelegt haben."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <caption className="sr-only">Offene Einladungen</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail-Adresse</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead className="hidden md:table-cell">Gültig bis</TableHead>
                  <TableHead className="w-64">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      {invitation.email}
                      {invitation.memberName && (
                        <p className="text-xs text-muted-foreground">
                          für Mitglied {invitation.memberName}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{invitation.roleName}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(invitation.expiresAt)}{" "}
                      {invitation.expired && <ToneBadge tone="warning">abgelaufen</ToneBadge>}
                    </TableCell>
                    <TableCell>
                      {canInvite && (
                        <InvitationActions id={invitation.id} email={invitation.email} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}

      {tab === "rollen" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => {
            const byModule = Object.entries(Object.groupBy(role.permissions, (p) => p.module));
            return (
              <Card key={role.id}>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
                    {role.name}
                    <ToneBadge tone="neutral">
                      {role.userCount} {role.userCount === 1 ? "Benutzer" : "Benutzer"}
                    </ToneBadge>
                  </CardTitle>
                  {role.description && <CardDescription>{role.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      {role.permissions.length} Berechtigungen anzeigen
                    </summary>
                    <div className="mt-3 grid gap-3 text-sm">
                      {byModule.map(([module, permissions]) => (
                        <div key={module}>
                          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {module}
                          </h3>
                          <ul className="grid gap-0.5">
                            {permissions?.map((p) => (
                              <li key={p.key} className="flex items-start justify-between gap-3">
                                <span>{p.label}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {PERMISSION_SCOPE_LABEL[p.scope]}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
