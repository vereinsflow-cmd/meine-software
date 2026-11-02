import { safeRedirectPath } from "./safe-redirect";

/**
 * Zeitplan der automatischen Abmeldung wegen Inaktivität (`IdleLogout`). Maßgeblich ist die Frist auf dem Server
 * (`SESSION_IDLE_MINUTES` ab der letzten Anfrage, siehe `session-core.ts`); die Seite fragt dort nach, wie lange sie noch läuft.
 */

/** So lange vor der automatischen Abmeldung erscheint der Hinweis „Bist du noch da?“. */
export const IDLE_WARNING_MS = 2 * 60_000;

/**
 * Bedienung meldet die Seite höchstens so oft dem Server: alle 5 Minuten, bei einer kurzen Frist öfter (ein Fünftel davon).
 * Sonst liefe die Frist auf dem Server zwischen zwei Meldungen ab, und der Hinweis käme mitten in der Arbeit.
 */
export function idlePingInterval(idleMinutes: number): number {
  return Math.min(5 * 60_000, (idleMinutes * 60_000) / 5);
}

/**
 * Nächster Schritt nach einer Auskunft des Servers (Zeit bis zur Abmeldung): Bleibt mehr als die Vorwarnzeit, ohne Hinweis
 * weiterarbeiten und kurz vor dem Hinweis erneut nachfragen; sonst den Hinweis zeigen und zum Ende erneut nachfragen.
 */
export function idleStep(remainingMs: number): { warn: boolean; askAgainInMs: number } {
  if (remainingMs > IDLE_WARNING_MS) {
    return { warn: false, askAgainInMs: remainingMs - IDLE_WARNING_MS };
  }
  return { warn: true, askAgainInMs: Math.max(0, remainingMs) };
}

/** Restzeit als „1:59“ (Minuten:Sekunden, aufgerundet – „0:00“ erst am Ende). */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Anmeldung nach der automatischen Abmeldung – danach geht es zurück zur Seite, auf der man war (nur interne Pfade). */
export function idleLoginUrl(currentPath: string): string {
  const next = safeRedirectPath(currentPath, "");
  return next ? `/anmelden?expired=1&next=${encodeURIComponent(next)}` : "/anmelden?expired=1";
}
