import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/uploads";
import { can } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import { listDocuments } from "../service";

const SHOWN = 5;

/**
 * Karte "Dokumente" auf der Veranstaltungsseite: die Unterlagen, die zu dieser Veranstaltung hochgeladen wurden
 * (Genehmigungen, Ablaufpläne, Formulare). Sichtbar ist nur, was die Zugriffsstufen dem Benutzer erlauben; ohne Dokumente
 * und ohne Upload-Recht erscheint die Karte gar nicht.
 */
export async function EventDocumentsCard({
  ctx,
  eventId,
}: {
  ctx: TenantContext;
  eventId: string;
}) {
  if (!can(ctx, "documents:read")) return null;
  const result = await listDocuments(ctx, {
    eventId,
    request: { page: 1, pageSize: SHOWN, skip: 0 },
  });
  const canUpload = can(ctx, "documents:upload");
  if (result.total === 0 && !canUpload) return null;

  return (
    <section aria-labelledby="event-dokumente">
      <Card>
        <CardHeader>
          <CardTitle
            id="event-dokumente"
            role="heading"
            aria-level={2}
            className="flex items-center gap-2 text-base [&_svg]:size-4"
          >
            <AREA_ICON.dokumente aria-hidden="true" /> Dokumente
          </CardTitle>
          <CardDescription>Unterlagen zu dieser Veranstaltung.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {result.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Dokumente hochgeladen.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {result.items.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm"
                >
                  <a
                    href={`/api/dokumente/${document.id}/download`}
                    className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                  >
                    <DownloadIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="break-words">{document.name}</span>
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {document.category ? `${document.category} · ` : ""}
                    {formatBytes(document.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/dokumente?veranstaltung=${eventId}`}>
                {canUpload ? "Dokumente verwalten und hochladen" : "Alle Dokumente ansehen"}
              </Link>
            </Button>
            {result.total > SHOWN && (
              <span className="text-xs text-muted-foreground">{result.total - SHOWN} weitere</span>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
