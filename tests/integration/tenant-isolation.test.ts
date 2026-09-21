import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { TenantScopeError, createTenantDb, type TenantDb } from "@/server/db/tenant";
import {
  createClub,
  createDepartment,
  createEvent,
  createMember,
  createShift,
} from "../helpers/factories";

/**
 * Kernstück der Mandantentrennung: Ein Client, der an Verein A gebunden ist, darf unter
 * KEINEN Umständen Daten von Verein B lesen, ändern, löschen oder anlegen.
 */
describe("Mandantentrennung (Datenzugriff)", () => {
  let clubA: Awaited<ReturnType<typeof createClub>>;
  let clubB: Awaited<ReturnType<typeof createClub>>;
  let dbA: TenantDb;
  let memberA: Awaited<ReturnType<typeof createMember>>;
  let memberB: Awaited<ReturnType<typeof createMember>>;
  let eventB: Awaited<ReturnType<typeof createEvent>>;

  beforeAll(async () => {
    clubA = await createClub("Verein A");
    clubB = await createClub("Verein B");
    dbA = createTenantDb(clubA.id);
    memberA = await createMember(clubA.id, { lastName: "Anders" });
    memberB = await createMember(clubB.id, { lastName: "Berger" });
    eventB = await createEvent(clubB.id);
  });

  it("liest nur Datensätze des eigenen Vereins", async () => {
    const members = await dbA.member.findMany();
    expect(members.map((m) => m.id)).toEqual([memberA.id]);
    expect(await dbA.member.count()).toBe(1);
  });

  it("findUnique auf einen Datensatz eines fremden Vereins liefert nichts (IDOR)", async () => {
    expect(await dbA.member.findUnique({ where: { id: memberB.id } })).toBeNull();
    expect(await dbA.member.findFirst({ where: { id: memberB.id } })).toBeNull();
    await expect(dbA.member.findUniqueOrThrow({ where: { id: memberB.id } })).rejects.toThrow();
  });

  it("weist einen Filter auf die clubId eines fremden Vereins ab", async () => {
    await expect(dbA.member.findMany({ where: { clubId: clubB.id } })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    await expect(dbA.member.deleteMany({ where: { clubId: clubB.id } })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
  });

  it("kann Datensätze eines fremden Vereins weder ändern noch löschen", async () => {
    await expect(
      dbA.member.update({ where: { id: memberB.id }, data: { firstName: "Hacker" } }),
    ).rejects.toThrow();
    expect(
      (await dbA.member.updateMany({ where: { id: memberB.id }, data: { firstName: "Hacker" } }))
        .count,
    ).toBe(0);
    await expect(dbA.member.delete({ where: { id: memberB.id } })).rejects.toThrow();
    expect((await dbA.member.deleteMany({ where: { id: memberB.id } })).count).toBe(0);

    const unchanged = await prisma.member.findUniqueOrThrow({ where: { id: memberB.id } });
    expect(unchanged.firstName).toBe("Max");
  });

  it("legt Datensätze immer im eigenen Verein an", async () => {
    const created = await dbA.department.create({ data: { name: "Fußball" } as never });
    expect(created.clubId).toBe(clubA.id);
  });

  it("verweigert das Anlegen mit einer fremden clubId", async () => {
    await expect(
      dbA.department.create({ data: { clubId: clubB.id, name: "Eingeschleust" } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("verweigert das Verschieben eines Datensatzes in einen anderen Verein", async () => {
    await expect(
      dbA.member.update({ where: { id: memberA.id }, data: { clubId: clubB.id } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("verweigert verschachtelte Schreibzugriffe (sie würden den Filter umgehen)", async () => {
    await expect(
      dbA.department.create({
        data: { name: "Mit Kindern", groups: { create: [{ name: "Gruppe" }] } } as never,
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("wendet den Filter auch auf count, aggregate, groupBy und upsert an", async () => {
    expect(await dbA.event.count()).toBe(0);
    const aggregate = await dbA.member.aggregate({ _count: { _all: true } });
    expect(aggregate._count._all).toBe(1);
    const groups = await dbA.member.groupBy({ by: ["status"], _count: { _all: true } });
    expect(groups).toEqual([{ status: "ACTIVE", _count: { _all: 1 } }]);

    // upsert mit der ID eines fremden Datensatzes darf keinen Treffer erzeugen, sondern legt im eigenen Verein an.
    const upserted = await dbA.department.upsert({
      where: { id: "00000000-0000-7000-8000-000000000000" },
      create: { name: "Upsert-Abteilung" } as never,
      update: {},
    });
    expect(upserted.clubId).toBe(clubA.id);
  });

  it("gilt auch innerhalb einer interaktiven Transaktion", async () => {
    await dbA.$transaction(async (tx) => {
      const members = await tx.member.findMany();
      expect(members.map((m) => m.id)).toEqual([memberA.id]);
      expect(await tx.event.findUnique({ where: { id: eventB.id } })).toBeNull();
    });
  });

  it("wendet Relationen über zusammengesetzte Schlüssel nur innerhalb des Vereins an", async () => {
    const event = await createEvent(clubA.id);
    const withShifts = await dbA.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { shifts: true },
    });
    expect(withShifts.shifts).toEqual([]);
  });

  it("lässt globale Modelle nicht über den Mandanten-Client zu", async () => {
    await expect(dbA.user.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(dbA.session.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("erlaubt den schreibgeschützten Berechtigungskatalog, aber keine Änderungen daran", async () => {
    expect((await dbA.permission.findMany()).length).toBeGreaterThan(0);
    await expect(dbA.permission.deleteMany()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("zeigt und ändert nur den eigenen Verein; Löschen ist gesperrt", async () => {
    const clubs = await dbA.club.findMany();
    expect(clubs.map((c) => c.id)).toEqual([clubA.id]);
    await expect(dbA.club.delete({ where: { id: clubA.id } })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    // Der Versuch, einen FREMDEN Verein zu ändern, darf weder gelingen noch den eigenen still verändern.
    await expect(
      dbA.club.update({ where: { id: clubB.id }, data: { name: "Gekapert" } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    expect((await prisma.club.findUniqueOrThrow({ where: { id: clubB.id } })).name).toBe(
      "Verein B",
    );
    expect((await prisma.club.findUniqueOrThrow({ where: { id: clubA.id } })).name).toBe(
      "Verein A",
    );
  });

  it("Rollen und Berechtigungen sind je Verein getrennt", async () => {
    const roles = await dbA.role.findMany();
    expect(roles.length).toBe(5);
    expect(roles.every((role) => role.clubId === clubA.id)).toBe(true);
  });
});

describe("Mandantentrennung (Datenbank-Integrität)", () => {
  it("die Datenbank verhindert Verknüpfungen zwischen Vereinen (zusammengesetzter Fremdschlüssel)", async () => {
    const clubA = await createClub("Verein A");
    const clubB = await createClub("Verein B");
    const eventB = await createEvent(clubB.id);

    // Selbst mit dem UNGESCHÜTZTEN Client kann keine Schicht von Verein A an eine Veranstaltung von Verein B hängen.
    await expect(
      prisma.eventShift.create({
        data: {
          clubId: clubA.id,
          eventId: eventB.id,
          title: "Eingeschleust",
          startsAt: new Date(Date.now() + 3_600_000),
          endsAt: new Date(Date.now() + 7_200_000),
          requiredCount: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it("die Datenbank verhindert Zuweisungen von Mitgliedern eines anderen Vereins", async () => {
    const clubA = await createClub("Verein A");
    const clubB = await createClub("Verein B");
    const eventA = await createEvent(clubA.id);
    const shiftA = await createShift(clubA.id, eventA.id);
    const memberB = await createMember(clubB.id);

    await expect(
      prisma.shiftAssignment.create({
        data: { clubId: clubA.id, shiftId: shiftA.id, memberId: memberB.id },
      }),
    ).rejects.toThrow();
  });

  it("ein Mitglied kann nur mit einem Benutzer verknüpft werden, der Mitglied im selben Verein ist", async () => {
    const clubA = await createClub("Verein A");
    const outsider = await prisma.user.create({
      data: {
        email: `${Date.now()}@example.test`,
        firstName: "Fremd",
        lastName: "Person",
        passwordHash: "x",
      },
    });
    await expect(
      prisma.member.create({
        data: { clubId: clubA.id, userId: outsider.id, firstName: "Fremd", lastName: "Person" },
      }),
    ).rejects.toThrow();
  });

  it("Abteilung eines fremden Vereins kann keiner Veranstaltung zugeordnet werden", async () => {
    const clubA = await createClub("Verein A");
    const clubB = await createClub("Verein B");
    const departmentB = await createDepartment(clubB.id);
    await expect(createEvent(clubA.id, { departmentId: departmentB.id })).rejects.toThrow();
  });
});
