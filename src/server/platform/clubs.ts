import "server-only";
import type { SessionUser } from "@/server/auth/session-core";
import { recordSystemAudit } from "@/server/audit/audit";
import { issueInvitation } from "@/server/auth/invitations";
import { prisma } from "@/server/db/client";
import { conflict, forbidden, notFound, validationFailed } from "@/server/errors";
import { provisionClub } from "./provision";

/**
 * Plattformverwaltung (Superadministrator).
 *
 * Datenschutz: Der Superadministrator verwaltet Vereine, sieht aber KEINE Mitgliederdaten. Alle Auswertungen
 * hier liefern ausschließlich Zähler und Vereinsstammdaten. Für Support kann er sich als Mitglied einladen
 * lassen – das ist protokolliert und für den Verein sichtbar.
 */
async function assertPlatformAdmin(actor: SessionUser): Promise<void> {
  // Frisch aus der Datenbank prüfen (nicht nur dem Sitzungsobjekt vertrauen): Entzogene Rechte gelten sofort.
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { isPlatformAdmin: true, disabledAt: true, deletedAt: true },
  });
  if (!user?.isPlatformAdmin || user.disabledAt || user.deletedAt) throw forbidden();
}

export interface PlatformClubRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: Date;
  deactivatedAt: Date | null;
  memberCount: number;
  userCount: number;
  eventCount: number;
  pendingAdminInvitation: boolean;
}

export async function listPlatformClubs(actor: SessionUser): Promise<PlatformClubRow[]> {
  await assertPlatformAdmin(actor);
  const [clubs, members, users, events, adminInvites] = await Promise.all([
    prisma.club.findMany({ orderBy: { name: "asc" } }),
    prisma.member.groupBy({
      by: ["clubId"],
      where: { deletedAt: null, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.clubMembership.groupBy({
      by: ["clubId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.event.groupBy({ by: ["clubId"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.invitation.findMany({
      where: {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        role: { key: "CLUB_ADMIN" },
      },
      select: { clubId: true },
    }),
  ]);
  const count = (rows: { clubId: string; _count: { _all: number } }[], id: string) =>
    rows.find((r) => r.clubId === id)?._count._all ?? 0;
  const invited = new Set(adminInvites.map((i) => i.clubId));

  return clubs.map((club) => ({
    id: club.id,
    name: club.name,
    slug: club.slug,
    active: club.status === "ACTIVE",
    createdAt: club.createdAt,
    deactivatedAt: club.deactivatedAt,
    memberCount: count(members, club.id),
    userCount: count(users, club.id),
    eventCount: count(events, club.id),
    pendingAdminInvitation: invited.has(club.id),
  }));
}

export interface PlatformStats {
  clubs: { active: number; deactivated: number };
  users: number;
  members: number;
  events: number;
  upcomingEvents: number;
  activeSessions: number;
}

export async function getPlatformStats(actor: SessionUser): Promise<PlatformStats> {
  await assertPlatformAdmin(actor);
  const now = new Date();
  const [active, deactivated, users, members, events, upcomingEvents, activeSessions] =
    await Promise.all([
      prisma.club.count({ where: { status: "ACTIVE" } }),
      prisma.club.count({ where: { status: "DEACTIVATED" } }),
      prisma.user.count({ where: { deletedAt: null, disabledAt: null } }),
      prisma.member.count({ where: { deletedAt: null, archivedAt: null } }),
      prisma.event.count({ where: { deletedAt: null } }),
      prisma.event.count({
        where: { deletedAt: null, status: "PUBLISHED", startsAt: { gte: now } },
      }),
      prisma.session.count({ where: { expiresAt: { gt: now } } }),
    ]);
  return { clubs: { active, deactivated }, users, members, events, upcomingEvents, activeSessions };
}

/** Legt einen Verein samt Systemrollen an und lädt den ersten Administrator per E-Mail ein. */
export async function createClubWithAdmin(
  actor: SessionUser,
  input: { name: string; slug: string; adminEmail: string },
): Promise<{ clubId: string }> {
  await assertPlatformAdmin(actor);
  if (await prisma.club.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
    throw validationFailed({ slug: ["Dieses Kürzel ist bereits vergeben."] });
  }

  const { club, roleIds } = await provisionClub({ name: input.name, slug: input.slug });
  await issueInvitation({
    clubId: club.id,
    email: input.adminEmail,
    roleId: roleIds.CLUB_ADMIN!,
    invitedByUserId: actor.id,
    inviterName: "Die Plattformverwaltung",
  });
  await recordSystemAudit({
    clubId: club.id,
    actorUserId: actor.id,
    action: "platform.club_created",
    entityType: "Club",
    entityId: club.id,
    summary: `Verein ${input.name} angelegt; erster Administrator eingeladen`,
  });
  return { clubId: club.id };
}

/**
 * Deaktiviert oder reaktiviert einen Verein. Ein deaktivierter Verein ist für alle Mitglieder gesperrt
 * (Anmeldung und laufende Sitzungen), seine Daten bleiben unverändert erhalten.
 */
export async function setClubActive(
  actor: SessionUser,
  clubId: string,
  active: boolean,
): Promise<void> {
  await assertPlatformAdmin(actor);
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) throw notFound("Der Verein");
  if ((club.status === "ACTIVE") === active)
    throw conflict(
      active ? "Der Verein ist bereits aktiv." : "Der Verein ist bereits deaktiviert.",
    );

  await prisma.$transaction(async (tx) => {
    await tx.club.update({
      where: { id: clubId },
      data: active
        ? { status: "ACTIVE", deactivatedAt: null }
        : { status: "DEACTIVATED", deactivatedAt: new Date() },
    });
    if (!active) {
      // Laufende Sitzungen verlieren den Vereinsbezug; die nächste Anfrage findet keinen aktiven Verein mehr.
      await tx.session.updateMany({
        where: { activeClubId: clubId },
        data: { activeClubId: null },
      });
    }
  });
  await recordSystemAudit({
    clubId,
    actorUserId: actor.id,
    action: active ? "platform.club_activated" : "platform.club_deactivated",
    entityType: "Club",
    entityId: clubId,
    summary: `Verein ${club.name} ${active ? "reaktiviert" : "deaktiviert"}`,
  });
}
