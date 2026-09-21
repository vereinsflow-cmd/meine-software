import { describe, expect, it } from "vitest";
import { messageFormSchema, type MessageFormInput } from "@/modules/messages/schemas";
import {
  countUnreadMessages,
  deleteMessage,
  getComposeOptions,
  getDraftForEdit,
  getMessage,
  listInbox,
  listSent,
  previewRecipients,
  saveDraft,
  sendDraft,
} from "@/modules/messages/service";
import { prisma } from "@/server/db/client";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
  createMember,
  createShift,
} from "../helpers/factories";

const first = { page: 1, pageSize: 25, skip: 0 };
const input = (over: Partial<MessageFormInput> = {}) =>
  messageFormSchema.parse({
    subject: "Wichtige Info",
    body: "Liebe Mitglieder, …",
    audience: "ALL_MEMBERS",
    isAnnouncement: false,
    sendEmail: false,
    ...over,
  });

async function setup() {
  const club = await createClub("Nachrichtenverein");
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
  await prisma.memberDepartment.create({
    data: { clubId: club.id, memberId: helper.member.id, departmentId: fussball.id },
  });
  await prisma.memberDepartment.create({
    data: { clubId: club.id, memberId: member.member.id, departmentId: handball.id },
  });
  const eventF = await createEvent(club.id, { title: "Fußballturnier", departmentId: fussball.id });
  const eventH = await createEvent(club.id, {
    title: "Handballturnier",
    departmentId: handball.id,
  });
  return {
    club,
    fussball,
    handball,
    eventF,
    eventH,
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

type Ctx = Awaited<ReturnType<typeof setup>>["ctx"]["admin"];
const send = async (ctx: Ctx, over: Partial<MessageFormInput> = {}) => {
  const { id } = await saveDraft(ctx, input(over));
  return { id, ...(await sendDraft(ctx, id)) };
};
const subjects = async (ctx: Ctx) => (await listInbox(ctx, first)).items.map((m) => m.subject);

describe("Nachrichten senden", () => {
  it("an alle Mitglieder: Empfänger werden festgehalten, benachrichtigt (nicht der Absender), protokolliert", async () => {
    const { ctx, people, club } = await setup();
    const result = await send(ctx.admin, {
      subject: "Sommerfest",
      body: "Es geht los!",
      isAnnouncement: true,
    });
    expect(result).toMatchObject({ recipients: 4, unreachable: 0 }); // alle außer dem Absender

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored).toMatchObject({
      status: "SENT",
      recipientCount: 4,
      isAnnouncement: true,
      authorUserId: people.admin.user.id,
      sentAt: expect.any(Date),
    });
    expect(await prisma.messageRecipient.count({ where: { messageId: result.id } })).toBe(4);

    // Alle außer dem Absender bekommen eine Benachrichtigung mit Link auf die Nachricht.
    const notes = await prisma.notification.findMany({
      where: { clubId: club.id, type: "MESSAGE" },
    });
    expect(notes).toHaveLength(4);
    expect(
      notes.every(
        (n) =>
          n.linkUrl === `/nachrichten/${result.id}` &&
          n.title === "Ankündigung: Sommerfest" &&
          n.body === "Es geht los!" &&
          n.emailStatus === "NONE",
      ),
    ).toBe(true);
    expect(notes.some((n) => n.userId === people.admin.user.id)).toBe(false);

    expect(
      await prisma.auditLog.findFirst({ where: { clubId: club.id, action: "message.sent" } }),
    ).toMatchObject({
      entityId: result.id,
      summary: "Nachricht „Sommerfest“ an 4 Personen gesendet",
    });
    // Alle Empfänger finden sie im Posteingang – der Absender nicht (bei ihm steht sie unter "Gesendet").
    for (const c of [ctx.board, ctx.lead, ctx.helper, ctx.member])
      expect(await subjects(c)).toEqual(["Sommerfest"]);
    expect(await subjects(ctx.admin)).toEqual([]);
    expect((await listSent(ctx.admin, "sent", first)).items.map((m) => m.subject)).toEqual([
      "Sommerfest",
    ]);
  });

  it("E-Mail nur auf Wunsch – und nur an Personen, die E-Mails nicht abgeschaltet haben", async () => {
    const { ctx, people, club } = await setup();
    await prisma.user.update({
      where: { id: people.member.user.id },
      data: { emailNotifications: false },
    });
    await send(ctx.admin, { subject: "Mit Mail", sendEmail: true });
    const notes = await prisma.notification.findMany({
      where: { clubId: club.id, type: "MESSAGE" },
    });
    expect(notes.find((n) => n.userId === people.member.user.id)!.emailStatus).toBe("NONE");
    expect(notes.filter((n) => n.emailStatus === "PENDING")).toHaveLength(3); // Vorstand, Leitung, Helferin
  });

  it("Zielgruppen: Abteilung, zugesagte Teilnehmer und eingetragene Helfer einer Veranstaltung", async () => {
    const { ctx, people, club, fussball, eventF, eventH } = await setup();
    await prisma.eventParticipant.createMany({
      data: [
        {
          clubId: club.id,
          eventId: eventF.id,
          memberId: people.helper.member.id,
          status: "ACCEPTED",
        },
        {
          clubId: club.id,
          eventId: eventF.id,
          memberId: people.member.member.id,
          status: "DECLINED",
        },
        {
          clubId: club.id,
          eventId: eventF.id,
          memberId: people.board.member.id,
          status: "WAITLISTED",
        },
      ],
    });
    const shift = await createShift(club.id, eventH.id, { title: "Aufbau", requiredCount: 3 });
    await prisma.shiftAssignment.createMany({
      data: [
        { clubId: club.id, shiftId: shift.id, memberId: people.member.member.id },
        {
          clubId: club.id,
          shiftId: shift.id,
          memberId: people.helper.member.id,
          status: "CANCELLED",
        },
      ],
    });

    const dept = await send(ctx.admin, {
      subject: "An Fußball",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    expect(dept.recipients).toBe(2); // Leitung (Leiter der Abteilung) + Helferin
    expect(await subjects(ctx.helper)).toEqual(["An Fußball"]);
    expect(await subjects(ctx.member)).toEqual([]);

    const participants = await send(ctx.admin, {
      subject: "An Teilnehmer",
      audience: "EVENT_PARTICIPANTS",
      eventId: eventF.id,
    });
    expect(participants.recipients).toBe(1); // nur "zugesagt"
    expect(await subjects(ctx.helper)).toContain("An Teilnehmer");
    expect(await subjects(ctx.member)).toEqual([]);

    const helpers = await send(ctx.admin, {
      subject: "An Helfer",
      audience: "EVENT_HELPERS",
      eventId: eventH.id,
    });
    expect(helpers.recipients).toBe(1); // nur bestätigte Eintragungen
    expect(await subjects(ctx.member)).toEqual(["An Helfer"]);
  });

  it("Personen ohne Konto sowie archivierte, ausgetretene und gesperrte Mitglieder werden nicht erreicht", async () => {
    const { ctx, club, people, fussball } = await setup();
    const noAccount = await createMember(club.id, { firstName: "Ohne", lastName: "Konto" });
    const left = await createMember(club.id, {
      firstName: "Aus",
      lastName: "Getreten",
      status: "LEFT",
    });
    const archived = await createMember(club.id, { firstName: "Archiv", lastName: "Iert" });
    await prisma.member.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    for (const m of [noAccount, left, archived])
      await prisma.memberDepartment.create({
        data: { clubId: club.id, memberId: m.id, departmentId: fussball.id },
      });
    await prisma.clubMembership.update({
      where: { id: people.helper.membershipId },
      data: { status: "SUSPENDED" },
    });

    const preview = await previewRecipients(ctx.admin, {
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    expect(preview).toEqual({ reachable: 1, unreachable: 2 }); // Leitung erreichbar; "Ohne Konto" und die gesperrte Helferin nicht
    const result = await send(ctx.admin, { audience: "DEPARTMENT", departmentId: fussball.id });
    expect(result).toMatchObject({ recipients: 1, unreachable: 2 });
  });

  it("eine Zielgruppe ohne erreichbare Personen wird nicht gesendet – der Entwurf bleibt erhalten", async () => {
    const { ctx, eventF } = await setup();
    const { id } = await saveDraft(
      ctx.admin,
      input({ audience: "EVENT_PARTICIPANTS", eventId: eventF.id }),
    );
    await expect(sendDraft(ctx.admin, id)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.message.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DRAFT",
      sentAt: null,
      recipientCount: 0,
    });
    expect(await prisma.messageRecipient.count({ where: { messageId: id } })).toBe(0);
  });

  it("doppeltes Senden ist ausgeschlossen (auch parallel)", async () => {
    const { ctx, club } = await setup();
    const { id } = await saveDraft(ctx.admin, input());
    const results = await Promise.allSettled([
      sendDraft(ctx.admin, id),
      sendDraft(ctx.admin, id),
      sendDraft(ctx.admin, id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(await prisma.messageRecipient.count({ where: { messageId: id } })).toBe(4);
    expect(await prisma.notification.count({ where: { clubId: club.id, type: "MESSAGE" } })).toBe(
      4,
    ); // je Person genau eine
    await expect(sendDraft(ctx.admin, id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("Wer wen erreichen darf", () => {
  it("Vorstand und Verwaltung: alle Zielgruppen; Helfer und Mitglieder: gar nicht", async () => {
    const { ctx } = await setup();
    await expect(saveDraft(ctx.board, input())).resolves.toHaveProperty("id");
    await expect(saveDraft(ctx.helper, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveDraft(ctx.member, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listSent(ctx.member, "sent", first)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getComposeOptions(ctx.helper)).toBeNull();
  });

  it("Abteilungsleiter: nur die eigene Abteilung und deren Veranstaltungen – nicht alle Mitglieder, nicht fremde", async () => {
    const { ctx, fussball, handball, eventF, eventH } = await setup();
    await expect(
      send(ctx.lead, { audience: "DEPARTMENT", departmentId: fussball.id }),
    ).resolves.toMatchObject({ recipients: 1 }); // die Helferin (die Leiterin ist Absenderin)
    await expect(saveDraft(ctx.lead, input({ audience: "ALL_MEMBERS" }))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { audience: [expect.any(String)] },
    });
    await expect(
      saveDraft(ctx.lead, input({ audience: "DEPARTMENT", departmentId: handball.id })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { departmentId: [expect.stringContaining("eigene Abteilung")] },
    });
    await expect(
      saveDraft(ctx.lead, input({ audience: "EVENT_HELPERS", eventId: eventH.id })),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { eventId: [expect.any(String)] } });
    await expect(
      saveDraft(ctx.lead, input({ audience: "EVENT_HELPERS", eventId: eventF.id })),
    ).resolves.toHaveProperty("id");
    await expect(
      previewRecipients(ctx.lead, { audience: "DEPARTMENT", departmentId: handball.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const options = await getComposeOptions(ctx.lead);
    expect(options).toMatchObject({
      scope: "DEPARTMENT",
      departments: [{ name: "Fußball" }],
      events: [{ title: "Fußballturnier" }],
    });
    expect(await getComposeOptions(ctx.admin)).toMatchObject({ scope: "CLUB" });
  });

  it("Mandantentrennung: Abteilungen und Veranstaltungen anderer Vereine sind nicht wählbar", async () => {
    const a = await setup();
    const b = await setup();
    await expect(
      saveDraft(a.ctx.admin, input({ audience: "DEPARTMENT", departmentId: b.fussball.id })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      saveDraft(a.ctx.admin, input({ audience: "EVENT_PARTICIPANTS", eventId: b.eventF.id })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await send(b.ctx.admin, { subject: "Nur Verein B" });
    expect(await subjects(a.ctx.helper)).toEqual([]);
  });

  it("Eingaben: Betreff, Text, Zielgruppen-Angaben", () => {
    expect(
      messageFormSchema.safeParse({
        subject: "x",
        body: "y",
        audience: "ALL_MEMBERS",
        isAnnouncement: false,
        sendEmail: false,
      }).success,
    ).toBe(false);
    expect(
      messageFormSchema.safeParse({
        subject: "Gut",
        body: "",
        audience: "ALL_MEMBERS",
        isAnnouncement: false,
        sendEmail: false,
      }).success,
    ).toBe(false);
    expect(
      messageFormSchema.safeParse({
        subject: "Gut",
        body: "x".repeat(5001),
        audience: "ALL_MEMBERS",
        isAnnouncement: false,
        sendEmail: false,
      }).success,
    ).toBe(false);
    expect(
      messageFormSchema.safeParse({
        subject: "Gut",
        body: "Text",
        audience: "DEPARTMENT",
        isAnnouncement: false,
        sendEmail: false,
      }).success,
    ).toBe(false); // Abteilung fehlt
    expect(
      messageFormSchema.safeParse({
        subject: "Gut",
        body: "Text",
        audience: "EVENT_HELPERS",
        isAnnouncement: false,
        sendEmail: false,
      }).success,
    ).toBe(false); // Veranstaltung fehlt
    expect(
      messageFormSchema.safeParse({
        subject: "Gut",
        body: "Text",
        audience: "ALL_MEMBERS",
        isAnnouncement: false,
        sendEmail: false,
      }).success,
    ).toBe(true);
  });
});

describe("Lesen", () => {
  it("Empfänger lesen nur an sie adressierte Nachrichten; das Öffnen markiert sie und die Benachrichtigung als gelesen", async () => {
    const { ctx, people, fussball } = await setup();
    const toDept = await send(ctx.admin, {
      subject: "Nur Fußball",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    const toAll = await send(ctx.admin, { subject: "Für alle" });

    expect(await countUnreadMessages(ctx.helper)).toBe(2);
    expect(await countUnreadMessages(ctx.member)).toBe(1);
    const before = (await listInbox(ctx.helper, first)).items;
    expect(before.map((m) => [m.subject, m.readByMe])).toEqual([
      ["Für alle", false],
      ["Nur Fußball", false],
    ]); // neueste zuerst

    const opened = await getMessage(ctx.helper, toAll.id);
    expect(opened).toMatchObject({
      subject: "Für alle",
      body: "Liebe Mitglieder, …",
      author: "Anna Admin",
      readByMe: true,
      readCount: null,
      can: { edit: false, delete: false },
    });
    expect(await countUnreadMessages(ctx.helper)).toBe(1);
    expect(
      (
        await prisma.notification.findFirstOrThrow({
          where: { userId: people.helper.user.id, linkUrl: `/nachrichten/${toAll.id}` },
        })
      ).readAt,
    ).toBeInstanceOf(Date);
    // Die andere Benachrichtigung bleibt ungelesen.
    expect(
      (
        await prisma.notification.findFirstOrThrow({
          where: { userId: people.helper.user.id, linkUrl: `/nachrichten/${toDept.id}` },
        })
      ).readAt,
    ).toBeNull();

    // Das Mitglied (Handball) bekam die Fußball-Nachricht nie: "nicht gefunden", nicht "verboten".
    await expect(getMessage(ctx.member, toDept.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Der Absender hat die Nachricht nicht "gelesen", nur die Empfänger.
    expect(
      await prisma.messageRecipient.count({
        where: { messageId: toAll.id, readAt: { not: null } },
      }),
    ).toBe(1);
  });

  it("Absender sehen Lesestatistik, aber nicht wer gelesen hat; Vorstand sieht gesendete Nachrichten anderer, Leitung nur eigene", async () => {
    const { ctx, fussball } = await setup();
    const fromAdmin = await send(ctx.admin, { subject: "Vom Admin" });
    const fromLead = await send(ctx.lead, {
      subject: "Von der Leitung",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    await getMessage(ctx.helper, fromAdmin.id);
    await getMessage(ctx.member, fromAdmin.id);

    const detail = await getMessage(ctx.admin, fromAdmin.id);
    expect(detail).toMatchObject({
      readCount: 2,
      recipientCount: 4,
      can: { edit: false, delete: true },
    });
    expect(JSON.stringify(detail)).not.toContain("Hanna"); // keine Namen von Lesern

    const sentByBoard = await listSent(ctx.board, "sent", first);
    expect(sentByBoard.items.map((m) => [m.subject, m.readCount]).sort()).toEqual(
      [
        ["Vom Admin", 2],
        ["Von der Leitung", 0],
      ].sort(),
    );
    expect((await listSent(ctx.lead, "sent", first)).items.map((m) => m.subject)).toEqual([
      "Von der Leitung",
    ]);
    await expect(getMessage(ctx.lead, fromAdmin.id)).resolves.toMatchObject({
      subject: "Vom Admin",
    }); // Leitung ist Empfänger (alle Mitglieder)
    void fromLead;
  });

  it("Entwürfe sind persönlich: nur der Verfasser sieht und ändert sie", async () => {
    const { ctx } = await setup();
    const { id } = await saveDraft(ctx.admin, input({ subject: "Entwurf Anna" }));
    expect((await listSent(ctx.admin, "drafts", first)).items.map((m) => m.subject)).toEqual([
      "Entwurf Anna",
    ]);
    expect((await listSent(ctx.board, "drafts", first)).items).toEqual([]);
    await expect(getMessage(ctx.board, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(sendDraft(ctx.board, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveDraft(ctx.board, input({ subject: "Übernommen" }), id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await subjects(ctx.helper)).toEqual([]); // ungesendet: niemand sonst sieht etwas
  });
});

describe("Entwürfe bearbeiten, gesendete schützen, löschen", () => {
  it("Entwurf ändern und senden; gesendete Nachrichten sind unveränderlich", async () => {
    const { ctx } = await setup();
    const { id } = await saveDraft(ctx.admin, input({ subject: "Erster Wurf" }));
    await saveDraft(ctx.admin, input({ subject: "Zweiter Wurf", body: "Neuer Text" }), id);
    expect(await getDraftForEdit(ctx.admin, id)).toMatchObject({
      subject: "Zweiter Wurf",
      body: "Neuer Text",
      audience: "ALL_MEMBERS",
    });

    await sendDraft(ctx.admin, id);
    await expect(
      saveDraft(ctx.admin, input({ subject: "Nachträglich" }), id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(getDraftForEdit(ctx.admin, id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await prisma.message.findUniqueOrThrow({ where: { id } })).subject).toBe(
      "Zweiter Wurf",
    );
  });

  it("Rückruf: Löschen blendet die Nachricht bei allen aus (weich), Protokoll; Leitung löscht nur eigene", async () => {
    const { ctx, fussball } = await setup();
    const fromAdmin = await send(ctx.admin, { subject: "Zurückgezogen" });
    const fromLead = await send(ctx.lead, {
      subject: "Von Lea",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    await expect(deleteMessage(ctx.lead, fromAdmin.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteMessage(ctx.helper, fromAdmin.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await deleteMessage(ctx.admin, fromAdmin.id);
    expect(await subjects(ctx.helper)).toEqual(["Von Lea"]);
    expect(await countUnreadMessages(ctx.helper)).toBe(1);
    await expect(getMessage(ctx.helper, fromAdmin.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await prisma.message.findUniqueOrThrow({ where: { id: fromAdmin.id } })).deletedAt,
    ).toBeInstanceOf(Date);
    expect(
      await prisma.auditLog.count({ where: { action: "message.deleted", entityId: fromAdmin.id } }),
    ).toBe(1);

    await deleteMessage(ctx.admin, fromLead.id); // Verein darf jede zurückrufen
    expect(await subjects(ctx.helper)).toEqual([]);
    await expect(deleteMessage(ctx.admin, fromLead.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("Text wird nie als HTML behandelt (wird unverändert gespeichert und ausgeliefert)", async () => {
    const { ctx } = await setup();
    const body = "<script>alert(1)</script> & <b>fett</b>";
    const { id } = await send(ctx.admin, { subject: "<i>Betreff</i>", body });
    const message = await getMessage(ctx.helper, id);
    expect(message).toMatchObject({ subject: "<i>Betreff</i>", body });
  });
});
