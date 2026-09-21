import { readRetention } from "@/lib/club-settings";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import { assertCan } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { ClubSettingsInput } from "./schemas";

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
}

export async function getClubSettings(ctx: TenantContext): Promise<ClubSettings> {
  assertCan(ctx, "club:update");
  const club = await ctx.db.club.findFirstOrThrow({});
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
