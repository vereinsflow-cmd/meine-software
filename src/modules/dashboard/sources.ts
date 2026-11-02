import type { EventType, MemberStatus } from "@/generated/prisma/enums";
import { buildBuckets } from "@/lib/charts/time-buckets";
import { eventVisibilityWhere } from "@/modules/events/service";
import { memberReadScope } from "@/modules/members/service";
import { listWorkedMinutes } from "@/modules/shifts/service";
import type { TenantContext } from "@/server/tenancy/context-core";

/**
 * Daten, die die Kennzahlen (`getDashboard`) und die Auswertungen (`getAnalytics`) gleichermaßen brauchen. Die Seite legt
 * die Quellen EINMAL je Aufruf an und gibt sie beiden mit. Vorher las jeder Teil selbst: die Mitglieder (samt Bestand je
 * Status) zweimal, die Termine zweimal und die Helferminuten der letzten fünf Jahre zweimal – dazu die Stunden des Jahres
 * mit Namen ein drittes Mal.
 *
 * Jede Quelle lädt erst beim ersten Abruf und danach nicht wieder: Sie gilt für genau einen Aufruf der Seite. Die
 * Berechtigung prüfen weiter die Aufrufer, bevor sie eine Quelle abrufen; der Sichtbereich (Abteilung, „nur eigene“)
 * steckt wie bisher in den Abfragen.
 */
export interface DashboardSources {
  /**
   * Alle Mitglieder im Sichtbereich – samt Archiv und Papierkorb, die Verläufe wählen selbst aus – und der Bestand je
   * Status (ohne Archiv und Papierkorb).
   */
  members(): Promise<{
    records: MemberHistoryRecord[];
    byStatus: { status: MemberStatus; count: number }[];
  }>;
  /** Veröffentlichte und abgeschlossene Termine im Sichtbereich, siehe {@link EVENT_LOOKAHEAD_DAYS}. */
  events(): Promise<{ startsAt: Date; type: EventType }[]>;
  /** Dokumentierte Helferminuten der fünf Jahre, die die Verläufe zeigen (bis Ende des laufenden Jahres). */
  workedMinutes(): ReturnType<typeof listWorkedMinutes>;
}

export interface MemberHistoryRecord {
  joinedAt: Date | null;
  leftAt: Date | null;
  createdAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  status: MemberStatus;
}

/**
 * Die Termine reichen vom Beginn der Fünf-Jahres-Auswertung bis 30 Tage nach heute (Kennzahl „Termine in den nächsten
 * 30 Tagen“) bzw. bis zum Ende des laufenden Jahres, je nachdem, was später ist. Jeder Teil wählt daraus seinen Zeitraum.
 */
export const EVENT_LOOKAHEAD_DAYS = 30;
const DAY = 86_400_000;

export function dashboardSources(ctx: TenantContext, now: Date): DashboardSources {
  const years = buildBuckets("Y", now);
  const from = years[0]!.start;
  const to = years[years.length - 1]!.end;
  return {
    members: once(async () => {
      // Erst hier, nicht beim Anlegen: Die Seite legt die Quellen für jeden Benutzer an, und ohne `members:read` wirft der
      // Filter `FORBIDDEN` – abgerufen wird die Quelle aber nur nach der Prüfung des Aufrufers.
      const scope = memberReadScope(ctx) ?? {};
      const [records, groups] = await Promise.all([
        ctx.db.member.findMany({
          where: scope,
          select: {
            joinedAt: true,
            leftAt: true,
            createdAt: true,
            archivedAt: true,
            deletedAt: true,
            status: true,
          },
        }),
        ctx.db.member.groupBy({
          by: ["status"],
          where: { AND: [{ archivedAt: null, deletedAt: null }, scope] },
          _count: { _all: true },
        }),
      ]);
      return {
        records,
        byStatus: groups.map((group) => ({ status: group.status, count: group._count._all })),
      };
    }),
    events: once(() =>
      ctx.db.event.findMany({
        where: {
          AND: [
            eventVisibilityWhere(ctx),
            {
              status: { in: ["PUBLISHED", "COMPLETED"] },
              startsAt: {
                gte: from,
                lt: new Date(Math.max(to.getTime(), now.getTime() + EVENT_LOOKAHEAD_DAYS * DAY)),
              },
            },
          ],
        },
        select: { startsAt: true, type: true },
      }),
    ),
    workedMinutes: once(() => listWorkedMinutes(ctx, { from, to })),
  };
}

/** Lädt beim ersten Aufruf und gibt danach dasselbe Ergebnis zurück. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let result: Promise<T> | undefined;
  return () => (result ??= load());
}
