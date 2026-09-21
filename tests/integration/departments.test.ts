import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { departmentSchema, groupSchema } from "@/modules/departments/schemas";
import {
  addGroupMember,
  createDepartment,
  createGroup,
  deleteDepartment,
  deleteGroup,
  getDepartment,
  listDepartments,
  removeGroupMember,
  setDepartmentActive,
  setDepartmentLeader,
  updateDepartment,
  updateGroup,
} from "@/modules/departments/service";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment as createDepartmentRow,
  createEvent,
  createMember,
} from "../helpers/factories";

const dept = (name: string, extra: Record<string, unknown> = {}) =>
  departmentSchema.parse({ name, ...extra });
const group = (name: string, departmentId?: string) => groupSchema.parse({ name, departmentId });

async function setup() {
  const club = await createClub("Abteilungsverein");
  const fussball = await createDepartmentRow(club.id, "Fußball");
  const handball = await createDepartmentRow(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const helper = await addUserToClub(club, "HELPER");
  return {
    club,
    fussball,
    handball,
    people: { admin, board, lead, helper },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
    },
  };
}

describe("Abteilungen verwalten", () => {
  it("Vorstand legt Abteilungen an, ändert und (de)aktiviert sie", async () => {
    const { ctx } = await setup();
    const { id } = await createDepartment(
      ctx.board,
      dept("Tischtennis", { description: "Ligabetrieb", color: "#2563EB" }),
    );
    let detail = await getDepartment(ctx.board, id);
    expect(detail).toMatchObject({
      name: "Tischtennis",
      description: "Ligabetrieb",
      color: "#2563eb",
      isActive: true,
      memberCount: 0,
    });

    await updateDepartment(ctx.board, id, dept("Tischtennis (Herren)"));
    await setDepartmentActive(ctx.board, id, false);
    detail = await getDepartment(ctx.board, id);
    expect(detail).toMatchObject({ name: "Tischtennis (Herren)", isActive: false });
    expect((await listDepartments(ctx.board)).map((d) => d.name)).not.toContain(
      "Tischtennis (Herren)",
    );
    expect(
      (await listDepartments(ctx.board, { includeInactive: true })).map((d) => d.name),
    ).toContain("Tischtennis (Herren)");

    const actions = (
      await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })
    ).map((l) => l.action);
    expect(actions).toEqual(["department.created", "department.updated", "department.deactivated"]);
  });

  it("verhindert doppelte Namen (ohne Beachtung der Groß-/Kleinschreibung)", async () => {
    const { ctx } = await setup();
    await expect(createDepartment(ctx.board, dept("FUßBALL"))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { name: expect.any(Array) },
    });
    await expect(createDepartment(ctx.board, dept("handball"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("validiert Eingaben", () => {
    expect(departmentSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(departmentSchema.safeParse({ name: "Gültig", color: "rot" }).success).toBe(false);
    expect(departmentSchema.safeParse({ name: "Gültig", color: "#ff0000" }).success).toBe(true);
    expect(departmentSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });

  it("Löschen nur, wenn nichts mehr zugeordnet ist – sonst Konflikt mit Erklärung", async () => {
    const { ctx, club, fussball } = await setup();
    await expect(deleteDepartment(ctx.board, fussball.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("deaktiviere"),
    });

    const empty = await createDepartment(ctx.board, dept("Leer"));
    await deleteDepartment(ctx.board, empty.id);
    await expect(getDepartment(ctx.board, empty.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Auch eine Veranstaltung verhindert das Löschen.
    const withEvent = await createDepartment(ctx.board, dept("Mit Termin"));
    await createEvent(club.id, { departmentId: withEvent.id });
    await expect(deleteDepartment(ctx.board, withEvent.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("Abteilungsleiter pflegen nur die eigene Abteilung – anlegen, deaktivieren, löschen und Leitung bestimmen sind tabu", async () => {
    const { ctx, fussball, handball, people } = await setup();
    await updateDepartment(ctx.lead, fussball.id, dept("Fußball (Herren)"));
    expect((await getDepartment(ctx.lead, fussball.id)).name).toBe("Fußball (Herren)");

    await expect(
      updateDepartment(ctx.lead, handball.id, dept("Manipuliert")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createDepartment(ctx.lead, dept("Neu"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(setDepartmentActive(ctx.lead, fussball.id, false)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(deleteDepartment(ctx.lead, fussball.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      setDepartmentLeader(ctx.lead, {
        departmentId: fussball.id,
        memberId: people.lead.member.id,
        isLeader: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Helfer und Mitglieder dürfen nichts verwalten", async () => {
    const { ctx, fussball } = await setup();
    await expect(createDepartment(ctx.helper, dept("Neu"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateDepartment(ctx.helper, fussball.id, dept("Neu"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createGroup(ctx.helper, group("Gruppe", fussball.id))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Ansehen ist erlaubt.
    expect((await listDepartments(ctx.helper)).length).toBeGreaterThan(0);
  });
});

describe("Abteilungsleitung", () => {
  it("Vorstand bestimmt und entzieht die Leitung; sie erscheint in der Liste", async () => {
    const { ctx, club, handball } = await setup();
    const member = await createMember(club.id, { firstName: "Hanna", lastName: "Handball" });
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: member.id, departmentId: handball.id },
    });

    await setDepartmentLeader(ctx.board, {
      departmentId: handball.id,
      memberId: member.id,
      isLeader: true,
    });
    expect((await listDepartments(ctx.board)).find((d) => d.id === handball.id)?.leaders).toEqual([
      { id: member.id, name: "Hanna Handball" },
    ]);

    // Mit der Leitung ändern sich die Rechte im nächsten Kontext (ledDepartmentIds).
    const detail = await getDepartment(ctx.board, handball.id);
    expect(detail.members).toEqual([expect.objectContaining({ id: member.id, isLeader: true })]);

    await setDepartmentLeader(ctx.board, {
      departmentId: handball.id,
      memberId: member.id,
      isLeader: false,
    });
    expect((await listDepartments(ctx.board)).find((d) => d.id === handball.id)?.leaders).toEqual(
      [],
    );
  });

  it("verlangt, dass das Mitglied der Abteilung angehört", async () => {
    const { ctx, club, handball } = await setup();
    const outsider = await createMember(club.id);
    await expect(
      setDepartmentLeader(ctx.board, {
        departmentId: handball.id,
        memberId: outsider.id,
        isLeader: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("archivierte Mitglieder zählen nicht und sind keine Leitung mehr", async () => {
    const { ctx, club, fussball } = await setup();
    const before = (await listDepartments(ctx.board)).find((d) => d.id === fussball.id)!;
    const member = await createMember(club.id);
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: member.id, departmentId: fussball.id, isLeader: true },
    });
    expect((await listDepartments(ctx.board)).find((d) => d.id === fussball.id)?.memberCount).toBe(
      before.memberCount + 1,
    );

    await prisma.member.update({ where: { id: member.id }, data: { archivedAt: new Date() } });
    const after = (await listDepartments(ctx.board)).find((d) => d.id === fussball.id)!;
    expect(after.memberCount).toBe(before.memberCount);
    expect(after.leaders.map((l) => l.id)).not.toContain(member.id);
  });
});

describe("Gruppen", () => {
  it("Gruppen in Abteilungen: Leitung der Abteilung darf, andere nicht", async () => {
    const { ctx, fussball, handball } = await setup();
    const own = await createGroup(ctx.lead, group("1. Herren", fussball.id));
    await expect(createGroup(ctx.lead, group("Fremd", handball.id))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createGroup(ctx.lead, group("Vereinsweit"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await updateGroup(ctx.lead, own.id, { name: "1. Herrenmannschaft" });
    expect((await getDepartment(ctx.lead, fussball.id)).groups.map((g) => g.name)).toEqual([
      "1. Herrenmannschaft",
    ]);

    const foreign = await createGroup(ctx.board, group("Handball-Gruppe", handball.id));
    await expect(updateGroup(ctx.lead, foreign.id, { name: "Gekapert" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(deleteGroup(ctx.lead, foreign.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("vereinsweite Gruppen (ohne Abteilung) verwaltet nur der Vorstand", async () => {
    const { ctx } = await setup();
    const festausschuss = await createGroup(ctx.board, group("Festausschuss"));
    await expect(deleteGroup(ctx.lead, festausschuss.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await deleteGroup(ctx.board, festausschuss.id);
  });

  it("Mitglieder zu Gruppen hinzufügen und entfernen (idempotent, nur aktive Mitglieder)", async () => {
    const { ctx, club, fussball } = await setup();
    const { id } = await createGroup(ctx.lead, group("Trainer", fussball.id));
    const member = await createMember(club.id, { firstName: "Toni", lastName: "Trainer" });

    await addGroupMember(ctx.lead, { groupId: id, memberId: member.id });
    await addGroupMember(ctx.lead, { groupId: id, memberId: member.id }); // doppelt → keine Fehler
    let detail = await getDepartment(ctx.admin, fussball.id);
    expect(detail.groups[0]?.members).toEqual([
      { id: member.id, name: "Toni Trainer", isLead: false },
    ]);

    await removeGroupMember(ctx.lead, { groupId: id, memberId: member.id });
    detail = await getDepartment(ctx.admin, fussball.id);
    expect(detail.groups[0]?.members).toEqual([]);

    await prisma.member.update({ where: { id: member.id }, data: { archivedAt: new Date() } });
    await expect(
      addGroupMember(ctx.lead, { groupId: id, memberId: member.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Gruppen mit Aufgaben lassen sich nicht löschen", async () => {
    const { ctx, club, fussball } = await setup();
    const { id } = await createGroup(ctx.lead, group("Mit Aufgabe", fussball.id));
    await prisma.task.create({ data: { clubId: club.id, title: "Aufgabe", groupId: id } });
    await expect(deleteGroup(ctx.lead, id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("Sichtbarkeit der Mitglieder in Abteilungen und Mandantentrennung", () => {
  it("Mitglieder sehen die Abteilung, aber nur sich selbst in der Mitgliederliste", async () => {
    const { ctx, fussball, people } = await setup();
    const detail = await getDepartment(ctx.helper, fussball.id);
    expect(detail.members).toEqual([]); // Helfer gehört der Abteilung nicht an → sieht dort niemanden
    expect(detail.memberCount).toBeGreaterThan(0); // aber die Anzahl ist kein Geheimnis
    void people;
  });

  it("Abteilungsleiter sehen die Mitglieder ihrer Abteilung, nicht die anderer", async () => {
    const { ctx, fussball, handball, club } = await setup();
    const inFussball = await createMember(club.id, { lastName: "Fussballer" });
    const inHandball = await createMember(club.id, { lastName: "Handballer" });
    await prisma.memberDepartment.createMany({
      data: [
        { clubId: club.id, memberId: inFussball.id, departmentId: fussball.id },
        { clubId: club.id, memberId: inHandball.id, departmentId: handball.id },
      ],
    });
    expect((await getDepartment(ctx.lead, fussball.id)).members?.map((m) => m.name)).toContain(
      `${inFussball.lastName}, Max`,
    );
    expect((await getDepartment(ctx.lead, handball.id)).members).toEqual([]);
  });

  it("Abteilungen anderer Vereine sind nicht sichtbar und nicht änderbar", async () => {
    const a = await setup();
    const b = await setup();
    await expect(getDepartment(a.ctx.admin, b.fussball.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updateDepartment(a.ctx.admin, b.fussball.id, dept("Gekapert")),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteDepartment(a.ctx.admin, b.fussball.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      createGroup(a.ctx.admin, group("Fremde Gruppe", b.fussball.id)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listDepartments(a.ctx.admin)).map((d) => d.id)).not.toContain(b.fussball.id);
  });
});
