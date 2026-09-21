import { describe, expect, it } from "vitest";
import { addBerlinDays, parseBerlinDateTime, toDateInputValue } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import {
  assignMember,
  confirmPlannedHours,
  createShift,
  deleteShift,
  exportShiftPlanCsv,
  getHoursOverview,
  getShiftForEdit,
  getStaffingOverview,
  listAssignableMembers,
  listMyAssignments,
  listOpenShifts,
  listShiftsForEvent,
  recordHours,
  signOut,
  signUp,
  unassignMember,
  updateShift,
} from "@/modules/shifts/service";
import { shiftFormSchema, type ShiftFormInput } from "@/modules/shifts/schemas";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent as createEventRow,
  createMember,
  createShift as createShiftRow,
} from "../helpers/factories";

const H = 3_600_000;
const inDays = (n: number) => toDateInputValue(addBerlinDays(new Date(), n));

const shiftInput = (overrides: Partial<ShiftFormInput> = {}) =>
  shiftFormSchema.parse({
    title: "Getränkestand",
    date: inDays(10),
    startTime: "12:00",
    endTime: "15:00",
    requiredCount: 3,
    status: "OPEN",
    ...overrides,
  });

async function setup() {
  const club = await createClub("Schichtverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const helper = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const helper2 = await addUserToClub(club, "HELPER", { firstName: "Heinz", lastName: "Helfer" });
  const member = await addUserToClub(club, "MEMBER");
  const event = await createEventRow(club.id, {
    title: "Sommerfest",
    startsAt: parseBerlinDateTime(inDays(10), "10:00")!,
    endsAt: parseBerlinDateTime(inDays(10), "22:00")!,
  });
  return {
    club,
    fussball,
    handball,
    event,
    people: { admin, board, lead, helper, helper2, member },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
      helper2: await contextFor(helper2.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}
const notes = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("Schichten anlegen und ändern", () => {
  it("Vorstand legt eine Schicht an, ändert sie und löscht sie", async () => {
    const { ctx, event } = await setup();
    const { id } = await createShift(
      ctx.board,
      event.id,
      shiftInput({ taskName: "Getränke ausschenken", meetingPoint: "Eingang", minAge: 16 }),
    );

    let plan = await listShiftsForEvent(ctx.board, event.id);
    expect(plan.shifts).toHaveLength(1);
    expect(plan.shifts[0]).toMatchObject({
      title: "Getränkestand",
      requiredCount: 3,
      filled: 0,
      minAge: 16,
      meetingPoint: "Eingang",
      health: { fill: "EMPTY", freeSpots: 3 },
    });

    await updateShift(ctx.board, id, shiftInput({ title: "Bierstand", requiredCount: 5 }));
    plan = await listShiftsForEvent(ctx.board, event.id);
    expect(plan.shifts[0]).toMatchObject({ title: "Bierstand", requiredCount: 5 });

    await deleteShift(ctx.board, id);
    expect((await listShiftsForEvent(ctx.board, event.id)).shifts).toHaveLength(0);
    const actions = (
      await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.action);
    expect(actions).toEqual(["shift.created", "shift.updated", "shift.deleted"]);
  });

  it("nur Berechtigte legen Schichten an; Abteilungsleiter nur für Veranstaltungen ihrer Abteilung", async () => {
    const { ctx, club, event, fussball, handball } = await setup();
    await expect(createShift(ctx.helper, event.id, shiftInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createShift(ctx.member, event.id, shiftInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(createShift(ctx.lead, event.id, shiftInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
    }); // Verein-weite Veranstaltung

    const own = await createEventRow(club.id, { title: "Training", departmentId: fussball.id });
    const foreign = await createEventRow(club.id, { title: "Turnier", departmentId: handball.id });
    await expect(createShift(ctx.lead, own.id, shiftInput())).resolves.toHaveProperty("id");
    await expect(createShift(ctx.lead, foreign.id, shiftInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("validiert Eingaben und lehnt Schichten für abgesagte Veranstaltungen ab", async () => {
    const { ctx, event } = await setup();
    await expect(
      createShift(ctx.board, event.id, shiftInput({ responsibleMemberId: "gibt-es-nicht" })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await prisma.event.update({ where: { id: event.id }, data: { status: "CANCELLED" } });
    await expect(createShift(ctx.board, event.id, shiftInput())).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("verbietet, die Helferzahl unter die bereits Eingetragenen zu senken", async () => {
    const { ctx, event } = await setup();
    const { id } = await createShift(ctx.board, event.id, shiftInput({ requiredCount: 3 }));
    await signUp(ctx.helper, id);
    await signUp(ctx.helper2, id);
    await expect(
      updateShift(ctx.board, id, shiftInput({ requiredCount: 1 })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { requiredCount: [expect.stringContaining("bereits 2")] },
    });
    await expect(
      updateShift(ctx.board, id, shiftInput({ requiredCount: 2 })),
    ).resolves.toBeUndefined();
  });

  it("Zeitänderung: benachrichtigt Eingetragene und verhindert neue Überschneidungen", async () => {
    const { ctx, event, people } = await setup();
    const a = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Schicht A", startTime: "10:00", endTime: "12:00" }),
    );
    const b = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Schicht B", startTime: "13:00", endTime: "15:00" }),
    );
    await signUp(ctx.helper, a.id);
    await signUp(ctx.helper, b.id);

    // B soll nach 11:00 beginnen → würde A überlappen, in die Helferin eingetragen ist.
    await expect(
      updateShift(
        ctx.board,
        b.id,
        shiftInput({ title: "Schicht B", startTime: "11:00", endTime: "14:00" }),
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Hanna Helfer"),
    });
    const before = (await notes(people.helper.user.id)).length;
    await updateShift(
      ctx.board,
      b.id,
      shiftInput({
        title: "Schicht B",
        startTime: "14:00",
        endTime: "16:00",
        meetingPoint: "Neuer Treffpunkt",
      }),
    );
    const last = (await notes(people.helper.user.id)).at(-1);
    expect((await notes(people.helper.user.id)).length).toBe(before + 1);
    expect(last).toMatchObject({
      type: "SHIFT_CHANGED",
      emailStatus: "PENDING",
      body: expect.stringContaining("Neuer Treffpunkt"),
    });
  });

  it("Löschen trägt Eingetragene aus und benachrichtigt sie", async () => {
    const { ctx, event, people } = await setup();
    const { id } = await createShift(ctx.board, event.id, shiftInput());
    await signUp(ctx.helper, id);
    await deleteShift(ctx.board, id);
    expect((await notes(people.helper.user.id)).at(-1)).toMatchObject({
      type: "SHIFT_CANCELLED",
      emailStatus: "PENDING",
    });
    expect(
      await prisma.shiftAssignment.count({ where: { shiftId: id, status: "CONFIRMED" } }),
    ).toBe(0);
    expect((await listMyAssignments(ctx.helper)).length).toBe(0);
  });

  it("liefert die Werte zum Bearbeiten samt Ortszeit", async () => {
    const { ctx, event } = await setup();
    const { id } = await createShift(
      ctx.board,
      event.id,
      shiftInput({ startTime: "09:30", endTime: "11:00", date: "2026-07-15" }),
    );
    const edit = await getShiftForEdit(ctx.board, id);
    expect(edit.values).toMatchObject({
      date: "2026-07-15",
      startTime: "09:30",
      endTime: "11:00",
      requiredCount: 3,
      status: "OPEN",
    });
  });
});

describe("Eintragen und Austragen – Überbuchung", () => {
  it("trägt Mitglieder ein und aus; der Platz wird wieder frei", async () => {
    const { ctx, event } = await setup();
    const { id } = await createShift(ctx.board, event.id, shiftInput({ requiredCount: 1 }));

    await signUp(ctx.helper, id);
    let plan = await listShiftsForEvent(ctx.member, event.id);
    expect(plan.shifts[0]).toMatchObject({
      filled: 1,
      health: { fill: "FULL", freeSpots: 0 },
      signup: { allowed: false, reason: expect.stringContaining("voll besetzt") },
    });
    expect(plan.shifts[0]?.assignments.map((a) => a.name)).toEqual(["Hanna Helfer"]);

    await expect(signUp(ctx.member, id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("voll besetzt"),
    });
    await signOut(ctx.helper, id);
    await expect(signUp(ctx.member, id)).resolves.toBeUndefined();
    plan = await listShiftsForEvent(ctx.helper, event.id);
    expect(plan.shifts[0]?.assignments.map((a) => a.isMe)).toEqual([false]);
  });

  it("verhindert Überbuchung bei vielen gleichzeitigen Eintragungen (Datenbank als letzte Instanz)", async () => {
    const { ctx, club, event } = await setup();
    const { id } = await createShift(ctx.board, event.id, shiftInput({ requiredCount: 2 }));
    const contexts = await Promise.all(
      Array.from({ length: 8 }, async () =>
        contextFor((await addUserToClub(club, "HELPER")).user.id, club.id),
      ),
    );

    const results = await Promise.allSettled(contexts.map((c) => signUp(c, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const rejected of results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    )) {
      expect(rejected.reason).toMatchObject({
        code: "CONFLICT",
        message: expect.stringMatching(/voll besetzt/),
      }); // verständlich, kein Datenbankfehler
    }
    expect(
      await prisma.shiftAssignment.count({ where: { shiftId: id, status: "CONFIRMED" } }),
    ).toBe(2);
  });

  it("Mehrfach-Eintragung ist idempotent-freundlich (bereits eingetragen → Hinweis)", async () => {
    const { ctx, event } = await setup();
    const { id } = await createShift(ctx.board, event.id, shiftInput());
    await signUp(ctx.helper, id);
    await expect(signUp(ctx.helper, id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("bereits eingetragen"),
    });
    expect(await prisma.shiftAssignment.count({ where: { shiftId: id } })).toBe(1);
  });

  it("geschlossene, abgesagte und begonnene Schichten sowie nicht veröffentlichte Veranstaltungen lassen keine Eintragung zu", async () => {
    const { ctx, club, event } = await setup();
    const closed = await createShift(ctx.board, event.id, shiftInput({ status: "CLOSED" }));
    await expect(signUp(ctx.helper, closed.id)).rejects.toMatchObject({
      message: expect.stringContaining("geschlossen"),
    });

    const started = await createShiftRow(club.id, event.id, {
      startsAt: new Date(Date.now() - H),
      endsAt: new Date(Date.now() + 2 * H),
    });
    await expect(signUp(ctx.helper, started.id)).rejects.toMatchObject({
      message: expect.stringContaining("begonnen"),
    });

    const draft = await createEventRow(club.id, { title: "Entwurf" });
    await prisma.event.update({ where: { id: draft.id }, data: { status: "DRAFT" } });
    const draftShift = await createShiftRow(club.id, draft.id);
    await expect(signUp(ctx.helper, draftShift.id)).rejects.toMatchObject({ code: "NOT_FOUND" }); // Entwurf unsichtbar

    const open = await createShift(ctx.board, event.id, shiftInput());
    await prisma.event.update({ where: { id: event.id }, data: { status: "CANCELLED" } });
    await expect(signUp(ctx.helper, open.id)).rejects.toMatchObject({
      message: expect.stringContaining("nicht (mehr) veröffentlicht"),
    });
  });

  it("Austragen ist nur bis zum Beginn möglich", async () => {
    const { ctx, club, event } = await setup();
    const shift = await createShiftRow(club.id, event.id, {
      startsAt: new Date(Date.now() + H),
      endsAt: new Date(Date.now() + 3 * H),
    });
    await signUp(ctx.helper, shift.id);
    await prisma.eventShift.update({
      where: { id: shift.id },
      data: { startsAt: new Date(Date.now() - H) },
    });
    await expect(signOut(ctx.helper, shift.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("begonnen"),
    });
  });

  it("Mindestalter: nur mit Geburtsdatum und ausreichendem Alter", async () => {
    const { ctx, event, people } = await setup();
    const { id } = await createShift(ctx.board, event.id, shiftInput({ minAge: 18 }));

    await expect(signUp(ctx.helper, id)).rejects.toMatchObject({
      message: expect.stringContaining("kein Geburtsdatum"),
    });
    await prisma.member.update({
      where: { id: people.helper.member.id },
      data: { birthDate: new Date(`${new Date().getUTCFullYear() - 16}-01-01`) },
    });
    await expect(signUp(ctx.helper, id)).rejects.toMatchObject({
      message: expect.stringContaining("mindestens 18"),
    });
    await prisma.member.update({
      where: { id: people.helper.member.id },
      data: { birthDate: new Date(`${new Date().getUTCFullYear() - 30}-01-01`) },
    });
    await expect(signUp(ctx.helper, id)).resolves.toBeUndefined();
  });
});

describe("Doppelbelegung und Konflikte", () => {
  it("verhindert überschneidende Schichten mit Hinweis auf die andere Schicht", async () => {
    const { ctx, event } = await setup();
    const a = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Aufbau", startTime: "09:00", endTime: "11:00" }),
    );
    const b = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Grill", startTime: "10:00", endTime: "12:00" }),
    );
    await signUp(ctx.helper, a.id);

    const plan = await listShiftsForEvent(ctx.helper, event.id);
    expect(plan.shifts.find((s) => s.id === b.id)?.signup).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("Aufbau"),
    });
    await expect(signUp(ctx.helper, b.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Überschneidet sich"),
    });
  });

  it("erlaubt aufeinanderfolgende Schichten und Schichten verschiedener Veranstaltungen ohne Überschneidung", async () => {
    const { ctx, club, event } = await setup();
    const a = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Früh", startTime: "09:00", endTime: "12:00" }),
    );
    const b = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Spät", startTime: "12:00", endTime: "15:00" }),
    );
    const otherEvent = await createEventRow(club.id, { title: "Andere" });
    const c = await createShiftRow(club.id, otherEvent.id, {
      startsAt: parseBerlinDateTime(inDays(11), "09:00")!,
      endsAt: parseBerlinDateTime(inDays(11), "11:00")!,
    });
    for (const id of [a.id, b.id, c.id])
      await expect(signUp(ctx.helper, id)).resolves.toBeUndefined();
    expect((await listMyAssignments(ctx.helper)).map((m) => m.title)).toEqual([
      "Früh",
      "Spät",
      "Getränkestand",
    ]);
  });

  it("überschneidende Schichten verschiedener Veranstaltungen sind ebenfalls ausgeschlossen – auch bei Gleichzeitigkeit", async () => {
    const { ctx, club, event } = await setup();
    const other = await createEventRow(club.id, { title: "Parallel-Event" });
    const start = parseBerlinDateTime(inDays(10), "12:00")!;
    const shifts = await Promise.all(
      [event.id, other.id, event.id, other.id].map((eventId, i) =>
        createShiftRow(club.id, eventId, {
          title: `S${i}`,
          startsAt: new Date(start.getTime() + i * 15 * 60_000),
          endsAt: new Date(start.getTime() + 3 * H),
          requiredCount: 5,
        }),
      ),
    );
    const results = await Promise.allSettled(shifts.map((s) => signUp(ctx.helper, s.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.shiftAssignment.count({
        where: { memberId: ctx.helper.memberId!, status: "CONFIRMED" },
      }),
    ).toBe(1);
  });

  it("Zuweisungsliste zeigt Konflikte und Gründe für gesperrte Mitglieder", async () => {
    const { ctx, event, people } = await setup();
    const a = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Aufbau", startTime: "09:00", endTime: "11:00" }),
    );
    const b = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Ausschank", startTime: "10:00", endTime: "12:00", minAge: 18 }),
    );
    await assignMember(ctx.board, { shiftId: a.id, memberId: people.helper.member.id });
    // Hanna ist erwachsen (sonst käme die Altersmeldung vor der Überschneidung), Heinz ist zu jung.
    await prisma.member.update({
      where: { id: people.helper.member.id },
      data: { birthDate: new Date("1990-01-01") },
    });
    await prisma.member.update({
      where: { id: people.helper2.member.id },
      data: { birthDate: new Date(`${new Date().getUTCFullYear() - 15}-06-01`) },
    });
    await prisma.member.update({
      where: { id: people.member.member.id },
      data: { birthDate: new Date("1985-03-03") },
    });

    const list = await listAssignableMembers(ctx.board, b.id);
    const byName = (last: string, first: string) =>
      list.find((m) => m.name === `${last}, ${first}`)!;
    expect(byName("Helfer", "Hanna").blockedReason).toContain("Aufbau"); // Konflikt (und Alter fehlt) – Konflikt/Alter zuerst geprüft
    expect(byName("Helfer", "Heinz").blockedReason).toContain("Mindestalter 18");
    expect(byName("MEMBER", "Test").blockedReason).toBeNull();
  });
});

describe("Zuweisen durch Veranstalter", () => {
  it("weist zu und aus, benachrichtigt die Person und protokolliert", async () => {
    const { ctx, event, people } = await setup();
    const { id } = await createShift(
      ctx.board,
      event.id,
      shiftInput({ meetingPoint: "Haupteingang" }),
    );

    await assignMember(ctx.board, { shiftId: id, memberId: people.member.member.id });
    expect((await notes(people.member.user.id)).at(-1)).toMatchObject({
      type: "SHIFT_ASSIGNED",
      emailStatus: "PENDING",
      body: expect.stringContaining("Haupteingang"),
    });
    await expect(
      assignMember(ctx.board, { shiftId: id, memberId: people.member.member.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await unassignMember(ctx.board, { shiftId: id, memberId: people.member.member.id });
    expect((await notes(people.member.user.id)).at(-1)).toMatchObject({ type: "SHIFT_CANCELLED" });
    const actions = (
      await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.action);
    expect(actions).toEqual(["shift.created", "shift.assigned", "shift.unassigned"]);
  });

  it("überschreitet die Helferzahl auch für Veranstalter nicht", async () => {
    const { ctx, event, people } = await setup();
    const { id } = await createShift(ctx.board, event.id, shiftInput({ requiredCount: 1 }));
    await assignMember(ctx.board, { shiftId: id, memberId: people.helper.member.id });
    await expect(
      assignMember(ctx.board, { shiftId: id, memberId: people.helper2.member.id }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("voll besetzt") });
  });

  it("nur Berechtigte weisen zu; Abteilungsleiter nur in ihrer Abteilung; Mitglieder anderer Status sind ausgeschlossen", async () => {
    const { ctx, club, event, fussball, handball, people } = await setup();
    const shift = await createShift(ctx.board, event.id, shiftInput());
    await expect(
      assignMember(ctx.helper, { shiftId: shift.id, memberId: people.helper2.member.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      assignMember(ctx.lead, { shiftId: shift.id, memberId: people.helper2.member.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAssignableMembers(ctx.helper, shift.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const ownEvent = await createEventRow(club.id, {
      title: "Fußball-Fest",
      departmentId: fussball.id,
    });
    const foreignEvent = await createEventRow(club.id, {
      title: "Handball-Fest",
      departmentId: handball.id,
    });
    const own = await createShiftRow(club.id, ownEvent.id);
    const foreign = await createShiftRow(club.id, foreignEvent.id);
    await expect(
      assignMember(ctx.lead, { shiftId: own.id, memberId: people.helper2.member.id }),
    ).resolves.toBeUndefined();
    await expect(
      assignMember(ctx.lead, { shiftId: foreign.id, memberId: people.helper2.member.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const gone = await createMember(club.id, { status: "LEFT" });
    await expect(
      assignMember(ctx.board, { shiftId: shift.id, memberId: gone.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Eintragung benachrichtigt die verantwortliche Person", async () => {
    const { ctx, event, people } = await setup();
    const { id } = await createShift(
      ctx.board,
      event.id,
      shiftInput({ responsibleMemberId: people.board.member.id }),
    );
    await signUp(ctx.helper, id);
    expect((await notes(people.board.user.id)).at(-1)).toMatchObject({
      type: "SHIFT_CHANGED",
      title: expect.stringContaining("Neue Eintragung"),
    });
    await signOut(ctx.helper, id);
    expect((await notes(people.board.user.id)).at(-1)?.title).toContain("Abmeldung");
  });
});

describe("Helferstunden", () => {
  async function pastShift() {
    const s = await setup();
    const shift = await createShiftRow(s.club.id, s.event.id, {
      title: "Bewirtung",
      startsAt: new Date(Date.now() - 4 * H),
      endsAt: new Date(Date.now() - H),
    });
    // Über die Datenbank eintragen (Schicht liegt in der Vergangenheit).
    await prisma.shiftAssignment.create({
      data: { clubId: s.club.id, shiftId: shift.id, memberId: s.people.helper.member.id },
    });
    await prisma.shiftAssignment.create({
      data: { clubId: s.club.id, shiftId: shift.id, memberId: s.people.helper2.member.id },
    });
    return { ...s, shift };
  }

  it("dokumentiert Stunden erst nach Beginn; Berechtigte dürfen, Helfer nicht", async () => {
    const { ctx, club, event, people, shift } = await pastShift();
    const assignment = await prisma.shiftAssignment.findFirstOrThrow({
      where: { shiftId: shift.id, memberId: people.helper.member.id },
    });
    await expect(
      recordHours(ctx.helper, { assignmentId: assignment.id, minutes: 120 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await recordHours(ctx.board, { assignmentId: assignment.id, minutes: 150 });
    expect(
      await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: assignment.id } }),
    ).toMatchObject({ workedMinutes: 150, hoursApprovedById: ctx.board.userId });

    const future = await createShiftRow(club.id, event.id, { title: "Später" });
    const futureAssignment = await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: future.id, memberId: people.helper.member.id },
    });
    await expect(
      recordHours(ctx.board, { assignmentId: futureAssignment.id, minutes: 60 }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("noch nicht begonnen"),
    });
  });

  it("übernimmt die geplante Dauer nur für Helfer ohne dokumentierte Stunden", async () => {
    const { ctx, people, shift } = await pastShift();
    const first = await prisma.shiftAssignment.findFirstOrThrow({
      where: { shiftId: shift.id, memberId: people.helper.member.id },
    });
    await recordHours(ctx.board, { assignmentId: first.id, minutes: 90 });

    expect(await confirmPlannedHours(ctx.board, shift.id)).toBe(1);
    const minutes = (
      await prisma.shiftAssignment.findMany({
        where: { shiftId: shift.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.workedMinutes);
    expect(minutes).toEqual([90, 180]); // 3 Stunden Schichtdauer für den zweiten
    expect(await confirmPlannedHours(ctx.board, shift.id)).toBe(0);
  });

  it("Übersicht: Veranstalter sehen alle, Mitglieder nur die eigenen Stunden; Abteilungsleitung nur ihre Abteilung", async () => {
    const { ctx, club, fussball, handball, people } = await pastShift();
    const year = new Date().getFullYear();
    const own = await createEventRow(club.id, {
      title: "Fußball-Event",
      departmentId: fussball.id,
    });
    const foreign = await createEventRow(club.id, {
      title: "Handball-Event",
      departmentId: handball.id,
    });
    for (const [event, member, minutes] of [
      [own, people.helper, 60],
      [foreign, people.helper2, 120],
    ] as const) {
      // Andere Zeit als die Schicht aus pastShift(): Dieselbe Person kann nicht zweimal gleichzeitig eingetragen sein.
      const shift = await createShiftRow(club.id, event.id, {
        startsAt: new Date(Date.now() - 30 * H),
        endsAt: new Date(Date.now() - 28 * H),
      });
      await prisma.shiftAssignment.create({
        data: {
          clubId: club.id,
          shiftId: shift.id,
          memberId: member.member.id,
          workedMinutes: minutes,
          hoursApprovedAt: new Date(),
        },
      });
    }

    const all = await getHoursOverview(ctx.board, year);
    expect(all.scope).toBe("ALL");
    expect(all.rows.find((r) => r.name === "Helfer, Heinz")?.minutes).toBe(120);
    expect(all.totalMinutes).toBe(180);

    const mine = await getHoursOverview(ctx.helper, year);
    expect(mine.scope).toBe("OWN");
    expect(mine.rows.map((r) => r.name)).toEqual(["Helfer, Hanna"]);
    expect(mine.totalMinutes).toBe(60);

    const dept = await getHoursOverview(ctx.lead, year);
    expect(dept.rows.map((r) => r.name)).toEqual(["Helfer, Hanna"]); // nur Fußball-Einsätze
  });
});

describe("Übersichten und Export", () => {
  it("Besetzungsübersicht und offene Schichten zeigen Warnstufen; Abgesagte und Volle fehlen", async () => {
    const { ctx, club, event } = await setup();
    const soon = await createEventRow(club.id, {
      title: "Morgen-Event",
      startsAt: new Date(Date.now() + 24 * H),
      endsAt: new Date(Date.now() + 30 * H),
    });
    const full = await createShiftRow(club.id, soon.id, {
      title: "Voll",
      startsAt: new Date(Date.now() + 25 * H),
      endsAt: new Date(Date.now() + 28 * H),
      requiredCount: 1,
    });
    await createShiftRow(club.id, soon.id, {
      title: "Leer",
      startsAt: new Date(Date.now() + 25 * H),
      endsAt: new Date(Date.now() + 28 * H),
      requiredCount: 2,
    });
    await createShift(ctx.board, event.id, shiftInput({ title: "Später", requiredCount: 2 }));
    await signUp(ctx.helper, full.id);

    const overview = await getStaffingOverview(ctx.board);
    const morgen = overview.find((e) => e.title === "Morgen-Event")!;
    expect(morgen).toMatchObject({
      shifts: 2,
      required: 3,
      filled: 1,
      openShifts: 1,
      worstUrgency: "CRITICAL",
    });
    expect(overview.find((e) => e.title === "Sommerfest")).toMatchObject({
      worstUrgency: "NONE",
      openShifts: 1,
    });
    expect(overview[0]!.title).toBe("Morgen-Event"); // nach Datum sortiert

    const open = await listOpenShifts(ctx.member);
    expect(open.map((o) => o.title).sort()).toEqual(["Leer", "Später"]);
    expect(open.find((o) => o.title === "Leer")).toMatchObject({
      health: { fill: "EMPTY", urgency: "CRITICAL", freeSpots: 2 },
      signup: { allowed: true },
    });
  });

  it("offene Schichten zeigen dem Benutzer, warum eine Eintragung nicht geht", async () => {
    const { ctx, event } = await setup();
    const a = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Schicht A", startTime: "09:00", endTime: "12:00" }),
    );
    await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Schicht B", startTime: "10:00", endTime: "13:00" }),
    );
    await signUp(ctx.helper, a.id);
    const open = await listOpenShifts(ctx.helper);
    expect(open.find((o) => o.title === "Schicht B")?.signup).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("Überschneidet sich"),
    });
  });

  it("Export enthält freie Plätze; Telefonnummern nur mit Berechtigung", async () => {
    const { ctx, event, people } = await setup();
    const { id } = await createShift(
      ctx.board,
      event.id,
      shiftInput({ title: "Grill", requiredCount: 3 }),
    );
    await prisma.member.update({
      where: { id: people.helper.member.id },
      data: { phone: "0171 555" },
    });
    await signUp(ctx.helper, id);

    const { csv, filename } = await exportShiftPlanCsv(ctx.board, event.id);
    expect(filename).toBe("helferplan-sommerfest.csv");
    expect(csv).toContain("Hanna Helfer");
    expect(csv).toContain("0171 555");
    expect(csv.match(/— frei —/g)).toHaveLength(2);

    await expect(exportShiftPlanCsv(ctx.helper, event.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(exportShiftPlanCsv(ctx.member, event.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("Mitglieder sehen Schichten, aber keine internen Hinweise", async () => {
    const { ctx, event } = await setup();
    await createShift(
      ctx.board,
      event.id,
      shiftInput({ internalNotes: "Kasse: Schlüssel im Büro" }),
    );
    expect((await listShiftsForEvent(ctx.member, event.id)).shifts[0]?.internalNotes).toBeNull();
    expect((await listShiftsForEvent(ctx.board, event.id)).shifts[0]?.internalNotes).toBe(
      "Kasse: Schlüssel im Büro",
    );
  });
});

describe("Mandantentrennung in der Helferplanung", () => {
  it("Schichten und Einteilungen anderer Vereine sind weder sichtbar noch änderbar", async () => {
    const a = await setup();
    const b = await setup();
    const shift = await createShift(b.ctx.board, b.event.id, shiftInput());
    await signUp(b.ctx.helper, shift.id);

    await expect(listShiftsForEvent(a.ctx.admin, b.event.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(signUp(a.ctx.helper, shift.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(signOut(a.ctx.helper, shift.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateShift(a.ctx.admin, shift.id, shiftInput())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteShift(a.ctx.admin, shift.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      assignMember(a.ctx.admin, { shiftId: shift.id, memberId: a.people.helper.member.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(exportShiftPlanCsv(a.ctx.admin, b.event.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(createShift(a.ctx.admin, b.event.id, shiftInput())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getStaffingOverview(a.ctx.admin)).map((e) => e.eventId)).not.toContain(
      b.event.id,
    );
    expect((await listOpenShifts(a.ctx.helper)).map((s) => s.shiftId)).not.toContain(shift.id);
  });
});
