import { NextResponse, type NextRequest } from "next/server";
import { contentDisposition } from "@/lib/uploads";
import { openReceipt } from "@/modules/finance/receipts";
import { apiHandler } from "@/server/api";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * Beleg einer Buchung herunterladen (`id` = Anhang). Berechtigt ist, wer die Finanzen ansehen darf – unabhängig von der
 * Zugriffsstufe des Dokuments. Ausgeliefert wie in `/api/dokumente/[id]/download`: immer als Anhang, Typ aus der
 * Positivliste, `nosniff`, `sandbox`-CSP, nicht zwischengespeichert.
 */
export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const ctx = await requireTenantContext();
    const { document, stream, size } = await openReceipt(ctx, id);
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
  "receipt-download",
);
