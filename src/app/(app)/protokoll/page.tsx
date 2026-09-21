import type { Metadata } from "next";
import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AUDIT_MODULES, auditActionLabel, formatAuditChanges } from "@/lib/audit-labels";
import { formatDateTime, parseBerlinDateTime, addBerlinDays } from "@/lib/dates";
import { enumParam, pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { listAuditActors, listAuditEntries } from "@/modules/audit/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Änderungsprotokoll" };

/** Datum aus dem URL-Parameter (JJJJ-MM-TT) als Beginn des Tages in Berlin; ungültig → nicht gesetzt. */
const dayParam = (params: RawSearchParams, key: string) => {
  const raw = param(params, key);
  return raw ? (parseBerlinDateTime(raw, "00:00") ?? undefined) : undefined;
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "audit:read")) return <NoAccess what="das Änderungsprotokoll" />;

  const area = enumParam(
    params,
    "bereich",
    AUDIT_MODULES.map((m) => m.key),
  );
  const q = param(params, "q");
  const from = dayParam(params, "von");
  const toDay = dayParam(params, "bis");
  const actors = await listAuditActors(ctx);
  const actorUserId = actors.find((a) => a.userId === param(params, "person"))?.userId;

  const result = await listAuditEntries(ctx, {
    module: area,
    q,
    actorUserId,
    from,
    to: toDay ? addBerlinDays(toDay, 1) : undefined, // "bis" gilt einschließlich
    request: pageRequest(params, 25),
  });
  const filtered = Boolean(area || q || from || toDay || actorUserId);

  return (
    <>
      <PageHeader
        title="Änderungsprotokoll"
        description="Wer wann was geändert hat. Einträge können nicht nachträglich verändert werden; sensible Angaben (z. B. Kontaktdaten) werden nur als „geändert“ vermerkt."
      />

      <form
        key={JSON.stringify(params)}
        method="get"
        action="/protokoll"
        role="search"
        aria-label="Protokoll filtern"
        className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pr-bereich">Bereich</Label>
          <NativeSelect id="pr-bereich" name="bereich" defaultValue={area ?? ""}>
            <option value="">Alle Bereiche</option>
            {AUDIT_MODULES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pr-person">Person</Label>
          <NativeSelect id="pr-person" name="person" defaultValue={actorUserId ?? ""}>
            <option value="">Alle Personen</option>
            {actors.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pr-von">Von</Label>
          <Input id="pr-von" type="date" name="von" defaultValue={param(params, "von") ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pr-bis">Bis</Label>
          <Input id="pr-bis" type="date" name="bis" defaultValue={param(params, "bis") ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="pr-q">Suche in der Beschreibung</Label>
          <Input id="pr-q" type="search" name="q" defaultValue={q} placeholder="z. B. Sommerfest" />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Filtern</Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/protokoll">Zurücksetzen</Link>
            </Button>
          )}
        </div>
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          title={filtered ? "Keine passenden Einträge" : "Noch keine Einträge"}
          description={
            filtered ? "Passe die Filter an." : "Sobald etwas geändert wird, erscheint es hier."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <caption className="sr-only">Änderungsprotokoll, neueste Einträge zuerst</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Zeitpunkt</TableHead>
                  <TableHead className="w-44">Person</TableHead>
                  <TableHead>Aktion</TableHead>
                  <TableHead>Beschreibung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((entry) => {
                  const details = formatAuditChanges(entry.changes);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="align-top whitespace-nowrap tabular-nums">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell className="align-top">
                        {entry.actor.kind === "USER" ? (
                          entry.actor.name
                        ) : entry.actor.kind === "SYSTEM" ? (
                          <span className="text-muted-foreground">System</span>
                        ) : (
                          <span className="text-muted-foreground">Nicht mehr vorhanden</span>
                        )}
                        {entry.ipPrefix && (
                          <span className="block text-xs text-muted-foreground">
                            IP {entry.ipPrefix}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-top font-medium">
                        {auditActionLabel(entry.action)}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        {entry.summary ?? <span className="text-muted-foreground">–</span>}
                        {details.length > 0 && (
                          <details className="mt-1 text-sm">
                            <summary className="cursor-pointer text-xs text-muted-foreground">
                              Details ({details.length})
                            </summary>
                            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                              {details.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/protokoll" searchParams={params} {...result} />
        </>
      )}
    </>
  );
}
