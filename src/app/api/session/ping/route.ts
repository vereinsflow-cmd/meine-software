import { NextResponse } from "next/server";
import { apiHandler } from "@/server/api";
import { getCurrentSession } from "@/server/auth/session";

/**
 * Verlängert die Sitzung, solange der Benutzer aktiv ist (siehe IdleLogout). Die Prüfung der Sitzung
 * aktualisiert `lastSeenAt`. Antwort: 204 = gültig, 401 = abgelaufen. Keine Nutzdaten.
 */
export const POST = apiHandler(async () => {
  const session = await getCurrentSession();
  return new NextResponse(null, {
    status: session ? 204 : 401,
    headers: { "Cache-Control": "no-store" },
  });
});
