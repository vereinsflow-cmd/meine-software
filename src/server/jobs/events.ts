import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Schließt vergangene Veranstaltungen automatisch ab: Veröffentlichte Veranstaltungen, deren Ende mehr als
 * `GRACE_HOURS` Stunden zurückliegt, werden "Abgeschlossen". Damit erscheinen sie in der Vergangenheit statt bei den
 * kommenden, und niemand kann sich mehr eintragen. Jede Änderung steht im Änderungsprotokoll (Akteur: System).
 */
export const GRACE_HOURS = 12;

export async function completePastEvents(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - GRACE_HOURS * 3_600_000);
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED", deletedAt: null, endsAt: { lt: cutoff } },
    select: { id: true, clubId: true, title: true },
    take: 500,
  });
  if (events.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    // Bedingung im UPDATE: Wurde eine Veranstaltung zwischenzeitlich abgesagt oder archiviert, bleibt sie unberührt.
    const { count } = await tx.event.updateMany({
      where: { id: { in: events.map((e) => e.id) }, status: "PUBLISHED" },
      data: { status: "COMPLETED" },
    });
    await tx.auditLog.createMany({
      data: events.map((event) => ({
        clubId: event.clubId,
        actorType: "SYSTEM" as const,
        action: "event.auto_completed",
        entityType: "Event",
        entityId: event.id,
        summary: `Veranstaltung „${event.title}“ automatisch abgeschlossen`,
      })),
    });
    return count;
  });
}
