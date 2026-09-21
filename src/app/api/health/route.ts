import { NextResponse } from "next/server";
import { isDatabaseReachable } from "@/server/health";

/**
 * Lebenszeichen für Überwachung, Reverse-Proxy und den Docker-HEALTHCHECK: 200, wenn Anwendung und Datenbank antworten, sonst 503.
 * Ohne Anmeldung erreichbar und deshalb bewusst knapp – die Antwort enthält weder Version noch Fehlermeldung noch Konfiguration.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const ok = await isDatabaseReachable();
  return NextResponse.json(
    { ok },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
