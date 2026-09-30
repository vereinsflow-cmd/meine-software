import { Prisma } from "@/generated/prisma/client";
import type { MembershipApplicationStatus } from "@/generated/prisma/enums";
import { parseCalendarDate, todayCalendarDate } from "@/lib/dates";
import {
  APPLICATION_CONSENT_VERSION,
  APPLICATION_DECIDED_RETENTION_DAYS,
  INVALID_JOIN_LINK_TEXT,
  joinLogoUrl,
  joinPath,
} from "@/lib/membership-application";
import { recordAudit } from "@/server/audit/audit";
import { issueInvitation } from "@/server/auth/invitations";
import { lockUntilCommit, type TenantDb, type TenantTx } from "@/server/db/tenant";
import { env } from "@/server/env";
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  isAppError,
  notFound,
  validationFailed,
} from "@/server/errors";
import { logUnexpectedError } from "@/server/log";
import { assertCan, scopeOf } from "@/server/permissions/policy";
import { enforceRateLimit, rateLimitIp } from "@/server/security/rate-limit";
import type { RequestMeta } from "@/server/security/request";
import { generateToken } from "@/server/security/tokens";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { resolveJoinToken } from "@/server/tenancy/join-token";
import { readClubLogoFile, type ClubLogoFile } from "@/modules/clubs/service";
import { suggestNextMemberNumber } from "@/modules/members/service";
import { notifyUsers } from "@/modules/notifications/service";
import { isHoneypotFilled, type ApplicationInput } from "./schemas";

/**
 * Mitglied werden per QR-Code – Geschäftslogik.
 *
 * Ablauf: Der Verein richtet einen öffentlichen Link ein (als QR-Code zum Aushängen). Wer ihn öffnet, stellt ohne Konto
 * einen Antrag. Der Vorstand nimmt an oder lehnt ab. ERST beim Annehmen entsteht das Mitglied und bekommt über den
 * vorhandenen Einladungsweg einen Link zum Konto – vorher gibt es keinen Zugang, denn Mitglieder sehen Chats, Termine und
 * Dokumente des Vereins.
 *
 * Grundsätze:
 *  - Link und Anträge verwaltet nur, wer Mitglieder für den GANZEN Verein anlegen darf (`members:create`, Reichweite
 *    Verein: Vereinsadministrator, Vorstand). Abteilungsleitungen nicht – ein Antrag gehört nicht sicher zu ihrer Abteilung.
 *  - Der Link ist kein Zugangsschlüssel: Er zeigt nur Vereinsname, Logo und Abteilungen und nimmt Anträge an. Deshalb
 *    steht er im Klartext am Verein und lässt sich für Nachdrucke wieder anzeigen; „Neuen Code erzeugen“ ersetzt ihn.
 *  - Das öffentliche Formular ist gegen Missbrauch begrenzt (Rate-Limits je Anschluss und je Verein, Honigtopf-Feld).
 *  - Angenommen wird genau einmal – auch wenn zwei Personen gleichzeitig klicken (atomarer Übergang „offen → angenommen“) –,
 *    und je E-Mail-Adresse entsteht nur ein Mitglied, auch wenn zwei Anträge derselben Person gleichzeitig angenommen werden.
 *  - Die Einwilligung im Formular gilt nur für die Bearbeitung des Antrags. Sie bleibt mit Zeitpunkt und Textfassung am
 *    Antrag (bis zu seiner Löschung) und wird beim Annehmen NICHT als „Einwilligung in die Datenverarbeitung“ ans Mitglied
 *    übertragen: Die Person hat keinem weiteren Zweck zugestimmt, die Mitgliedschaft selbst stützt sich auf den
 *    Mitgliedschaftsvertrag (Art. 6 Abs. 1 lit. b DSGVO). Die Kenntnisnahme der Datenschutzerklärung erfasst die Einladung,
 *    wenn die Person ihr Konto anlegt.
 */

const DAY = 86_400_000;

/** Grenzen des öffentlichen Formulars: je Anschluss (IPv4-Adresse bzw. IPv6-/64-Netz) und Stunde, je Verein und Tag. */
export const APPLICATION_RATE_LIMITS = {
  perIp: { limit: 5, windowSeconds: 3600 },
  perClub: { limit: 30, windowSeconds: 86_400 },
} as const;

export const DUPLICATE_MEMBER_TEXT =
  "Es gibt schon ein Mitglied mit dieser E-Mail-Adresse – bitte prüfe die Mitgliederliste.";
export const EXISTING_ACCOUNT_TEXT =
  "Diese Person hat schon einen Zugang zum Verein – bitte prüfe „Benutzer und Rollen“.";
export const OPEN_INVITATION_TEXT =
  "Für diese E-Mail-Adresse gibt es schon eine offene Einladung – bitte prüfe „Benutzer und Rollen“.";
const ALREADY_DECIDED_TEXT = "Über diesen Antrag wurde bereits entschieden.";
const UNKNOWN_DEPARTMENT_TEXT = "Bitte wähle eine Abteilung aus der Liste.";

// ---------------------------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------------------------

/** Darf der Benutzer den Beitrittslink verwalten und Anträge entscheiden? (für Knöpfe und Seiten) */
export const canManageApplications = (ctx: TenantContext): boolean =>
  scopeOf(ctx, "members:create") === "CLUB";

function assertCanManage(ctx: TenantContext): void {
  assertCan(ctx, "members:create");
  if (!canManageApplications(ctx)) throw forbidden();
}

// ---------------------------------------------------------------------------------------------
// Beitrittslink (QR-Code)
// ---------------------------------------------------------------------------------------------

export interface JoinLink {
  token: string;
  /** Pfad der öffentlichen Seite, z. B. „/beitreten/…“. */
  path: string;
  /** Vollständige Adresse für QR-Code und Aushang. */
  url: string;
  createdAt: Date;
}

const toJoinLink = (token: string, createdAt: Date): JoinLink => ({
  token,
  path: joinPath(token),
  url: `${env.APP_URL}${joinPath(token)}`,
  createdAt,
});

export async function getJoinLink(ctx: TenantContext): Promise<JoinLink | null> {
  assertCanManage(ctx);
  const club = await ctx.db.club.findFirstOrThrow({
    select: { joinToken: true, joinTokenCreatedAt: true },
  });
  return club.joinToken && club.joinTokenCreatedAt
    ? toJoinLink(club.joinToken, club.joinTokenCreatedAt)
    : null;
}

async function storeNewToken(
  ctx: TenantContext,
  action: "member.join_link_created" | "member.join_link_renewed",
  summary: string,
): Promise<JoinLink> {
  const token = generateToken(32);
  const createdAt = new Date();
  await ctx.db.$transaction(async (tx) => {
    await tx.club.update({
      where: { id: ctx.clubId },
      data: { joinToken: token, joinTokenCreatedAt: createdAt },
    });
    await recordAudit(tx, auditActor(ctx), {
      action,
      entityType: "Club",
      entityId: ctx.clubId,
      summary,
    });
  });
  return toJoinLink(token, createdAt);
}

/** Richtet den Beitrittslink ein. Gibt es schon einen, bleibt er (ein zweiter Klick macht keine Aushänge ungültig). */
export async function enableJoinLink(ctx: TenantContext): Promise<JoinLink> {
  const current = await getJoinLink(ctx);
  if (current) return current;
  return storeNewToken(ctx, "member.join_link_created", "QR-Code zum Beitritt eingerichtet");
}

/** Ersetzt den Link durch einen neuen – der alte QR-Code (und jeder gedruckte Aushang) funktioniert danach nicht mehr. */
export async function renewJoinLink(ctx: TenantContext): Promise<JoinLink> {
  assertCanManage(ctx);
  return storeNewToken(
    ctx,
    "member.join_link_renewed",
    "Neuer QR-Code zum Beitritt erzeugt (der alte gilt nicht mehr)",
  );
}

/** Schließt den Beitritt: Der Link gilt nicht mehr, neue Anträge sind nicht möglich. Offene Anträge bleiben erhalten. */
export async function closeJoinLink(ctx: TenantContext): Promise<void> {
  assertCanManage(ctx);
  await ctx.db.$transaction(async (tx) => {
    const club = await tx.club.findFirstOrThrow({ select: { joinToken: true } });
    if (!club.joinToken) return;
    await tx.club.update({
      where: { id: ctx.clubId },
      data: { joinToken: null, joinTokenCreatedAt: null },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.join_link_closed",
      entityType: "Club",
      entityId: ctx.clubId,
      summary: "Beitritt per QR-Code geschlossen",
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Öffentliche Seite (ohne Anmeldung)
// ---------------------------------------------------------------------------------------------

export interface JoinPage {
  clubName: string;
  logoUrl: string | null;
  /** Nur Kennung und Name der aktiven Abteilungen – mehr erfahren Fremde über den Verein nicht. */
  departments: { id: string; name: string }[];
}

/** Daten der öffentlichen Antragsseite. `null`, wenn der Link ungültig, erneuert oder geschlossen ist. */
export async function getJoinPage(token: string): Promise<JoinPage | null> {
  const join = await resolveJoinToken(token);
  if (!join) return null;
  const departments = await join.db.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return {
    clubName: join.club.name,
    logoUrl: joinLogoUrl(token, join.club.logoSha256),
    departments,
  };
}

/** Logo für die öffentliche Seite – nur mit gültigem Beitrittslink, sonst „nicht gefunden“. */
export async function openJoinLogo(token: string): Promise<ClubLogoFile> {
  const join = await resolveJoinToken(token);
  if (!join) throw notFound("Das Logo");
  return readClubLogoFile(join.db, join.clubId);
}

/** Wartezeit in Worten für die Meldung bei einer ausgeschöpften Grenze („in 12 Minuten“, „in 5 Stunden“). */
function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes <= 90) return minutes === 1 ? "in einer Minute" : `in ${minutes} Minuten`;
  return `in ${Math.ceil(minutes / 60)} Stunden`;
}

/**
 * Grenze des öffentlichen Formulars mit eigener Meldung. Der allgemeine Text („Bitte warte einen Moment …“) passt hier nicht:
 * Die Sperre dauert bis zu einer Stunde (Anschluss) bzw. einem Tag (Verein) – wer nach einem Moment erneut sendet, scheitert
 * wieder und gibt auf. Typisch ist z. B. eine Familie, die alle Anträge vom selben Handy stellt, oder das WLAN im Vereinsheim.
 */
async function enforceApplicationLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
  message: (wait: string) => string,
): Promise<void> {
  try {
    await enforceRateLimit(key, limit, windowSeconds);
  } catch (error) {
    if (!isAppError(error) || error.code !== "RATE_LIMITED") throw error;
    const retryAfterSeconds = error.retryAfterSeconds ?? windowSeconds;
    throw new AppError("RATE_LIMITED", message(waitText(retryAfterSeconds)), { retryAfterSeconds });
  }
}

/**
 * Nimmt einen Antrag über das öffentliche Formular an. Die Eingaben sind bereits mit `applicationFormSchema` geprüft.
 *
 * Reihenfolge mit Absicht: Link prüfen → Grenze je Anschluss → Honigtopf (ausgefüllt: Erfolg vortäuschen, nichts
 * speichern – der Roboter zählt aber gegen die Grenze) → Abteilung → Vereinsgrenze → speichern. Fehleingaben verbrauchen so
 * kein Kontingent des Vereins. Ohne bekannte IP (kein vertrauenswürdiger Proxy) gibt es nur die Vereinsgrenze.
 */
export async function submitApplication(
  input: ApplicationInput,
  meta: Pick<RequestMeta, "ip" | "ipPrefix">,
  now: Date = new Date(),
): Promise<void> {
  const join = await resolveJoinToken(input.token);
  if (!join) throw badRequest(INVALID_JOIN_LINK_TEXT);

  const { perIp, perClub } = APPLICATION_RATE_LIMITS;
  if (meta.ip !== "unknown")
    await enforceApplicationLimit(
      `join:ip:${rateLimitIp(meta.ip)}`,
      perIp,
      (wait) =>
        `Von diesem Anschluss sind gerade mehrere Anträge gekommen. Bitte versuche es ${wait} noch einmal.`,
    );
  if (isHoneypotFilled(input)) return;

  if (input.departmentId) {
    const department = await join.db.department.findFirst({
      where: { id: input.departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) throw validationFailed({ departmentId: [UNKNOWN_DEPARTMENT_TEXT] });
  }
  await enforceApplicationLimit(
    `join:club:${join.clubId}`,
    perClub,
    (wait) =>
      `Beim Verein sind heute schon sehr viele Anträge eingegangen. Bitte versuche es ${wait} noch einmal oder sprich den Verein direkt an.`,
  );

  // Wer Anträge entscheiden darf – dieselbe Regel wie `canManageApplications` (Recht mit Reichweite „ganzer Verein“).
  const approvers = await join.db.clubMembership.findMany({
    where: {
      status: "ACTIVE",
      user: { disabledAt: null, deletedAt: null },
      role: { permissions: { some: { permissionKey: "members:create", scope: "CLUB" } } },
    },
    select: { userId: true },
  });

  await join.db.$transaction(async (tx) => {
    const application = await tx.membershipApplication.create({
      data: {
        clubId: join.clubId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone ?? null,
        birthDate: input.birthDate ? parseCalendarDate(input.birthDate) : null,
        departmentId: input.departmentId ?? null,
        message: input.message ?? null,
        // Nachweis der Einwilligung: wann UND welchem Text (Fassung des Kästchens) zugestimmt wurde.
        consentAt: now,
        consentTextVersion: APPLICATION_CONSENT_VERSION,
        ipPrefix: meta.ipPrefix,
      },
      select: { id: true },
    });
    // Ohne angemeldete Person: Akteur „System“ mit gekürzter IP (wie andere öffentliche Vorgänge). Ohne Namen – abgelehnte
    // Anträge werden nach 30 Tagen gelöscht, das Protokoll bleibt länger.
    await tx.auditLog.create({
      data: {
        clubId: join.clubId,
        actorType: "SYSTEM",
        action: "member.application_received",
        entityType: "MembershipApplication",
        entityId: application.id,
        summary: "Beitrittsantrag über den QR-Code eingegangen",
        ipPrefix: meta.ipPrefix,
      },
    });
    // Ebenfalls ohne Namen: Benachrichtigungen und E-Mails bleiben länger erhalten als ein abgelehnter Antrag.
    await notifyUsers(tx, join.clubId, {
      userIds: approvers.map((approver) => approver.userId),
      type: "SYSTEM",
      title: "Neuer Beitrittsantrag",
      body: "Über den QR-Code möchte jemand Mitglied werden. Bitte prüfe den Antrag und nimm ihn an oder lehne ihn ab.",
      linkUrl: "/mitglieder/antraege",
      email: true,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Verwaltung: Anträge ansehen und entscheiden
// ---------------------------------------------------------------------------------------------

/** Warum „Annehmen“ bei einem offenen Antrag scheitern würde – die Karte zeigt es vorher an, statt erst nach dem Klick. */
export type ApplicationConflict =
  | { kind: "member"; memberId: string; memberName: string; archived: boolean }
  | { kind: "account" }
  | { kind: "invitation" };

export interface ApplicationDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthDate: Date | null;
  departmentName: string | null;
  /** Die gewünschte Abteilung ist inzwischen deaktiviert (beim Annehmen wird sie trotzdem zugeordnet – wie beim Anlegen). */
  departmentInactive: boolean;
  message: string | null;
  status: MembershipApplicationStatus;
  createdAt: Date;
  decidedAt: Date | null;
  decidedByName: string | null;
  /** Angelegtes Mitglied (nur bei angenommenen Anträgen). */
  memberId: string | null;
  /** Nur offene Anträge: Hindernis fürs Annehmen (Mitglied, Zugang oder Einladung mit derselben Adresse). */
  conflict: ApplicationConflict | null;
  /** Nur offene Anträge: weitere offene Anträge mit derselben E-Mail-Adresse (doppelt abgeschickt). */
  samePendingEmail: number;
  /** Nur angenommene Anträge: Das Mitglied hat noch kein Konto – die Einladung lässt sich erneut senden. */
  canResendInvitation: boolean;
  /** Nur angenommene Anträge ohne Konto: Gültigkeit der offenen Einladung, `null` = keine gültige (z. B. abgelaufen). */
  invitationExpiresAt: Date | null;
}

export interface ApplicationOverview {
  /** Offene Anträge, älteste zuerst (wer am längsten wartet, steht oben). */
  pending: ApplicationDto[];
  /** In den letzten 30 Tagen entschiedene, neueste Entscheidung zuerst. */
  decided: ApplicationDto[];
}

/** Offene, noch gültige Einladungen (dieselbe Bedingung wie in `issueInvitation`, dazu nicht abgelaufen). */
const openInvitationWhere = (now: Date) => ({
  acceptedAt: null,
  revokedAt: null,
  expiresAt: { gt: now },
});

/** Hindernisse fürs Annehmen je E-Mail-Adresse der offenen Anträge – dieselben Prüfungen wie `assertNotInClubYet`. */
async function findConflicts(
  ctx: TenantContext,
  emails: string[],
  now: Date,
): Promise<Map<string, ApplicationConflict>> {
  const result = new Map<string, ApplicationConflict>();
  if (emails.length === 0) return result;
  const [members, accounts, invitations] = await Promise.all([
    ctx.db.member.findMany({
      where: {
        deletedAt: null,
        OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
      },
      select: { id: true, firstName: true, lastName: true, email: true, archivedAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    ctx.db.clubMembership.findMany({
      where: { user: { email: { in: emails } } },
      select: { user: { select: { email: true } } },
    }),
    ctx.db.invitation.findMany({
      where: { email: { in: emails }, ...openInvitationWhere(now) },
      select: { email: true },
    }),
  ]);
  // Reihenfolge der Prüfung wie beim Annehmen; ein aktives Mitglied geht einem archivierten vor.
  for (const { email } of invitations) result.set(email, { kind: "invitation" });
  for (const { user } of accounts) result.set(user.email, { kind: "account" });
  const byArchive = [...members].sort((a, b) => Number(!!b.archivedAt) - Number(!!a.archivedAt));
  for (const member of byArchive) {
    result.set((member.email ?? "").toLowerCase(), {
      kind: "member",
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`,
      archived: member.archivedAt !== null,
    });
  }
  return result;
}

/** Stand der Einladung bei angenommenen Anträgen: Hat das Mitglied schon ein Konto, gilt die Einladung noch? */
async function findInvitationStates(
  ctx: TenantContext,
  memberIds: string[],
  now: Date,
): Promise<Map<string, { canResend: boolean; expiresAt: Date | null }>> {
  const result = new Map<string, { canResend: boolean; expiresAt: Date | null }>();
  if (memberIds.length === 0) return result;
  const [members, invitations] = await Promise.all([
    ctx.db.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, userId: true, email: true, archivedAt: true, deletedAt: true },
    }),
    ctx.db.invitation.findMany({
      where: { memberId: { in: memberIds }, ...openInvitationWhere(now) },
      select: { memberId: true, expiresAt: true },
    }),
  ]);
  const expiry = new Map(invitations.map((i) => [i.memberId, i.expiresAt]));
  for (const member of members) {
    const canResend =
      member.userId === null &&
      member.email !== null &&
      member.archivedAt === null &&
      member.deletedAt === null;
    result.set(member.id, {
      canResend,
      expiresAt: canResend ? (expiry.get(member.id) ?? null) : null,
    });
  }
  return result;
}

export async function listApplications(
  ctx: TenantContext,
  now: Date = new Date(),
): Promise<ApplicationOverview> {
  assertCanManage(ctx);
  const since = new Date(now.getTime() - APPLICATION_DECIDED_RETENTION_DAYS * DAY);
  const include = { department: { select: { name: true, isActive: true } } } as const;
  const [pending, decided] = await Promise.all([
    ctx.db.membershipApplication.findMany({
      where: { status: "PENDING" },
      include,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
    }),
    ctx.db.membershipApplication.findMany({
      where: { status: { not: "PENDING" }, decidedAt: { gte: since } },
      include,
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
  ]);

  const pendingEmails = [...new Set(pending.map((row) => row.email))];
  const acceptedMemberIds = decided.map((row) => row.memberId).filter((id) => id !== null);
  const deciderIds = [
    ...new Set(decided.map((row) => row.decidedById).filter((id) => id !== null)),
  ];
  const [conflicts, invitationStates, deciders] = await Promise.all([
    findConflicts(ctx, pendingEmails, now),
    findInvitationStates(ctx, acceptedMemberIds, now),
    deciderIds.length === 0
      ? []
      : ctx.db.clubMembership.findMany({
          where: { userId: { in: deciderIds } },
          select: { userId: true, user: { select: { firstName: true, lastName: true } } },
        }),
  ]);
  const deciderName = new Map(
    deciders.map((d) => [d.userId, `${d.user.firstName} ${d.user.lastName}`]),
  );
  const pendingPerEmail = new Map<string, number>();
  for (const row of pending)
    pendingPerEmail.set(row.email, (pendingPerEmail.get(row.email) ?? 0) + 1);

  const toDto = (row: (typeof pending)[number]): ApplicationDto => {
    const open = row.status === "PENDING";
    const invitation = row.memberId ? invitationStates.get(row.memberId) : undefined;
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      birthDate: row.birthDate,
      departmentName: row.department?.name ?? null,
      departmentInactive: row.department ? !row.department.isActive : false,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      decidedByName: row.decidedById ? (deciderName.get(row.decidedById) ?? null) : null,
      memberId: row.memberId,
      conflict: open ? (conflicts.get(row.email) ?? null) : null,
      samePendingEmail: open ? (pendingPerEmail.get(row.email) ?? 1) - 1 : 0,
      canResendInvitation: invitation?.canResend ?? false,
      invitationExpiresAt: invitation?.expiresAt ?? null,
    };
  };
  return { pending: pending.map(toDto), decided: decided.map(toDto) };
}

/** Anzahl offener Anträge für den Knopf in der Mitgliederliste – `null`, wenn der Benutzer sie nicht sehen darf. */
export async function countPendingApplications(ctx: TenantContext): Promise<number | null> {
  if (!canManageApplications(ctx)) return null;
  return ctx.db.membershipApplication.count({ where: { status: "PENDING" } });
}

/**
 * Ist die Person schon im Verein – als Mitglied (auch im Archiv), mit Zugang oder mit einer offenen Einladung? Dann würde
 * das Annehmen eine Dublette anlegen bzw. `issueInvitation` die vorhandene Einladung still zurückziehen (sie gilt je
 * Adresse nur einmal) – womöglich eine mit höherer Rolle, die die Vereinsadministration verschickt hat. Lieber anhalten.
 */
async function assertNotInClubYet(db: TenantDb | TenantTx, email: string): Promise<void> {
  const member = await db.member.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  if (member) throw validationFailed({ email: [DUPLICATE_MEMBER_TEXT] }, DUPLICATE_MEMBER_TEXT);
  const account = await db.clubMembership.findFirst({
    where: { user: { email: email.toLowerCase() } },
    select: { id: true },
  });
  if (account) throw conflict(EXISTING_ACCOUNT_TEXT);
  const invitation = await db.invitation.findFirst({
    where: { email: email.toLowerCase(), ...openInvitationWhere(new Date()) },
    select: { id: true },
  });
  if (invitation) throw conflict(OPEN_INVITATION_TEXT);
}

/** Eine Mitgliedsnummer kann zwischen Vorschlag und Speichern vergeben werden (gleichzeitiges Anlegen) – dann erneut. */
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Legt in EINER Transaktion das Mitglied an und markiert den Antrag als angenommen.
 *  1. Der Antrag wird zuerst beansprucht (`offen → angenommen`, bedingt auf „offen“): Klicken zwei Personen gleichzeitig
 *     auf denselben Antrag, wartet die zweite auf die erste und findet danach keinen offenen Antrag mehr.
 *  2. Dann eine Sperre je Verein und E-Mail-Adresse: Werden zwei Anträge DERSELBEN Person gleichzeitig angenommen (doppelt
 *     abgeschickt), sähe die zweite Transaktion das Mitglied der ersten sonst nicht – die Adresse ist bei Mitgliedern nicht
 *     eindeutig. So wartet sie und bekommt danach die Dubletten-Meldung.
 */
async function createMemberFromApplication(ctx: TenantContext, id: string): Promise<string> {
  const memberNumber = await suggestNextMemberNumber(ctx); // wie beim normalen Anlegen: M-0001, M-0002 …
  return ctx.db.$transaction(async (tx) => {
    const claimed = await tx.membershipApplication.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "ACCEPTED", decidedAt: new Date(), decidedById: ctx.userId },
    });
    if (claimed.count !== 1) throw conflict(ALREADY_DECIDED_TEXT);
    // Frisch aus der Transaktion: Die Abteilung kann seit dem Laden der Seite gelöscht worden sein (Feld dann leer).
    const application = await tx.membershipApplication.findFirstOrThrow({ where: { id } });
    await lockUntilCommit(tx, ctx.clubId, `member-email:${application.email}`);
    await assertNotInClubYet(tx, application.email);

    // Wie beim normalen Anlegen zählt nur, dass es die Abteilung gibt – auch eine inzwischen deaktivierte wird zugeordnet
    // (die Karte zeigt „nicht mehr aktiv“ vorher an), statt den Wunsch still fallen zu lassen.
    const department = application.departmentId
      ? await tx.department.findFirst({
          where: { id: application.departmentId },
          select: { id: true },
        })
      : null;

    const member = await tx.member.create({
      data: {
        clubId: ctx.clubId,
        memberNumber,
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
        birthDate: application.birthDate,
        status: "ACTIVE",
        joinedAt: todayCalendarDate(), // Eintritt: heute als Berliner Kalendertag
      },
      select: { id: true },
    });
    if (department) {
      await tx.memberDepartment.createMany({
        data: [{ clubId: ctx.clubId, memberId: member.id, departmentId: department.id }],
      });
    }
    // Bewusst KEIN Einwilligungs-Eintrag am Mitglied: Die Einwilligung im Formular galt nur der Bearbeitung des Antrags und
    // bleibt als Nachweis (Zeitpunkt, Textfassung) am Antrag, bis dieser gelöscht wird (siehe Kopfkommentar).
    await tx.membershipApplication.update({
      where: { id: application.id },
      data: { memberId: member.id },
    });

    const name = `${application.firstName} ${application.lastName}`;
    await recordAudit(tx, auditActor(ctx), {
      action: "member.created",
      entityType: "Member",
      entityId: member.id,
      summary: `Mitglied ${name} angelegt (Beitrittsantrag)`,
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.application_accepted",
      entityType: "MembershipApplication",
      entityId: application.id,
      summary: `Beitrittsantrag angenommen – ${name} ist jetzt Mitglied`,
    });
    return member.id;
  });
}

/** Höchstens drei Versuche, falls die vorgeschlagene Mitgliedsnummer inzwischen vergeben wurde. */
async function createMemberWithRetry(ctx: TenantContext, id: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await createMemberFromApplication(ctx, id);
    } catch (error) {
      if (attempt >= 3 || !isUniqueViolation(error)) throw error;
    }
  }
}

/** Die Rolle, mit der angenommene Anträge eingeladen werden: fest „Mitglied“ (die Systemrolle des Vereins). */
async function memberRole(ctx: TenantContext): Promise<{ id: string; name: string }> {
  const role = await ctx.db.role.findFirst({
    where: { key: "MEMBER", isSystem: true },
    select: { id: true, name: true },
  });
  if (!role)
    throw conflict(
      "Im Verein fehlt die Rolle „Mitglied“. Bitte wende dich an den Vereinsadministrator.",
    );
  return role;
}

/** Einladung über den vorhandenen Einladungsweg verschicken und protokollieren. */
async function inviteMember(
  ctx: TenantContext,
  role: { id: string; name: string },
  member: { id: string; email: string },
  summary: string,
): Promise<void> {
  const invitation = await issueInvitation({
    clubId: ctx.clubId,
    email: member.email,
    roleId: role.id,
    memberId: member.id,
    invitedByUserId: ctx.userId,
    inviterName: `${ctx.user.firstName} ${ctx.user.lastName}`,
  });
  await recordAudit(ctx.db, auditActor(ctx), {
    action: "invitation.created",
    entityType: "Invitation",
    entityId: invitation.id,
    summary,
    changes: { rolle: { to: role.name } },
  });
}

export interface AcceptResult {
  memberId: string;
  name: string;
  /** Konnte die Einladung verschickt werden? (Sonst ist das Mitglied trotzdem angelegt.) */
  invitationSent: boolean;
}

/**
 * Nimmt einen Antrag an: Mitglied anlegen (aktiv, Eintritt heute, Mitgliedsnummer wie beim normalen Anlegen, gewünschte
 * Abteilung), danach über den vorhandenen Einladungsweg eine Einladung mit der Rolle „Mitglied“ verschicken. Die Rolle ist
 * fest die niedrigste – wer über Beitritte entscheidet, vergibt damit keine Rechte, die über ein normales Mitglied
 * hinausgehen (auch der Vorstand, der sonst niemanden einladen darf). Dubletten prüft allein die Transaktion: Eine Prüfung
 * vorab gäbe dem Verlierer eines gleichzeitigen Doppelklicks „Es gibt schon ein Mitglied …“ statt „bereits entschieden“.
 */
export async function acceptApplication(ctx: TenantContext, id: string): Promise<AcceptResult> {
  assertCanManage(ctx);
  const application = await ctx.db.membershipApplication.findFirst({ where: { id } });
  if (!application) throw notFound("Der Antrag");
  if (application.status !== "PENDING") throw conflict(ALREADY_DECIDED_TEXT);
  const role = await memberRole(ctx);

  const memberId = await createMemberWithRetry(ctx, id);

  const name = `${application.firstName} ${application.lastName}`;
  let invitationSent = false;
  try {
    await inviteMember(
      ctx,
      role,
      { id: memberId, email: application.email },
      `Einladung als ${role.name} versendet (Beitrittsantrag)`,
    );
    invitationSent = true;
  } catch (error) {
    // Das Mitglied steht bereits; die Einladung lässt sich unter „Zuletzt entschieden“ erneut senden.
    if (!isAppError(error)) logUnexpectedError("application-invite", error);
  }
  return { memberId, name, invitationSent };
}

/**
 * Schickt die Einladung zu einem angenommenen Antrag noch einmal – etwa wenn sie beim Annehmen nicht verschickt werden
 * konnte oder nach 7 Tagen (`INVITATION_TTL_DAYS`) abgelaufen ist. Gleiche Regel wie
 * beim Annehmen (nur `members:create` für den ganzen Verein, Rolle fest „Mitglied“), damit der Vorstand ohne
 * `users:invite` nicht die Vereinsadministration bitten muss. Geht an die Adresse, die JETZT beim Mitglied steht (eine
 * korrigierte Adresse zählt). Eine vorhandene Einladung für dieses Mitglied wird ersetzt, eine fremde nie.
 */
export async function resendApplicationInvitation(
  ctx: TenantContext,
  id: string,
): Promise<{ email: string }> {
  assertCanManage(ctx);
  const application = await ctx.db.membershipApplication.findFirst({
    where: { id },
    select: { status: true, memberId: true },
  });
  if (!application) throw notFound("Der Antrag");
  if (application.status !== "ACCEPTED" || !application.memberId)
    throw conflict("Eine Einladung gibt es nur für angenommene Anträge.");
  const member = await ctx.db.member.findFirst({
    where: { id: application.memberId, deletedAt: null, archivedAt: null },
    select: { id: true, userId: true, email: true, firstName: true, lastName: true },
  });
  if (!member)
    throw conflict(
      "Das Mitglied ist inzwischen archiviert oder gelöscht – es wird nicht eingeladen.",
    );
  const name = `${member.firstName} ${member.lastName}`;
  if (member.userId)
    throw conflict(`${name} hat schon ein Konto – eine neue Einladung ist nicht nötig.`);
  if (!member.email)
    throw conflict(
      `Bei ${name} ist keine E-Mail-Adresse eingetragen. Trage sie beim Mitglied ein und versuche es dann erneut.`,
    );

  const role = await memberRole(ctx);
  const email = member.email.toLowerCase();
  // In JavaScript statt per `NOT` in der Abfrage verglichen: Bei einer Einladung ohne Mitglied (`memberId` leer) ergäbe
  // `NOT (memberId = … AND …)` in SQL „unbekannt“ – die fremde Einladung fiele durchs Raster.
  const open = await ctx.db.invitation.findMany({
    where: { email, ...openInvitationWhere(new Date()) },
    select: { memberId: true, roleId: true },
  });
  if (open.some((i) => i.memberId !== member.id || i.roleId !== role.id))
    throw conflict(OPEN_INVITATION_TEXT);

  await inviteMember(
    ctx,
    role,
    { id: member.id, email },
    `Einladung als ${role.name} erneut versendet (Beitrittsantrag)`,
  );
  return { email };
}

/** Lehnt einen offenen Antrag ab. Bewusst ohne E-Mail an die Person; der Antrag wird nach 30 Tagen gelöscht. */
export async function rejectApplication(ctx: TenantContext, id: string): Promise<void> {
  assertCanManage(ctx);
  await ctx.db.$transaction(async (tx) => {
    const claimed = await tx.membershipApplication.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: new Date(), decidedById: ctx.userId },
    });
    if (claimed.count !== 1) {
      const exists = await tx.membershipApplication.count({ where: { id } });
      throw exists > 0 ? conflict(ALREADY_DECIDED_TEXT) : notFound("Der Antrag");
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "member.application_rejected",
      entityType: "MembershipApplication",
      entityId: id,
      summary: "Beitrittsantrag abgelehnt",
    });
  });
}
