import "server-only";
import { getPasswordIssues } from "@/lib/password-policy";
import { TERMS_VERSION } from "@/lib/legal";
import { todayCalendarDate } from "@/lib/dates";
import { recordSystemAudit } from "@/server/audit/audit";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { conflict, forbidden, notFound, validationFailed } from "@/server/errors";
import { sendMailDeferred } from "@/server/mail";
import { invitationEmail } from "@/server/mail/templates";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword } from "./password";
import { normalizeEmail, type ClientMeta } from "./service";

/**
 * Einladungen. Liegen unter `src/server`, weil beim Annehmen ein Benutzerkonto (plattformweit)
 * angelegt wird. Jede Funktion arbeitet ausdrücklich mit der `clubId` der Einladung.
 */
export const INVITATION_TTL_DAYS = 7;

export interface IssueInvitationInput {
  clubId: string;
  email: string;
  roleId: string;
  /** Optional: vorhandener Mitgliedsdatensatz, der mit dem neuen Konto verknüpft wird. */
  memberId?: string | null;
  invitedByUserId: string | null;
  inviterName: string | null;
}

/**
 * Legt eine Einladung an und versendet den Link. Das Token wird bewusst NICHT zurückgegeben –
 * es existiert nur in der E-Mail und als Hash in der Datenbank.
 * Die Berechtigungsprüfung (`users:invite`, keine Rechteausweitung) erfolgt beim Aufrufer.
 */
export async function issueInvitation(
  input: IssueInvitationInput,
): Promise<{ id: string; email: string; expiresAt: Date }> {
  const email = normalizeEmail(input.email);

  const [club, role, existingMember] = await Promise.all([
    prisma.club.findUnique({
      where: { id: input.clubId },
      select: { id: true, name: true, status: true },
    }),
    prisma.role.findFirst({
      where: { id: input.roleId, clubId: input.clubId },
      select: { id: true, name: true },
    }),
    prisma.clubMembership.findFirst({
      where: { clubId: input.clubId, user: { email } },
      select: { id: true },
    }),
  ]);
  if (!club || club.status !== "ACTIVE") throw notFound("Der Verein");
  if (!role) throw notFound("Die Rolle");
  if (existingMember) throw conflict("Diese Person ist bereits Mitglied im Verein.");

  if (input.memberId) {
    const member = await prisma.member.findFirst({
      where: { id: input.memberId, clubId: input.clubId, userId: null, deletedAt: null },
      select: { id: true },
    });
    if (!member)
      throw conflict(
        "Der Mitgliedsdatensatz ist nicht vorhanden oder hat bereits ein Benutzerkonto.",
      );
  }

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.$transaction(async (tx) => {
    // Es gibt je Adresse nur eine offene Einladung; eine neue ersetzt die alte.
    await tx.invitation.updateMany({
      where: { clubId: input.clubId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.invitation.create({
      data: {
        clubId: input.clubId,
        email,
        roleId: input.roleId,
        memberId: input.memberId ?? null,
        tokenHash: hashToken(token),
        invitedByUserId: input.invitedByUserId,
        expiresAt,
      },
    });
  });

  await sendMailDeferred(
    invitationEmail({
      to: email,
      clubName: club.name,
      inviterName: input.inviterName,
      roleName: role.name,
      url: `${env.APP_URL}/einladung/${token}`,
      expiresAt,
    }),
  );
  return { id: invitation.id, email, expiresAt };
}

async function findValidInvitation(token: string) {
  if (!token) return null;
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      club: { select: { id: true, name: true, status: true } },
      role: { select: { id: true, name: true } },
    },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date() ||
    invitation.club.status !== "ACTIVE"
  ) {
    return null;
  }
  return invitation;
}

export interface InvitationPreview {
  clubName: string;
  roleName: string;
  email: string;
  expiresAt: Date;
  /** Gibt es für die Adresse bereits ein Konto? Dann muss sich die Person anmelden statt zu registrieren. */
  hasAccount: boolean;
}

/** Zeigt die Eckdaten einer Einladung. `null`, wenn sie ungültig, abgelaufen oder bereits verwendet ist. */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const invitation = await findValidInvitation(token);
  if (!invitation) return null;
  const hasAccount = (await prisma.user.count({ where: { email: invitation.email } })) > 0;
  return {
    clubName: invitation.club.name,
    roleName: invitation.role.name,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    hasAccount,
  };
}

const invalidInvitation = () => notFound("Die Einladung");

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Verknüpft (oder erstellt) den Mitgliedsdatensatz und legt die Vereinsmitgliedschaft an. */
async function joinClub(
  tx: Tx,
  invitation: NonNullable<Awaited<ReturnType<typeof findValidInvitation>>>,
  user: { id: string; email: string; firstName: string; lastName: string },
): Promise<void> {
  await tx.clubMembership.create({
    data: { clubId: invitation.clubId, userId: user.id, roleId: invitation.roleId },
  });

  if (invitation.memberId) {
    const linked = await tx.member.updateMany({
      where: { id: invitation.memberId, clubId: invitation.clubId, userId: null, deletedAt: null },
      data: { userId: user.id },
    });
    if (linked.count !== 1) {
      throw conflict(
        "Der verknüpfte Mitgliedsdatensatz ist nicht mehr verfügbar. Bitte wende dich an den Verein.",
      );
    }
  } else {
    await tx.member.create({
      data: {
        clubId: invitation.clubId,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: "ACTIVE",
        joinedAt: todayCalendarDate(),
      },
    });
  }

  const member = await tx.member.findFirstOrThrow({
    where: { clubId: invitation.clubId, userId: user.id },
    select: { id: true },
  });
  await tx.consent.create({
    data: {
      clubId: invitation.clubId,
      memberId: member.id,
      type: "PRIVACY_POLICY",
      granted: true,
      textVersion: TERMS_VERSION,
      source: "app",
      recordedBy: user.id,
    },
  });
}

export interface AcceptNewUserInput {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}

/** Nimmt eine Einladung an und legt dabei das neue Benutzerkonto an (die Person ist dadurch angemeldet-fähig). */
export async function acceptInvitationAsNewUser(
  input: AcceptNewUserInput,
  meta: ClientMeta,
): Promise<{ userId: string; clubId: string }> {
  if (meta.ip !== "unknown") await enforceRateLimit(`invite:ip:${meta.ip}`, 20, 60 * 60);

  const invitation = await findValidInvitation(input.token);
  if (!invitation) throw invalidInvitation();

  if ((await prisma.user.count({ where: { email: invitation.email } })) > 0) {
    throw conflict(
      "Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melde dich an, um die Einladung anzunehmen.",
    );
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const issues = getPasswordIssues(input.password, {
    email: invitation.email,
    firstName,
    lastName,
  });
  if (issues.length > 0) throw validationFailed({ password: issues });

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) throw invalidInvitation();

    const created = await tx.user.create({
      data: {
        email: invitation.email,
        passwordHash,
        firstName,
        lastName,
        // Die Einladung ging an diese Adresse – wer sie annimmt, hat sie damit bestätigt.
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
      },
    });
    await joinClub(tx, invitation, created);
    return created;
  });

  await recordSystemAudit({
    clubId: invitation.clubId,
    actorUserId: user.id,
    action: "invitation.accepted",
    entityType: "Invitation",
    entityId: invitation.id,
    summary: `${firstName} ${lastName} ist dem Verein beigetreten (${invitation.role.name})`,
    ipPrefix: meta.ipPrefix,
  });
  return { userId: user.id, clubId: invitation.clubId };
}

/**
 * Nimmt eine Einladung für ein BESTEHENDES Konto an. Der Benutzer muss dafür angemeldet sein und die
 * Einladung muss an seine Adresse gehen – ein Link allein darf nie eine Sitzung für ein vorhandenes
 * Konto erzeugen (sonst könnte jeder mit dem Link das Konto übernehmen).
 */
export async function acceptInvitationAsExistingUser(
  input: { token: string; userId: string },
  meta: ClientMeta,
): Promise<{ clubId: string }> {
  const invitation = await findValidInvitation(input.token);
  if (!invitation) throw invalidInvitation();

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.deletedAt || user.disabledAt) throw forbidden();
  if (normalizeEmail(user.email) !== invitation.email) {
    throw forbidden(
      "Diese Einladung gilt für eine andere E-Mail-Adresse. Bitte melde dich mit dem passenden Konto an.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalidInvitation();

    const existing = await tx.clubMembership.findUnique({
      where: { clubId_userId: { clubId: invitation.clubId, userId: user.id } },
    });
    if (existing) return; // Bereits Mitglied: Einladung ist verbraucht, sonst ändert sich nichts.
    await joinClub(tx, invitation, user);
  });

  await recordSystemAudit({
    clubId: invitation.clubId,
    actorUserId: user.id,
    action: "invitation.accepted",
    entityType: "Invitation",
    entityId: invitation.id,
    summary: `${user.firstName} ${user.lastName} hat die Einladung angenommen (${invitation.role.name})`,
    ipPrefix: meta.ipPrefix,
  });
  return { clubId: invitation.clubId };
}
