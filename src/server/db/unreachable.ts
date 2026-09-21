/**
 * Erkennt Fehler, die bedeuten „die Datenbank ist nicht erreichbar“ (sie läuft nicht, falscher Host/Port) – im Gegensatz zu
 * Programmfehlern. Skripte können dann eine verständliche Anleitung statt eines langen Fehlerbildes ausgeben.
 * Prisma, `pg` und Node verpacken den Grund unterschiedlich (`code`, `errorCode`, `cause`, `errors` bei AggregateError).
 */
const UNREACHABLE = new Set(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "P1001", "P1002"]);

export function isDatabaseUnreachable(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 5) return false;
  const { code, errorCode, cause, errors } = error as {
    code?: unknown;
    errorCode?: unknown;
    cause?: unknown;
    errors?: unknown;
  };
  if (typeof code === "string" && UNREACHABLE.has(code)) return true;
  if (typeof errorCode === "string" && UNREACHABLE.has(errorCode)) return true;
  if (Array.isArray(errors) && errors.some((inner) => isDatabaseUnreachable(inner, depth + 1))) {
    return true;
  }
  return isDatabaseUnreachable(cause, depth + 1);
}
