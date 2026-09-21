import { describe, expect, it } from "vitest";
import {
  addBerlinDays,
  parseBerlinDateTime,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/dates";
import { pageRequest } from "@/lib/search-params";
import { prisma } from "@/server/db/client";
import {
  listParticipantCandidates,
  listParticipants,
  removeParticipant,
  respondToEvent,
  setParticipantStatus,
} from "@/modules/events/participants";
import {
  eventFormSchema,
  normalizeEventTimes,
  type EventFormInput,
} from "@/modules/events/schemas";
import {
  archiveEvent,
  cancelEvent,
  completeEvent,
  createEvent,
  deleteEvent,
  duplicateEvent,
  getEvent,
  getEventForEdit,
  listEvents,
  publishEvent,
  restoreEvent,
  updateEvent,
  type EventListQuery,
} from "@/modules/events/service";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createMember,
  createShift,
  createEvent as createEventRow,
} from "../helpers/factories";

const inDays = (n: number) => toDateInputValue(addBerlinDays(new Date(), n));

const form = (overrides: Partial<EventFormInput> = {}) =>
  eventFormSchema.parse({
    title: "Sommerfest",
    type: "EVENT",
    visibility: "INTERNAL",
    startDate: inDays(14),
    startTime: "14:00",
    endDate: inDays(14),
    endTime: "22:00",
    allDay: false,
    registrationRequired: false,
    waitlistEnabled: false,
    repeat: "none",
    ...overrides,
  });

const query = (overrides: Partial<EventListQuery> = {}): EventListQuery => ({
  period: "all",
  request: pageRequest({}),
  ...overrides,
});

async function setup() {
  const club = await createClub("Eventverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const helper = await addUserToClub(club, "HELPER");
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    fussball,
    handball,
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

const notificationsFor = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("Zeiten und Eingaben", () => {
  it("wandelt Ortszeit (Europe/Berlin) in UTC um – auch im Sommer", () => {
    const input = form({
      startDate: "2026-07-15",
      startTime: "18:30",
      endDate: "2026-07-15",
      endTime: "20:00",
    });
    const times = normalizeEventTimes(input)!;
    expect(times.startsAt.toISOString()).toBe("2026-07-15T16:30:00.000Z");
    expect(times.endsAt.toISOString()).toBe("2026-07-15T18:00:00.000Z");
  });

  it("ganztägige Termine laufen von 00:00 bis 23:59 Ortszeit", () => {
    const times = normalizeEventTimes(
      form({
        allDay: true,
        startDate: "2026-09-05",
        endDate: "2026-09-06",
        startTime: "10:00",
        endTime: "11:00",
      }),
    )!;
    expect([toDateInputValue(times.startsAt), toTimeInputValue(times.startsAt)]).toEqual([
      "2026-09-05",
      "00:00",
    ]);
    expect([toDateInputValue(times.endsAt), toTimeInputValue(times.endsAt)]).toEqual([
      "2026-09-06",
      "23:59",
    ]);
  });

  it("weist ungültige Eingaben mit verständlichen Meldungen ab", () => {
    const base = {
      title: "T",
      type: "EVENT",
      visibility: "INTERNAL",
      startDate: "2026-09-05",
      startTime: "10:00",
      endDate: "2026-09-05",
      endTime: "12:00",
      allDay: false,
      registrationRequired: false,
      waitlistEnabled: false,
      repeat: "none",
    } as const;
    const issues = (overrides: object) =>
      eventFormSchema
        .safeParse({ ...base, title: "Titel", ...overrides })
        .error?.issues.map((i) => i.message) ?? [];
    expect(issues({ title: "" }).join()).toContain("Titel");
    expect(issues({ endTime: "09:00" }).join()).toContain("Ende");
    expect(issues({ endDate: "2026-09-04" }).join()).toContain("Ende");
    expect(issues({ endTime: "10:00" }).join()).toContain("nach dem Beginn");
    expect(issues({ startDate: "2026-02-31" }).join()).toContain("ungültig");
    expect(issues({ startTime: "25:00" }).join()).toContain("Uhrzeit");
    expect(issues({ contactEmail: "keine-mail" }).join()).toContain("E-Mail");
    expect(issues({ registrationDeadlineDate: "2026-09-06" }).join()).toContain("Anmeldefrist");
    expect(issues({ repeat: "weekly" }).join()).toContain("wie viele Termine");
    expect(issues({ repeat: "weekly", repeatCount: 99 }).join()).toContain("Höchstens");
    expect(issues({})).toEqual([]);
  });
});

describe("Anlegen, Ändern und Lebenszyklus", () => {
  it("Vorstand legt einen Entwurf an, veröffentlicht ihn und benachrichtigt die Mitglieder", async () => {
    const { ctx, people } = await setup();
    const { id, count } = await createEvent(
      ctx.board,
      form({ title: "Grillfest", locationName: "Vereinsheim" }),
    );
    expect(count).toBe(1);

    let detail = await getEvent(ctx.board, id);
    expect(detail).toMatchObject({
      title: "Grillfest",
      status: "DRAFT",
      locationName: "Vereinsheim",
    });
    await publishEvent(ctx.board, id);
    detail = await getEvent(ctx.board, id);
    expect(detail.status).toBe("PUBLISHED");
    expect(detail.publishedAt).not.toBeNull();

    // Alle anderen aktiven Benutzer des Vereins erhalten eine Benachrichtigung – nicht der Veröffentlichende selbst.
    expect((await notificationsFor(people.member.user.id)).map((n) => n.type)).toEqual([
      "EVENT_PUBLISHED",
    ]);
    expect((await notificationsFor(people.board.user.id)).length).toBe(0);
    await expect(publishEvent(ctx.board, id)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const actions = (
      await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.action);
    expect(actions).toEqual(["event.created", "event.published"]);
  });

  it("Veranstaltungen einer Abteilung benachrichtigen nur deren Mitglieder", async () => {
    const { ctx, fussball, people } = await setup();
    await prisma.memberDepartment.create({
      data: {
        clubId: ctx.admin.clubId,
        memberId: people.helper.member.id,
        departmentId: fussball.id,
      },
    });
    const { id } = await createEvent(ctx.lead, form({ departmentId: fussball.id }));
    await publishEvent(ctx.lead, id);

    expect((await notificationsFor(people.helper.user.id)).length).toBe(1);
    expect((await notificationsFor(people.member.user.id)).length).toBe(0); // gehört nicht zur Abteilung
  });

  it("Serien: legt alle Termine mit gemeinsamer Serien-ID an und behält die Ortszeit", async () => {
    const { ctx } = await setup();
    const { id, count } = await createEvent(
      ctx.board,
      form({
        title: "Training",
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        startTime: "18:30",
        endTime: "20:00",
        repeat: "weekly",
        repeatCount: 4,
      }),
    );
    expect(count).toBe(4);
    const series = await prisma.event.findMany({
      where: { clubId: ctx.board.clubId, title: "Training" },
      orderBy: { startsAt: "asc" },
    });
    expect(series).toHaveLength(4);
    expect(new Set(series.map((e) => e.seriesId)).size).toBe(1);
    expect(series[0]!.seriesId).not.toBeNull();
    expect(
      series.map((e) => `${toDateInputValue(e.startsAt)} ${toTimeInputValue(e.startsAt)}`),
    ).toEqual(["2026-10-20 18:30", "2026-10-27 18:30", "2026-11-03 18:30", "2026-11-10 18:30"]);
    expect(series.every((e) => e.status === "DRAFT")).toBe(true);
    expect(series[0]!.id).toBe(id);
  });

  it("Änderungen an Zeit/Ort benachrichtigen Teilnehmer und Helfer – interne Notizen nicht", async () => {
    const { ctx, club, people } = await setup();
    const { id } = await createEvent(ctx.board, form());
    await publishEvent(ctx.board, id);
    await respondToEvent(ctx.member, { eventId: id, response: "ACCEPTED" });
    const shift = await createShift(club.id, id);
    await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: shift.id, memberId: people.helper.member.id },
    });
    const [memberBefore, helperBefore] = [
      (await notificationsFor(people.member.user.id)).length,
      (await notificationsFor(people.helper.user.id)).length,
    ];

    await updateEvent(ctx.board, id, form({ internalNotes: "nur intern" }));
    expect((await notificationsFor(people.member.user.id)).length).toBe(memberBefore); // keine relevante Änderung

    await updateEvent(ctx.board, id, form({ startTime: "15:00", locationName: "Neue Halle" }));
    const memberNotes = await notificationsFor(people.member.user.id);
    expect(memberNotes.at(-1)).toMatchObject({
      type: "EVENT_CHANGED",
      emailStatus: "PENDING",
      linkUrl: `/veranstaltungen/${id}`,
    });
    expect((await notificationsFor(people.helper.user.id)).length).toBe(helperBefore + 1);
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: { entityId: id, action: "event.updated" },
          orderBy: { createdAt: "desc" },
        })
      ).changes,
    ).toHaveProperty("locationName");
  });

  it("Absage verlangt einen Grund, storniert die Schichten und benachrichtigt Betroffene", async () => {
    const { ctx, club, people } = await setup();
    const { id } = await createEvent(ctx.board, form());
    await publishEvent(ctx.board, id);
    await respondToEvent(ctx.member, { eventId: id, response: "ACCEPTED" });
    const shift = await createShift(club.id, id);
    await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: shift.id, memberId: people.helper.member.id },
    });

    await cancelEvent(ctx.board, id, "Schlechtes Wetter");
    const detail = await getEvent(ctx.board, id);
    expect(detail).toMatchObject({ status: "CANCELLED", cancelReason: "Schlechtes Wetter" });
    expect((await prisma.eventShift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe(
      "CANCELLED",
    );
    for (const user of [people.member.user, people.helper.user]) {
      expect((await notificationsFor(user.id)).at(-1)).toMatchObject({
        type: "EVENT_CANCELLED",
        body: "Schlechtes Wetter",
        emailStatus: "PENDING",
      });
    }
    await expect(cancelEvent(ctx.board, id, "nochmal")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(updateEvent(ctx.board, id, form())).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(getEventForEdit(ctx.board, id)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("abschließen, archivieren, wiederherstellen und löschen (Entwurf/Archiv)", async () => {
    const { ctx } = await setup();
    const { id } = await createEvent(ctx.board, form({ title: "Ablauf" }));
    await publishEvent(ctx.board, id);
    await completeEvent(ctx.board, id);
    expect((await getEvent(ctx.board, id)).status).toBe("COMPLETED");

    await expect(deleteEvent(ctx.board, id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("archiviere"),
    });
    await archiveEvent(ctx.board, id);
    expect((await getEvent(ctx.board, id)).status).toBe("ARCHIVED");
    await restoreEvent(ctx.board, id);
    expect((await getEvent(ctx.board, id)).status).toBe("DRAFT"); // Termin liegt in der Zukunft
    await deleteEvent(ctx.board, id);
    await expect(getEvent(ctx.board, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.event.count({ where: { id } })).toBe(1); // nur weich gelöscht
  });

  it("dupliziert eine Veranstaltung samt Schichten auf ein neues Datum (Ortszeit bleibt)", async () => {
    const { ctx, club, people } = await setup();
    const { id } = await createEvent(
      ctx.board,
      form({
        startDate: "2026-06-13",
        endDate: "2026-06-13",
        startTime: "14:00",
        endTime: "22:00",
        maxParticipants: 50,
      }),
    );
    const shiftStart = parseBerlinDateTime("2026-06-13", "09:00")!;
    const shift = await createShift(club.id, id, {
      title: "Aufbau",
      startsAt: shiftStart,
      endsAt: parseBerlinDateTime("2026-06-13", "11:00")!,
      requiredCount: 5,
    });
    await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: shift.id, memberId: people.helper.member.id },
    });

    const copy = await duplicateEvent(ctx.board, id, "2026-11-14"); // anderer Zeitzonen-Offset (Winterzeit)
    const detail = await getEvent(ctx.board, copy.id);
    expect(detail).toMatchObject({
      title: "Sommerfest (Kopie)",
      status: "DRAFT",
      maxParticipants: 50,
    });
    expect([toDateInputValue(detail.startsAt), toTimeInputValue(detail.startsAt)]).toEqual([
      "2026-11-14",
      "14:00",
    ]);
    const copied = await prisma.eventShift.findMany({
      where: { eventId: copy.id },
      include: { assignments: true },
    });
    expect(copied).toHaveLength(1);
    expect([toDateInputValue(copied[0]!.startsAt), toTimeInputValue(copied[0]!.startsAt)]).toEqual([
      "2026-11-14",
      "09:00",
    ]);
    expect(copied[0]!.requiredCount).toBe(5);
    expect(copied[0]!.assignments).toHaveLength(0); // keine Einteilungen übernommen
  });
});

describe("Berechtigungen und Sichtbarkeit", () => {
  it("Mitglieder und Helfer dürfen nichts anlegen oder ändern", async () => {
    const { ctx } = await setup();
    await expect(createEvent(ctx.member, form())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createEvent(ctx.helper, form())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Abteilungsleiter legen nur Veranstaltungen ihrer Abteilung an und bearbeiten nur diese", async () => {
    const { ctx, fussball, handball } = await setup();
    await expect(createEvent(ctx.lead, form())).rejects.toMatchObject({ code: "VALIDATION" }); // ohne Abteilung
    await expect(createEvent(ctx.lead, form({ departmentId: handball.id }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const own = await createEvent(ctx.lead, form({ departmentId: fussball.id }));
    const foreign = await createEvent(
      ctx.board,
      form({ title: "Handball-Turnier", departmentId: handball.id }),
    );
    await publishEvent(ctx.board, foreign.id);

    await updateEvent(ctx.lead, own.id, form({ departmentId: fussball.id, title: "Neuer Titel" }));
    await expect(
      updateEvent(ctx.lead, foreign.id, form({ departmentId: handball.id })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Verschieben in eine fremde Abteilung ist ebenfalls nicht erlaubt.
    await expect(
      updateEvent(ctx.lead, own.id, form({ departmentId: handball.id })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(cancelEvent(ctx.lead, foreign.id, "Grund")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await getEvent(ctx.lead, foreign.id)).can).toMatchObject({
      update: false,
      publish: false,
      archive: false,
    });
  });

  it("Entwürfe sind nur für Berechtigte sichtbar – für alle anderen nicht einmal auffindbar", async () => {
    const { ctx, fussball, handball } = await setup();
    const draft = await createEvent(
      ctx.board,
      form({ title: "Geheimer Entwurf", departmentId: handball.id }),
    );
    const ownDraft = await createEvent(
      ctx.lead,
      form({ title: "Eigener Entwurf", departmentId: fussball.id }),
    );

    await expect(getEvent(ctx.member, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getEvent(ctx.lead, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" }); // fremde Abteilung
    await expect(getEvent(ctx.lead, ownDraft.id)).resolves.toBeDefined();
    expect((await listEvents(ctx.member, query())).total).toBe(0);
    expect((await listEvents(ctx.lead, query())).items.map((e) => e.title)).toEqual([
      "Eigener Entwurf",
    ]);
    expect((await listEvents(ctx.board, query())).total).toBe(2);
  });

  it("Archivierte sieht nur, wer archivieren darf; Gelöschte niemand", async () => {
    const { ctx } = await setup();
    const { id } = await createEvent(ctx.board, form({ title: "Alt" }));
    await publishEvent(ctx.board, id);
    await archiveEvent(ctx.board, id);
    await expect(getEvent(ctx.member, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getEvent(ctx.board, id)).resolves.toBeDefined();
    expect((await listEvents(ctx.member, query({ status: "ARCHIVED" }))).total).toBe(0);
    expect((await listEvents(ctx.board, query({ status: "ARCHIVED" }))).total).toBe(1);
    await deleteEvent(ctx.board, id);
    await expect(getEvent(ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Veröffentlichte Veranstaltungen sehen alle Mitglieder; interne Notizen nur Berechtigte", async () => {
    const { ctx } = await setup();
    const { id } = await createEvent(
      ctx.board,
      form({ internalNotes: "Kasse: Schlüssel beim Hausmeister" }),
    );
    await publishEvent(ctx.board, id);
    expect((await getEvent(ctx.member, id)).internalNotes).toBeNull();
    expect((await getEvent(ctx.board, id)).internalNotes).toBe("Kasse: Schlüssel beim Hausmeister");
    expect((await getEvent(ctx.member, id)).can).toMatchObject({
      update: false,
      publish: false,
      archive: false,
      manageParticipants: false,
      participate: true,
    });
  });

  it("Liste: Suche, Zeitraum, Typ und Abteilung; kommende zuerst, vergangene rückwärts", async () => {
    const { ctx, club, fussball } = await setup();
    const past = await createEventRow(club.id, {
      title: "Vergangenes Turnier",
      startsAt: new Date(Date.now() - 10 * 86_400_000),
    });
    await createEventRow(club.id, {
      title: "Nächstes Training",
      startsAt: new Date(Date.now() + 2 * 86_400_000),
      departmentId: fussball.id,
    });
    await createEventRow(club.id, {
      title: "Späteres Fest",
      startsAt: new Date(Date.now() + 20 * 86_400_000),
    });

    const titles = async (q: Partial<EventListQuery>) =>
      (await listEvents(ctx.member, query(q))).items.map((e) => e.title);
    expect(await titles({ period: "upcoming" })).toEqual(["Nächstes Training", "Späteres Fest"]);
    expect(await titles({ period: "past" })).toEqual(["Vergangenes Turnier"]);
    expect(await titles({ q: "fest" })).toEqual(["Späteres Fest"]);
    expect(await titles({ departmentId: fussball.id })).toEqual(["Nächstes Training"]);
    expect(await titles({ status: "PUBLISHED", period: "all" })).toHaveLength(3);
    void past;
  });

  it("Mandantentrennung: Veranstaltungen anderer Vereine sind unsichtbar und unveränderbar", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await createEvent(b.ctx.board, form({ title: "Fremdes Fest" }));
    await publishEvent(b.ctx.board, id);

    await expect(getEvent(a.ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateEvent(a.ctx.admin, id, form())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelEvent(a.ctx.admin, id, "Grund")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      respondToEvent(a.ctx.member, { eventId: id, response: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(duplicateEvent(a.ctx.admin, id, "2027-01-01")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await listEvents(a.ctx.admin, query({ q: "Fremdes" }))).total).toBe(0);
    await expect(
      createEvent(a.ctx.admin, form({ departmentId: b.fussball.id })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("Zu- und Absagen, Teilnehmerlimit, Warteliste", () => {
  async function published(overrides: Partial<EventFormInput> = {}) {
    const s = await setup();
    const { id } = await createEvent(s.ctx.board, form(overrides));
    await publishEvent(s.ctx.board, id);
    return { ...s, id };
  }

  it("Mitglied sagt zu und ab; Zähler und eigener Status stimmen", async () => {
    const { ctx, id } = await published({ registrationRequired: true });
    expect(
      await respondToEvent(ctx.member, {
        eventId: id,
        response: "ACCEPTED",
        note: "Bringe Kuchen",
      }),
    ).toEqual({ status: "ACCEPTED" });
    expect(await respondToEvent(ctx.member, { eventId: id, response: "ACCEPTED" })).toEqual({
      status: "ACCEPTED",
    }); // idempotent
    let detail = await getEvent(ctx.member, id);
    expect(detail).toMatchObject({ acceptedCount: 1, myStatus: "ACCEPTED" });

    await respondToEvent(ctx.member, { eventId: id, response: "DECLINED" });
    detail = await getEvent(ctx.member, id);
    expect(detail).toMatchObject({ acceptedCount: 0, myStatus: "DECLINED" });
  });

  it("Anmeldung ist nur bei veröffentlichten, laufenden Veranstaltungen und vor Ablauf der Frist möglich", async () => {
    const s = await setup();
    const draft = await createEvent(s.ctx.board, form());
    await expect(
      respondToEvent(s.ctx.member, { eventId: draft.id, response: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" }); // Entwurf: unsichtbar

    const withDeadline = await createEvent(
      s.ctx.board,
      form({
        startDate: inDays(10),
        endDate: inDays(10),
        registrationDeadlineDate: inDays(5),
        registrationDeadlineTime: "12:00",
      }),
    );
    await publishEvent(s.ctx.board, withDeadline.id);
    await respondToEvent(s.ctx.member, { eventId: withDeadline.id, response: "ACCEPTED" });
    // Frist verstreichen lassen (direkt in der Datenbank).
    await prisma.event.update({
      where: { id: withDeadline.id },
      data: { registrationDeadline: new Date(Date.now() - 3_600_000) },
    });
    await expect(
      respondToEvent(s.ctx.helper, { eventId: withDeadline.id, response: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("Anmeldefrist") });
    // Absagen ist auch nach der Frist möglich.
    await expect(
      respondToEvent(s.ctx.member, { eventId: withDeadline.id, response: "DECLINED" }),
    ).resolves.toEqual({ status: "DECLINED" });

    const pastEvent = await createEventRow(s.club.id, {
      title: "Vorbei",
      startsAt: new Date(Date.now() - 5 * 86_400_000),
    });
    await expect(
      respondToEvent(s.ctx.member, { eventId: pastEvent.id, response: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("vorbei") });

    const cancelled = await createEvent(s.ctx.board, form());
    await publishEvent(s.ctx.board, cancelled.id);
    await cancelEvent(s.ctx.board, cancelled.id, "Grund");
    await expect(
      respondToEvent(s.ctx.member, { eventId: cancelled.id, response: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("abgesagt") });
  });

  it("Teilnehmerlimit ohne Warteliste: 'ausgebucht'", async () => {
    const { ctx, id } = await published({ maxParticipants: 1, registrationRequired: true });
    await respondToEvent(ctx.member, { eventId: id, response: "ACCEPTED" });
    await expect(
      respondToEvent(ctx.helper, { eventId: id, response: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("ausgebucht") });
    expect((await getEvent(ctx.board, id)).acceptedCount).toBe(1);
  });

  it("Warteliste: Überzählige warten und rücken bei Absage in der Reihenfolge der Anmeldung nach", async () => {
    const { ctx, id, people } = await published({
      maxParticipants: 1,
      waitlistEnabled: true,
      registrationRequired: true,
    });
    expect(await respondToEvent(ctx.member, { eventId: id, response: "ACCEPTED" })).toEqual({
      status: "ACCEPTED",
    });
    expect(await respondToEvent(ctx.helper, { eventId: id, response: "ACCEPTED" })).toEqual({
      status: "WAITLISTED",
    });
    expect(await respondToEvent(ctx.lead, { eventId: id, response: "ACCEPTED" })).toEqual({
      status: "WAITLISTED",
    });
    expect(await respondToEvent(ctx.helper, { eventId: id, response: "ACCEPTED" })).toEqual({
      status: "WAITLISTED",
    }); // Position bleibt
    expect(await getEvent(ctx.board, id)).toMatchObject({ acceptedCount: 1, waitlistCount: 2 });

    await respondToEvent(ctx.member, { eventId: id, response: "DECLINED" });
    const rows = await listParticipants(ctx.board, id);
    expect(rows?.map((r) => [r.name.split(",")[0], r.status])).toEqual([
      ["HELPER", "ACCEPTED"], // war zuerst auf der Warteliste
      ["DEPARTMENT_LEAD", "WAITLISTED"],
      ["MEMBER", "DECLINED"],
    ]);
    const note = (await notificationsFor(people.helper.user.id)).at(-1);
    expect(note).toMatchObject({
      type: "EVENT_CHANGED",
      title: expect.stringContaining("nachgerückt"),
    });
  });

  it("Erhöhen des Limits lässt Wartende nachrücken", async () => {
    const { ctx, id } = await published({
      maxParticipants: 1,
      waitlistEnabled: true,
      registrationRequired: true,
    });
    await respondToEvent(ctx.member, { eventId: id, response: "ACCEPTED" });
    await respondToEvent(ctx.helper, { eventId: id, response: "ACCEPTED" });
    await respondToEvent(ctx.lead, { eventId: id, response: "ACCEPTED" });

    await updateEvent(
      ctx.board,
      id,
      form({ maxParticipants: 3, waitlistEnabled: true, registrationRequired: true }),
    );
    expect(await getEvent(ctx.board, id)).toMatchObject({ acceptedCount: 3, waitlistCount: 0 });
  });

  it("Gleichzeitige Anmeldungen überschreiten das Limit nie (Datenbank ist die letzte Instanz)", async () => {
    const s = await setup();
    const { id } = await createEvent(
      s.ctx.board,
      form({ maxParticipants: 3, waitlistEnabled: true, registrationRequired: true }),
    );
    await publishEvent(s.ctx.board, id);
    const extra = await Promise.all(
      Array.from({ length: 8 }, async () =>
        contextFor((await addUserToClub(s.club, "MEMBER")).user.id, s.club.id),
      ),
    );

    const results = await Promise.all(
      extra.map((c) => respondToEvent(c, { eventId: id, response: "ACCEPTED" })),
    );
    expect(results.filter((r) => r.status === "ACCEPTED")).toHaveLength(3);
    expect(results.filter((r) => r.status === "WAITLISTED")).toHaveLength(5);
    expect((await getEvent(s.ctx.board, id)).acceptedCount).toBe(3);
  });

  it("Veranstalter verwalten Teilnehmer; das Limit gilt auch für sie", async () => {
    const { ctx, id, people } = await published({ maxParticipants: 1, registrationRequired: true });
    await setParticipantStatus(ctx.board, {
      eventId: id,
      memberId: people.member.member.id,
      status: "ACCEPTED",
    });
    await expect(
      setParticipantStatus(ctx.board, {
        eventId: id,
        memberId: people.helper.member.id,
        status: "ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("Limit") });
    await setParticipantStatus(ctx.board, {
      eventId: id,
      memberId: people.helper.member.id,
      status: "WAITLISTED",
    });

    expect((await notificationsFor(people.member.user.id)).at(-1)?.body).toBe(
      "Du wurdest angemeldet.",
    );
    expect((await listParticipantCandidates(ctx.board, id)).map((m) => m.id)).not.toContain(
      people.member.member.id,
    );

    await removeParticipant(ctx.board, { eventId: id, memberId: people.member.member.id });
    expect((await getEvent(ctx.board, id)).acceptedCount).toBe(1); // die wartende Person ist nachgerückt
  });

  it("Teilnehmerlisten sehen nur Veranstalter; Mitglieder sehen Zähler und den eigenen Status", async () => {
    const { ctx, id } = await published({ registrationRequired: true });
    await respondToEvent(ctx.member, { eventId: id, response: "ACCEPTED" });
    await respondToEvent(ctx.helper, { eventId: id, response: "DECLINED" });

    expect(await listParticipants(ctx.member, id)).toBeNull();
    expect((await listParticipants(ctx.board, id))?.length).toBe(2);
    await expect(
      setParticipantStatus(ctx.member, {
        eventId: id,
        memberId: ctx.member.memberId!,
        status: "DECLINED",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      removeParticipant(ctx.member, { eventId: id, memberId: ctx.helper.memberId! }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listParticipantCandidates(ctx.member, id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("Konten ohne Mitgliedsdatensatz können sich nicht anmelden (verständliche Meldung)", async () => {
    const { ctx, id, club } = await published();
    const orphan = await addUserToClub(club, "MEMBER");
    await prisma.member.update({ where: { id: orphan.member.id }, data: { userId: null } });
    const orphanCtx = await contextFor(orphan.user.id, club.id);
    await expect(
      respondToEvent(orphanCtx, { eventId: id, response: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Mitglied") });
    void ctx;
    void createMember;
  });
});
