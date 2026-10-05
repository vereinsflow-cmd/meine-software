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
/**
 * Kürzel der Finanz-Trigger (Migrationen `*_finance_*`). Der Trigger liefert hinter dem Kürzel schon einen verständlichen
 * deutschen Satz – er wird unverändert angezeigt.
 */
const FINANCE_CODES = [
  "FINANCE_NOT_SET_UP",
  "FINANCE_IMMUTABLE",
  "PERIOD_LOCKED",
  "PERIOD_REOPEN_FORBIDDEN",
  "LEDGER_UNBALANCED",
  "REVERSAL_INVALID",
  "OPENING_INVALID",
  "ACCOUNT_ARCHIVED",
  "CASH_NEGATIVE",
  "FUTURE_DATE",
  "CATEGORY_IN_USE",
  "DOCUMENT_RETAINED",
  "INVOICE_BOOKED",
  "CLOSE_INVALID",
  "FEE_RATE_LOCKED",
  "FEE_HISTORY_LOCKED",
  "PAYER_CHAIN",
] as const;
const FINANCE_MESSAGE = new RegExp(`(?:${FINANCE_CODES.join("|")}): ([^\n"]+)`);

export function mapDatabaseError(error: unknown): AppError | null {
  const text = error instanceof Error ? error.message : "";
  const finance = FINANCE_MESSAGE.exec(text);
  if (finance) return conflict(finance[1]!.trim());
  // Gegenseitige Sperre bzw. Schreibkonflikt gleichzeitiger Transaktionen: Ein erneuter Versuch klappt.
  if (/deadlock detected|could not serialize|TransactionWriteConflict|40P01|40001/.test(text))
    return conflict("Die Änderung kollidierte mit einer anderen. Bitte versuche es erneut.");
  if (text.includes("MemberFeeAssignment_no_overlap"))
    return conflict("Für diesen Zeitraum gibt es schon eine solche Regel – beende sie zuerst.");
  if (text.includes("FeeType_one_priority_per_base"))
    return conflict("Die Reihenfolge hat sich gerade geändert. Bitte versuche es erneut.");
  if (text.includes("SHIFT_FULL")) return conflict("Diese Schicht ist bereits voll besetzt.");
  if (text.includes("SHIFT_OVERLAP")) {
    return conflict("Du bist zur selben Zeit bereits in einer anderen Schicht eingetragen.");
  }
  if (text.includes("EVENT_FULL"))
    return conflict("Das Teilnehmerlimit dieser Veranstaltung ist erreicht.");

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        if (
          String(error.meta?.modelName ?? "") === "LedgerEntry" &&
          /reversalOf/.test(JSON.stringify(error.meta))
        )
          return conflict("Diese Buchung ist bereits storniert.");
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
