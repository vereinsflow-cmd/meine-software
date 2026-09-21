import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { getCurrentSession } from "@/server/auth/session";
import { setSessionActiveClub, type SessionUser } from "@/server/auth/session-core";
import { forbidden, unauthenticated } from "@/server/errors";
import { getRequestMeta } from "@/server/security/request";
import { loadTenantContext, type TenantContext } from "./context-core";

export type { TenantContext } from "./context-core";
export { auditActor } from "./context-core";

/**
 * Kontext der laufenden Anfrage (pro Anfrage nur einmal aufgebaut).
 * `null`, wenn nicht angemeldet oder in keinem aktiven Verein.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await getCurrentSession();
  if (!session) return null;

  const meta = await getRequestMeta();
  const loaded = await loadTenantContext(session.user, session.activeClubId, {
    ipPrefix: meta.ipPrefix,
  });
  if (!loaded) return null;

  if (loaded.clubId !== session.activeClubId) {
    await setSessionActiveClub(session.id, loaded.clubId);
  }
  return loaded.context;
});

/**
 * Für Server Actions und Route Handler: wirft `UNAUTHENTICATED` (401), wenn kein gültiger
 * Kontext besteht. Die Berechtigungsprüfung folgt danach in der jeweiligen Fachfunktion.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) throw unauthenticated();
  return ctx;
}

/** Für Seiten und Layouts: leitet auf die Anmeldung bzw. eine Hinweisseite um. */
export async function requirePageContext(): Promise<TenantContext> {
  const session = await getCurrentSession();
  if (!session) {
    // Cookie vorhanden, Sitzung aber ungültig → abgelaufen/inaktiv: mit Hinweis zur Anmeldung.
    const hadCookie = (await cookies()).has(SESSION_COOKIE_NAME);
    redirect(hadCookie ? "/anmelden?expired=1" : "/anmelden");
  }

  const ctx = await getTenantContext();
  if (ctx) return ctx;

  redirect(session.user.isPlatformAdmin ? "/system" : "/kein-verein");
}

/** Angemeldeter Benutzer ohne Vereinsbezug (z. B. Profil, Systemadministration). */
export async function requireUser(): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) throw unauthenticated();
  return session.user;
}

export async function requirePageUser(): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) redirect("/anmelden");
  return session.user;
}

/** Nur für Superadministratoren. Für alle anderen wirkt die Seite, als gäbe es sie nicht. */
export async function requirePlatformAdminPage(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (!user.isPlatformAdmin) notFound();
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) throw forbidden();
  return user;
}
