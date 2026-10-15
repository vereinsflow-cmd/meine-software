import { NextResponse, type NextRequest } from "next/server";
import { contentDisposition } from "@/lib/uploads";
import { openDonationEvidence } from "@/modules/donations/evidence";
import { apiHandler } from "@/server/api";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * Nachweis einer Spende herunterladen (`id` = Anhang). Berechtigt ist, wer die Finanzen ansehen darf. Ausgeliefert wie
 * `/api/finanzen/belege/[id]`: immer als Anhang, Typ aus der Positivliste, `nosniff`, `sandbox`-CSP, nicht zwischengespeichert.
 */
export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const ctx = await requireTenantContext();
    const { document, stream, size } = await openDonationEvidence(ctx, id);
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
  "donation-evidence-download",
);
