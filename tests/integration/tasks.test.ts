import { describe, expect, it } from "vitest";
import {
  addChecklistItem,
  createChecklist,
  deleteChecklist,
  listChecklists,
  removeChecklistItem,
  toggleChecklistItem,
} from "@/modules/tasks/checklists";
import { taskFormSchema, type TaskFormInput } from "@/modules/tasks/schemas";
import {
  createTask,
  deleteTask,
  getTask,
  getTaskFormOptions,
  getTaskStats,
  listMyOpenTasks,
  listTasks,
  setTaskStatus,
  updateTask,
  type TaskListQuery,
} from "@/modules/tasks/service";
import { prisma } from "@/server/db/client";
import { berlinDay } from "../helpers/dates";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
  createMember,
} from "../helpers/factories";

const day = (offset: number) => berlinDay(offset);
const first = { page: 1, pageSize: 25, skip: 0 };
const list = (
  view: TaskListQuery["view"] = "all",
  extra: Partial<TaskListQuery> = {},
): TaskListQuery => ({ view, request: first, ...extra });
const input = (over: Partial<TaskFormInput> = {}) =>
  taskFormSchema.parse({
    title: "Getränke bestellen",
    priority: "NORMAL",
    status: "OPEN",
    ...over,
  });

async function setup() {
  const club = await createClub("Aufgabenverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", {
    ledDepartmentIds: [fussball.id],
    firstName: "Lea",
    lastName: "Leitung",
  });
  const helper = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const member = await addUserToClub(club, "MEMBER", { firstName: "Max", lastName: "Mitglied" });
  // (Die Leiter-Zuordnung zur Abteilung Fußball legt addUserToClub über ledDepartmentIds bereits an.)
  // Helferin spielt Fußball, ein weiteres Mitglied Handball
  await prisma.memberDepartment.create({
    data: { clubId: club.id, memberId: helper.member.id, departmentId: fussball.id },
  });
  const handballer = await createMember(club.id, { firstName: "Hans", lastName: "Handball" });
  await prisma.memberDepartment.create({
    data: { clubId: club.id, memberId: handballer.id, departmentId: handball.id },
  });
  const eventF = await createEvent(club.id, { title: "Fußballturnier", departmentId: fussball.id });
  const eventH = await createEvent(club.id, {
    title: "Handballturnier",
    departmentId: handball.id,
  });
  const eventClub = await createEvent(club.id, { title: "Sommerfest" });
  const groupF = await prisma.group.create({
    data: { clubId: club.id, departmentId: fussball.id, name: "Jugend" },
  });
  return {
    club,
    fussball,
    handball,
    eventF,
    eventH,
    eventClub,
    groupF,
    handballer,
    people: { admin, board, lead, helper, member },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

const titles = async (
  ctx: Awaited<ReturnType<typeof setup>>["ctx"]["admin"],
  query: TaskListQuery = list(),
) => (await listTasks(ctx, query)).items.map((t) => t.title);

describe("Aufgaben anlegen", () => {
  it("Vereinsadministrator legt an; Zuständige werden benachrichtigt (nicht bei Selbstzuweisung); Protokoll", async () => {
    const { ctx, people, club } = await setup();
    const { id } = await createTask(
      ctx.admin,
      input({
        assigneeMemberId: people.helper.member.id,
        dueDate: day(3),
        description: "Bier, Softdrinks, Wasser",
      }),
    );

    const task = await getTask(ctx.admin, id);
    expect(task).toMatchObject({
      title: "Getränke bestellen",
      status: "OPEN",
      priority: "NORMAL",
      overdue: false,
      assignee: { name: "Hanna Helfer" },
      description: "Bier, Softdrinks, Wasser",
    });
    expect(task.dueDate!.toISOString().slice(0, 10)).toBe(day(3));

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: people.helper.user.id, type: "TASK_ASSIGNED" },
    });
    expect(note).toMatchObject({
      title: "Neue Aufgabe: Getränke bestellen",
      linkUrl: "/aufgaben",
      emailStatus: "PENDING",
    });
    expect(note.body).toMatch(/^Fällig am \d{2}\.\d{2}\.\d{4}$/);

    // Selbstzuweisung: keine Benachrichtigung
    await createTask(
      ctx.admin,
      input({ title: "Für mich", assigneeMemberId: people.admin.member.id }),
    );
    expect(await prisma.notification.count({ where: { userId: people.admin.user.id } })).toBe(0);

    expect(
      await prisma.auditLog.findFirst({
        where: { clubId: club.id, action: "task.created", entityId: id },
      }),
    ).toMatchObject({
      actorUserId: people.admin.user.id,
      summary: "Aufgabe „Getränke bestellen“ angelegt",
    });
    expect(await prisma.task.findUniqueOrThrow({ where: { id } })).toMatchObject({
      createdById: people.admin.user.id,
      completedAt: null,
    });
  });

  it("nur wer verwalten darf: Vorstand ja; Helfer und Mitglieder nein", async () => {
    const { ctx } = await setup();
    await expect(createTask(ctx.board, input())).resolves.toHaveProperty("id");
    await expect(createTask(ctx.helper, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTask(ctx.member, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Abteilungsleiter: nur für die eigene Abteilung (über Veranstaltung, Gruppe oder Person)", async () => {
    const { ctx, eventF, eventH, eventClub, groupF, people, handballer } = await setup();
    await expect(createTask(ctx.lead, input({ eventId: eventF.id }))).resolves.toHaveProperty("id");
    await expect(createTask(ctx.lead, input({ groupId: groupF.id }))).resolves.toHaveProperty("id");
    await expect(
      createTask(ctx.lead, input({ assigneeMemberId: people.helper.member.id })),
    ).resolves.toHaveProperty("id"); // Fußballerin
    for (const bad of [
      { eventId: eventH.id },
      { eventId: eventClub.id },
      { assigneeMemberId: handballer.id },
      {},
    ]) {
      await expect(createTask(ctx.lead, input(bad))).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { assigneeMemberId: [expect.stringContaining("deine Abteilung")] },
      });
    }
  });

  it("verweigert fremde, archivierte und unbekannte Verweise (Mandantentrennung)", async () => {
    const a = await setup();
    const b = await setup();
    const archived = await createMember(a.club.id, { firstName: "Archiv", lastName: "Ivar" });
    await prisma.member.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    const cases: [Partial<TaskFormInput>, string][] = [
      [{ assigneeMemberId: b.people.helper.member.id }, "assigneeMemberId"],
      [{ assigneeMemberId: archived.id }, "assigneeMemberId"],
      [{ eventId: b.eventClub.id }, "eventId"],
      [{ groupId: b.groupF.id }, "groupId"],
      [{ assigneeMemberId: "00000000-0000-0000-0000-000000000000" }, "assigneeMemberId"],
    ];
    for (const [over, field] of cases) {
      await expect(createTask(a.ctx.admin, input(over))).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { [field]: [expect.any(String)] },
      });
    }
    expect(await prisma.task.count({ where: { clubId: a.club.id } })).toBe(0);
  });

  it("Eingaben werden geprüft (Titel, Datum, Länge)", () => {
    expect(
      taskFormSchema.safeParse({ title: "x", priority: "NORMAL", status: "OPEN" }).success,
    ).toBe(false);
    expect(
      taskFormSchema.safeParse({
        title: "Gut",
        priority: "NORMAL",
        status: "OPEN",
        dueDate: "31.12.2026",
      }).success,
    ).toBe(false);
    expect(
      taskFormSchema.safeParse({
        title: "Gut",
        priority: "NORMAL",
        status: "OPEN",
        dueDate: "2026-02-31",
      }).success,
    ).toBe(false);
    expect(
      taskFormSchema.safeParse({ title: "Gut", priority: "DRINGEND", status: "OPEN" }).success,
    ).toBe(false);
    expect(
      taskFormSchema.safeParse({
        title: "Gut",
        priority: "NORMAL",
        status: "OPEN",
        description: "x".repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      taskFormSchema.safeParse({ title: "Gut", priority: "NORMAL", status: "OPEN", dueDate: "" })
        .success,
    ).toBe(true);
  });
});

describe("Aufgaben sehen", () => {
  it("Sichtbarkeit nach Reichweite: Verein, Abteilung, nur eigene – und nie fremde Vereine oder Gelöschtes", async () => {
    const { ctx, people, eventF, eventH, groupF, handballer } = await setup();
    const make = (title: string, over: Partial<TaskFormInput> = {}) =>
      createTask(ctx.admin, input({ title, ...over }));
    await make("Club-weit ohne Bezug");
    await make("Beim Fußballturnier", { eventId: eventF.id });
    await make("Beim Handballturnier", { eventId: eventH.id });
    await make("Für die Jugendgruppe", { groupId: groupF.id });
    await make("Für die Helferin", { assigneeMemberId: people.helper.member.id });
    await make("Für den Handballer", { assigneeMemberId: handballer.id });
    const deleted = await make("Gelöscht");
    await deleteTask(ctx.admin, deleted.id);

    expect((await titles(ctx.admin)).sort()).toEqual([
      "Beim Fußballturnier",
      "Beim Handballturnier",
      "Club-weit ohne Bezug",
      "Für den Handballer",
      "Für die Helferin",
      "Für die Jugendgruppe",
    ]);
    expect(await titles(ctx.board)).toHaveLength(6);
    // Abteilungsleiter (Fußball): eigene Abteilung über Veranstaltung, Gruppe und Person
    expect((await titles(ctx.lead)).sort()).toEqual([
      "Beim Fußballturnier",
      "Für die Helferin",
      "Für die Jugendgruppe",
    ]);
    // Helferin: nur die ihr zugewiesene
    expect(await titles(ctx.helper)).toEqual(["Für die Helferin"]);
    // Mitglied: keine Aufgaben-Berechtigung
    await expect(listTasks(ctx.member, list())).rejects.toMatchObject({ code: "FORBIDDEN" });

    const other = await setup();
    expect(await titles(other.ctx.admin)).toEqual([]);
  });

  it("Selbst angelegte Aufgaben sieht der Abteilungsleiter auch ohne Abteilungsbezug nicht mehr – nur solche mit Bezug oder eigene Zuweisung/Erstellung", async () => {
    const { ctx, eventF, people } = await setup();
    const own = await createTask(
      ctx.lead,
      input({ title: "Von mir angelegt", eventId: eventF.id }),
    );
    // Der Bezug entfällt später (Veranstaltung wird gewechselt) – die selbst angelegte Aufgabe bleibt für den Ersteller sichtbar.
    const other = await createTask(ctx.admin, input({ title: "Fremd, ohne Bezug" }));
    expect(await titles(ctx.lead)).toEqual(["Von mir angelegt"]);
    await expect(getTask(ctx.lead, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.task.update({ where: { id: own.id }, data: { eventId: null } });
    expect(await titles(ctx.lead)).toEqual(["Von mir angelegt"]);
    void people;
  });

  it("Aufgaben anderer Vereine sind per ID nicht abrufbar", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await createTask(b.ctx.admin, input({ title: "Geheim in Verein B" }));
    await expect(getTask(a.ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setTaskStatus(a.ctx.admin, id, "DONE")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteTask(a.ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateTask(a.ctx.admin, id, input())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });

  it("interne Notizen sehen nur Verwalter", async () => {
    const { ctx, people } = await setup();
    const { id } = await createTask(
      ctx.admin,
      input({ assigneeMemberId: people.helper.member.id, notes: "Nur für uns" }),
    );
    expect((await getTask(ctx.admin, id)).notes).toBe("Nur für uns");
    expect((await getTask(ctx.helper, id)).notes).toBeNull();
    expect(JSON.stringify(await listTasks(ctx.helper, list()))).not.toContain("Nur für uns");
  });
});

describe("Filter, Sortierung, Kennzahlen", () => {
  it("filtert nach Ansicht, Priorität, Zuständigkeit, Veranstaltung, Überfälligkeit und Text", async () => {
    const { ctx, people, eventF } = await setup();
    const make = (title: string, over: Partial<TaskFormInput> = {}) =>
      createTask(ctx.admin, input({ title, ...over }));
    await make("Alt und offen", {
      dueDate: day(-3),
      priority: "HIGH",
      assigneeMemberId: people.admin.member.id,
    });
    await make("Bald fällig", {
      dueDate: day(2),
      priority: "URGENT",
      eventId: eventF.id,
      description: "Plakate hängen",
    });
    await make("Ohne Termin", { assigneeMemberId: people.admin.member.id });
    await make("Erledigt", { status: "DONE", dueDate: day(-10) });
    await make("In Arbeit", { status: "IN_PROGRESS", dueDate: day(10) });

    expect(await titles(ctx.admin, list("open"))).toEqual([
      "Alt und offen",
      "Bald fällig",
      "In Arbeit",
      "Ohne Termin",
    ]); // fällige zuerst, ohne Termin zuletzt
    expect(await titles(ctx.admin, list("done"))).toEqual(["Erledigt"]);
    expect(await titles(ctx.admin, list("all"))).toHaveLength(5);
    expect(await titles(ctx.admin, list("all", { priority: "URGENT" }))).toEqual(["Bald fällig"]);
    expect((await titles(ctx.admin, list("open", { assignee: "me" }))).sort()).toEqual([
      "Alt und offen",
      "Ohne Termin",
    ]);
    expect((await titles(ctx.admin, list("open", { assignee: "none" }))).sort()).toEqual([
      "Bald fällig",
      "In Arbeit",
    ]);
    expect(
      await titles(ctx.admin, list("all", { assignee: people.admin.member.id, priority: "HIGH" })),
    ).toEqual(["Alt und offen"]);
    expect(await titles(ctx.admin, list("all", { eventId: eventF.id }))).toEqual(["Bald fällig"]);
    expect(await titles(ctx.admin, list("all", { overdueOnly: true }))).toEqual(["Alt und offen"]); // Erledigtes ist nie überfällig
    expect(await titles(ctx.admin, list("all", { q: "plakate" }))).toEqual(["Bald fällig"]); // Beschreibung, ohne Groß-/Kleinschreibung

    const overdue = (await listTasks(ctx.admin, list("all"))).items;
    expect(overdue.find((t) => t.title === "Alt und offen")!.overdue).toBe(true);
    expect(overdue.find((t) => t.title === "Erledigt")!.overdue).toBe(false);
  });

  it("Seitenwechsel und Kennzahlen im Rahmen der Sichtbarkeit", async () => {
    const { ctx, people } = await setup();
    for (let index = 0; index < 5; index += 1)
      await createTask(
        ctx.admin,
        input({
          title: `Aufgabe ${index}`,
          dueDate: day(index),
          assigneeMemberId: index < 2 ? people.helper.member.id : undefined,
        }),
      );
    await createTask(
      ctx.admin,
      input({ title: "Überfällig", dueDate: day(-1), assigneeMemberId: people.helper.member.id }),
    );
    await createTask(
      ctx.admin,
      input({ title: "Fertig", status: "DONE", assigneeMemberId: people.helper.member.id }),
    );

    const page2 = await listTasks(ctx.admin, {
      view: "open",
      request: { page: 2, pageSize: 4, skip: 4 },
    });
    expect(page2).toMatchObject({ total: 6, pageCount: 2 });
    expect(page2.items).toHaveLength(2);

    expect(await getTaskStats(ctx.admin)).toEqual({ open: 6, overdue: 1, mineOpen: 0 });
    expect(await getTaskStats(ctx.helper)).toEqual({ open: 3, overdue: 1, mineOpen: 3 }); // nur die eigenen
    expect((await listMyOpenTasks(ctx.helper)).map((t) => t.title)).toEqual([
      "Überfällig",
      "Aufgabe 0",
      "Aufgabe 1",
    ]);
    expect(await listMyOpenTasks(ctx.admin)).toEqual([]);
  });

  it("Formular-Auswahllisten: Abteilungsleiter sehen nur ihre Abteilung, Helfer nichts", async () => {
    const { ctx, handballer, people } = await setup();
    const admin = await getTaskFormOptions(ctx.admin);
    expect(admin.members.map((m) => m.name)).toContain("Handball, Hans");
    expect(admin.events.map((e) => e.title).sort()).toEqual([
      "Fußballturnier",
      "Handballturnier",
      "Sommerfest",
    ]);

    const lead = await getTaskFormOptions(ctx.lead);
    expect(lead.members.map((m) => m.id).sort()).toEqual(
      [people.lead.member.id, people.helper.member.id].sort(),
    );
    expect(lead.members.some((m) => m.id === handballer.id)).toBe(false);
    expect(lead.events.map((e) => e.title)).toEqual(["Fußballturnier"]);
    expect(lead.events[0]?.startsAt).toBeInstanceOf(Date); // für das Datum in der Auswahlliste
    expect(lead.groups.map((g) => g.name)).toEqual(["Jugend"]);
    expect(await getTaskFormOptions(ctx.helper)).toEqual({ members: [], events: [], groups: [] });
  });
});

describe("Aufgaben ändern", () => {
  it("Status: Zuständige ändern den Status ihrer Aufgaben; Erledigt setzt/löscht den Zeitpunkt; Protokoll; keine Doppel-Einträge", async () => {
    const { ctx, people, club } = await setup();
    const mine = await createTask(
      ctx.admin,
      input({ title: "Meine", assigneeMemberId: people.helper.member.id }),
    );
    const foreign = await createTask(
      ctx.admin,
      input({ title: "Fremde", assigneeMemberId: people.admin.member.id }),
    );

    await setTaskStatus(ctx.helper, mine.id, "DONE");
    expect(await prisma.task.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({
      status: "DONE",
      completedAt: expect.any(Date),
    });
    await setTaskStatus(ctx.helper, mine.id, "DONE"); // unverändert → kein zweiter Eintrag
    await setTaskStatus(ctx.helper, mine.id, "IN_PROGRESS");
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: mine.id } })).completedAt,
    ).toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "task.status_changed", entityId: mine.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.changes)).toEqual([
      { status: { from: "OPEN", to: "DONE" } },
      { status: { from: "DONE", to: "IN_PROGRESS" } },
    ]);

    // Fremde Aufgabe ist für die Helferin unsichtbar → "nicht gefunden"
    await expect(setTaskStatus(ctx.helper, foreign.id, "DONE")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Administratoren dürfen jede
    await expect(setTaskStatus(ctx.admin, foreign.id, "BLOCKED")).resolves.toBeUndefined();
    // Mitglieder ohne Aufgabenrecht nicht
    await expect(setTaskStatus(ctx.member, mine.id, "DONE")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("sichtbar, aber nicht verwaltbar: Helfer sehen ihre Aufgabe, dürfen sie aber nicht bearbeiten oder löschen", async () => {
    const { ctx, people } = await setup();
    const { id } = await createTask(
      ctx.admin,
      input({ assigneeMemberId: people.helper.member.id }),
    );
    expect((await getTask(ctx.helper, id)).can).toEqual({ edit: false, setStatus: true });
    await expect(updateTask(ctx.helper, id, input({ title: "Umbenannt" }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(deleteTask(ctx.helper, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getTask(ctx.admin, id)).can).toEqual({ edit: true, setStatus: true });
  });

  it("Bearbeiten: Änderungen im Protokoll (ohne Beschreibungstext), Neuzuweisung benachrichtigt die neue Person", async () => {
    const { ctx, people, club } = await setup();
    const { id } = await createTask(
      ctx.admin,
      input({ assigneeMemberId: people.helper.member.id, description: "Vertraulicher Text" }),
    );
    await updateTask(
      ctx.admin,
      id,
      input({
        title: "Neuer Titel",
        priority: "URGENT",
        assigneeMemberId: people.board.member.id,
        description: "Anderer vertraulicher Text",
        dueDate: day(5),
      }),
    );

    const task = await getTask(ctx.admin, id);
    expect(task).toMatchObject({
      title: "Neuer Titel",
      priority: "URGENT",
      assignee: { name: "Bernd Vorstand" },
    });
    expect(
      await prisma.notification.count({
        where: { userId: people.board.user.id, type: "TASK_ASSIGNED" },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: people.helper.user.id, type: "TASK_ASSIGNED" },
      }),
    ).toBe(1); // nur die ursprüngliche

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "task.updated", entityId: id },
    });
    expect(JSON.stringify(audit.changes)).toContain("Neuer Titel");
    expect(JSON.stringify(audit.changes)).not.toContain("vertraulicher Text"); // Freitext bleibt maskiert
    expect(JSON.stringify(audit.changes)).toContain("Bernd Vorstand");

    // Gleiche Zuständige beim Bearbeiten → keine erneute Benachrichtigung
    await updateTask(
      ctx.admin,
      id,
      input({ title: "Nochmal", assigneeMemberId: people.board.member.id }),
    );
    expect(
      await prisma.notification.count({
        where: { userId: people.board.user.id, type: "TASK_ASSIGNED" },
      }),
    ).toBe(1);
  });

  it("Löschen ist weich: weg aus Listen und Kennzahlen, Datensatz bleibt; Protokoll", async () => {
    const { ctx, club } = await setup();
    const { id } = await createTask(ctx.admin, input());
    await deleteTask(ctx.admin, id);
    expect(await titles(ctx.admin)).toEqual([]);
    expect((await getTaskStats(ctx.admin)).open).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).deletedAt).toBeInstanceOf(Date);
    expect(
      await prisma.auditLog.count({
        where: { clubId: club.id, action: "task.deleted", entityId: id },
      }),
    ).toBe(1);
    await expect(getTask(ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteTask(ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Abteilungsleiter dürfen nur Aufgaben ihrer Abteilung ändern, löschen und nicht in fremde verschieben", async () => {
    const { ctx, eventF, eventH } = await setup();
    const mine = await createTask(ctx.admin, input({ title: "Fußball", eventId: eventF.id }));
    await expect(
      updateTask(ctx.lead, mine.id, input({ title: "Fußball neu", eventId: eventF.id })),
    ).resolves.toBeUndefined();
    await expect(
      updateTask(ctx.lead, mine.id, input({ title: "Rausgeschoben", eventId: eventH.id })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteTask(ctx.lead, mine.id)).resolves.toBeUndefined();

    const foreign = await createTask(ctx.admin, input({ title: "Handball", eventId: eventH.id }));
    await expect(updateTask(ctx.lead, foreign.id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    }); // nicht einmal sichtbar
  });
});

describe("Checklisten", () => {
  it("anlegen, Punkte hinzufügen/abhaken/entfernen, Fortschritt, löschen", async () => {
    const { ctx, eventClub, people } = await setup();
    const { id } = await createChecklist(ctx.admin, {
      title: "Vorbereitung Sommerfest",
      eventId: eventClub.id,
    });
    const a = await addChecklistItem(ctx.admin, { checklistId: id, text: "Zelte reservieren" });
    const b = await addChecklistItem(ctx.admin, {
      checklistId: id,
      text: "Plakate drucken",
      assigneeMemberId: people.helper.member.id,
      dueDate: day(5),
    });
    await addChecklistItem(ctx.admin, { checklistId: id, text: "Getränke bestellen" });

    await toggleChecklistItem(ctx.admin, a.id, true);
    let [checklist] = await listChecklists(ctx.admin, { eventId: eventClub.id });
    expect(checklist).toMatchObject({
      title: "Vorbereitung Sommerfest",
      done: 1,
      canManage: true,
      event: { title: "Sommerfest" },
    });
    expect(checklist!.items.map((i) => [i.text, i.isDone])).toEqual([
      ["Zelte reservieren", true],
      ["Plakate drucken", false],
      ["Getränke bestellen", false],
    ]); // Reihenfolge bleibt
    expect(checklist!.items[1]).toMatchObject({ assignee: { name: "Hanna Helfer" } });
    expect(await prisma.checklistItem.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      doneById: people.admin.user.id,
      doneAt: expect.any(Date),
    });

    await toggleChecklistItem(ctx.admin, a.id, false);
    expect(
      (await prisma.checklistItem.findUniqueOrThrow({ where: { id: a.id } })).doneAt,
    ).toBeNull();
    await removeChecklistItem(ctx.admin, b.id);
    [checklist] = await listChecklists(ctx.admin);
    expect(checklist!.items).toHaveLength(2);

    await deleteChecklist(ctx.admin, id);
    expect(await listChecklists(ctx.admin)).toEqual([]);
    expect((await prisma.checklist.findUniqueOrThrow({ where: { id } })).deletedAt).toBeInstanceOf(
      Date,
    );
    await expect(
      addChecklistItem(ctx.admin, { checklistId: id, text: "Nachträglich" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Rechte: Helfer sehen keine Checklisten; Abteilungsleiter nur die ihrer Veranstaltungen; Vorstand alle", async () => {
    const { ctx, eventF, eventH, eventClub } = await setup();
    const own = await createChecklist(ctx.admin, { title: "Fußball-Liste", eventId: eventF.id });
    await createChecklist(ctx.admin, { title: "Handball-Liste", eventId: eventH.id });
    await createChecklist(ctx.admin, { title: "Vereinsliste", eventId: eventClub.id });
    await createChecklist(ctx.admin, { title: "Allgemein" });

    expect((await listChecklists(ctx.board)).map((l) => l.title).sort()).toEqual([
      "Allgemein",
      "Fußball-Liste",
      "Handball-Liste",
      "Vereinsliste",
    ]);
    expect((await listChecklists(ctx.lead)).map((l) => l.title)).toEqual(["Fußball-Liste"]);
    await expect(listChecklists(ctx.helper)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listChecklists(ctx.member)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      addChecklistItem(ctx.lead, { checklistId: own.id, text: "Bälle aufpumpen" }),
    ).resolves.toHaveProperty("id");
    await expect(
      createChecklist(ctx.lead, { title: "Neu", eventId: eventF.id }),
    ).resolves.toHaveProperty("id");
    await expect(
      createChecklist(ctx.lead, { title: "Fremd", eventId: eventH.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createChecklist(ctx.lead, { title: "Ohne Veranstaltung" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createChecklist(ctx.helper, { title: "Nein" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("Mandantentrennung: fremde Checklisten und Punkte sind unerreichbar", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await createChecklist(b.ctx.admin, { title: "Verein B" });
    const item = await addChecklistItem(b.ctx.admin, { checklistId: id, text: "Geheim" });
    expect(await listChecklists(a.ctx.admin)).toEqual([]);
    await expect(
      addChecklistItem(a.ctx.admin, { checklistId: id, text: "Eindringling" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(toggleChecklistItem(a.ctx.admin, item.id, true)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(removeChecklistItem(a.ctx.admin, item.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteChecklist(a.ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createChecklist(a.ctx.admin, { title: "Mit fremder Veranstaltung", eventId: b.eventClub.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.checklistItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      isDone: false,
    });
  });

  it("Grenzen: höchstens 200 Punkte je Liste, gültige Mitglieder und Termine", async () => {
    const { ctx, club, handballer } = await setup();
    const { id } = await createChecklist(ctx.admin, { title: "Groß" });
    await prisma.checklistItem.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        clubId: club.id,
        checklistId: id,
        text: `Punkt ${index}`,
        position: index,
      })),
    });
    await expect(
      addChecklistItem(ctx.admin, { checklistId: id, text: "Zu viel" }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { text: [expect.stringContaining("200")] },
    });

    const small = await createChecklist(ctx.admin, { title: "Klein" });
    await expect(
      addChecklistItem(ctx.admin, {
        checklistId: small.id,
        text: "Ok",
        assigneeMemberId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      addChecklistItem(ctx.admin, { checklistId: small.id, text: "Ok", dueDate: "2026-02-31" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      addChecklistItem(ctx.admin, {
        checklistId: small.id,
        text: "Ok",
        assigneeMemberId: handballer.id,
      }),
    ).resolves.toHaveProperty("id");
  });
});
