import type { ConsentType } from "@/generated/prisma/enums";
import { SELF_SERVICE_CONSENTS, type SelfServiceConsent } from "@/lib/privacy";
import { recordAudit } from "@/server/audit/audit";
import { badRequest } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";

/**
 * Einwilligungen der Mitglieder selbst (Selbstbedienung).
 *
 * Wählbar sind nur freiwillige Einwilligungen (Newsletter, Fotos). Die Kenntnisnahme der Datenschutzerklärung und die
 * Einwilligung in die Verarbeitung der Vereinsdaten gehören zur Mitgliedschaft und werden vom Verein erfasst
 * (`recordConsent`, z. B. schriftlich); ihr "Widerruf" wäre die Beendigung der Mitgliedschaft bzw. ein Löschantrag.
 *
 * Jede Änderung ist ein NEUER Eintrag (Nachweis: wann was erteilt oder widerrufen wurde) samt Protokolleintrag.
 * Der Zugriff ist auf das eigene Mitglied beschränkt – die Mitglieds-ID kommt aus dem Kontext, nie aus der Eingabe.
 */
export { SELF_SERVICE_CONSENTS, type SelfServiceConsent };

export interface OwnConsent {
  type: ConsentType;
  /** `null` = noch nie erfasst. */
  granted: boolean | null;
  recordedAt: Date | null;
  source: string | null;
  /** Kann das Mitglied das selbst ändern? */
  selfService: boolean;
}

const ORDER: ConsentType[] = [
  "PRIVACY_POLICY",
  "DATA_PROCESSING",
  "NEWSLETTER",
  "PHOTO_PUBLICATION",
];

/** Aktueller Stand je Art (jüngster Eintrag gilt). `null`, wenn das Konto mit keinem Mitgliedsdatensatz verknüpft ist. */
export async function getOwnConsents(ctx: TenantContext): Promise<OwnConsent[] | null> {
  if (!ctx.memberId) return null;
  const rows = await ctx.db.consent.findMany({
    where: { memberId: ctx.memberId },
    orderBy: { recordedAt: "desc" },
  });
  return ORDER.map((type) => {
    const latest = rows.find((row) => row.type === type);
    return {
      type,
      granted: latest ? latest.granted : null,
      recordedAt: latest?.recordedAt ?? null,
      source: latest?.source ?? null,
      selfService: (SELF_SERVICE_CONSENTS as readonly ConsentType[]).includes(type),
    };
  });
}

export async function setOwnConsent(
  ctx: TenantContext,
  input: { type: ConsentType; granted: boolean },
): Promise<void> {
  if (!ctx.memberId) throw badRequest("Dein Konto ist mit keinem Mitgliedsdatensatz verknüpft.");
  if (!(SELF_SERVICE_CONSENTS as readonly ConsentType[]).includes(input.type)) {
    throw badRequest(
      "Diese Einwilligung kann nur der Verein erfassen. Wende dich bei Fragen an den Vorstand.",
    );
  }
  const memberId = ctx.memberId;

  await ctx.db.$transaction(async (tx) => {
    const latest = await tx.consent.findFirst({
      where: { memberId, type: input.type },
      orderBy: { recordedAt: "desc" },
      select: { granted: true },
    });
    if (latest?.granted === input.granted) return; // Nichts zu tun (auch bei doppeltem Klick)
    if (!latest && !input.granted) return; // Widerruf ohne bestehende Einwilligung: nichts festzuhalten

    await tx.consent.create({
      data: {
        clubId: ctx.clubId,
        memberId,
        type: input.type,
        granted: input.granted,
        source: "app",
        recordedBy: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.consent_changed",
      entityType: "Member",
      entityId: memberId,
      summary: `Einwilligung ${input.type} ${input.granted ? "erteilt" : "widerrufen"} (durch das Mitglied selbst)`,
      changes: { [input.type]: { to: input.granted } },
    });
  });
}
