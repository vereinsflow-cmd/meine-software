import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { mapDatabaseError } from "@/server/action";
import { createClub, createEvent, createMember, createShift, unique } from "../helpers/factories";

const HOUR = 3_600_000;

async function setup(requiredCount = 2) {
  const club = await createClub();
  const event = await createEvent(club.id);
  const shift = await createShift(club.id, event.id, { requiredCount });
  return { club, event, shift };
}

const assign = (clubId: string, shiftId: string, memberId: string) =>
  prisma.shiftAssignment.create({ data: { clubId, shiftId, memberId } });

describe("Überbuchung verhindern", () => {
  it("nimmt höchstens so viele Helfer auf, wie die Schicht benötigt", async () => {
    const { club, shift } = await setup(2);
    const [m1, m2, m3] = await Promise.all([
      createMember(club.id),
      createMember(club.id),
      createMember(club.id),
    ]);

    await assign(club.id, shift.id, m1.id);
    await assign(club.id, shift.id, m2.id);
    await expect(assign(club.id, shift.id, m3.id)).rejects.toThrow(/SHIFT_FULL/);
  });

  it("hält die Grenze auch bei gleichzeitigen Anmeldungen ein (Race Condition)", async () => {
    const { club, shift } = await setup(1);
    const members = await Promise.all(Array.from({ length: 8 }, () => createMember(club.id)));

    const results = await Promise.allSettled(members.map((m) => assign(club.id, shift.id, m.id)));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.shiftAssignment.count({ where: { shiftId: shift.id, status: "CONFIRMED" } }),
    ).toBe(1);
  });

  it("gibt beim Abmelden den Platz wieder frei", async () => {
    const { club, shift } = await setup(1);
    const [m1, m2] = await Promise.all([createMember(club.id), createMember(club.id)]);
    const first = await assign(club.id, shift.id, m1.id);

    await expect(assign(club.id, shift.id, m2.id)).rejects.toThrow(/SHIFT_FULL/);
    await prisma.shiftAssignment.update({
      where: { id: first.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await expect(assign(club.id, shift.id, m2.id)).resolves.toBeDefined();
  });

  it("prüft die Kapazität auch beim erneuten Aktivieren einer stornierten Eintragung", async () => {
    const { club, shift } = await setup(1);
    const [m1, m2] = await Promise.all([createMember(club.id), createMember(club.id)]);
    const first = await assign(club.id, shift.id, m1.id);
    await prisma.shiftAssignment.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    await assign(club.id, shift.id, m2.id); // Platz wurde inzwischen vergeben

    await expect(
      prisma.shiftAssignment.update({ where: { id: first.id }, data: { status: "CONFIRMED" } }),
    ).rejects.toThrow(/SHIFT_FULL/);
  });

  it("wird von der Anwendung als verständlicher Konflikt gemeldet", async () => {
    const { club, shift } = await setup(1);
    const [m1, m2] = await Promise.all([createMember(club.id), createMember(club.id)]);
    await assign(club.id, shift.id, m1.id);
    const error = await assign(club.id, shift.id, m2.id).catch((e: unknown) => e);

    const mapped = mapDatabaseError(error);
    expect(mapped?.code).toBe("CONFLICT");
    expect(mapped?.message).toMatch(/voll besetzt/);
  });
});

describe("Doppelbelegung verhindern", () => {
  it("verhindert zwei sich überschneidende Schichten für dasselbe Mitglied", async () => {
    const club = await createClub();
    const event = await createEvent(club.id);
    const start = new Date(Date.now() + 72 * HOUR);
    const shiftA = await createShift(club.id, event.id, {
      startsAt: start,
      endsAt: new Date(start.getTime() + 3 * HOUR),
    });
    const shiftB = await createShift(club.id, event.id, {
      startsAt: new Date(start.getTime() + 2 * HOUR),
      endsAt: new Date(start.getTime() + 5 * HOUR),
    });
    const member = await createMember(club.id);

    await assign(club.id, shiftA.id, member.id);
    await expect(assign(club.id, shiftB.id, member.id)).rejects.toThrow(/SHIFT_OVERLAP/);
  });

  it("erlaubt direkt aufeinanderfolgende Schichten (Ende = Beginn)", async () => {
    const club = await createClub();
    const event = await createEvent(club.id);
    const start = new Date(Date.now() + 72 * HOUR);
    const shiftA = await createShift(club.id, event.id, {
      startsAt: start,
      endsAt: new Date(start.getTime() + 3 * HOUR),
    });
    const shiftB = await createShift(club.id, event.id, {
      startsAt: new Date(start.getTime() + 3 * HOUR),
      endsAt: new Date(start.getTime() + 6 * HOUR),
    });
    const member = await createMember(club.id);

    await assign(club.id, shiftA.id, member.id);
    await expect(assign(club.id, shiftB.id, member.id)).resolves.toBeDefined();
  });

  it("verhindert Doppelbelegung auch bei gleichzeitigen Eintragungen", async () => {
    const club = await createClub();
    const event = await createEvent(club.id);
    const start = new Date(Date.now() + 96 * HOUR);
    const shifts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createShift(club.id, event.id, {
          startsAt: new Date(start.getTime() + i * 30 * 60_000),
          endsAt: new Date(start.getTime() + 3 * HOUR),
          requiredCount: 5,
        }),
      ),
    );
    const member = await createMember(club.id);

    const results = await Promise.allSettled(
      shifts.map((shift) => assign(club.id, shift.id, member.id)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("ignoriert abgesagte Schichten", async () => {
    const club = await createClub();
    const event = await createEvent(club.id);
    const start = new Date(Date.now() + 72 * HOUR);
    const shiftA = await createShift(club.id, event.id, {
      startsAt: start,
      endsAt: new Date(start.getTime() + 3 * HOUR),
    });
    const shiftB = await createShift(club.id, event.id, {
      startsAt: start,
      endsAt: new Date(start.getTime() + 2 * HOUR),
    });
    const member = await createMember(club.id);

    await assign(club.id, shiftA.id, member.id);
    await prisma.eventShift.update({ where: { id: shiftA.id }, data: { status: "CANCELLED" } });
    await expect(assign(club.id, shiftB.id, member.id)).resolves.toBeDefined();
  });

  it("wird von der Anwendung als verständlicher Konflikt gemeldet", async () => {
    const club = await createClub();
    const event = await createEvent(club.id);
    const start = new Date(Date.now() + 72 * HOUR);
    const a = await createShift(club.id, event.id, {
      startsAt: start,
      endsAt: new Date(start.getTime() + 3 * HOUR),
    });
    const b = await createShift(club.id, event.id, {
      startsAt: start,
      endsAt: new Date(start.getTime() + 3 * HOUR),
    });
    const member = await createMember(club.id);
    await assign(club.id, a.id, member.id);

    const mapped = mapDatabaseError(
      await assign(club.id, b.id, member.id).catch((e: unknown) => e),
    );
    expect(mapped?.code).toBe("CONFLICT");
    expect(mapped?.message).toMatch(/anderen Schicht/);
  });
});

describe("Teilnehmerlimit", () => {
  it("nimmt nicht mehr Zusagen an als erlaubt", async () => {
    const club = await createClub();
    const event = await createEvent(club.id, { maxParticipants: 1 });
    const [m1, m2] = await Promise.all([createMember(club.id), createMember(club.id)]);

    await prisma.eventParticipant.create({
      data: { clubId: club.id, eventId: event.id, memberId: m1.id, status: "ACCEPTED" },
    });
    await expect(
      prisma.eventParticipant.create({
        data: { clubId: club.id, eventId: event.id, memberId: m2.id, status: "ACCEPTED" },
      }),
    ).rejects.toThrow(/EVENT_FULL/);
    // Auf die Warteliste darf trotzdem jeder.
    await expect(
      prisma.eventParticipant.create({
        data: { clubId: club.id, eventId: event.id, memberId: m2.id, status: "WAITLISTED" },
      }),
    ).resolves.toBeDefined();
  });
});

describe("Audit-Log ist unveränderlich", () => {
  it("verweigert UPDATE und DELETE", async () => {
    const club = await createClub();
    const entry = await prisma.auditLog.create({
      data: { clubId: club.id, action: "test.created", entityType: "Test", summary: "Original" },
    });

    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { summary: "Manipuliert" } }),
    ).rejects.toThrow(/unveraenderlich/);
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
      /unveraenderlich/,
    );
    await expect(prisma.auditLog.deleteMany({ where: { clubId: club.id } })).rejects.toThrow(
      /unveraenderlich/,
    );

    const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stored.summary).toBe("Original");
  });

  it("erlaubt das Löschen nur der Aufbewahrungsroutine", async () => {
    const club = await createClub();
    const entry = await prisma.auditLog.create({
      data: { clubId: club.id, action: "test.created", entityType: "Test" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('vereinsflow.audit_purge', 'on', true)`;
      await tx.auditLog.delete({ where: { id: entry.id } });
    });
    expect(await prisma.auditLog.findUnique({ where: { id: entry.id } })).toBeNull();
  });

  it("Datenschutzroutine darf NUR summary und changes schwärzen – alles andere bleibt gesperrt", async () => {
    const club = await createClub();
    const entry = await prisma.auditLog.create({
      data: {
        clubId: club.id,
        action: "member.updated",
        entityType: "Member",
        entityId: "m-1",
        summary: "Mitglied Max Muster geändert",
        changes: { firstName: "Max" },
        ipPrefix: "10.0.0.0",
      },
    });
    const inPurgeMode = <T>(
      work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
    ) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('vereinsflow.audit_purge', 'on', true)`;
        return work(tx);
      });

    // Außerhalb der Routine: gesperrt.
    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { summary: "x" } }),
    ).rejects.toThrow(/unveraenderlich/);

    // In der Routine: Klartext-Felder dürfen überschrieben werden …
    await inPurgeMode((tx) =>
      tx.auditLog.update({
        where: { id: entry.id },
        data: { summary: "Mitglied (anonymisiert)", changes: Prisma.JsonNull },
      }),
    );
    const scrubbed = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(scrubbed.summary).toBe("Mitglied (anonymisiert)");
    expect(scrubbed.changes).toBeNull();
    expect(scrubbed).toMatchObject({
      action: "member.updated",
      entityType: "Member",
      entityId: "m-1",
      ipPrefix: "10.0.0.0",
    });

    // … aber nicht Aktion, Objekt, Akteur, IP oder Zeitpunkt – auch dort nicht.
    for (const data of [
      { action: "member.deleted" },
      { entityType: "Other" },
      { entityId: "m-2" },
      { ipPrefix: null },
      { createdAt: new Date(0) },
      { actorType: "SYSTEM" as const },
    ]) {
      await expect(
        inPurgeMode((tx) => tx.auditLog.update({ where: { id: entry.id }, data })),
      ).rejects.toThrow(/unveraenderlich/);
    }
    const unchanged = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
    expect(unchanged).toMatchObject({
      action: "member.updated",
      entityType: "Member",
      entityId: "m-1",
      ipPrefix: "10.0.0.0",
      actorType: "USER",
    });
    expect(unchanged.createdAt.getTime()).toBe(entry.createdAt.getTime());
  });
});

describe("CHECK-Constraints", () => {
  it("lehnt ungültige Schichtzeiten und Helferzahlen ab", async () => {
    const club = await createClub();
    const event = await createEvent(club.id);
    const start = new Date(Date.now() + 10 * HOUR);
    const base = {
      clubId: club.id,
      eventId: event.id,
      title: "X",
      startsAt: start,
      endsAt: new Date(start.getTime() + HOUR),
      requiredCount: 1,
    };

    await expect(
      prisma.eventShift.create({ data: { ...base, endsAt: new Date(start.getTime() - HOUR) } }),
    ).rejects.toThrow();
    await expect(prisma.eventShift.create({ data: { ...base, endsAt: start } })).rejects.toThrow();
    await expect(
      prisma.eventShift.create({ data: { ...base, requiredCount: 0 } }),
    ).rejects.toThrow();
    await expect(
      prisma.eventShift.create({ data: { ...base, requiredCount: 501 } }),
    ).rejects.toThrow();
    await expect(prisma.eventShift.create({ data: base })).resolves.toBeDefined();
  });

  it("lehnt Veranstaltungen mit Ende vor dem Beginn ab", async () => {
    const club = await createClub();
    const start = new Date(Date.now() + 10 * HOUR);
    await expect(
      createEvent(club.id, { startsAt: start, endsAt: new Date(start.getTime() - 1) }),
    ).rejects.toThrow();
  });

  it("erzwingt kleingeschriebene E-Mail-Adressen", async () => {
    await expect(
      prisma.user.create({
        data: { email: "GROSS@Example.test", firstName: "A", lastName: "B", passwordHash: "x" },
      }),
    ).rejects.toThrow();
  });

  it("erlaubt in Benachrichtigungen nur interne Links", async () => {
    const club = await createClub();
    const user = await prisma.user.create({
      data: {
        email: `${unique("n")}@example.test`,
        firstName: "A",
        lastName: "B",
        passwordHash: "x",
      },
    });
    const role = club.roleIds.MEMBER!;
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: user.id, roleId: role },
    });
    const base = { clubId: club.id, userId: user.id, type: "SYSTEM" as const, title: "Hallo" };

    await expect(
      prisma.notification.create({ data: { ...base, linkUrl: "https://evil.example" } }),
    ).rejects.toThrow();
    await expect(
      prisma.notification.create({ data: { ...base, linkUrl: "//evil.example" } }),
    ).rejects.toThrow();
    await expect(
      prisma.notification.create({ data: { ...base, linkUrl: "/veranstaltungen/1" } }),
    ).resolves.toBeDefined();
  });

  it("erlaubt höchstens eine offene Einladung je E-Mail-Adresse", async () => {
    const club = await createClub();
    const roleId = club.roleIds.MEMBER!;
    const base = {
      clubId: club.id,
      email: "neu@example.test",
      roleId,
      expiresAt: new Date(Date.now() + 86_400_000),
    };

    await prisma.invitation.create({ data: { ...base, tokenHash: unique("h1") } });
    await expect(
      prisma.invitation.create({ data: { ...base, tokenHash: unique("h2") } }),
    ).rejects.toThrow();

    // Nach dem Widerruf ist eine neue Einladung möglich.
    await prisma.invitation.updateMany({
      where: { clubId: club.id },
      data: { revokedAt: new Date() },
    });
    await expect(
      prisma.invitation.create({ data: { ...base, tokenHash: unique("h3") } }),
    ).resolves.toBeDefined();
  });
});
