import { NextResponse, type NextRequest } from "next/server";
import { buildIcs } from "@/modules/calendar/ics";
import { getEventIcsEntry } from "@/modules/calendar/service";
import { apiHandler } from "@/server/api";
import { env } from "@/server/env";
import { requireTenantContext } from "@/server/tenancy/context";

/** Einzelnen Termin als .ics-Datei herunterladen (Anmeldung erforderlich; nur sichtbare Termine). */
export const GET = apiHandler(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const ctx = await requireTenantContext();
    const entry = await getEventIcsEntry(ctx, id, env.APP_URL);
    const body = buildIcs({
      name: ctx.club.name,
      entries: [entry],
      uidDomain: new URL(env.APP_URL).hostname,
    });
    const slug =
      entry.title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "termin";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.ics"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  "calendar-event-ics",
);
