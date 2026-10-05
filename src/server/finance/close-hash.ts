import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Monatsabschluss nachrechnen – mit denselben Datenbankfunktionen wie beim Abschließen (`finance_close_balances`,
 * `finance_close_content`, `finance_close_hash`, Migration finance_closing): Kontostände und Prüfsumme frisch aus den
 * Buchungen. Rohabfrage nur lesend und nur mit gebundenen Werten; der Verein kommt aus dem geprüften Kontext des Aufrufers.
 */
export async function recomputeClose(input: {
  clubId: string;
  /** Prüfsumme des Vormonats (bzw. `null` beim ersten Abschluss). */
  previousHash: string | null;
  /** Ende des Vormonats-Abschlusses (bzw. `null` beim ersten Abschluss). */
  after: Date | null;
  closedThrough: Date;
  /** Gespeicherte Kontostände des Abschlusses – die Prüfsumme wird mit ihnen gerechnet, der Aufrufer vergleicht sie mit `balances`. */
  storedBalances: unknown;
}): Promise<{ hash: string; balances: Record<string, number> } | null> {
  const [result] = await prisma.$queryRaw<{ hash: string; balances: Record<string, number> }[]>`
    SELECT "finance_close_hash"(${input.previousHash}, ${input.closedThrough}::date,
             ${JSON.stringify(input.storedBalances ?? {})}::jsonb,
             "finance_close_content"(${input.clubId}, ${input.after}::date, ${input.closedThrough}::date)) AS hash,
           "finance_close_balances"(${input.clubId}, ${input.closedThrough}::date) AS balances`;
  return result ?? null;
}
