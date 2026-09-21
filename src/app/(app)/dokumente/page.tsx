import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, FolderOpenIcon } from "lucide-react";
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
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/dates";
import { pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { formatBytes } from "@/lib/uploads";
import {
  DeleteDocumentButton,
  EditDocumentDialog,
  UploadDialog,
} from "@/modules/documents/components/document-controls";
import { ACCESS_LABEL, type AccessLevel } from "@/modules/documents/schemas";
import {
  allowedAccessLevels,
  getStorageUsage,
  listCategories,
  listDocuments,
  listUploadEvents,
} from "@/modules/documents/service";
import { env } from "@/server/env";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Dokumente" };

const accessTone: Record<AccessLevel, "neutral" | "warning" | "danger"> = {
  ALL_MEMBERS: "neutral",
  BOARD: "warning",
  ADMIN: "danger",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "documents:read")) return <NoAccess what="die Dokumente" />;

  const q = param(params, "q");
  const category = param(params, "kategorie");
  const eventId = param(params, "veranstaltung");
  const canUpload = can(ctx, "documents:upload");
  const [result, categories, usage, events] = await Promise.all([
    listDocuments(ctx, { q, category, eventId, request: pageRequest(params, 15) }),
    listCategories(ctx),
    getStorageUsage(ctx),
    canUpload ? listUploadEvents(ctx) : Promise.resolve([]),
  ]);
  const filtered = Boolean(q || category || eventId);
  const usedPercent = Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100));

  return (
    <>
      <PageHeader
        title="Dokumente"
        description="Satzung, Protokolle, Formulare und weitere Unterlagen deines Vereins."
        actions={
          canUpload ? (
            <UploadDialog
              categories={categories}
              events={events.map((event) => ({
                id: event.id,
                label: `${event.title} (${formatDate(event.startsAt)})`,
              }))}
              accessLevels={allowedAccessLevels(ctx)}
              maxMb={env.MAX_UPLOAD_MB}
              requireEvent={scopeOf(ctx, "documents:upload") === "DEPARTMENT"}
            />
          ) : undefined
        }
      />

      <form
        key={JSON.stringify(params)}
        method="get"
        action="/dokumente"
        role="search"
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_auto]"
      >
        {eventId && <input type="hidden" name="veranstaltung" value={eventId} />}
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Dokument oder Kategorie suchen …"
          aria-label="Dokumente durchsuchen"
        />
        <NativeSelect
          name="kategorie"
          defaultValue={category ?? ""}
          aria-label="Nach Kategorie filtern"
        >
          <option value="">Alle Kategorien</option>
          {categories.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit">Filtern</Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/dokumente">Zurücksetzen</Link>
            </Button>
          )}
        </div>
      </form>

      {eventId && (
        <p className="mb-3 text-sm text-muted-foreground">
          Es werden nur Dokumente zu einer Veranstaltung angezeigt.{" "}
          <Link href={`/veranstaltungen/${eventId}`} className="underline underline-offset-4">
            Zur Veranstaltung
          </Link>
        </p>
      )}

      {result.items.length === 0 ? (
        <EmptyState
          icon={<FolderOpenIcon />}
          title={filtered ? "Keine passenden Dokumente" : "Noch keine Dokumente"}
          description={
            filtered
              ? "Passe die Suche oder den Filter an."
              : canUpload
                ? "Lade das erste Dokument hoch – z. B. die Satzung."
                : "Sobald dein Verein Dokumente bereitstellt, findest du sie hier."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <caption className="sr-only">Dokumente, neueste zuerst</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Kategorie</TableHead>
                  <TableHead className="hidden md:table-cell">Zugriff</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Größe</TableHead>
                  <TableHead className="hidden md:table-cell">Hochgeladen</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="max-w-xs whitespace-normal">
                      <a
                        href={`/api/dokumente/${document.id}/download`}
                        className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                      >
                        <DownloadIcon className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="break-words">{document.name}</span>
                      </a>
                      {document.event && (
                        <span className="block text-xs text-muted-foreground">
                          Zu:{" "}
                          <Link
                            href={`/veranstaltungen/${document.event.id}`}
                            className="underline underline-offset-4"
                          >
                            {document.event.title} ({formatDate(document.event.startsAt)})
                          </Link>
                        </span>
                      )}
                      {/* Auf dem Smartphone stehen die übrigen Angaben unter dem Namen statt in eigenen Spalten. */}
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground md:hidden">
                        {document.category && <span>{document.category}</span>}
                        <span>{formatBytes(document.sizeBytes)}</span>
                        <span>{formatDate(document.createdAt)}</span>
                        <ToneBadge tone={accessTone[document.access]}>
                          {ACCESS_LABEL[document.access]}
                        </ToneBadge>
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {document.category ?? "–"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <ToneBadge tone={accessTone[document.access]}>
                        {ACCESS_LABEL[document.access]}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatBytes(document.sizeBytes)}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {formatDate(document.createdAt)}
                      {document.uploader && (
                        <span className="block text-xs text-muted-foreground">
                          {document.uploader}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {document.can.manage && (
                        <div className="flex justify-end gap-1">
                          <EditDocumentDialog
                            id={document.id}
                            accessLevels={allowedAccessLevels(ctx)}
                            defaults={{
                              name: document.name,
                              category: document.category ?? "",
                              access: document.access,
                            }}
                          />
                          <DeleteDocumentButton id={document.id} name={document.name} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/dokumente" searchParams={params} {...result} />
        </>
      )}

      {canUpload && (
        <p className="mt-6 text-sm text-muted-foreground" role="status">
          Speicherplatz: {formatBytes(usage.usedBytes)} von {formatBytes(usage.quotaBytes)} belegt (
          {usedPercent} %).
        </p>
      )}
    </>
  );
}
