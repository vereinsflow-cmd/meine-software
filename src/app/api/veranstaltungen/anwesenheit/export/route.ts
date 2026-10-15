import { NextResponse, type NextRequest } from "next/server";
import { exportAttendanceCsv } from "@/modules/events/attendance";
import { attendanceFiltersFromParams } from "@/modules/events/attendance-schemas";
import { apiHandler } from "@/server/api";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * CSV-Export der Anwesenheit mit denselben Filtern wie die Auswertung (`/veranstaltungen/anwesenheit`). Erfordert das
 * Recht für Teilnehmerlisten; Abteilungsleiter bekommen nur Termine ihrer Abteilungen. Wird protokolliert und nie
 * zwischengespeichert.
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const { csv, filename } = await exportAttendanceCsv(ctx, attendanceFiltersFromParams(params));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, "attendance-export");
