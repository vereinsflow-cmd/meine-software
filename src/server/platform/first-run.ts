import "server-only";
import { todayCalendarDate } from "@/lib/dates";
import { TERMS_VERSION } from "@/lib/legal";
import { getPasswordIssues } from "@/lib/password-policy";
import { recordSystemAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { normalizeEmail, type ClientMeta } from "@/server/auth/service";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { conflict, notFound, validationFailed } from "@/server/errors";
import { provisionClubIn } from "./provision";

/*
 * Ersteinrichtung der leeren Version („VereinsFlow leer starten“): Wer VereinsFlow zum ersten Mal öffnet, legt seinen
 * Verein und das erste Administrator-Konto selbst an – ohne Plattformverwaltung und ohne Einladung. Das geht nur, wenn
 * FIRST_RUN_SETUP gesetzt ist (in Produktion verboten, siehe env.ts) UND es noch kein einziges Konto gibt. Danach ist
 * die Seite für immer zu; weitere Personen kommen über Einladungen dazu.
 */

export async function isFirstRunOpen(): Promise<boolean> {
  if (!env.FIRST_RUN_SETUP) return false;
  return (await prisma.user.count()) === 0;
}

/** Kürzel aus dem Vereinsnamen: „TSV Grün-Weiß Müllheim“ → „tsv-gruen-weiss-muellheim“. */
export function clubSlugFrom(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
  return slug.length >= 3 ? slug : "mein-verein";
}

export interface FirstRunData {
  clubName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export async function completeFirstRun(
  input: FirstRunData,
  meta: ClientMeta,
): Promise<{ userId: string; clubId: string }> {
  if (!env.FIRST_RUN_SETUP) throw notFound("Die Ersteinrichtung");

  const email = normalizeEmail(input.email);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const clubName = input.clubName.trim();
  const issues = getPasswordIssues(input.password, { email, firstName, lastName });
  if (issues.length > 0) throw validationFailed({ password: issues });

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Zwei gleichzeitige Absendungen: Die zweite wartet hier und findet danach das erste Konto vor.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vereinsflow:first-run'))`;
    if ((await tx.user.count()) > 0) {
      throw conflict("VereinsFlow ist bereits eingerichtet. Bitte melde dich an.");
    }

    const { club, roleIds } = await provisionClubIn(tx, {
      name: clubName,
      slug: clubSlugFrom(clubName),
      contactEmail: email,
    });
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        // Kein Bestätigungslink nötig: Die Person richtet ihre eigene Installation ein.
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
      },
    });
    await tx.clubMembership.create({
      data: { clubId: club.id, userId: user.id, roleId: roleIds.CLUB_ADMIN! },
    });
    const member = await tx.member.create({
      data: {
        clubId: club.id,
        userId: user.id,
        firstName,
        lastName,
        email,
        status: "ACTIVE",
        joinedAt: todayCalendarDate(),
      },
      select: { id: true },
    });
    await tx.consent.create({
      data: {
        clubId: club.id,
        memberId: member.id,
        type: "PRIVACY_POLICY",
        granted: true,
        textVersion: TERMS_VERSION,
        source: "app",
        recordedBy: user.id,
      },
    });
    return { userId: user.id, clubId: club.id };
  });

  await recordSystemAudit({
    clubId: result.clubId,
    actorUserId: result.userId,
    action: "platform.first_run",
    entityType: "Club",
    entityId: result.clubId,
    summary: `Verein ${clubName} angelegt; erster Administrator ${firstName} ${lastName}`,
    ipPrefix: meta.ipPrefix,
  });
  return result;
}
