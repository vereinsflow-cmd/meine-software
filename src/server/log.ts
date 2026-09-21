import "server-only";

/**
 * Protokolliert einen unerwarteten Fehler OHNE Nutzdaten (keine Query-Argumente, keine Secrets, keine E-Mail-Adressen).
 * Bewusst ohne Abhängigkeit von Next.js, damit auch Kommandozeilen-Skripte (Jobs, Seed) es nutzen können.
 */
export function logUnexpectedError(scope: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message.slice(0, 300) : "";
  console.error(
    `[${scope}] Unerwarteter Fehler: ${name}${code ? ` (${String(code)})` : ""} ${message}`,
  );
  if (process.env.NODE_ENV !== "production" && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
