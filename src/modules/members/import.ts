import type { MemberStatus } from "@/generated/prisma/enums";
import { normalizeHeader, parseCsv } from "@/lib/csv";
import { parseCalendarDate } from "@/lib/dates";
import { recordAudit } from "@/server/audit/audit";
import { badRequest } from "@/server/errors";
import { assertCan } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { memberFormSchema, type MemberInput } from "./schemas";

/**
 * CSV-Import von Mitgliedern in zwei Schritten:
 *   1. Vorschau (`previewMemberImport`): liest, prüft und meldet Fehler/Duplikate zeilenweise – schreibt nichts.
 *   2. Import (`executeMemberImport`): liest und prüft die Datei ERNEUT auf dem Server und legt gültige Zeilen an.
 * Der Server verlässt sich nie auf eine im Browser angezeigte Vorschau.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  memberNumber: [
    "mitgliedsnummer",
    "mitgliedernummer",
    "mitgliednr",
    "mitgliedsnr",
    "mitgliedernr",
    "nummer",
    "nr",
    "membernumber",
  ],
  firstName: ["vorname", "firstname", "vornamen"],
  lastName: ["nachname", "familienname", "lastname", "name"],
  email: ["email", "emailadresse", "mail", "emailadr"],
  phone: ["telefon", "telefonnummer", "tel", "handy", "mobil", "mobilnummer", "phone"],
  street: ["strasse", "strassehausnummer", "adresse", "anschrift", "street"],
  postalCode: ["plz", "postleitzahl", "postalcode", "zip"],
  city: ["ort", "stadt", "wohnort", "city"],
  country: ["land", "country"],
  birthDate: ["geburtsdatum", "geboren", "gebdatum", "geburtstag", "birthdate"],
  joinedAt: [
    "eintritt",
    "eintrittsdatum",
    "eintrittam",
    "beitritt",
    "beitrittsdatum",
    "mitgliedseit",
    "joined",
  ],
  leftAt: ["austritt", "austrittsdatum", "austrittam", "left"],
  status: ["status", "mitgliedsstatus"],
  clubFunction: ["funktion", "funktionimverein", "amt", "vereinsfunktion"],
  internalNotes: ["notizen", "notiz", "bemerkung", "bemerkungen", "anmerkung", "anmerkungen"],
  departments: ["abteilung", "abteilungen", "sparte", "sparten"],
};

const ALIAS_TO_FIELD = new Map<string, string>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES))
  for (const alias of aliases) ALIAS_TO_FIELD.set(alias, field);

const STATUS_WORDS: Record<string, MemberStatus> = {
  aktiv: "ACTIVE",
  active: "ACTIVE",
  passiv: "PASSIVE",
  passive: "PASSIVE",
  ausgetreten: "LEFT",
  ehemalig: "LEFT",
  ehrenmitglied: "HONORARY",
  ehren: "HONORARY",
  gesperrt: "BLOCKED",
  blocked: "BLOCKED",
};

/** TT.MM.JJJJ und JJJJ-MM-TT werden akzeptiert. */
function normalizeDate(value: string): string {
  const trimmed = value.trim();
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (german) return `${german[3]}-${german[2]!.padStart(2, "0")}-${german[1]!.padStart(2, "0")}`;
  return trimmed;
}

export interface ImportRow {
  /** Zeilennummer in der Datei (Kopfzeile = 1). */
  line: number;
  label: string;
  status: "ok" | "duplicate" | "error";
  messages: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  counts: { ok: number; duplicate: number; error: number };
  recognizedColumns: string[];
  ignoredColumns: string[];
}

interface Candidate {
  row: ImportRow;
  data?: MemberInput;
  departmentNames: string[];
}

async function analyze(ctx: TenantContext, csvText: string) {
  assertCan(ctx, "members:import");
  const parsed = parseCsv(csvText);

  const columns = parsed.header.map((name) => ALIAS_TO_FIELD.get(normalizeHeader(name)) ?? null);
  if (!columns.includes("firstName") || !columns.includes("lastName")) {
    throw badRequest(
      'Die Datei braucht mindestens die Spalten "Vorname" und "Nachname" in der Kopfzeile.',
    );
  }
  const recognized = [...new Set(columns.filter((c): c is string => !!c))];
  const ignored = parsed.header.filter((_, index) => columns[index] === null);

  const [departments, existing] = await Promise.all([
    ctx.db.department.findMany({ select: { id: true, name: true } }),
    ctx.db.member.findMany({
      where: { deletedAt: null },
      select: { memberNumber: true, firstName: true, lastName: true, birthDate: true, email: true },
    }),
  ]);
  const departmentByName = new Map(departments.map((d) => [d.name.trim().toLowerCase(), d.id]));

  const numbers = new Set(existing.map((m) => m.memberNumber).filter((n): n is string => !!n));
  const keys = new Set<string>();
  const nameKey = (first: string, last: string) =>
    `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`;
  for (const m of existing) {
    keys.add(nameKey(m.firstName, m.lastName));
  }

  const seenNumbers = new Set<string>();
  const seenKeys = new Set<string>();
  const candidates: Candidate[] = parsed.rows.map((cells, index) => {
    const line = index + 2;
    const raw: Record<string, string> = {};
    columns.forEach((field, column) => {
      if (field) raw[field] = (cells[column] ?? "").trim();
    });
    const label = `${raw.firstName ?? ""} ${raw.lastName ?? ""}`.trim() || "(ohne Namen)";
    const messages: string[] = [];

    const statusText = (raw.status ?? "").toLowerCase();
    const status = statusText ? STATUS_WORDS[statusText] : "ACTIVE";
    if (!status)
      messages.push(
        `Unbekannter Status „${raw.status}“ (erlaubt: aktiv, passiv, ausgetreten, Ehrenmitglied, gesperrt).`,
      );

    const departmentNames = (raw.departments ?? "")
      .split(/[|;/]|,(?!\s*\d)/)
      .map((n) => n.trim())
      .filter(Boolean);
    const departmentIds: string[] = [];
    for (const name of departmentNames) {
      const id = departmentByName.get(name.toLowerCase());
      if (id) departmentIds.push(id);
      else messages.push(`Die Abteilung „${name}“ existiert nicht. Bitte lege sie zuerst an.`);
    }

    const result = memberFormSchema.safeParse({
      memberNumber: raw.memberNumber,
      firstName: raw.firstName ?? "",
      lastName: raw.lastName ?? "",
      email: raw.email,
      phone: raw.phone,
      street: raw.street,
      postalCode: raw.postalCode,
      city: raw.city,
      country: raw.country,
      birthDate: raw.birthDate ? normalizeDate(raw.birthDate) : undefined,
      joinedAt: raw.joinedAt ? normalizeDate(raw.joinedAt) : undefined,
      leftAt: raw.leftAt ? normalizeDate(raw.leftAt) : undefined,
      status: status ?? "ACTIVE",
      clubFunction: raw.clubFunction,
      internalNotes: raw.internalNotes,
      departmentIds,
      leaderDepartmentIds: [],
    });
    if (!result.success) {
      for (const issue of result.error.issues) messages.push(issue.message);
    }

    let outcome: ImportRow["status"] = messages.length > 0 ? "error" : "ok";

    if (result.success && outcome === "ok") {
      const data = result.data;
      const key = nameKey(data.firstName, data.lastName);
      if (
        data.memberNumber &&
        (numbers.has(data.memberNumber) || seenNumbers.has(data.memberNumber))
      ) {
        outcome = "duplicate";
        messages.push(`Die Mitgliedsnummer ${data.memberNumber} ist bereits vergeben.`);
      } else if (keys.has(key) || seenKeys.has(key)) {
        outcome = "duplicate";
        messages.push(
          "Mögliches Duplikat: Ein Mitglied mit diesem Namen existiert bereits (übersprungen).",
        );
      }
      if (data.memberNumber) seenNumbers.add(data.memberNumber);
      seenKeys.add(key);
    }

    return {
      row: { line, label, status: outcome, messages },
      data: result.success && outcome === "ok" ? result.data : undefined,
      departmentNames,
    };
  });

  return { candidates, recognized, ignored };
}

export async function previewMemberImport(
  ctx: TenantContext,
  csvText: string,
): Promise<ImportPreview> {
  const { candidates, recognized, ignored } = await analyze(ctx, csvText);
  const rows = candidates.map((c) => c.row);
  return {
    rows: rows.slice(0, 500), // Die Vorschau zeigt höchstens 500 Zeilen; die Zählung umfasst alle.
    counts: {
      ok: rows.filter((r) => r.status === "ok").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      error: rows.filter((r) => r.status === "error").length,
    },
    recognizedColumns: recognized,
    ignoredColumns: ignored,
  };
}

export async function executeMemberImport(
  ctx: TenantContext,
  csvText: string,
): Promise<{ created: number; skipped: number; failed: number }> {
  const { candidates } = await analyze(ctx, csvText);
  const valid = candidates.filter(
    (c): c is Candidate & { data: MemberInput } => c.row.status === "ok" && !!c.data,
  );
  const skipped = candidates.filter((c) => c.row.status === "duplicate").length;
  const failed = candidates.filter((c) => c.row.status === "error").length;
  if (valid.length === 0) return { created: 0, skipped, failed };

  await ctx.db.$transaction(async (tx) => {
    const created = await tx.member.createManyAndReturn({
      data: valid.map(({ data }) => ({
        clubId: ctx.clubId,
        memberNumber: data.memberNumber ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        street: data.street ?? null,
        postalCode: data.postalCode ?? null,
        city: data.city ?? null,
        country: data.country ?? "DE",
        birthDate: data.birthDate ? parseCalendarDate(data.birthDate) : null,
        joinedAt: data.joinedAt ? parseCalendarDate(data.joinedAt) : null,
        leftAt: data.leftAt ? parseCalendarDate(data.leftAt) : null,
        status: data.status,
        clubFunction: data.clubFunction ?? null,
        internalNotes: data.internalNotes ?? null,
      })),
      select: { id: true },
    });

    // createManyAndReturn liefert die Zeilen in der Reihenfolge der Eingabe.
    const assignments = created.flatMap((member, index) =>
      [...new Set(valid[index]!.data.departmentIds)].map((departmentId) => ({
        clubId: ctx.clubId,
        memberId: member.id,
        departmentId,
      })),
    );
    if (assignments.length > 0) await tx.memberDepartment.createMany({ data: assignments });

    await recordAudit(tx, auditActor(ctx), {
      action: "members.imported",
      entityType: "Member",
      summary: `${created.length} Mitglieder per CSV importiert (${skipped} Duplikate, ${failed} fehlerhafte Zeilen übersprungen)`,
      changes: {
        created: { to: created.length },
        skipped: { to: skipped },
        failed: { to: failed },
      },
    });
  });

  return { created: valid.length, skipped, failed };
}
