import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import type { ApiResponse } from "@/lib/action-result";
import { env } from "./env";
import { forbidden } from "./errors";
import { toActionError } from "./action";
import { HTTP_STATUS } from "./errors";

/** JSON-Erfolgsantwort im einheitlichen Format `{ ok: true, data }`. */
export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data } satisfies ApiResponse<T>, init);
}

/** JSON-Fehlerantwort mit passendem HTTP-Statuscode. Enthält nie interne Details. */
export function jsonError(error: unknown, scope = "api"): NextResponse<ApiResponse<never>> {
  const actionError = toActionError(error, scope);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (actionError.retryAfterSeconds) {
    headers["Retry-After"] = String(actionError.retryAfterSeconds);
  }
  return NextResponse.json({ ok: false, error: actionError } satisfies ApiResponse<never>, {
    status: HTTP_STATUS[actionError.code],
    headers,
  });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF-Schutz für Route Handler (Server Actions bringen ihre eigene Prüfung mit).
 * Änderungen (POST, PUT, PATCH, DELETE) müssen von der eigenen Seite kommen:
 *  1. Ist ein `Origin`-Header vorhanden, muss er zur Anwendung gehören.
 *  2. Sonst muss `Sec-Fetch-Site` "same-origin" (oder "none") sein.
 * Browser senden bei Änderungen immer einen dieser Header; Angreifer-Seiten können sie nicht fälschen.
 * Zusätzlich ist das Sitzungs-Cookie SameSite=Lax.
 */
export function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  if (origin) {
    const allowedHosts = new Set([new URL(env.APP_URL).host]);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) allowedHosts.add(host);
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw forbidden("Ungültige Anfrage-Herkunft.");
    }
    if (!allowedHosts.has(originHost))
      throw forbidden("Anfragen von fremden Seiten sind nicht erlaubt.");
    return;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw forbidden("Anfragen von fremden Seiten sind nicht erlaubt.");
  }
}

/**
 * Umhüllt einen Route Handler: prüft die Herkunft bei Änderungen und übersetzt alle Fehler in
 * eine typisierte JSON-Antwort mit sinnvollem Statuscode (401, 403, 404, 409, 422, 429, 500).
 */
export function apiHandler<Context = unknown>(
  handler: (request: NextRequest, context: Context) => Promise<Response>,
  scope = "api",
) {
  return async (request: NextRequest, context: Context): Promise<Response> => {
    try {
      assertSameOrigin(request);
      return await handler(request, context);
    } catch (error) {
      unstable_rethrow(error);
      return jsonError(error, scope);
    }
  };
}
