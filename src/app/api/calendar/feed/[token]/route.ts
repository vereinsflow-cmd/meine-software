import { NextResponse, type NextRequest } from "next/server";
import { buildIcs } from "@/modules/calendar/ics";
import { getFeedIcsEntries } from "@/modules/calendar/service";
import { apiHandler } from "@/server/api";
import { env } from "@/server/env";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { getRequestMeta } from "@/server/security/request";
import { resolveFeedToken } from "@/server/tenancy/feed-token";

/**
 * Persönlicher Kalender-Abo-Feed (für Kalender-Apps ohne Anmeldung). Der geheime Link ist die Berechtigung.
 *
 * - Ungültige, widerrufene oder abgelaufene Links liefern einheitlich 404 (kein Hinweis, ob ein Token existiert).
 * - Rate-Limit je Herkunft, damit sich Links nicht durchprobieren lassen (Tokens haben 256 Bit; das ist Tiefenschutz).
 * - Nie cachen: Ein widerrufener Link muss sofort wirken.
 */
export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ token: string }> }) => {
    const { token: raw } = await context.params;
    const { ip } = await getRequestMeta();
    await enforceRateLimit(`calendar-feed:${ip}`, 120, 3600);

    const ctx = await resolveFeedToken(raw.replace(/\.ics$/i, ""));
    if (!ctx) return notFound();

    const entries = await getFeedIcsEntries(ctx, env.APP_URL);
    const body = buildIcs({
      name: `${ctx.club.name} – VereinsFlow`,
      entries,
      uidDomain: new URL(env.APP_URL).hostname,
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="vereinsflow.ics"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  },
  "calendar-feed",
);

function notFound(): Response {
  return new NextResponse("Nicht gefunden", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}
