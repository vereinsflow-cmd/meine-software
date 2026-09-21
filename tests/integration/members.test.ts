import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { pageRequest } from "@/lib/search-params";
import { memberFormSchema, type MemberFormInput } from "@/modules/members/schemas";
import {
  archiveMember,
  createMember,
  deleteMember,
  getMember,
  getMemberForEdit,
  getMemberHistory,
  getMemberStats,
  listMembers,
  recordConsent,
  restoreFromTrash,
  restoreMember,
  suggestNextMemberNumber,
  updateMember,
  type MemberListQuery,
} from "@/modules/members/service";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createMember as createMemberRow,
} from "../helpers/factories";

const input = (overrides: Partial<MemberFormInput> = {}) =>
  memberFormSchema.parse({
    firstName: "Erika",
    lastName: "Mustermann",
    status: "ACTIVE",
    departmentIds: [],
    leaderDepartmentIds: [],
    ...overrides,
  });

const query = (overrides: Partial<MemberListQuery> = {}): MemberListQuery => ({
  view: "active",
  sort: "name",
  dir: "asc",
  request: pageRequest({}),
  ...overrides,
});

async function setup() {
  const club = await createClub("Testverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    admin: await contextFor(admin.user.id, club.id),
    board: await contextFor(board.user.id, club.id),
    lead: await contextFor(lead.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  return { club, fussball, handball, admin, board, lead, member, ctx };
}

describe("Mitglieder anlegen und bearbeiten", () => {
  it("legt ein Mitglied mit Abteilungen an und protokolliert es", async () => {
    const { ctx, fussball, handball, admin } = await setup();
    const { id } = await createMember(
      ctx.admin,
      input({
        memberNumber: "M-1001",
        email: "Erika@Example.org",
        phone: "0171 1234567",
        birthDate: "1985-04-12",
        joinedAt: "2020-01-15",
        departmentIds: [fussball.id, handball.id],
        leaderDepartmentIds: [handball.id],
        internalNotes: "Vertraulich",
      }),
    );

    const detail = await getMember(ctx.admin, id);
    expect(detail).toMatchObject({
      firstName: "Erika",
      lastName: "Mustermann",
      memberNumber: "M-1001",
      email: "erika@example.org",
    });
    expect(detail.departments.map((d) => [d.name, d.isLeader])).toEqual([
      ["Fußball", false],
      ["Handball", true],
    ]);
    expect(detail.private?.birthDate?.toISOString().slice(0, 10)).toBe("1985-04-12");
    expect(detail.private?.internalNotes).toBe("Vertraulich");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: id, action: "member.created" },
    });
    expect(audit.actorUserId).toBe(admin.user.id);
    expect(audit.clubId).toBe(ctx.admin.clubId);
  });

  it("verlangt Pflichtfelder und plausible Werte (Schema-Validierung)", () => {
    expect(
      memberFormSchema.safeParse({
        firstName: "",
        lastName: "",
        status: "ACTIVE",
        departmentIds: [],
        leaderDepartmentIds: [],
      }).success,
    ).toBe(false);
    for (const bad of [
      { email: "keine-mail" },
      { phone: "abc" },
      { birthDate: "2030-01-01" },
      { birthDate: "1850-01-01" },
      { birthDate: "31.02.2000" },
      { joinedAt: "2020-05-01", leftAt: "2019-01-01" },
      { status: "UNBEKANNT" },
      { departmentIds: ["a"], leaderDepartmentIds: ["b"] },
    ]) {
      expect(
        memberFormSchema.safeParse({
          firstName: "A",
          lastName: "B",
          status: "ACTIVE",
          departmentIds: [],
          leaderDepartmentIds: [],
          ...bad,
        }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it("verhindert doppelte Mitgliedsnummern mit verständlichem Feldfehler", async () => {
    const { ctx } = await setup();
    await createMember(ctx.admin, input({ memberNumber: "M-2000" }));
    await expect(
      createMember(ctx.admin, input({ memberNumber: "M-2000", lastName: "Zweite" })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { memberNumber: [expect.stringContaining("bereits vergeben")] },
    });
  });

  it("schlägt die nächste freie Mitgliedsnummer vor", async () => {
    const { ctx } = await setup();
    expect(await suggestNextMemberNumber(ctx.admin)).toBe("M-0001");
    await createMember(ctx.admin, input({ memberNumber: "M-0041" }));
    expect(await suggestNextMemberNumber(ctx.admin)).toBe("M-0042");
  });

  it("weist unbekannte Abteilungen ab", async () => {
    const { ctx } = await setup();
    await expect(
      createMember(ctx.admin, input({ departmentIds: ["gibt-es-nicht"] })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("ändert ein Mitglied und protokolliert nur Änderungen – sensible Werte maskiert", async () => {
    const { ctx, fussball, handball } = await setup();
    const { id } = await createMember(
      ctx.admin,
      input({ phone: "0171 1111111", departmentIds: [fussball.id], clubFunction: "Kassenwart" }),
    );

    await updateMember(
      ctx.admin,
      id,
      input({ phone: "0171 2222222", clubFunction: "Schriftführer", departmentIds: [handball.id] }),
    );

    const detail = await getMember(ctx.admin, id);
    expect(detail).toMatchObject({ phone: "0171 2222222", clubFunction: "Schriftführer" });
    expect(detail.departments.map((d) => d.name)).toEqual(["Handball"]);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: id, action: "member.updated" },
    });
    const changes = audit.changes as Record<string, unknown>;
    expect(changes.clubFunction).toEqual({ from: "Kassenwart", to: "Schriftführer" });
    expect(changes.phone).toEqual({ changed: true }); // Wert wird NICHT gespeichert
    expect(changes.departments).toEqual({ from: ["Fußball"], to: ["Handball"] });
    expect(JSON.stringify(changes)).not.toContain("2222222");
  });

  it("schreibt keinen Audit-Eintrag, wenn sich nichts geändert hat", async () => {
    const { ctx } = await setup();
    const { id } = await createMember(ctx.admin, input());
    await updateMember(ctx.admin, id, input());
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "member.updated" } })).toBe(
      0,
    );
  });
});

describe("Berechtigungen und Reichweite", () => {
  it("Mitglied darf nichts verwalten und sieht in der Liste nur sich selbst", async () => {
    const { ctx, member } = await setup();
    await createMemberRow(ctx.member.clubId, { firstName: "Anderer", lastName: "Mensch" });

    await expect(createMember(ctx.member, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const list = await listMembers(ctx.member, query());
    expect(list.items.map((m) => m.id)).toEqual([member.member.id]);
  });

  it("Mitglied sieht fremde Datensätze nicht (404, nicht 403 – verrät nichts)", async () => {
    const { ctx } = await setup();
    const other = await createMemberRow(ctx.member.clubId, {
      firstName: "Fremd",
      lastName: "Person",
      email: "fremd@example.org",
    });
    await expect(getMember(ctx.member, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateMember(ctx.member, other.id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getMemberHistory(ctx.member, other.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("Mitglied sieht die eigenen Kontakt- und Privatdaten vollständig", async () => {
    const { ctx, member } = await setup();
    await prisma.member.update({
      where: { id: member.member.id },
      data: { birthDate: new Date("1990-03-03"), street: "Weg 1" },
    });
    const detail = await getMember(ctx.member, member.member.id);
    expect(detail.contact?.street).toBe("Weg 1");
    expect(detail.private?.birthDate).not.toBeNull();
    expect(detail.can.update).toBe(false);
  });

  it("Abteilungsleiter sieht und ändert nur Mitglieder der eigenen Abteilung", async () => {
    const { ctx, fussball, handball } = await setup();
    const inOwn = await createMember(
      ctx.admin,
      input({ lastName: "Eigene", email: "eigene@example.org", departmentIds: [fussball.id] }),
    );
    const inOther = await createMember(
      ctx.admin,
      input({ lastName: "Fremde", email: "fremde@example.org", departmentIds: [handball.id] }),
    );
    const without = await createMember(ctx.admin, input({ lastName: "Ohne" }));

    const list = await listMembers(ctx.lead, query());
    expect(list.items.map((m) => m.lastName).sort()).toEqual(
      ["Eigene", ctx.lead.user.lastName].sort(),
    );
    expect(list.items.find((m) => m.lastName === "Eigene")?.email).toBe("eigene@example.org");

    await expect(getMember(ctx.lead, inOther.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getMember(ctx.lead, without.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateMember(ctx.lead, inOther.id, input({ lastName: "Manipuliert" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateMember(
        ctx.lead,
        inOwn.id,
        input({ lastName: "Geändert", departmentIds: [fussball.id] }),
      ),
    ).resolves.toBeUndefined();
    expect((await getMember(ctx.lead, inOwn.id)).lastName).toBe("Geändert");
  });

  it("Abteilungsleiter darf nur Mitglieder ihrer Abteilung anlegen", async () => {
    const { ctx, fussball, handball } = await setup();
    await expect(
      createMember(ctx.lead, input({ departmentIds: [handball.id] })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createMember(ctx.lead, input({ departmentIds: [] }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      createMember(ctx.lead, input({ departmentIds: [fussball.id, handball.id] })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createMember(ctx.lead, input({ departmentIds: [fussball.id] })),
    ).resolves.toHaveProperty("id");
  });

  it("Abteilungsleiter ändert Zuordnungen und Leitung fremder Abteilungen nicht", async () => {
    const { ctx, fussball, handball } = await setup();
    const { id } = await createMember(
      ctx.admin,
      input({ departmentIds: [fussball.id, handball.id], leaderDepartmentIds: [handball.id] }),
    );

    // Der Leiter (Fußball) versucht, Handball zu entfernen und die Leitung dort zu entziehen.
    await updateMember(ctx.lead, id, input({ departmentIds: [], leaderDepartmentIds: [] }));
    const detail = await getMember(ctx.admin, id);
    expect(detail.departments.map((d) => [d.name, d.isLeader])).toEqual([["Handball", true]]); // Fußball entfernt, Handball unangetastet – samt Leitung
  });

  it("Abteilungsleiter darf die Leitung in der EIGENEN Abteilung setzen, in fremden nicht", async () => {
    const { ctx, fussball, handball } = await setup();
    const { id } = await createMember(
      ctx.admin,
      input({ departmentIds: [fussball.id, handball.id] }),
    );

    // Das Formular verlangt: Wer Leiter einer Abteilung ist, gehört ihr auch an – die Handball-Zuordnung bleibt daher im Formular
    // stehen (der Leiter darf sie ohnehin nicht ändern), die Handball-LEITUNG wird ignoriert.
    await updateMember(
      ctx.lead,
      id,
      input({
        departmentIds: [fussball.id, handball.id],
        leaderDepartmentIds: [fussball.id, handball.id],
      }),
    );
    const led = (await getMember(ctx.admin, id)).departments
      .map((d) => [d.name, d.isLeader])
      .sort();
    expect(led).toEqual([
      ["Fußball", true],
      ["Handball", false],
    ]);

    await updateMember(
      ctx.lead,
      id,
      input({ departmentIds: [fussball.id, handball.id], leaderDepartmentIds: [] }),
    ); // eigene Leitung wieder entziehen
    expect(
      (await getMember(ctx.admin, id)).departments.map((d) => [d.name, d.isLeader]).sort(),
    ).toEqual([
      ["Fußball", false],
      ["Handball", false],
    ]);
  });

  it("Abteilungsleiter kann weder archivieren noch löschen noch exportieren", async () => {
    const { ctx, fussball } = await setup();
    const { id } = await createMember(ctx.admin, input({ departmentIds: [fussball.id] }));
    await expect(archiveMember(ctx.lead, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteMember(ctx.lead, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listMembers(ctx.lead, query({ view: "archived" }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("Vorstand darf archivieren, aber nicht endgültig löschen", async () => {
    const { ctx } = await setup();
    const { id } = await createMember(ctx.admin, input());
    await archiveMember(ctx.board, id);
    await expect(deleteMember(ctx.board, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Berechtigte Rollen sehen Kontaktdaten, Rollen ohne Berechtigung sehen sie geschwärzt", async () => {
    const { ctx, member } = await setup();
    const { id } = await createMember(
      ctx.admin,
      input({ email: "privat@example.org", phone: "0170 999", birthDate: "1980-01-01" }),
    );
    const asBoard = await getMember(ctx.board, id);
    expect(asBoard.email).toBe("privat@example.org");
    expect(asBoard.private).not.toBeNull();

    // Ein Mitglied mit erweiterter Leseberechtigung (aber ohne Kontaktrecht) sieht keine Kontaktdaten.
    const role = await prisma.role.findFirstOrThrow({
      where: { clubId: ctx.admin.clubId, key: "MEMBER" },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionKey: { roleId: role.id, permissionKey: "members:read" } },
      update: { scope: "CLUB" },
      create: {
        clubId: ctx.admin.clubId,
        roleId: role.id,
        permissionKey: "members:read",
        scope: "CLUB",
      },
    });
    const widened = await contextFor(member.user.id, ctx.admin.clubId);
    const seen = await getMember(widened, id);
    expect(seen).toMatchObject({
      firstName: "Erika",
      email: null,
      phone: null,
      contact: null,
      private: null,
    });
    expect(
      (await listMembers(widened, query())).items.every(
        (m) => m.email === null || m.id === member.member.id,
      ),
    ).toBe(true);
  });

  it("Formular liefert gesperrte Felder nicht aus, und Änderungen daran werden ignoriert", async () => {
    const { ctx, fussball, member } = await setup();
    const { id } = await createMember(
      ctx.admin,
      input({ departmentIds: [fussball.id], birthDate: "1990-01-01", internalNotes: "geheim" }),
    );
    // Abteilungsleiter hat read_private (DEPARTMENT) – dieser Test prüft stattdessen Board→Lead mit entzogenem Recht:
    await prisma.rolePermission.deleteMany({
      where: {
        clubId: ctx.admin.clubId,
        permissionKey: "members:read_private",
        role: { key: "DEPARTMENT_LEAD" },
      },
    });
    const restricted = await contextFor(ctx.lead.user.id, ctx.admin.clubId);

    const { values, editable } = await getMemberForEdit(restricted, id);
    expect(editable.private).toBe(false);
    expect(values.birthDate).toBe("");
    expect(values.internalNotes).toBe("");

    await updateMember(
      restricted,
      id,
      input({
        departmentIds: [fussball.id],
        birthDate: "2000-12-12",
        internalNotes: "überschrieben",
      }),
    );
    const stored = await prisma.member.findUniqueOrThrow({ where: { id } });
    expect(stored.internalNotes).toBe("geheim");
    expect(stored.birthDate?.toISOString().slice(0, 10)).toBe("1990-01-01");
    void member;
  });
});

describe("Mandantentrennung im Service", () => {
  it("ein Administrator sieht und verändert keine Mitglieder eines anderen Vereins", async () => {
    const a = await setup();
    const b = await setup();
    const inB = await createMember(
      b.ctx.admin,
      input({ lastName: "Fremdverein", email: "b@example.org" }),
    );

    await expect(getMember(a.ctx.admin, inB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateMember(a.ctx.admin, inB.id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(archiveMember(a.ctx.admin, inB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteMember(a.ctx.admin, inB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      recordConsent(a.ctx.admin, {
        memberId: inB.id,
        type: "NEWSLETTER",
        granted: true,
        source: "paper",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getMemberHistory(a.ctx.admin, inB.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const list = await listMembers(a.ctx.admin, query({ q: "Fremdverein" }));
    expect(list.total).toBe(0);
    // Auch die Mitgliedsnummer eines anderen Vereins ist frei verfügbar (Nummern sind je Verein eindeutig).
    await createMember(b.ctx.admin, input({ memberNumber: "M-7777" }));
    await expect(
      createMember(a.ctx.admin, input({ memberNumber: "M-7777" })),
    ).resolves.toHaveProperty("id");
    // Abteilungen eines anderen Vereins lassen sich nicht zuordnen.
    await expect(
      createMember(a.ctx.admin, input({ departmentIds: [b.fussball.id] })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("die Statistik eines Vereins enthält nur eigene Mitglieder", async () => {
    const a = await setup();
    const b = await setup();
    await createMember(b.ctx.admin, input());
    await createMember(b.ctx.admin, input());
    const stats = await getMemberStats(a.ctx.admin);
    expect(stats.total).toBe(4); // 4 Benutzer-Mitglieder aus setup(), keine aus Verein B
  });
});

describe("Archivieren, Löschen, Wiederherstellen", () => {
  it("archivierte Mitglieder verschwinden aus der Standardliste und sind im Archiv auffindbar", async () => {
    const { ctx } = await setup();
    const { id } = await createMember(ctx.admin, input({ lastName: "Archiv" }));
    await archiveMember(ctx.admin, id);

    expect((await listMembers(ctx.admin, query({ q: "Archiv" }))).total).toBe(0);
    expect((await listMembers(ctx.admin, query({ q: "Archiv", view: "archived" }))).total).toBe(1);
    await restoreMember(ctx.admin, id);
    expect((await listMembers(ctx.admin, query({ q: "Archiv" }))).total).toBe(1);
  });

  it("Löschen erfordert vorheriges Archivieren und verschiebt in den Papierkorb", async () => {
    const { ctx } = await setup();
    const { id } = await createMember(ctx.admin, input({ lastName: "Papierkorb" }));

    await expect(deleteMember(ctx.admin, id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("archiviere"),
    });
    await archiveMember(ctx.admin, id);
    await deleteMember(ctx.admin, id);

    expect((await listMembers(ctx.admin, query({ q: "Papierkorb", view: "archived" }))).total).toBe(
      0,
    );
    expect((await listMembers(ctx.admin, query({ q: "Papierkorb", view: "trash" }))).total).toBe(1);
    // Die Daten werden nicht sofort vernichtet:
    expect(await prisma.member.count({ where: { id } })).toBe(1);

    await restoreFromTrash(ctx.admin, id);
    expect((await listMembers(ctx.admin, query({ q: "Papierkorb", view: "archived" }))).total).toBe(
      1,
    );
  });

  it("Austritt und Archivierung sperren das verknüpfte Benutzerkonto", async () => {
    const { ctx, member, club } = await setup();
    await updateMember(
      ctx.admin,
      member.member.id,
      input({
        firstName: member.member.firstName,
        lastName: member.member.lastName,
        status: "LEFT",
      }),
    );
    expect(
      (
        await prisma.clubMembership.findFirstOrThrow({
          where: { userId: member.user.id, clubId: club.id },
        })
      ).status,
    ).toBe("SUSPENDED");

    const other = await addUserToClub(club, "HELPER");
    await archiveMember(ctx.admin, other.member.id);
    expect(
      (
        await prisma.clubMembership.findFirstOrThrow({
          where: { userId: other.user.id, clubId: club.id },
        })
      ).status,
    ).toBe("SUSPENDED");
  });

  it("schützt den letzten Vereinsadministrator vor Sperrung, Archivierung und Löschung", async () => {
    const { ctx, admin } = await setup();
    await expect(archiveMember(ctx.admin, admin.member.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("letzte Vereinsadministrator"),
    });
    await expect(
      updateMember(
        ctx.admin,
        admin.member.id,
        input({
          firstName: admin.member.firstName,
          lastName: admin.member.lastName,
          status: "BLOCKED",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await prisma.clubMembership.findFirstOrThrow({ where: { userId: admin.user.id } })).status,
    ).toBe("ACTIVE");
  });

  it("gelöschte Mitglieder sind für Rollen ohne Löschrecht unsichtbar", async () => {
    const { ctx } = await setup();
    const { id } = await createMember(ctx.admin, input());
    await archiveMember(ctx.admin, id);
    await deleteMember(ctx.admin, id);
    await expect(getMember(ctx.board, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getMember(ctx.admin, id)).resolves.toHaveProperty("deletedAt");
  });
});

describe("Suchen, Filtern, Sortieren", () => {
  it("findet über Namensteile, Mitgliedsnummer und E-Mail (ohne Groß-/Kleinschreibung)", async () => {
    const { ctx } = await setup();
    await createMember(
      ctx.admin,
      input({
        firstName: "Jürgen",
        lastName: "Schulz-Müller",
        memberNumber: "M-5001",
        email: "juergen@verein.example",
      }),
    );
    await createMember(
      ctx.admin,
      input({ firstName: "Petra", lastName: "Schulz", memberNumber: "M-5002" }),
    );

    const names = async (q: string) =>
      (await listMembers(ctx.admin, query({ q }))).items.map((m) => m.lastName).sort();
    expect(await names("schulz")).toEqual(["Schulz", "Schulz-Müller"]);
    expect(await names("jürgen schulz")).toEqual(["Schulz-Müller"]); // mehrere Wörter: alle müssen passen
    expect(await names("M-5002")).toEqual(["Schulz"]);
    expect(await names("juergen@")).toEqual(["Schulz-Müller"]);
    expect(await names("gibt-es-nicht")).toEqual([]);
  });

  it("die Suche kann keine Kontaktdaten erraten, wenn dafür keine Berechtigung besteht", async () => {
    const { ctx, member } = await setup();
    const role = await prisma.role.findFirstOrThrow({
      where: { clubId: ctx.admin.clubId, key: "MEMBER" },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionKey: "members:read_contact" },
    });
    await prisma.rolePermission.updateMany({
      where: { roleId: role.id, permissionKey: "members:read" },
      data: { scope: "CLUB" },
    });
    await createMember(ctx.admin, input({ lastName: "Versteckt", email: "geheim@example.org" }));
    const restricted = await contextFor(member.user.id, ctx.admin.clubId);

    expect((await listMembers(restricted, query({ q: "geheim@" }))).total).toBe(0);
    expect((await listMembers(restricted, query({ q: "Versteckt" }))).total).toBe(1);
  });

  it("filtert nach Status und Abteilung, sortiert und blättert", async () => {
    const { ctx, fussball } = await setup();
    for (const [last, status] of [
      ["Adler", "ACTIVE"],
      ["Bauer", "PASSIVE"],
      ["Conrad", "HONORARY"],
      ["Dietz", "ACTIVE"],
    ] as const) {
      await createMember(
        ctx.admin,
        input({
          lastName: last,
          status,
          departmentIds: last === "Adler" || last === "Dietz" ? [fussball.id] : [],
        }),
      );
    }
    const lastNames = async (q: Partial<MemberListQuery>) =>
      (await listMembers(ctx.admin, query({ q: "", ...q }))).items.map((m) => m.lastName);

    // Die Abteilungsleiterin aus setup() gehört ebenfalls zu "Fußball".
    const lead = ctx.lead.user.lastName;
    expect(await lastNames({ status: "PASSIVE" })).toEqual(["Bauer"]);
    expect(await lastNames({ departmentId: fussball.id })).toEqual(["Adler", lead, "Dietz"]);
    expect(await lastNames({ status: "ACTIVE", departmentId: fussball.id, dir: "desc" })).toEqual([
      "Dietz",
      lead,
      "Adler",
    ]);

    const page1 = await listMembers(
      ctx.admin,
      query({ request: { page: 1, pageSize: 5, skip: 0 } }),
    );
    const page2 = await listMembers(
      ctx.admin,
      query({ request: { page: 2, pageSize: 5, skip: 5 } }),
    );
    expect(page1.items).toHaveLength(5);
    expect(page1.total).toBe(page1.total);
    expect(page1.pageCount).toBe(Math.ceil(page1.total / 5));
    expect(page2.items.length).toBe(page1.total - 5);
    expect(new Set([...page1.items, ...page2.items].map((m) => m.id)).size).toBe(page1.total);
  });

  it("ignoriert gefährliche Sucheingaben (Wildcards und SQL-Zeichen sind nur Text)", async () => {
    const { ctx } = await setup();
    await createMember(ctx.admin, input({ lastName: "Normal" }));
    for (const q of ['\'; DROP TABLE "Member"; --', "%", "_", "\\", '" OR 1=1']) {
      await expect(listMembers(ctx.admin, query({ q }))).resolves.toBeDefined();
    }
    expect((await listMembers(ctx.admin, query())).total).toBeGreaterThan(0);
  });
});

describe("Einwilligungen und Verlauf", () => {
  it("führt Einwilligungen als Protokoll; maßgeblich ist der neueste Eintrag", async () => {
    const { ctx } = await setup();
    const { id } = await createMember(ctx.admin, input());

    await recordConsent(ctx.admin, {
      memberId: id,
      type: "PHOTO_PUBLICATION",
      granted: true,
      source: "paper",
    });
    let detail = await getMember(ctx.admin, id);
    expect(detail.private?.consents).toEqual([
      expect.objectContaining({ type: "PHOTO_PUBLICATION", granted: true, source: "paper" }),
    ]);

    await recordConsent(ctx.admin, {
      memberId: id,
      type: "PHOTO_PUBLICATION",
      granted: false,
      source: "app",
    });
    detail = await getMember(ctx.admin, id);
    expect(detail.private?.consents).toEqual([
      expect.objectContaining({ type: "PHOTO_PUBLICATION", granted: false }),
    ]);
    expect(await prisma.consent.count({ where: { memberId: id } })).toBe(2); // Nachweis bleibt erhalten
  });

  it("Änderungsverlauf listet Ereignisse mit Bearbeiter, neueste zuerst", async () => {
    const { ctx, admin } = await setup();
    const { id } = await createMember(ctx.admin, input());
    await updateMember(ctx.board, id, input({ clubFunction: "Beisitzer" }));

    const history = await getMemberHistory(ctx.admin, id);
    expect(history.map((h) => h.action)).toEqual(["member.updated", "member.created"]);
    expect(history[1]?.actorName).toBe(`${admin.user.firstName} ${admin.user.lastName}`);
    await expect(getMemberHistory(ctx.member, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Statistik", () => {
  it("zählt nach Status, Abteilung, Eintrittsjahr und (mit Berechtigung) Altersgruppen", async () => {
    const { ctx, fussball } = await setup();
    const year = new Date().getUTCFullYear();
    await createMember(
      ctx.admin,
      input({
        status: "ACTIVE",
        joinedAt: `${year - 1}-03-01`,
        birthDate: `${year - 10}-06-01`,
        departmentIds: [fussball.id],
      }),
    );
    await createMember(
      ctx.admin,
      input({ status: "PASSIVE", joinedAt: `${year - 1}-04-01`, birthDate: `${year - 40}-06-01` }),
    );
    await archiveMember(ctx.admin, (await createMember(ctx.admin, input())).id); // archiviert → zählt nicht

    const stats = await getMemberStats(ctx.admin);
    expect(stats.total).toBe(6); // 4 aus setup() + 2 aktive
    expect(stats.byStatus.find((s) => s.status === "PASSIVE")?.count).toBe(1);
    // Fußball: das neue Mitglied und die Abteilungsleiterin aus setup().
    expect(stats.byDepartment).toEqual([expect.objectContaining({ name: "Fußball", count: 2 })]);
    expect(stats.joinedPerYear.find((y) => y.year === year - 1)?.count).toBe(2);
    expect(stats.ageGroups?.find((g) => g.label === "bis 13 Jahre")?.count).toBe(1);
    expect(stats.ageGroups?.find((g) => g.label === "30–49 Jahre")?.count).toBe(1);

    // Abteilungsleiter: nur die eigene Abteilung, keine vereinsweiten Altersgruppen.
    const leadStats = await getMemberStats(ctx.lead);
    expect(leadStats.ageGroups).toBeNull();
    expect(leadStats.total).toBe(2); // Leiter selbst + das Fußball-Mitglied
  });
});
