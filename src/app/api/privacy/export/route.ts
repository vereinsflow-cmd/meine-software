import { NextResponse } from "next/server";
import { toDateInputValue } from "@/lib/dates";
import { apiHandler } from "@/server/api";
import { recordSystemAudit } from "@/server/audit/audit";
import { notFound } from "@/server/errors";
import { buildUserDataExport } from "@/server/privacy/export";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { getRequestMeta } from "@/server/security/request";
import { requireUser } from "@/server/tenancy/context";

/**
 * Datenexport der eigenen Daten (Auskunft und Datenübertragbarkeit). Nur für die angemeldete Person und nur über ihre
 * EIGENE Benutzer-ID aus der Sitzung – es gibt keinen Parameter, mit dem sich fremde Daten anfordern ließen.
 * Begrenzt auf wenige Abrufe pro Stunde; nie zwischenspeichern.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  await enforceRateLimit(`privacy-export:user:${user.id}`, 5, 3600);

  const data = await buildUserDataExport(user.id);
  if (!data) throw notFound("Das Konto");

  const { ipPrefix } = await getRequestMeta();
  await recordSystemAudit({
    actorUserId: user.id,
    action: "privacy.export_created",
    entityType: "User",
    entityId: user.id,
    summary: "Datenexport erstellt",
    ipPrefix,
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vereinsflow-datenexport-${toDateInputValue(new Date())}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, "privacy-export");
