import { NextResponse, type NextRequest } from "next/server";
import { openJoinLogo } from "@/modules/membership-applications/service";
import { apiHandler } from "@/server/api";
import { enforceRateLimit, rateLimitIp } from "@/server/security/rate-limit";
import { getRequestMeta } from "@/server/security/request";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Vereinslogo für die öffentliche Beitrittsseite (ohne Anmeldung). Die normale Logo-Adresse liefert nur an Mitglieder;
 * hier ist ein gültiger Beitrittslink die Berechtigung – der Verein zeigt sein Logo dort bewusst wie auf dem Aushang.
 * Ungültiger, erneuerter oder geschlossener Link, Verein ohne Logo: einheitlich „nicht gefunden“. Ausgeliefert wie das
 * Mitglieder-Logo: Typ aus der Positivliste, `nosniff`, `sandbox`-CSP, nur für dieselbe Herkunft, `private`-Cache.
 */
export const GET = apiHandler(async (request: NextRequest, context: RouteContext) => {
  const { token } = await context.params;
  const { ip } = await getRequestMeta();
  if (ip !== "unknown") await enforceRateLimit(`join-logo:ip:${rateLimitIp(ip)}`, 120, 3600);

  const logo = await openJoinLogo(token);
  const etag = `"${logo.version}"`;
  const current = request.nextUrl.searchParams.get("v") === logo.version;
  const headers = {
    "Content-Type": logo.mimeType,
    "Content-Disposition": `inline; filename="vereinslogo.${logo.ext}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": current ? "private, max-age=86400" : "private, no-cache",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) {
    await logo.stream.cancel();
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(logo.stream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(logo.size) },
  });
}, "join-logo");
