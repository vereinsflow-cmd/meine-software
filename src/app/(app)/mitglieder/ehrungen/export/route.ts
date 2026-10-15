import { NextResponse, type NextRequest } from "next/server";
import { ANNIVERSARY_YEAR_SPAN, referenceYear } from "@/lib/anniversaries";
import { intParam } from "@/lib/search-params";
import { exportAnniversariesCsv } from "@/modules/members/anniversaries";
import { apiHandler } from "@/server/api";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * CSV der Ehrungen eines Jahres (`?jahr=2026`), z. B. für Urkunden oder einen Serienbrief. Erfordert Anmeldung, das Recht,
 * Mitglieder vereinsweit bzw. der eigenen Abteilungen zu sehen, und `members:export`; jeder Export wird protokolliert. Liegt
 * neben der Seite (nicht unter `/api`), damit die Ehrungen an einem Ort bleiben – die Prüfungen sind dieselben wie beim
 * Export der Mitgliederliste. Die Antwort wird nie zwischengespeichert.
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const currentYear = referenceYear();
  const year = intParam(
    params,
    "jahr",
    currentYear,
    currentYear - ANNIVERSARY_YEAR_SPAN,
    currentYear + ANNIVERSARY_YEAR_SPAN,
  );
  const { csv, filename } = await exportAnniversariesCsv(ctx, { year });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, "anniversaries-export");
