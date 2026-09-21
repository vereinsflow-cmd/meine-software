import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Sorgt dafür, dass immer nur EIN Läufer die Hintergrundjobs ausführt – auch bei mehreren Server-Instanzen oder wenn
 * ein Cron-Aufruf noch läuft, während der nächste startet. Grundlage ist ein Advisory-Lock der Datenbank, der beim
 * Ende der Transaktion (auch bei Absturz oder Verbindungsabbruch) automatisch freigegeben wird – es bleibt also nie ein
 * "hängendes" Schloss zurück.
 *
 * Die Jobs selbst sind zusätzlich idempotent (Erinnerungen über eindeutige Schlüssel, Statuswechsel mit Bedingung).
 */
const LOCK_NAME = "vereinsflow:jobs";
const MAX_RUNTIME_MS = 15 * 60_000;

export async function withJobLock<T>(
  run: () => Promise<T>,
): Promise<{ ran: true; value: T } | { ran: false }> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_NAME})) AS locked`;
      if (!rows[0]?.locked) return { ran: false as const };
      return { ran: true as const, value: await run() };
    },
    { timeout: MAX_RUNTIME_MS, maxWait: 5_000 },
  );
}
