import "server-only";
import { prisma } from "@/server/db/client";

export interface CloseToRecompute {
  /** Prüfsumme des Vormonats (bzw. `null` beim ersten Abschluss). */
  previousHash: string | null;
  /** Ende des Vormonats-Abschlusses (bzw. `null` beim ersten Abschluss). */
  after: Date | null;
  closedThrough: Date;
  /** Gespeicherte Kontostände des Abschlusses – die Prüfsumme wird mit ihnen gerechnet, der Aufrufer vergleicht sie mit `balances`. */
  storedBalances: unknown;
}

/** Kalendertag als „JJJJ-MM-TT“ (UTC-Mitternacht wie alle `@db.Date`-Werte). */
const isoDay = (day: Date | null) => (day ? day.toISOString().slice(0, 10) : null);

/**
 * Monatsabschlüsse nachrechnen – mit denselben Datenbankfunktionen wie beim Abschließen (`finance_close_balances`,
 * `finance_close_content`, `finance_close_hash`, Migration finance_closing): Kontostände und Prüfsumme frisch aus den
 * Buchungen. Alle Abschlüsse in EINER Abfrage (statt einer je Abschluss). Rohabfrage nur lesend und nur mit gebundenen
 * Werten; der Verein kommt aus dem geprüften Kontext des Aufrufers. Ergebnis in derselben Reihenfolge wie `closes`.
 */
export async function recomputeCloses(
  clubId: string,
  closes: CloseToRecompute[],
): Promise<({ hash: string; balances: Record<string, number> } | null)[]> {
  if (closes.length === 0) return [];
  const rows = await prisma.$queryRaw<
    { ord: bigint; hash: string; balances: Record<string, number> }[]
  >`
    SELECT c.ord,
           "finance_close_hash"(c.previous, c.through::date, c.stored::jsonb,
             "finance_close_content"(${clubId}, c.after::date, c.through::date)) AS hash,
           "finance_close_balances"(${clubId}, c.through::date) AS balances
      FROM unnest(${closes.map((c) => c.previousHash)}::text[],
                  ${closes.map((c) => isoDay(c.after))}::text[],
                  ${closes.map((c) => isoDay(c.closedThrough))}::text[],
                  ${closes.map((c) => JSON.stringify(c.storedBalances ?? {}))}::text[])
        WITH ORDINALITY AS c(previous, after, through, stored, ord)`;
  const byOrd = new Map(rows.map((row) => [Number(row.ord), row]));
  return closes.map((_, i) => {
    const row = byOrd.get(i + 1);
    return row ? { hash: row.hash, balances: row.balances } : null;
  });
}
