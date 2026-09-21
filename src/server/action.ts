import "server-only";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type { ActionError, ActionResult } from "@/lib/action-result";
import { logUnexpectedError } from "./log";
import { AppError, conflict, notFound, validationFailed, type FieldErrors } from "./errors";

export type { ActionResult } from "@/lib/action-result";

/** Wandelt Zod-Fehler in Feldfehler um; verschachtelte Pfade werden mit Punkt verbunden (`address.city`). */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

/** Validiert Eingaben serverseitig. Wirft bei Fehlern `VALIDATION` (HTTP 422) mit Feldfehlern. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationFailed(fieldErrorsFromZod(result.error));
  }
  return result.data;
}

/**
 * Übersetzt bekannte Datenbankfehler in verständliche Fachfehler. Die Trigger der Migration
 * "integrity_guards" melden sich mit einem Kürzel (SHIFT_FULL, SHIFT_OVERLAP, EVENT_FULL).
 */
export function mapDatabaseError(error: unknown): AppError | null {
  const text = error instanceof Error ? error.message : "";
  if (text.includes("SHIFT_FULL")) return conflict("Diese Schicht ist bereits voll besetzt.");
  if (text.includes("SHIFT_OVERLAP")) {
    return conflict("Du bist zur selben Zeit bereits in einer anderen Schicht eingetragen.");
  }
  if (text.includes("EVENT_FULL"))
    return conflict("Das Teilnehmerlimit dieser Veranstaltung ist erreicht.");

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return conflict("Ein Eintrag mit diesen Daten existiert bereits.");
      case "P2003":
        return conflict(
          "Der Eintrag wird noch verwendet oder verweist auf einen ungültigen Datensatz.",
        );
      case "P2025":
        return notFound();
      case "P2034":
        return conflict("Die Änderung kollidierte mit einer anderen. Bitte versuche es erneut.");
    }
  }
  return null;
}

export function toActionError(error: unknown, scope = "action"): ActionError {
  const mapped = error instanceof AppError ? error : mapDatabaseError(error);
  if (mapped) {
    return {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.fieldErrors ? { fieldErrors: mapped.fieldErrors } : {}),
      ...(mapped.retryAfterSeconds ? { retryAfterSeconds: mapped.retryAfterSeconds } : {}),
    };
  }
  logUnexpectedError(scope, error);
  return {
    code: "INTERNAL",
    message: "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später erneut.",
  };
}

/**
 * Führt eine Server Action aus und liefert ein typisiertes Ergebnis statt einer Exception.
 * `redirect()` und `notFound()` von Next.js werden korrekt durchgereicht.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  scope = "action",
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: toActionError(error, scope) };
  }
}
