import "server-only";
import { clubLogoUrl } from "@/lib/club-logo";
import { setSessionActiveClub } from "@/server/auth/session-core";
import { prisma } from "@/server/db/client";
import { notFound } from "@/server/errors";

export interface UserClub {
  id: string;
  name: string;
  roleName: string;
  /** Adresse des Vereinslogos mit Version – `null`, wenn der Verein keins hinterlegt hat. */
  logoUrl: string | null;
}

/** Alle Vereine, in denen der Benutzer eine aktive Mitgliedschaft hat (für den Vereinswechsler). */
export async function listUserClubs(userId: string): Promise<UserClub[]> {
  const memberships = await prisma.clubMembership.findMany({
    where: { userId, status: "ACTIVE", club: { status: "ACTIVE" } },
    orderBy: { club: { name: "asc" } },
    select: {
      club: { select: { id: true, name: true, logoSha256: true } },
      role: { select: { name: true } },
    },
  });
  return memberships.map((m) => ({
    id: m.club.id,
    name: m.club.name,
    roleName: m.role.name,
    logoUrl: clubLogoUrl(m.club.id, m.club.logoSha256),
  }));
}

/**
 * Wechselt den aktiven Verein der Sitzung. Der Wechsel ist nur in Vereine möglich, in denen der
 * Benutzer eine aktive Mitgliedschaft hat – eine fremde ID führt zu "nicht gefunden".
 */
export async function switchActiveClub(
  sessionId: string,
  userId: string,
  clubId: string,
): Promise<void> {
  const membership = await prisma.clubMembership.findFirst({
    where: { userId, clubId, status: "ACTIVE", club: { status: "ACTIVE" } },
    select: { id: true },
  });
  if (!membership) throw notFound("Der Verein");
  await setSessionActiveClub(sessionId, clubId);
}
