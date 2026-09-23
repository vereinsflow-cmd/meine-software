import { Prisma } from "@/generated/prisma/client";
import { readRetention } from "@/lib/club-settings";
import { CLUB_LOGO_TYPES, checkClubLogo, clubLogoUrl, clubLogoVersion } from "@/lib/club-logo";
import { formatBytes } from "@/lib/uploads";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import { conflict, notFound, validationFailed } from "@/server/errors";
import { assertCan } from "@/server/permissions/policy";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { deleteFile, openFile, saveFile } from "@/server/storage/files";
import { scanUpload } from "@/server/storage/scan";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { ClubSettingsInput } from "./schemas";

export interface ClubLogoInfo {
  /** Adresse mit Version (`/api/vereine/<id>/logo?v=…`). */
  url: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: Date;
}

export interface ClubSettings {
  name: string;
  slug: string;
  contactEmail: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  website: string | null;
  privacyContact: string | null;
  retention: { leftMembersMonths: number; trashDays: number; auditMonths: number };
  logo: ClubLogoInfo | null;
}

export async function getClubSettings(ctx: TenantContext): Promise<ClubSettings> {
  assertCan(ctx, "club:update");
  const club = await ctx.db.club.findFirstOrThrow({});
  const logoUrl = clubLogoUrl(ctx.clubId, club.logoSha256);
  return {
    name: club.name,
    slug: club.slug,
    contactEmail: club.contactEmail,
    phone: club.phone,
    street: club.street,
    postalCode: club.postalCode,
    city: club.city,
    website: club.website,
    privacyContact: club.privacyContact,
    retention: readRetention(club.settings),
    logo:
      logoUrl && club.logoMimeType && club.logoSizeBytes !== null && club.logoUpdatedAt
        ? {
            url: logoUrl,
            mimeType: club.logoMimeType,
            sizeBytes: club.logoSizeBytes,
            updatedAt: club.logoUpdatedAt,
          }
        : null,
  };
}

export interface ClubPrivacyInfo {
  name: string;
  /** Anschrift des Vereins als eine Zeile, falls hinterlegt. */
  address: string | null;
  contactEmail: string | null;
  privacyContact: string | null;
  retention: { leftMembersMonths: number; trashDays: number; auditMonths: number };
}

/**
 * Angaben zum Verantwortlichen für die Datenschutzseite – für ALLE Mitglieder lesbar (Transparenzpflicht,
 * Art. 13 DSGVO). Enthält bewusst nichts außer öffentlichen Kontaktangaben und den Aufbewahrungsfristen.
 */
export async function getClubPrivacyInfo(ctx: TenantContext): Promise<ClubPrivacyInfo> {
  assertCan(ctx, "club:read");
  const club = await ctx.db.club.findFirstOrThrow({});
  const address = [club.street, [club.postalCode, club.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return {
    name: club.name,
    address: address || null,
    contactEmail: club.contactEmail,
    privacyContact: club.privacyContact,
    retention: readRetention(club.settings),
  };
}

export async function updateClubSettings(
  ctx: TenantContext,
  input: ClubSettingsInput,
): Promise<void> {
  assertCan(ctx, "club:update");
  const before = await ctx.db.club.findFirstOrThrow({});
  const retention = {
    leftMembersMonths: input.leftMembersMonths,
    trashDays: input.trashDays,
    auditMonths: input.auditMonths,
  };

  const fields = {
    name: input.name,
    contactEmail: input.contactEmail ?? null,
    phone: input.phone ?? null,
    street: input.street ?? null,
    postalCode: input.postalCode ?? null,
    city: input.city ?? null,
    website: input.website ?? null,
    privacyContact: input.privacyContact ?? null,
  };
  const previousSettings = (before.settings as Record<string, unknown> | null) ?? {};

  await ctx.db.$transaction(async (tx) => {
    await tx.club.update({
      where: { id: ctx.clubId },
      data: { ...fields, settings: { ...previousSettings, retention } },
    });
    const changes = {
      ...(diffChanges(before, fields, { masked: ["phone", "street", "postalCode", "city"] }) ?? {}),
      ...(diffChanges({ ...readRetention(before.settings) }, retention) ?? {}),
    };
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, auditActor(ctx), {
        action: "club.updated",
        entityType: "Club",
        entityId: ctx.clubId,
        summary: "Vereinseinstellungen geändert",
        changes,
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Vereinslogo
// ---------------------------------------------------------------------------------------------

/*
 * Das Logo ist Vereinsdaten (keine personenbezogenen Daten) und für alle Mitglieder sichtbar. Ändern darf es nur, wer
 * den Verein verwaltet (`club:update`), ansehen jeder mit `club:read`. Die Angaben stehen in eigenen Spalten am Verein –
 * nicht in `settings` (dort wird gelesen, ergänzt und zurückgeschrieben; gleichzeitige Änderungen könnten das Logo
 * verlieren) und nicht als Dokument (es gehörte sonst zur Dokumentenliste, zum Papierkorb und zum Speicherkontingent).
 *
 * Reihenfolge beim Speichern wie bei Dokumenten: prüfen → Scanner → Datei schreiben → Datenbank (mit Audit) → erst nach
 * dem Abschluss die alte Datei löschen. Scheitert die Datenbank, wird die neue Datei wieder entfernt.
 */

const LOGO_FIELDS_EMPTY = {
  logoStorageKey: null,
  logoMimeType: null,
  logoSizeBytes: null,
  logoSha256: null,
  logoUpdatedAt: null,
} as const;

const logoLabel = (mimeType: string | null, sizeBytes: number | null) => {
  const type = CLUB_LOGO_TYPES.find((entry) => entry.mime === mimeType);
  return type && sizeBytes !== null ? `${type.label}, ${formatBytes(sizeBytes)}` : null;
};

const isLostRace = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";

const LOST_RACE_MESSAGE =
  "Das Logo wurde gerade von jemand anderem geändert. Bitte lade die Seite neu und versuche es erneut.";

export interface ClubLogoUpload {
  fileName: string;
  bytes: Uint8Array;
}

/** Lädt ein Logo hoch oder ersetzt das bisherige. Gibt die neue Bildadresse zurück. */
export async function updateClubLogo(
  ctx: TenantContext,
  input: ClubLogoUpload,
): Promise<{ logoUrl: string }> {
  assertCan(ctx, "club:update");
  await enforceRateLimit(`club-logo:${ctx.userId}`, 20, 3600);

  const check = checkClubLogo(input.fileName, input.bytes);
  if (!check.ok) throw validationFailed({ file: [check.reason] });
  const scan = await scanUpload(input.bytes, {
    name: `vereinslogo.${check.type.ext}`,
    mime: check.type.mime,
  });
  if (!scan.clean)
    throw validationFailed({
      file: [scan.reason ?? "Die Datei wurde aus Sicherheitsgründen abgelehnt."],
    });

  const before = await ctx.db.club.findFirstOrThrow({
    select: { logoStorageKey: true, logoMimeType: true, logoSizeBytes: true },
  });
  const stored = await saveFile(ctx.clubId, input.bytes);
  const label = `${check.type.label}, ${formatBytes(input.bytes.length)}`;
  try {
    await ctx.db.$transaction(async (tx) => {
      // Nur ändern, wenn seit dem Lesen niemand anderes das Logo getauscht hat – sonst bliebe dessen Datei verwaist.
      // (Als AND-Filter, weil „noch kein Logo“ = NULL im Eindeutigkeits-Filter nicht ausdrückbar ist.)
      await tx.club.update({
        where: { id: ctx.clubId, AND: [{ logoStorageKey: before.logoStorageKey }] },
        data: {
          logoStorageKey: stored.storageKey,
          logoMimeType: check.type.mime, // aus der Positivliste, nicht vom Browser
          logoSizeBytes: input.bytes.length,
          logoSha256: stored.sha256,
          logoUpdatedAt: new Date(),
        },
      });
      await recordAudit(tx, auditActor(ctx), {
        action: "club.logo_updated",
        entityType: "Club",
        entityId: ctx.clubId,
        summary: before.logoStorageKey ? "Vereinslogo ersetzt" : "Vereinslogo hochgeladen",
        changes: {
          logo: { from: logoLabel(before.logoMimeType, before.logoSizeBytes), to: label },
        },
      });
    });
  } catch (error) {
    await deleteFile(ctx.clubId, stored.storageKey).catch(() => undefined); // keine Karteileichen im Speicher
    if (isLostRace(error)) throw conflict(LOST_RACE_MESSAGE);
    throw error;
  }

  if (before.logoStorageKey) {
    // Nach dem Abschluss: Schlägt das Löschen fehl, bleibt nur eine unbenutzte Datei zurück – das Logo stimmt trotzdem.
    await deleteFile(ctx.clubId, before.logoStorageKey).catch(() => undefined);
  }
  return { logoUrl: clubLogoUrl(ctx.clubId, stored.sha256)! };
}

/** Entfernt das Logo (die Oberfläche zeigt dann wieder die Anfangsbuchstaben). Ohne Logo passiert nichts. */
export async function removeClubLogo(ctx: TenantContext): Promise<void> {
  assertCan(ctx, "club:update");
  const before = await ctx.db.club.findFirstOrThrow({
    select: { logoStorageKey: true, logoMimeType: true, logoSizeBytes: true },
  });
  const previousKey = before.logoStorageKey;
  if (!previousKey) return;

  try {
    await ctx.db.$transaction(async (tx) => {
      await tx.club.update({
        where: { id: ctx.clubId, logoStorageKey: previousKey },
        data: LOGO_FIELDS_EMPTY,
      });
      await recordAudit(tx, auditActor(ctx), {
        action: "club.logo_removed",
        entityType: "Club",
        entityId: ctx.clubId,
        summary: "Vereinslogo entfernt",
        changes: { logo: { from: logoLabel(before.logoMimeType, before.logoSizeBytes), to: null } },
      });
    });
  } catch (error) {
    if (isLostRace(error)) throw conflict(LOST_RACE_MESSAGE);
    throw error;
  }
  // Sofort löschen (kein Papierkorb): Das Logo ist keine personenbezogene Angabe und lässt sich jederzeit neu hochladen.
  await deleteFile(ctx.clubId, previousKey).catch(() => undefined);
}

/**
 * Öffnet das Logo des Vereins im Kontext zum Ausliefern. Ohne Logo – oder wenn die Datei fehlt, etwa nach einer
 * Wiederherstellung ohne Dateiablage – „nicht gefunden“ statt Serverfehler.
 */
export async function openClubLogo(ctx: TenantContext): Promise<{
  stream: ReadableStream<Uint8Array>;
  size: number;
  mimeType: string;
  ext: string;
  version: string;
}> {
  assertCan(ctx, "club:read");
  const club = await ctx.db.club.findFirstOrThrow({
    select: { logoStorageKey: true, logoMimeType: true, logoSha256: true },
  });
  const type = CLUB_LOGO_TYPES.find((entry) => entry.mime === club.logoMimeType);
  if (!club.logoStorageKey || !club.logoSha256 || !type) throw notFound("Das Logo");
  let file: Awaited<ReturnType<typeof openFile>>;
  try {
    file = await openFile(ctx.clubId, club.logoStorageKey);
  } catch {
    throw notFound("Das Logo");
  }
  return { ...file, mimeType: type.mime, ext: type.ext, version: clubLogoVersion(club.logoSha256) };
}
