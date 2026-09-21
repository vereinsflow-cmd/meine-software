import { NextResponse, type NextRequest } from "next/server";
import { MemberStatus } from "@/generated/prisma/enums";
import { enumParam, param } from "@/lib/search-params";
import { exportMembersCsv } from "@/modules/members/export";
import { apiHandler } from "@/server/api";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * CSV-Export der Mitglieder. Erfordert Anmeldung und die Berechtigung `members:export`; Spalten und Werte
 * richten sich nach den Rechten des Benutzers. Die Antwort wird nie zwischengespeichert.
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const { csv, filename } = await exportMembersCsv(ctx, {
    status: enumParam(params, "status", Object.values(MemberStatus)),
    departmentId: param(params, "abteilung"),
    archived: param(params, "ansicht") === "archiv",
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, "members-export");
