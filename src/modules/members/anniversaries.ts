import type { Prisma } from "@/generated/prisma/client";
import type { MemberStatus } from "@/generated/prisma/enums";
import {
  anniversaryInYear,
  anniversaryToday,
  groupByLevel,
  joinedRanges,
  referenceYear,
  upcomingAnniversary,
} from "@/lib/anniversaries";
import { toCsv } from "@/lib/csv";
import { formatCalendarDate } from "@/lib/dates";
import { MEMBER_STATUS_LABEL } from "@/lib/labels";
import { recordAudit } from "@/server/audit/audit";
import { forbidden } from "@/server/errors";
import { assertCan, scopeOf } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { memberReadScope } from "./service";

/**
 * Ehrungen und Jubiläen – Geschäftslogik. Die Kalenderrechnung (Stufen, Jubiläumstag, wer zählt) steht in
 * `src/lib/anniversaries.ts`; hier kommen Berechtigung, Datenbank und Export dazu.
 *
 * Grundsätze:
 *  - Sichtbar für alle, die Mitglieder vereinsweit oder ihrer Abteilungen ansehen dürfen (`members:read` mit Reichweite
 *    CLUB bzw. DEPARTMENT). Abteilungsleiter sehen genau die Mitglieder, die sie auch in der Mitgliederliste sehen
 *    (`memberReadScope`). Wer nur den eigenen Datensatz sieht, bekommt keine Ehrungen.
 *  - Es erscheinen nur Name, Mitgliedsnummer, Eintritt/Austritt und Abteilungen – keine Kontaktdaten. So lässt sich die
 *    Liste auch ausdrucken und in der Versammlung vorlesen.
 *  - Der CSV-Export braucht zusätzlich `members:export` und wird protokolliert (wie der Export der Mitgliederliste).
 */

/** Status, die im Hinweis „Bei N Mitgliedern fehlt das Eintrittsdatum“ mitzählen (wie bei den Geburtstagen). */
const COUNTED_STATUSES: MemberStatus[] = ["ACTIVE", "PASSIVE", "HONORARY"];
const MAX_ROWS = 5000;

/** Darf der Benutzer die Ehrungen sehen? (Mitglieder vereinsweit oder der eigenen Abteilungen ansehen.) */
export function canSeeAnniversaries(ctx: TenantContext): boolean {
  const scope = scopeOf(ctx, "members:read");
  return scope === "CLUB" || scope === "DEPARTMENT";
}

function assertAnniversaries(ctx: TenantContext): "CLUB" | "DEPARTMENT" {
  const scope = scopeOf(ctx, "members:read");
  if (scope !== "CLUB" && scope !== "DEPARTMENT") throw forbidden();
  return scope;
}

export interface AnniversaryEntry {
  memberId: string;
  firstName: string;
  lastName: string;
  memberNumber: string | null;
  status: MemberStatus;
  joinedAt: Date;
  /** Austrittsdatum, falls eingetragen (auch ein künftiges: „Austritt zum …“). */
  leftAt: Date | null;
  departments: string[];
  /** Erreichte Stufe in Jahren. */
  years: number;
  /** Jubiläumstag (UTC-Mitternacht, `@db.Date`-Konvention). */
  date: Date;
}

export interface AnniversaryOverview {
  year: number;
  /** DEPARTMENT: nur die Mitglieder der eigenen Abteilung(en). */
  scope: "CLUB" | "DEPARTMENT";
  /** Nach Stufe, höchste zuerst; darin nach Jubiläumstag und Name. */
  groups: { years: number; entries: AnniversaryEntry[] }[];
  total: number;
  /** Mitglieder im Bestand ohne Eintrittsdatum – sie können hier nicht erscheinen. */
  withoutJoinDate: number;
}

const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  memberNumber: true,
  status: true,
  joinedAt: true,
  leftAt: true,
  archivedAt: true,
  deletedAt: true,
  departments: {
    select: { department: { select: { name: true } } },
    orderBy: { department: { name: "asc" } },
  },
} satisfies Prisma.MemberSelect;

type CandidateRow = Prisma.MemberGetPayload<{ select: typeof candidateSelect }>;

/** Mitglieder, die in einem der Jahre eine Stufe erreichen könnten (Vorauswahl über das Eintrittsjahr). */
async function loadCandidates(ctx: TenantContext, years: number[]): Promise<CandidateRow[]> {
  return ctx.db.member.findMany({
    where: {
      AND: [
        { archivedAt: null, deletedAt: null, status: { not: "BLOCKED" } },
        memberReadScope(ctx) ?? {},
        { OR: joinedRanges(years).map((range) => ({ joinedAt: range })) },
      ],
    },
    select: candidateSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: MAX_ROWS,
  });
}

const toEntry = (row: CandidateRow, hit: { years: number; date: Date }): AnniversaryEntry => ({
  memberId: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  memberNumber: row.memberNumber,
  status: row.status,
  joinedAt: row.joinedAt!,
  leftAt: row.leftAt,
  departments: row.departments.map((d) => d.department.name),
  years: hit.years,
  date: hit.date,
});

/** Alle runden Jubiläen eines Kalenderjahres (ohne Angabe: das laufende Jahr in Berlin). */
export async function listAnniversaries(
  ctx: TenantContext,
  options: { year?: number; now?: Date } = {},
): Promise<AnniversaryOverview> {
  const scope = assertAnniversaries(ctx);
  const year = options.year ?? referenceYear(options.now);
  const [rows, withoutJoinDate] = await Promise.all([
    loadCandidates(ctx, [year]),
    ctx.db.member.count({
      where: {
        AND: [
          { archivedAt: null, deletedAt: null, joinedAt: null, status: { in: COUNTED_STATUSES } },
          memberReadScope(ctx) ?? {},
        ],
      },
    }),
  ]);

  const entries: AnniversaryEntry[] = [];
  for (const row of rows) {
    const hit = anniversaryInYear(row, year);
    if (hit) entries.push(toEntry(row, hit));
  }
  return {
    year,
    scope,
    groups: groupByLevel(entries),
    total: entries.length,
    withoutJoinDate,
  };
}

export interface UpcomingAnniversaryItem {
  memberId: string;
  name: string;
  years: number;
  /** Jubiläumstag (UTC-Mitternacht). */
  date: Date;
  /** Tage ab heute (0 = heute). */
  inDays: number;
}

/**
 * Jubiläen der nächsten Tage (Dashboard-Karte „Jubiläen“): heute zählt mit, auch über den Jahreswechsel. Ohne Berechtigung
 * leer.
 */
export async function listUpcomingAnniversaries(
  ctx: TenantContext,
  options: { days?: number; limit?: number; now?: Date } = {},
): Promise<UpcomingAnniversaryItem[]> {
  if (!canSeeAnniversaries(ctx)) return [];
  const today = anniversaryToday(options.now);
  const days = options.days ?? 60;
  const thisYear = today.getUTCFullYear();
  const rows = await loadCandidates(ctx, [thisYear, thisYear + 1]);
  return rows
    .map((row) => ({ row, hit: upcomingAnniversary(row, today, days) }))
    .filter((item): item is { row: CandidateRow; hit: NonNullable<typeof item.hit> } =>
      Boolean(item.hit),
    )
    .sort(
      (a, b) =>
        a.hit.inDays - b.hit.inDays ||
        a.row.lastName.localeCompare(b.row.lastName, "de") ||
        a.row.firstName.localeCompare(b.row.firstName, "de"),
    )
    .slice(0, options.limit ?? 5)
    .map(({ row, hit }) => ({
      memberId: row.id,
      name: `${row.firstName} ${row.lastName}`,
      years: hit.years,
      date: hit.date,
      inDays: hit.inDays,
    }));
}

const CSV_HEADER = [
  "Jubiläum (Jahre)",
  "Jubiläum am",
  "Mitgliedsnummer",
  "Vorname",
  "Nachname",
  "Status",
  "Abteilungen",
  "Eintrittsdatum",
  "Austrittsdatum",
] as const;

/** CSV der Ehrungen eines Jahres (für Urkunden, Serienbriefe). Braucht `members:export`; wird protokolliert. */
export async function exportAnniversariesCsv(
  ctx: TenantContext,
  options: { year?: number; now?: Date } = {},
): Promise<{ csv: string; count: number; filename: string }> {
  assertCan(ctx, "members:export");
  const overview = await listAnniversaries(ctx, options);
  const body = overview.groups.flatMap((group) =>
    group.entries.map((entry) => [
      entry.years,
      formatCalendarDate(entry.date),
      entry.memberNumber,
      entry.firstName,
      entry.lastName,
      MEMBER_STATUS_LABEL[entry.status],
      entry.departments.join(" | "),
      formatCalendarDate(entry.joinedAt),
      entry.leftAt ? formatCalendarDate(entry.leftAt) : "",
    ]),
  );

  await recordAudit(ctx.db, auditActor(ctx), {
    action: "members.exported",
    entityType: "Member",
    summary: `Ehrungen ${overview.year}: ${overview.total} ${overview.total === 1 ? "Jubiläum" : "Jubiläen"} als CSV exportiert`,
    changes: {
      spalten: { to: [...CSV_HEADER] },
      anzahl: { to: overview.total },
      jahr: { to: overview.year },
    },
  });

  return {
    csv: toCsv(CSV_HEADER, body),
    count: overview.total,
    filename: `ehrungen-${overview.year}.csv`,
  };
}
