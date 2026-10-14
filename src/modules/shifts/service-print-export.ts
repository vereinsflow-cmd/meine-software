import { formatDate, toTimeInputValue } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { loadVisibleEvent } from "@/modules/events/service";
import { forbidden } from "@/server/errors";
import { assertCan, can } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import { fullName, resourceOf } from "./service-shared";

// ---------------------------------------------------------------------------------------------
// Ausdruck: Helferplan über mehrere Veranstaltungen
// ---------------------------------------------------------------------------------------------

export interface PrintShiftDto {
  id: string;
  title: string;
  taskName: string | null;
  startsAt: Date;
  endsAt: Date;
  meetingPoint: string | null;
  requiredCount: number;
  filled: number;
  /** Geschlossen: Mitglieder können sich nicht selbst eintragen, nur Veranstalter teilen ein (`checkEligibility`). */
  closed: boolean;
  /** Mindestalter am Tag der Schicht, sonst `null`. */
  minAge: number | null;
  responsible: string | null;
  /** Nur Namen – der Ausdruck ist zum Aushängen gedacht, keine Kontaktdaten wie beim CSV-Export für Organisatoren. */
  helperNames: string[];
}

export interface PrintPlanEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  locationName: string | null;
  address: string | null;
  /** Ansprechpartner wie auf der Veranstaltungsseite: das gewählte Mitglied, sonst der frei eingetragene Name. */
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  shifts: PrintShiftDto[];
}

export interface PrintPlanFilter {
  /** Nur diese Veranstaltungen (leer/weggelassen = keine Einschränkung nach Veranstaltung). */
  eventIds?: string[];
  /** Nur Veranstaltungen, die in diesem Zeitraum beginnen (jeweils optional, `to` ist exklusiv). */
  from?: Date;
  to?: Date;
  /** Nur Schichten mit noch freien Plätzen. */
  onlyOpen?: boolean;
}

/**
 * Helferplan für den Ausdruck, über mehrere Veranstaltungen hinweg und wahlweise eingegrenzt auf bestimmte
 * Veranstaltungen, einen Zeitraum oder nur offene Schichten. Nur veröffentlichte Veranstaltungen mit mindestens
 * einer nicht abgesagten Schicht; ohne jede Einschränkung nur Veranstaltungen, die noch nicht begonnen haben (anders
 * als `getStaffingOverview`, das nach dem Ende der Schicht geht – für den Ausdruck reicht der gröbere Blick).
 * Veranstaltungen, die nach Anwendung von `onlyOpen` keine Schicht mehr übrig haben, entfallen ganz.
 */
export async function listShiftPlanForPrint(
  ctx: TenantContext,
  filter: PrintPlanFilter = {},
): Promise<PrintPlanEvent[]> {
  assertCan(ctx, "shifts:read");
  const eventIds = filter.eventIds?.filter((id) => id.length > 0) ?? [];
  const hasDateFilter = filter.from !== undefined || filter.to !== undefined;

  const events = await ctx.db.event.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      ...(eventIds.length > 0 ? { id: { in: eventIds } } : {}),
      ...(hasDateFilter
        ? {
            startsAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : eventIds.length === 0
          ? { startsAt: { gte: new Date() } } // Ohne jede Auswahl: nur Kommendes, wie die übrige Helferplanung
          : {}),
      shifts: { some: { deletedAt: null, status: { not: "CANCELLED" } } },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      locationName: true,
      address: true,
      contactName: true,
      contactMember: { select: { firstName: true, lastName: true } },
      contactEmail: true,
      contactPhone: true,
      shifts: {
        where: { deletedAt: null, status: { not: "CANCELLED" } },
        orderBy: [{ startsAt: "asc" }, { title: "asc" }],
        select: {
          id: true,
          title: true,
          taskName: true,
          startsAt: true,
          endsAt: true,
          meetingPoint: true,
          requiredCount: true,
          status: true,
          minAge: true,
          responsible: { select: { firstName: true, lastName: true } },
          assignments: {
            where: { status: "CONFIRMED" },
            orderBy: { assignedAt: "asc" },
            select: { member: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 200,
  });

  return events
    .map((event) => {
      const shifts = event.shifts
        .map<PrintShiftDto>((row) => ({
          id: row.id,
          title: row.title,
          taskName: row.taskName,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          meetingPoint: row.meetingPoint,
          requiredCount: row.requiredCount,
          filled: row.assignments.length,
          closed: row.status === "CLOSED",
          minAge: row.minAge,
          responsible: row.responsible ? fullName(row.responsible) : null,
          helperNames: row.assignments.map((a) => fullName(a.member)),
        }))
        .filter((shift) => !filter.onlyOpen || shift.filled < shift.requiredCount);
      return {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        locationName: event.locationName,
        address: event.address,
        contactName: event.contactMember ? fullName(event.contactMember) : event.contactName,
        contactEmail: event.contactEmail,
        contactPhone: event.contactPhone,
        shifts,
      } satisfies PrintPlanEvent;
    })
    .filter((event) => event.shifts.length > 0);
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

/** CSV der Helferplanung einer Veranstaltung (für Veranstalter). Kontaktdaten nur mit entsprechendem Recht. */
export async function exportShiftPlanCsv(
  ctx: TenantContext,
  eventId: string,
): Promise<{ csv: string; filename: string }> {
  const event = await loadVisibleEvent(ctx, eventId);
  const resource = resourceOf(event);
  if (!can(ctx, "shifts:manage", resource) && !can(ctx, "shifts:assign", resource))
    throw forbidden();

  const shifts = await ctx.db.eventShift.findMany({
    where: { eventId, deletedAt: null },
    orderBy: [{ startsAt: "asc" }, { title: "asc" }],
    include: {
      responsible: { select: { firstName: true, lastName: true } },
      assignments: {
        where: { status: "CONFIRMED" },
        include: {
          member: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              departments: { select: { departmentId: true } },
              id: true,
            },
          },
        },
        orderBy: { assignedAt: "asc" },
      },
    },
  });

  const includeContact = can(ctx, "members:read_contact");
  const header = [
    "Schicht",
    "Aufgabe",
    "Datum",
    "Beginn",
    "Ende",
    "Treffpunkt",
    "Benötigt",
    "Eingetragen",
    "Verantwortlich",
    "Helfer",
    ...(includeContact ? ["Telefon"] : []),
    "Geleistete Minuten",
  ];
  const rows: (string | number | null)[][] = [];
  for (const shift of shifts) {
    const common = [
      shift.title,
      shift.taskName,
      formatDate(shift.startsAt),
      toTimeInputValue(shift.startsAt),
      toTimeInputValue(shift.endsAt),
      shift.meetingPoint,
      shift.requiredCount,
      shift.assignments.length,
      shift.responsible ? fullName(shift.responsible) : null,
    ];
    for (const a of shift.assignments) {
      const contactAllowed =
        includeContact &&
        can(ctx, "members:read_contact", {
          departmentIds: a.member.departments.map((d) => d.departmentId),
          ownerMemberId: a.member.id,
        });
      rows.push([
        ...common,
        fullName(a.member),
        ...(includeContact ? [contactAllowed ? a.member.phone : ""] : []),
        a.workedMinutes,
      ]);
    }
    for (let i = shift.assignments.length; i < shift.requiredCount; i++) {
      rows.push([...common, "— frei —", ...(includeContact ? [""] : []), null]);
    }
  }
  const slug =
    event.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "veranstaltung";
  return { csv: toCsv(header, rows), filename: `helferplan-${slug}.csv` };
}
