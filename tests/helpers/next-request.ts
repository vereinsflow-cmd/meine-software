import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { createSessionRecord } from "@/server/auth/session-core";

/**
 * Server Actions laufen in Integrationstests ohne Next.js: Cookies und Kopfzeilen der Anfrage kommen von hier.
 *
 * Einbinden (vor den übrigen Importen):
 *   vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());
 *
 * Das Sitzungs-Token liegt nur im echten Sitzungs-Cookie (`SESSION_COOKIE_NAME`). Liest der Servercode ein anderes
 * Cookie, gilt die Anfrage als nicht angemeldet – so fällt ein falscher Cookie-Name in den Tests auf.
 */
export const request = { token: null as string | null };

/** Legt eine Sitzung an und schickt deren Token ab jetzt mit jeder Anfrage mit. */
export async function loginAs(userId: string, activeClubId: string | null = null): Promise<string> {
  const { token } = await createSessionRecord({
    userId,
    activeClubId,
    userAgent: "vitest",
    ipPrefix: null,
  });
  request.token = token;
  return token;
}

/** Ersatz für `next/headers` mit dem Token aus {@link request}. */
export function nextHeadersMock() {
  return {
    cookies: async () => ({
      get: (name: string) =>
        name === SESSION_COOKIE_NAME && request.token ? { name, value: request.token } : undefined,
      has: (name: string) => name === SESSION_COOKIE_NAME && request.token !== null,
      set: () => {},
      delete: () => {},
    }),
    headers: async () => new Headers({ "user-agent": "vitest" }),
  };
}
