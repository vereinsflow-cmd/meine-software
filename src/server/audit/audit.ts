import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import type { TenantDb, TenantTx } from "@/server/db/tenant";

/**
 * Audit-Log: unveränderliches Protokoll wichtiger Änderungen (die Datenbank verhindert
 * UPDATE und DELETE, siehe Migration "integrity_guards").
 *
 * Grundsätze der Datensparsamkeit:
 *   - Keine Geheimnisse (Passwörter, Tokens, Hashes) – sie werden vor dem Speichern maskiert.
 *   - Für besonders schutzbedürftige Felder (z. B. Kontaktdaten, Notizen) wird nur vermerkt,
 *     DASS sich etwas geändert hat, nicht der alte und neue Wert.
 */
export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  changes?: Record<string, unknown> | null;
}

export interface AuditActor {
  clubId: string;
  userId: string;
  ipPrefix?: string | null;
  requestId?: string | null;
}

const SECRET_KEY = /(password|passwort|token|secret|hash|cookie)/i;

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item)) as Prisma.InputJsonValue;
  if (typeof value === "object") {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SECRET_KEY.test(key) ? "[maskiert]" : toJsonValue(inner);
    }
    return result as Prisma.InputJsonValue;
  }
  if (typeof value === "bigint") return value.toString();
  return value as Prisma.InputJsonValue;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return JSON.stringify(toJsonValue(a)) === JSON.stringify(toJsonValue(b));
}

export interface DiffOptions {
  /** Nur diese Felder vergleichen (Standard: alle Felder von `after`). */
  fields?: readonly string[];
  /** Felder, bei denen nur "geändert" ohne Werte protokolliert wird. */
  masked?: readonly string[];
}

/**
 * Vergleicht zwei Zustände und liefert die Änderungen als `{ feld: { from, to } }`.
 * Gibt `null` zurück, wenn sich nichts geändert hat.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options: DiffOptions = {},
): Record<string, unknown> | null {
  const fields = options.fields ?? Object.keys(after);
  const masked = new Set(options.masked ?? []);
  const changes: Record<string, unknown> = {};

  for (const field of fields) {
    if (!(field in after)) continue;
    if (sameValue(before[field], after[field])) continue;
    // Geheimnisse (Passwörter, Tokens, Hashes) werden grundsätzlich nie im Klartext protokolliert.
    changes[field] =
      masked.has(field) || SECRET_KEY.test(field)
        ? { changed: true }
        : { from: toJsonValue(before[field]), to: toJsonValue(after[field]) };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/** Schreibt einen Audit-Eintrag innerhalb des Vereins (gern innerhalb derselben Transaktion wie die Änderung). */
export async function recordAudit(
  db: Pick<TenantDb | TenantTx, "auditLog">,
  actor: AuditActor,
  entry: AuditEntry,
): Promise<void> {
  await db.auditLog.create({
    data: {
      clubId: actor.clubId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      changes: entry.changes ? (toJsonValue(entry.changes) ?? undefined) : undefined,
      ipPrefix: actor.ipPrefix ?? null,
      requestId: actor.requestId ?? null,
    },
  });
}

/** Audit-Eintrag außerhalb eines Vereinskontexts (Anmeldung, Plattformverwaltung, Jobs). */
export async function recordSystemAudit(
  entry: AuditEntry & {
    clubId?: string | null;
    actorUserId?: string | null;
    actorType?: "USER" | "SYSTEM";
    ipPrefix?: string | null;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      clubId: entry.clubId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorType: entry.actorType ?? (entry.actorUserId ? "USER" : "SYSTEM"),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      changes: entry.changes ? (toJsonValue(entry.changes) ?? undefined) : undefined,
      ipPrefix: entry.ipPrefix ?? null,
    },
  });
}
