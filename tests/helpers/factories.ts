import { randomBytes } from "node:crypto";
import type { Club, Member, User } from "@/generated/prisma/client";
import type { SystemRoleKey } from "@/server/permissions/defaults";
import { prisma } from "@/server/db/client";
import { provisionClub } from "@/server/platform/provision";
import { loadTenantContext, type TenantContext } from "@/server/tenancy/context-core";

/** Eindeutiger Suffix, damit parallele Tests sich nicht in die Quere kommen. */
export const unique = (prefix = "t") => `${prefix}-${randomBytes(4).toString("hex")}`;

export async function createClub(
  name = "Testverein",
): Promise<Club & { roleIds: Record<string, string> }> {
  const { club, roleIds } = await provisionClub({ name, slug: unique("verein") });
  return { ...club, roleIds };
}

export async function createUser(
  overrides: Partial<
    Pick<User, "email" | "firstName" | "lastName" | "isPlatformAdmin" | "passwordHash">
  > = {},
): Promise<User> {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${unique("user")}@example.test`,
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "Benutzer",
      // Kein echter Hash nötig – nur Authentifizierungs-Tests verwenden echte Passwörter.
      passwordHash: overrides.passwordHash ?? "$argon2id$platzhalter",
      isPlatformAdmin: overrides.isPlatformAdmin ?? false,
      emailVerifiedAt: new Date(),
    },
  });
}

export interface AddedUser {
  user: User;
  member: Member;
  membershipId: string;
}

/** Nimmt einen Benutzer mit Rolle in einem Verein auf – inklusive verknüpftem Mitgliedsdatensatz. */
export async function addUserToClub(
  club: Club & { roleIds: Record<string, string> },
  roleKey: SystemRoleKey,
  options: { user?: User; ledDepartmentIds?: string[]; firstName?: string; lastName?: string } = {},
): Promise<AddedUser> {
  const user =
    options.user ??
    (await createUser({
      firstName: options.firstName ?? "Test",
      lastName: options.lastName ?? roleKey,
    }));

  const roleId = club.roleIds[roleKey];
  if (!roleId) throw new Error(`Rolle ${roleKey} existiert im Verein nicht`);

  const membership = await prisma.clubMembership.create({
    data: { clubId: club.id, userId: user.id, roleId },
  });
  const member = await prisma.member.create({
    data: {
      clubId: club.id,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  });
  for (const departmentId of options.ledDepartmentIds ?? []) {
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: member.id, departmentId, isLeader: true },
    });
  }
  return { user, member, membershipId: membership.id };
}

export async function contextFor(userId: string, clubId: string): Promise<TenantContext> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const loaded = await loadTenantContext(
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isPlatformAdmin: user.isPlatformAdmin,
    },
    clubId,
  );
  if (!loaded) throw new Error("Kein Kontext für Benutzer/Verein");
  return loaded.context;
}

export function createDepartment(clubId: string, name = unique("Abteilung")) {
  return prisma.department.create({ data: { clubId, name } });
}

export function createMember(
  clubId: string,
  overrides: Partial<Pick<Member, "firstName" | "lastName" | "email" | "status">> = {},
) {
  return prisma.member.create({
    data: {
      clubId,
      firstName: overrides.firstName ?? "Max",
      lastName: overrides.lastName ?? unique("Muster"),
      email: overrides.email ?? null,
      status: overrides.status ?? "ACTIVE",
    },
  });
}

const HOUR = 60 * 60 * 1000;

export function createEvent(
  clubId: string,
  overrides: {
    title?: string;
    startsAt?: Date;
    endsAt?: Date;
    departmentId?: string | null;
    maxParticipants?: number | null;
  } = {},
) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 48 * HOUR);
  return prisma.event.create({
    data: {
      clubId,
      title: overrides.title ?? unique("Fest"),
      startsAt,
      endsAt: overrides.endsAt ?? new Date(startsAt.getTime() + 4 * HOUR),
      departmentId: overrides.departmentId ?? null,
      maxParticipants: overrides.maxParticipants ?? null,
      status: "PUBLISHED",
    },
  });
}

export function createShift(
  clubId: string,
  eventId: string,
  overrides: { title?: string; startsAt?: Date; endsAt?: Date; requiredCount?: number } = {},
) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 49 * HOUR);
  return prisma.eventShift.create({
    data: {
      clubId,
      eventId,
      title: overrides.title ?? "Getränkestand",
      startsAt,
      endsAt: overrides.endsAt ?? new Date(startsAt.getTime() + 3 * HOUR),
      requiredCount: overrides.requiredCount ?? 2,
    },
  });
}
