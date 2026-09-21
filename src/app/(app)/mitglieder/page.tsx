import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3Icon, DownloadIcon, PlusIcon, UploadIcon, UsersIcon } from "lucide-react";
import { MemberStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
import { Pagination } from "@/components/shared/pagination";
import { SortableHead } from "@/components/shared/sort-link";
import { MemberStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { formatCalendarDate } from "@/lib/dates";
import { MEMBER_STATUS_LABEL } from "@/lib/labels";
import {
  buildQuery,
  enumParam,
  pageRequest,
  param,
  type RawSearchParams,
} from "@/lib/search-params";
import { listDepartmentOptions, listMembers } from "@/modules/members/service";
import { MEMBER_SORT_FIELDS, type MemberView } from "@/modules/members/types";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Mitglieder" };

const VIEWS = {
  aktiv: "active",
  archiv: "archived",
  papierkorb: "trash",
} as const satisfies Record<string, MemberView>;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "members:read")) return <NoAccess what="die Mitgliederverwaltung" />;

  const canArchive = can(ctx, "members:archive");
  const canDelete = can(ctx, "members:delete");
  const ansicht =
    enumParam(params, "ansicht", ["aktiv", "archiv", "papierkorb"] as const) ?? "aktiv";
  const view =
    (ansicht === "archiv" && !canArchive) || (ansicht === "papierkorb" && !canDelete)
      ? "active"
      : VIEWS[ansicht];
  const sort = enumParam(params, "sort", MEMBER_SORT_FIELDS) ?? "name";
  const dir = param(params, "dir") === "desc" ? "desc" : "asc";
  const q = param(params, "q");
  const status = enumParam(params, "status", Object.values(MemberStatus));
  const departmentId = param(params, "abteilung");

  const [result, departments] = await Promise.all([
    listMembers(ctx, { q, status, departmentId, view, sort, dir, request: pageRequest(params) }),
    listDepartmentOptions(ctx, "members:update"),
  ]);

  const showContact = result.items.some((m) => m.email || m.phone);
  const filtered = Boolean(q || status || departmentId || view !== "active");
  const headProps = {
    basePath: "/mitglieder",
    searchParams: params,
    currentSort: sort,
    currentDir: dir,
  } as const;

  return (
    <>
      <PageHeader
        title="Mitglieder"
        description={`${result.total} ${result.total === 1 ? "Eintrag" : "Einträge"}${filtered ? " (gefiltert)" : ""}`}
        actions={
          <>
            {can(ctx, "members:create") && (
              <Button asChild>
                <Link href="/mitglieder/neu">
                  <PlusIcon /> Neues Mitglied
                </Link>
              </Button>
            )}
            {can(ctx, "members:import") && (
              <Button asChild variant="outline">
                <Link href="/mitglieder/import">
                  <UploadIcon /> Import
                </Link>
              </Button>
            )}
            {can(ctx, "members:export") && (
              <Button asChild variant="outline">
                <a
                  href={`/api/members/export${buildQuery(params, { q: undefined, sort: undefined, dir: undefined, page: undefined, pageSize: undefined })}`}
                >
                  <DownloadIcon /> Export
                </a>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/mitglieder/statistik">
                <BarChart3Icon /> Statistik
              </Link>
            </Button>
          </>
        }
      />

      <form
        key={JSON.stringify(params)}
        method="get"
        action="/mitglieder"
        role="search"
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto_auto]"
      >
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name, Nummer oder E-Mail suchen …"
          aria-label="Mitglieder durchsuchen"
        />
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Nach Status filtern">
          <option value="">Alle Status</option>
          {Object.values(MemberStatus).map((value) => (
            <option key={value} value={value}>
              {MEMBER_STATUS_LABEL[value]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="abteilung"
          defaultValue={departmentId ?? ""}
          aria-label="Nach Abteilung filtern"
        >
          <option value="">Alle Abteilungen</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </NativeSelect>
        {canArchive ? (
          <NativeSelect name="ansicht" defaultValue={ansicht} aria-label="Ansicht wählen">
            <option value="aktiv">Aktive Liste</option>
            <option value="archiv">Archiv</option>
            {canDelete && <option value="papierkorb">Papierkorb</option>}
          </NativeSelect>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="submit">Filtern</Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/mitglieder">Zurücksetzen</Link>
            </Button>
          )}
        </div>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={filtered ? "Keine passenden Mitglieder" : "Noch keine Mitglieder"}
          description={
            filtered
              ? "Passe die Suche oder die Filter an."
              : "Lege das erste Mitglied an oder importiere eine vorhandene Mitgliederliste als CSV-Datei."
          }
          action={
            !filtered && can(ctx, "members:create") ? (
              <Button asChild>
                <Link href="/mitglieder/neu">Mitglied anlegen</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <caption className="sr-only">Mitgliederliste</caption>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Name" field="name" {...headProps} />
                  <SortableHead
                    label="Nr."
                    field="memberNumber"
                    className="hidden md:table-cell"
                    {...headProps}
                  />
                  <SortableHead label="Status" field="status" {...headProps} />
                  <TableHead className="hidden lg:table-cell">Abteilungen</TableHead>
                  {showContact && <TableHead className="hidden xl:table-cell">Kontakt</TableHead>}
                  <SortableHead
                    label="Eintritt"
                    field="joinedAt"
                    className="hidden md:table-cell"
                    {...headProps}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Link
                        href={`/mitglieder/${member.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {member.lastName}, {member.firstName}
                      </Link>
                      {member.clubFunction && (
                        <p className="text-xs text-muted-foreground">{member.clubFunction}</p>
                      )}
                      {member.hasAccount && (
                        <ToneBadge tone="info" className="mt-1">
                          Benutzerkonto
                        </ToneBadge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {member.memberNumber ?? "–"}
                    </TableCell>
                    <TableCell>
                      <MemberStatusBadge status={member.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {member.departments.length === 0 ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        member.departments
                          .map((d) => d.name + (d.isLeader ? " (Leitung)" : ""))
                          .join(", ")
                      )}
                    </TableCell>
                    {showContact && (
                      <TableCell className="hidden text-sm xl:table-cell">
                        {member.email && <p>{member.email}</p>}
                        {member.phone && <p className="text-muted-foreground">{member.phone}</p>}
                      </TableCell>
                    )}
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatCalendarDate(member.joinedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/mitglieder" searchParams={params} {...result} />
        </>
      )}
    </>
  );
}
