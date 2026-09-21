/**
 * Einheitliches Fehlermodell der Serverlogik.
 *
 * Services werfen `AppError` (mit deutscher, für Benutzer bestimmter Meldung). Die
 * Übersetzung in eine Antwort übernehmen `runAction` (Server Actions) und `apiHandler`
 * (Route Handler). Unerwartete Fehler werden dort protokolliert und nur als generische
 * Meldung nach außen gegeben – Details (SQL, Stacktraces, Secrets) verlassen nie den Server.
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

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

/** Feldfehler je Formularfeld, z. B. `{ "email": ["Ungültige E-Mail-Adresse"] }`. */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options: { fieldErrors?: FieldErrors; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.fieldErrors = options.fieldErrors;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export const unauthenticated = (message = "Bitte melde dich an.") =>
  new AppError("UNAUTHENTICATED", message);

export const forbidden = (message = "Dafür fehlt dir die Berechtigung.") =>
  new AppError("FORBIDDEN", message);

/** Bewusst neutral: verrät nicht, ob der Datensatz in einem anderen Verein existiert (IDOR-Schutz). */
export const notFound = (what = "Der Eintrag") =>
  new AppError("NOT_FOUND", `${what} wurde nicht gefunden.`);

export const conflict = (message: string) => new AppError("CONFLICT", message);

export const badRequest = (message: string) => new AppError("BAD_REQUEST", message);

export const validationFailed = (
  fieldErrors: FieldErrors,
  message = "Bitte prüfe deine Eingaben.",
) => new AppError("VALIDATION", message, { fieldErrors });

export const rateLimited = (retryAfterSeconds: number) =>
  new AppError(
    "RATE_LIMITED",
    "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.",
    {
      retryAfterSeconds,
    },
  );

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
