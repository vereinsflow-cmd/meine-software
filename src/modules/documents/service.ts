import type { Prisma } from "@/generated/prisma/client";
import type { DocumentAccess, InvoiceStatus } from "@/generated/prisma/enums";
import { formatEuroFromCents, parseCalendarDate, todayCalendarDate } from "@/lib/dates";
import { parseEuroToCents } from "@/lib/money";
import { checkUpload, extensionOf, sanitizeFileName } from "@/lib/uploads";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import { recordAudit } from "@/server/audit/audit";
import type { TenantDb } from "@/server/db/tenant";
import { env } from "@/server/env";
import { badRequest, forbidden, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf } from "@/server/permissions/policy";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { deleteFile, openFile, saveFile } from "@/server/storage/files";
import { scanUpload } from "@/server/storage/scan";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { invoiceBaseName, nextInvoiceName } from "@/modules/finance/invoice-format";
import type { DocumentInput } from "./schemas";

/**
 * Dokumente – sicher hochladen, ablegen und herunterladen.
 *
 * Wer sieht was: Jedes Dokument hat eine Zugriffsstufe. "Alle Mitglieder" sehen alle mit `documents:read`;
 * "Nur Vorstand" nur, wer Dokumente verwalten darf (`documents:manage`); "Nur Verwaltung" nur, wer den Verein verwalten
 * darf (`club:update`). Die Stufen gelten kumulativ nach oben. Wer eine Stufe nicht sieht, kann sie auch nicht vergeben,
 * und ein nicht sichtbares Dokument ist "nicht gefunden" – nie "verboten" (keine Existenz-Hinweise).
 *
 * Uploads: Positivliste, Inhaltsprüfung, Größen- und Speicherkontingent, Rate-Limit, Scanner-Erweiterungspunkt. Die Datei
 * liegt unter einem zufälligen Schlüssel außerhalb von `public/`; Downloads laufen immer über die geprüfte Route.
 * Gelöschte Dokumente bleiben 30 Tage im Papierkorb-Zustand (Datei und Datensatz), dann räumt der Aufbewahrungsjob auf.
 *
 * Rechnungen: Ein Dokument kann eine Rechnung sein (`Invoice`, 1:1). Erfassen und ändern darf das nur, wer
 * `finance:manage` hat; Betrag und Zahlungsstand sieht nur, wer `finance:read` hat – alle anderen sehen ein gewöhnliches
 * Dokument. Rechnungen heißen nach dem Tag des Hochladens („Rechnung vom 27.09.2026.pdf“, am selben Tag „(2)“ …).
 */
export interface DocumentDto {
  id: string;
  name: string;
  category: string | null;
  mimeType: string;
  sizeBytes: number;
  access: DocumentAccess;
  uploader: string | null;
  createdAt: Date;
  event: { id: string; title: string; startsAt: Date } | null;
  /** Nur für Berechtigte (`finance:read`), sonst immer `null`. */
  invoice: DocumentInvoice | null;
  can: { manage: boolean };
}

export interface DocumentInvoice {
  id: string;
  status: InvoiceStatus;
  amountCents: number | null;
  /** Kalendertage (`@db.Date`, UTC-Mitternacht). */
  invoiceDate: Date;
  dueDate: Date | null;
  /** Tage bis zur Fälligkeit (0 = heute, negativ = überschritten); `null` ohne Fälligkeit. */
  dueInDays: number | null;
  overdue: boolean;
  paidAt: Date | null;
}

const include = {
  event: { select: { id: true, title: true, startsAt: true } },
  invoice: true,
} satisfies Prisma.DocumentInclude;
type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof include }>;

export function allowedAccessLevels(ctx: TenantContext): DocumentAccess[] {
  const levels: DocumentAccess[] = ["ALL_MEMBERS"];
  if (can(ctx, "documents:manage")) levels.push("BOARD");
  if (can(ctx, "club:update")) levels.push("ADMIN");
  return levels;
}

/** Auch von der zentralen Suche verwendet (src/modules/search/service.ts). */
export const visibleWhere = (ctx: TenantContext): Prisma.DocumentWhereInput => ({
  deletedAt: null,
  archivedAt: null,
  access: { in: allowedAccessLevels(ctx) },
});

/** Auch von der zentralen Suche verwendet (src/modules/search/service.ts). */
export function searchWhere(q: string): Prisma.DocumentWhereInput {
  const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" as const } },
        { category: { contains: token, mode: "insensitive" as const } },
      ],
    })),
  };
}

/** Darf der Benutzer dieses Dokument ändern oder löschen? Verwalter immer; Hochladende ihr eigenes. */
const canManageDocument = (ctx: TenantContext, row: { uploadedById: string | null }): boolean =>
  can(ctx, "documents:manage") || (can(ctx, "documents:upload") && row.uploadedById === ctx.userId);

async function toDtos(ctx: TenantContext, rows: DocumentRow[]): Promise<DocumentDto[]> {
  const ids = [
    ...new Set(rows.map((r) => r.uploadedById).filter((id): id is string => id !== null)),
  ];
  const people = ids.length
    ? await ctx.db.clubMembership.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, user: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const names = new Map(people.map((p) => [p.userId, `${p.user.firstName} ${p.user.lastName}`]));
  const finance = can(ctx, "finance:read");
  const today = todayCalendarDate();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    access: row.access,
    uploader: row.uploadedById ? (names.get(row.uploadedById) ?? null) : null,
    createdAt: row.createdAt,
    event: row.event,
    invoice: finance && row.invoice ? invoiceDto(row.invoice, today) : null,
    can: { manage: canManageDocument(ctx, row) },
  }));
}

/** Rechnungsangaben für die Anzeige (auch vom Finanzmodul für das Dashboard verwendet). */
export function invoiceDto(
  invoice: {
    id: string;
    status: InvoiceStatus;
    amountCents: number | null;
    invoiceDate: Date;
    dueDate: Date | null;
    paidAt: Date | null;
  },
  today: Date,
): DocumentInvoice {
  const dueInDays =
    invoice.dueDate === null
      ? null
      : Math.round((invoice.dueDate.getTime() - today.getTime()) / 86_400_000);
  return {
    id: invoice.id,
    status: invoice.status,
    amountCents: invoice.amountCents,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    dueInDays,
    overdue: invoice.status === "OPEN" && dueInDays !== null && dueInDays < 0,
    paidAt: invoice.paidAt,
  };
}

export interface DocumentQuery {
  q?: string;
  category?: string;
  eventId?: string;
  /** Nur Rechnungen („alle“) bzw. nur offene – wirkt nur für Berechtigte (`finance:read`). */
  invoices?: "open" | "all";
  request: PageRequest;
}

export async function listDocuments(
  ctx: TenantContext,
  query: DocumentQuery,
): Promise<Paged<DocumentDto>> {
  assertCan(ctx, "documents:read");
  const where: Prisma.DocumentWhereInput = {
    AND: [
      visibleWhere(ctx),
      query.category ? { category: query.category } : {},
      query.eventId ? { eventId: query.eventId } : {},
      query.invoices && can(ctx, "finance:read")
        ? query.invoices === "open"
          ? { invoice: { is: { status: "OPEN" } } }
          : { invoice: { isNot: null } }
        : {},
      searchWhere(query.q ?? ""),
    ],
  };
  const [rows, total] = await Promise.all([
    ctx.db.document.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: query.request.skip,
      take: query.request.pageSize,
    }),
    ctx.db.document.count({ where }),
  ]);
  return paged(await toDtos(ctx, rows), total, query.request);
}

/** Kategorien der sichtbaren Dokumente (für Filter und Vorschläge). */
export async function listCategories(ctx: TenantContext): Promise<string[]> {
  assertCan(ctx, "documents:read");
  const rows = await ctx.db.document.findMany({
    where: { AND: [visibleWhere(ctx), { category: { not: null } }] },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
    take: 100,
  });
  return rows.map((row) => row.category!).filter(Boolean);
}

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
}

async function usedBytes(db: TenantDb): Promise<number> {
  const result = await db.document.aggregate({
    where: { deletedAt: null },
    _sum: { sizeBytes: true },
  });
  return result._sum.sizeBytes ?? 0;
}

export async function getStorageUsage(ctx: TenantContext): Promise<StorageUsage> {
  assertCan(ctx, "documents:read");
  return {
    usedBytes: await usedBytes(ctx.db),
    quotaBytes: env.CLUB_STORAGE_QUOTA_MB * 1024 * 1024,
  };
}

/** Veranstaltungen, zu denen der Benutzer Dokumente hochladen darf (Abteilungsleiter: nur die eigene Abteilung). */
export async function listUploadEvents(
  ctx: TenantContext,
): Promise<{ id: string; title: string; startsAt: Date }[]> {
  if (!can(ctx, "documents:upload")) return [];
  const dept = scopeOf(ctx, "documents:upload") === "DEPARTMENT" ? [...ctx.ledDepartmentIds] : null;
  return ctx.db.event.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PUBLISHED", "COMPLETED", "DRAFT"] },
      ...(dept ? { departmentId: { in: dept } } : {}),
    },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    select: { id: true, title: true, startsAt: true },
    take: 200,
  });
}

function assertAccessAllowed(ctx: TenantContext, access: DocumentAccess): void {
  if (!allowedAccessLevels(ctx).includes(access))
    throw validationFailed({ access: ["Diese Zugriffsstufe darfst du nicht vergeben."] });
}

// ---------------------------------------------------------------------------------------------
// Hochladen
// ---------------------------------------------------------------------------------------------

export interface UploadInput {
  fileName: string;
  bytes: Uint8Array;
  access: DocumentAccess;
  category?: string | undefined;
  eventId?: string | undefined;
  /** Rechnung: offen (mit Betrag, optional Fälligkeit als „JJJJ-MM-TT“) oder schon bezahlt. */
  invoice?: {
    status: InvoiceStatus;
    amountCents: number | null;
    dueDate?: string | undefined;
  } | null;
}

export async function uploadDocument(
  ctx: TenantContext,
  input: UploadInput,
): Promise<{ id: string }> {
  assertCan(ctx, "documents:upload");
  // Rechnungen erfasst nur, wer die Finanzen verwaltet – geprüft vor allem anderen, auch vor dem Speichern der Datei.
  if (input.invoice) assertCan(ctx, "finance:manage");
  await enforceRateLimit(`document-upload:${ctx.userId}`, 30, 3600);

  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (input.bytes.length > maxBytes)
    throw validationFailed({
      file: [`Die Datei ist zu groß (höchstens ${env.MAX_UPLOAD_MB} MB).`],
    });
  const check = checkUpload(input.fileName, input.bytes);
  if (!check.ok) throw validationFailed({ file: [check.reason] });
  assertAccessAllowed(ctx, input.access);

  const event = input.eventId
    ? await ctx.db.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
        select: { id: true, departmentId: true },
      })
    : null;
  if (input.eventId && !event)
    throw validationFailed({ eventId: ["Diese Veranstaltung ist nicht verfügbar."] });
  if (scopeOf(ctx, "documents:upload") === "DEPARTMENT") {
    if (!event || !event.departmentId || !ctx.ledDepartmentIds.includes(event.departmentId)) {
      throw validationFailed({
        eventId: [
          "Als Abteilungsleiter lädst du Dokumente zu einer Veranstaltung deiner Abteilung hoch. Bitte wähle eine aus.",
        ],
      });
    }
  }

  const quota = env.CLUB_STORAGE_QUOTA_MB * 1024 * 1024;
  if ((await usedBytes(ctx.db)) + input.bytes.length > quota)
    throw validationFailed({
      file: [
        "Der Speicherplatz deines Vereins ist ausgeschöpft. Bitte lösche nicht mehr benötigte Dokumente.",
      ],
    });

  const scan = await scanUpload(input.bytes, { name: check.safeName, mime: check.type.mime });
  if (!scan.clean)
    throw validationFailed({
      file: [scan.reason ?? "Die Datei wurde aus Sicherheitsgründen abgelehnt."],
    });

  const invoice = input.invoice ?? null;
  const invoiceDate = todayCalendarDate();
  if (invoice?.status === "OPEN" && !invoice.amountCents)
    throw validationFailed({ amount: ["Bitte gib den Betrag ein."] });

  const stored = await saveFile(ctx.clubId, input.bytes);
  try {
    return await ctx.db.$transaction(async (tx) => {
      // Rechnungen heißen nach dem Tag; gezählt wird über alle nicht gelöschten Dokumente, gleich wer sie sehen darf.
      let name = check.safeName;
      if (invoice) {
        const base = invoiceBaseName(invoiceDate);
        const taken = await tx.document.findMany({
          where: { deletedAt: null, name: { startsWith: base } },
          select: { name: true },
        });
        name = nextInvoiceName(
          base,
          check.type.ext,
          taken.map((entry) => entry.name),
        );
      }
      const document = await tx.document.create({
        data: {
          clubId: ctx.clubId,
          name,
          storageKey: stored.storageKey,
          mimeType: check.type.mime, // aus der Positivliste, nicht vom Browser
          sizeBytes: input.bytes.length,
          sha256: stored.sha256,
          category: input.category ?? null,
          access: input.access,
          eventId: event?.id ?? null,
          uploadedById: ctx.userId,
        },
      });
      await recordAudit(tx, auditActor(ctx), {
        action: "document.uploaded",
        entityType: "Document",
        entityId: document.id,
        summary: `Dokument „${document.name}“ hochgeladen`,
      });
      if (invoice) {
        const created = await tx.invoice.create({
          data: {
            clubId: ctx.clubId,
            documentId: document.id,
            invoiceDate,
            amountCents: invoice.amountCents,
            dueDate: invoice.dueDate ? parseCalendarDate(invoice.dueDate) : null,
            status: invoice.status,
            createdById: ctx.userId,
          },
        });
        await recordAudit(tx, auditActor(ctx), {
          action: "finance.invoice_created",
          entityType: "Invoice",
          entityId: created.id,
          summary:
            invoice.status === "OPEN" && invoice.amountCents
              ? `Rechnung „${document.name}“ erfasst – offen: ${formatEuroFromCents(invoice.amountCents)}`
              : `Rechnung „${document.name}“ erfasst (bereits bezahlt)`,
        });
      }
      return { id: document.id };
    });
  } catch (error) {
    await deleteFile(ctx.clubId, stored.storageKey).catch(() => undefined); // keine Karteileichen im Speicher
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Herunterladen, ändern, löschen
// ---------------------------------------------------------------------------------------------

async function loadVisible(ctx: TenantContext, id: string) {
  assertCan(ctx, "documents:read");
  const row = await ctx.db.document.findFirst({
    where: { AND: [{ id }, visibleWhere(ctx)] },
    include,
  });
  if (!row) throw notFound("Das Dokument");
  return row;
}

export async function openDocument(
  ctx: TenantContext,
  id: string,
): Promise<{ document: DocumentDto; stream: ReadableStream<Uint8Array>; size: number }> {
  const row = await loadVisible(ctx, id);
  let file: Awaited<ReturnType<typeof openFile>>;
  try {
    file = await openFile(ctx.clubId, row.storageKey);
  } catch {
    // Datensatz ohne Datei (z. B. Datenbank ohne Dateiablage wiederhergestellt): nicht als Serverfehler melden.
    throw notFound("Die Datei");
  }
  return { document: (await toDtos(ctx, [row]))[0]!, ...file };
}

export async function updateDocument(
  ctx: TenantContext,
  id: string,
  input: DocumentInput,
): Promise<void> {
  const row = await loadVisible(ctx, id);
  if (!canManageDocument(ctx, row)) throw forbidden();
  assertAccessAllowed(ctx, input.access);
  // Rechnungsangaben ändert nur, wer die Finanzen verwaltet – und nur an einer Rechnung.
  if (input.invoice) {
    assertCan(ctx, "finance:manage");
    if (!row.invoice) throw badRequest("Dieses Dokument ist keine Rechnung.");
  }
  // Die Endung bestimmt den Typ – umbenennen darf sie nicht ändern (sonst passen Name und Inhalt nicht mehr zusammen).
  const ext = extensionOf(row.name);
  let name = sanitizeFileName(input.name);
  if (ext && extensionOf(name) !== ext) name = `${name}.${ext}`;

  await ctx.db.$transaction(async (tx) => {
    await tx.document.update({
      where: { id },
      data: { name, category: input.category ?? null, access: input.access },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "document.updated",
      entityType: "Document",
      entityId: id,
      summary: `Dokument „${row.name}“ geändert`,
      changes: {
        ...(row.name !== name ? { name: { from: row.name, to: name } } : {}),
        ...(row.access !== input.access ? { access: { from: row.access, to: input.access } } : {}),
        ...((row.category ?? null) !== (input.category ?? null)
          ? { category: { from: row.category, to: input.category ?? null } }
          : {}),
      },
    });
    if (input.invoice && row.invoice) {
      const before = row.invoice;
      const after = {
        status: input.invoice.status,
        amountCents: input.invoice.amount ? parseEuroToCents(input.invoice.amount) : null,
      };
      const dueDate = input.invoice.dueDate ? parseCalendarDate(input.invoice.dueDate) : null;
      const paid = after.status === "PAID";
      await tx.invoice.update({
        where: { id: before.id },
        data: {
          amountCents: after.amountCents,
          dueDate,
          status: after.status,
          // Bezahlt-Vermerk: beim Wechsel auf „bezahlt“ jetzt und von mir; zurück auf „offen“ wieder leer.
          ...(paid && before.status !== "PAID" ? { paidAt: new Date(), paidById: ctx.userId } : {}),
          ...(!paid ? { paidAt: null, paidById: null } : {}),
        },
      });
      const euro = (cents: number | null) => (cents === null ? null : formatEuroFromCents(cents));
      const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
      await recordAudit(tx, auditActor(ctx), {
        action: "finance.invoice_updated",
        entityType: "Invoice",
        entityId: before.id,
        summary: `Rechnung „${name}“ geändert`,
        changes: {
          ...(before.amountCents !== after.amountCents
            ? { betrag: { from: euro(before.amountCents), to: euro(after.amountCents) } }
            : {}),
          ...(day(before.dueDate) !== day(dueDate)
            ? { faellig: { from: day(before.dueDate), to: day(dueDate) } }
            : {}),
          ...(before.status !== after.status
            ? {
                zahlungsstand: {
                  from: before.status === "PAID" ? "bezahlt" : "offen",
                  to: after.status === "PAID" ? "bezahlt" : "offen",
                },
              }
            : {}),
        },
      });
    }
  });
}

export async function deleteDocument(ctx: TenantContext, id: string): Promise<void> {
  const row = await loadVisible(ctx, id);
  if (!canManageDocument(ctx, row)) throw forbidden();
  await ctx.db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "document.deleted",
      entityType: "Document",
      entityId: id,
      summary: `Dokument „${row.name}“ gelöscht`,
    });
  });
}
