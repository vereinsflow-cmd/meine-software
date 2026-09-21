import { NextResponse, type NextRequest } from "next/server";
import { contentDisposition } from "@/lib/uploads";
import { openDocument } from "@/modules/documents/service";
import { apiHandler } from "@/server/api";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * Dokument herunterladen. Anmeldung, Verein und Zugriffsstufe werden bei JEDEM Abruf geprüft; ein fremdes oder nicht
 * sichtbares Dokument ergibt 404 (kein Hinweis auf sein Bestehen). Die Datei wird nie direkt ausgeliefert, sondern:
 *  - immer als Anhang (kein Anzeigen im Browser → kein Ausführen von Inhalten im Kontext dieser Seite),
 *  - mit dem Medientyp aus der Positivliste und `nosniff`,
 *  - mit `sandbox`-CSP (auch falls ein Browser sie doch anzeigt: keine Skripte, keine Verbindungen),
 *  - ohne Zwischenspeicherung durch gemeinsam genutzte Caches.
 */
export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const ctx = await requireTenantContext();
    const { document, stream, size } = await openDocument(ctx, id);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(document.name),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  },
  "document-download",
);
