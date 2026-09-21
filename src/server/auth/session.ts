import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { env } from "@/server/env";
import { getRequestMeta } from "@/server/security/request";
import {
  createSessionRecord,
  deleteSessionByToken,
  validateSessionToken,
  type ValidSession,
} from "./session-core";

/**
 * Cookie-Anbindung der Sitzung (Next.js-spezifisch).
 *
 * Cookie-Eigenschaften:
 *   HttpOnly  – JavaScript im Browser kann das Token nicht lesen (Schutz vor XSS-Diebstahl)
 *   Secure    – nur über HTTPS (in Produktion)
 *   SameSite=Lax – Cookie wird bei fremden Seiten-Anfragen nicht mitgesendet (CSRF-Schutz)
 *   Präfix `__Host-` in Produktion – erzwingt Secure, Path=/ und verbietet Domain-Attribute
 */
export function sessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

/** Erzeugt eine neue Sitzung für den Benutzer und setzt das Cookie. Nur in Server Actions/Route Handlers aufrufen. */
export async function startSession(userId: string, activeClubId: string | null): Promise<void> {
  const meta = await getRequestMeta();
  const { token, expiresAt } = await createSessionRecord({
    userId,
    activeClubId,
    userAgent: meta.userAgent,
    ipPrefix: meta.ipPrefix,
  });

  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Beendet die aktuelle Sitzung (Datenbank + Cookie). */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (token) {
    await deleteSessionByToken(token);
  }
  store.delete(sessionCookieName());
}

/** Aktuelle Sitzung der laufenden Anfrage (pro Anfrage nur einmal aus der Datenbank geladen). */
export const getCurrentSession = cache(async (): Promise<ValidSession | null> => {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token) return null;
  return validateSessionToken(token);
});
