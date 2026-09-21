import { NextResponse, type NextRequest } from "next/server";
import { exportShiftPlanCsv } from "@/modules/shifts/service";
import { apiHandler } from "@/server/api";
import { requireTenantContext } from "@/server/tenancy/context";

/** CSV-Export der Helferplanung einer Veranstaltung (nur für Veranstalter; Telefonnummern nur mit Berechtigung). */
export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ eventId: string }> }) => {
    const { eventId } = await context.params;
    const ctx = await requireTenantContext();
    const { csv, filename } = await exportShiftPlanCsv(ctx, eventId);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  "shift-export",
);
