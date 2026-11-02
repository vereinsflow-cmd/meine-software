import { NextResponse } from "next/server";
import { apiHandler, jsonOk } from "@/server/api";
import { getCurrentSession, peekCurrentSession } from "@/server/auth/session";
import type { ValidSession } from "@/server/auth/session-core";

/**
 * Sitzung der geöffneten Seite (siehe IdleLogout). Antwort: 200 mit der Zeit bis zur automatischen Abmeldung
 * (`remainingMs`, keine weiteren Nutzdaten), 401 = abgelaufen.
 * - POST: Der Benutzer ist aktiv (Bedienung, „Angemeldet bleiben“). Die Prüfung der Sitzung verlängert sie (`lastSeenAt`).
 * - GET: Nur nachfragen, kurz vor Ablauf – verlängert nichts. So erfährt die Seite, ob eine andere Registerkarte die Sitzung
 *   inzwischen verlängert hat, ohne sie selbst am Leben zu halten.
 */
function answer(session: ValidSession | null): Response {
  if (!session) {
    return new NextResponse(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return jsonOk(
    { remainingMs: Math.max(0, session.endsAt.getTime() - Date.now()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = apiHandler(async () => answer(await getCurrentSession()));

export const GET = apiHandler(async () => answer(await peekCurrentSession()));
