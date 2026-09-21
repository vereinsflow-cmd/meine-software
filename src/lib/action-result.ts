/**
 * Typisierte Ergebnisse für Server Actions und die JSON-API.
 * Diese Datei enthält nur Typen und darf deshalb auch im Browser-Code importiert werden.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "INTERNAL";

export type FieldErrors = Record<string, string[]>;

export interface ActionError {
  code: ErrorCode;
  /** Verständliche, deutsche Meldung für Benutzer. */
  message: string;
  fieldErrors?: FieldErrors;
  retryAfterSeconds?: number;
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

/** Antwort der JSON-API – identisch aufgebaut wie `ActionResult`. */
export type ApiResponse<T> = ActionResult<T>;
