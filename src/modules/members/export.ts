import type { Prisma } from "@/generated/prisma/client";
import type { MemberStatus } from "@/generated/prisma/enums";
import { toCsv } from "@/lib/csv";
import { formatCalendarDate, toDateInputValue } from "@/lib/dates";
import { MEMBER_STATUS_LABEL } from "@/lib/labels";
import { recordAudit } from "@/server/audit/audit";
import { assertCan, can, scopeFilter } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";

const MAX_EXPORT_ROWS = 20_000;

/**
 * CSV-Export der Mitgliederliste. Spalten und Werte richten sich nach den Rechten des Exportierenden:
 * Kontakt- und sensible Daten erscheinen nur für Mitglieder, für die er sie auch in der Oberfläche sehen dürfte.
 * Jeder Export wird protokolliert (Anzahl und Spalten, keine Inhalte).
 */
export async function exportMembersCsv(
  ctx: TenantContext,
  filters: { status?: MemberStatus; departmentId?: string; archived?: boolean } = {},
): Promise<{ csv: string; count: number; filename: string }> {
  assertCan(ctx, "members:export");

  const scope = scopeFilter<Prisma.MemberWhereInput>(ctx, "members:read", {
    department: (ids) => ({ departments: { some: { departmentId: { in: [...ids] } } } }),
    own: (holder) => ({ id: holder.memberId ?? "kein-mitglied" }),
  });

  const rows = await ctx.db.member.findMany({
    where: {
      AND: [
        { deletedAt: null, archivedAt: filters.archived ? { not: null } : null },
        scope ?? {},
        filters.status ? { status: filters.status } : {},
        filters.departmentId
          ? { departments: { some: { departmentId: filters.departmentId } } }
          : {},
      ],
    },
    include: {
      departments: {
        include: { department: { select: { name: true } } },
        orderBy: { department: { name: "asc" } },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: MAX_EXPORT_ROWS,
  });

  const canContactAny = can(ctx, "members:read_contact");
  const canPrivateAny = can(ctx, "members:read_private");

  const header = [
    "Mitgliedsnummer",
    "Vorname",
    "Nachname",
    "Status",
    "Funktion",
    "Abteilungen",
    "Eintrittsdatum",
    "Austrittsdatum",
    ...(canContactAny ? ["E-Mail", "Telefon", "Straße", "PLZ", "Ort", "Land"] : []),
    ...(canPrivateAny ? ["Geburtsdatum", "Notizen"] : []),
  ];

  const body = rows.map((row) => {
    const resource = {
      departmentIds: row.departments.map((d) => d.departmentId),
      ownerMemberId: row.id,
    };
    const contact = can(ctx, "members:read_contact", resource);
    const sensitive = can(ctx, "members:read_private", resource);
    return [
      row.memberNumber,
      row.firstName,
      row.lastName,
      MEMBER_STATUS_LABEL[row.status],
      row.clubFunction,
      row.departments.map((d) => d.department.name).join(" | "),
      formatCalendarDate(row.joinedAt).replace("–", ""),
      formatCalendarDate(row.leftAt).replace("–", ""),
      ...(canContactAny
        ? [
            contact ? row.email : "",
            contact ? row.phone : "",
            contact ? row.street : "",
            contact ? row.postalCode : "",
            contact ? row.city : "",
            contact ? row.country : "",
          ]
        : []),
      ...(canPrivateAny
        ? [
            sensitive ? formatCalendarDate(row.birthDate).replace("–", "") : "",
            sensitive ? row.internalNotes : "",
          ]
        : []),
    ];
  });

  await ctx.db.$transaction(async (tx) => {
    await recordAudit(tx, auditActor(ctx), {
      action: "members.exported",
      entityType: "Member",
      summary: `${rows.length} Mitglieder als CSV exportiert`,
      changes: { spalten: { to: header }, anzahl: { to: rows.length } },
    });
  });

  return {
    csv: toCsv(header, body),
    count: rows.length,
    filename: `mitglieder-${toDateInputValue(new Date())}.csv`,
  };
}
