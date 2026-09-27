import { describe, expect, it } from "vitest";
import { chatKeyOf } from "@/modules/messages/chat-format";
import { getChat } from "@/modules/messages/chats";
import { messageFormSchema, type MessageFormInput } from "@/modules/messages/schemas";
import {
  countUnreadMessages,
  deleteMessage,
  discardDraft,
  getComposeOptions,
  getDraftForEdit,
  getMessage,
  listInbox,
  listSent,
  MEMBER_MESSAGES_PER_HOUR,
  previewRecipients,
  saveDraft,
  sendDraft,
} from "@/modules/messages/service";
import { prisma } from "@/server/db/client";
import { executeDeletionRequest } from "@/server/privacy/deletion";
import { buildUserDataExport } from "@/server/privacy/export";
import { checkRateLimit } from "@/server/security/rate-limit";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
  createMember,
  createShift,
  createUser,
} from "../helpers/factories";

const HOUR = 60 * 60 * 1000;
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
  it("Vorstand und Verwaltung: alle Zielgruppen, auch als Ankündigung und per E-Mail; Helfer und Mitglieder: nur ihre eigenen Gruppen", async () => {
    const { ctx, handball, eventH } = await setup();
    // Der Vorstand gehört weder zum Handball noch zu den Helfern – als Verein darf er trotzdem überallhin schreiben.
    await expect(
      saveDraft(
        ctx.board,
        input({
          audience: "DEPARTMENT",
          departmentId: handball.id,
          isAnnouncement: true,
          sendEmail: true,
        }),
      ),
    ).resolves.toHaveProperty("id");
    await expect(
      saveDraft(
        ctx.admin,
        input({ audience: "EVENT_HELPERS", eventId: eventH.id, isAnnouncement: true }),
      ),
    ).resolves.toHaveProperty("id");
    // Seit alle schreiben dürfen: Helfer und Mitglieder an alle Mitglieder (dazu gehören sie selbst) …
    await expect(saveDraft(ctx.helper, input())).resolves.toHaveProperty("id");
    await expect(saveDraft(ctx.member, input())).resolves.toHaveProperty("id");
    // … aber nicht in fremde Gruppen (Einzelheiten unter „Schreiben als Mitglied einer Gruppe“).
    await expect(
      saveDraft(ctx.helper, input({ audience: "DEPARTMENT", departmentId: handball.id })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await listSent(ctx.member, "sent", first)).items).toEqual([]);
    expect(await getComposeOptions(ctx.helper)).toMatchObject({ scope: "OWN", allMembers: true });
  });

  it("Abteilungsleiter: als Leitung die eigene Abteilung und deren Veranstaltungen, an alle Mitglieder nur als Mitglied – nicht an fremde", async () => {
    const { ctx, fussball, handball, eventF, eventH } = await setup();
    await expect(
      send(ctx.lead, { audience: "DEPARTMENT", departmentId: fussball.id }),
    ).resolves.toMatchObject({ recipients: 1 }); // die Helferin (die Leiterin ist Absenderin)
    // An alle Mitglieder schreibt die Leiterin wie jedes Mitglied: als einfache Nachricht (siehe nächster Test).
    await expect(saveDraft(ctx.lead, input({ audience: "ALL_MEMBERS" }))).resolves.toHaveProperty(
      "id",
    );
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
      allMembers: true,
      departments: [{ name: "Fußball", managed: true }],
      events: [{ title: "Fußballturnier", startsAt: expect.any(Date), managed: true }], // Beginn für das Datum in der Auswahl
    });
    expect(await getComposeOptions(ctx.admin)).toMatchObject({ scope: "CLUB" });
  });

  it("Abteilungsleiter: an alle Mitglieder ohne Ankündigung und E-Mail – in der eigenen Abteilung weiterhin mit", async () => {
    const { ctx, people, club, fussball } = await setup();
    await expect(saveDraft(ctx.lead, input({ isAnnouncement: true }))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { isAnnouncement: [expect.any(String)] },
    });
    await expect(saveDraft(ctx.lead, input({ sendEmail: true }))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { sendEmail: [expect.any(String)] },
    });

    const toAll = await send(ctx.lead, { subject: "Grillabend" });
    expect(toAll.recipients).toBe(4); // alle außer der Leiterin
    expect(
      await prisma.notification.count({
        where: {
          clubId: club.id,
          linkUrl: `/nachrichten/${toAll.id}`,
          title: "Neue Nachricht: Grillabend",
          emailStatus: "NONE",
        },
      }),
    ).toBe(4);

    const announced = await send(ctx.lead, {
      subject: "Training fällt aus",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
      isAnnouncement: true,
      sendEmail: true,
    });
    expect(announced.recipients).toBe(1);
    expect(
      await prisma.notification.findFirstOrThrow({
        where: { userId: people.helper.user.id, linkUrl: `/nachrichten/${announced.id}` },
      }),
    ).toMatchObject({ title: "Ankündigung: Training fällt aus", emailStatus: "PENDING" });
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

describe("Schreiben als Mitglied einer Gruppe", () => {
  it("Mitglied an alle Mitglieder: alle anderen werden benachrichtigt, der Absender ist kein Empfänger", async () => {
    const { ctx, people, club } = await setup();
    const result = await send(ctx.member, {
      subject: "Mitfahrgelegenheit",
      body: "Wer fährt mit zum Auswärtsspiel?",
    });
    expect(result).toMatchObject({ recipients: 4, unreachable: 0 });
    expect(await prisma.message.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({
      status: "SENT",
      recipientCount: 4,
      isAnnouncement: false,
      sendEmail: false,
      authorUserId: people.member.user.id,
    });

    const notes = await prisma.notification.findMany({
      where: { clubId: club.id, type: "MESSAGE" },
    });
    expect(notes.map((n) => n.userId).sort()).toEqual(
      [people.admin, people.board, people.lead, people.helper].map((p) => p.user.id).sort(),
    );
    expect(
      notes.every(
        (n) =>
          n.linkUrl === `/nachrichten/${result.id}` &&
          n.title === "Neue Nachricht: Mitfahrgelegenheit" &&
          n.emailStatus === "NONE",
      ),
    ).toBe(true);
    expect(
      await prisma.auditLog.findFirst({ where: { clubId: club.id, action: "message.sent" } }),
    ).toMatchObject({
      entityId: result.id,
      summary: "Nachricht „Mitfahrgelegenheit“ an 4 Personen gesendet",
    });

    for (const c of [ctx.admin, ctx.board, ctx.lead, ctx.helper])
      expect(await subjects(c)).toEqual(["Mitfahrgelegenheit"]);
    expect(await subjects(ctx.member)).toEqual([]);
    expect(await getMessage(ctx.helper, result.id)).toMatchObject({
      author: "Max Mitglied",
      can: { edit: false, delete: false },
    });
    // Beim Absender steht sie unter "Gesendet" – mit Lesestatistik und zurückrufbar.
    expect((await listSent(ctx.member, "sent", first)).items).toMatchObject([
      { subject: "Mitfahrgelegenheit", readCount: 1, can: { edit: false, delete: true } },
    ]);

    // Die Helferin genauso.
    await expect(send(ctx.helper, { subject: "Auch von Hanna" })).resolves.toMatchObject({
      recipients: 4,
    });
    expect(await subjects(ctx.member)).toEqual(["Auch von Hanna"]);
  });

  it("Mitglieder und Helfer: an die eigene Abteilung, zugesagte Veranstaltungen und eigene Helfereinsätze – nicht an fremde", async () => {
    const { ctx, people, club, fussball, handball, eventF, eventH } = await setup();
    // Handball: Max und der Vorstand. Fußball: Lea (Leitung) und Hanna.
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: people.board.member.id, departmentId: handball.id },
    });
    // Fußballturnier: Hanna und der Vorstand haben zugesagt, Max hat abgesagt.
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
          memberId: people.board.member.id,
          status: "ACCEPTED",
        },
        {
          clubId: club.id,
          eventId: eventF.id,
          memberId: people.member.member.id,
          status: "DECLINED",
        },
      ],
    });
    // Handballturnier: Max und die Verwaltung helfen (bestätigt), Hannas Eintrag ist storniert.
    const shift = await createShift(club.id, eventH.id, { title: "Kuchenstand", requiredCount: 3 });
    await prisma.shiftAssignment.createMany({
      data: [
        { clubId: club.id, shiftId: shift.id, memberId: people.member.member.id },
        { clubId: club.id, shiftId: shift.id, memberId: people.admin.member.id },
        {
          clubId: club.id,
          shiftId: shift.id,
          memberId: people.helper.member.id,
          status: "CANCELLED",
        },
      ],
    });

    await expect(
      send(ctx.member, {
        subject: "Handball intern",
        audience: "DEPARTMENT",
        departmentId: handball.id,
      }),
    ).resolves.toMatchObject({ recipients: 1 }); // der Vorstand
    await expect(
      send(ctx.helper, {
        subject: "Fußball intern",
        audience: "DEPARTMENT",
        departmentId: fussball.id,
      }),
    ).resolves.toMatchObject({ recipients: 1 }); // die Leiterin
    await expect(
      send(ctx.helper, {
        subject: "Wer bringt Bälle mit?",
        audience: "EVENT_PARTICIPANTS",
        eventId: eventF.id,
      }),
    ).resolves.toMatchObject({ recipients: 1 }); // der Vorstand (Max hat abgesagt)
    await expect(
      send(ctx.member, {
        subject: "Kuchen tauschen?",
        audience: "EVENT_HELPERS",
        eventId: eventH.id,
      }),
    ).resolves.toMatchObject({ recipients: 1 }); // die Verwaltung
    expect(await subjects(ctx.board)).toEqual(["Wer bringt Bälle mit?", "Handball intern"]);
    expect(await subjects(ctx.lead)).toEqual(["Fußball intern"]);
    expect(await subjects(ctx.admin)).toEqual(["Kuchen tauschen?"]);

    // Fremde Gruppen: VALIDATION am passenden Feld – und nichts wird gespeichert.
    const drafts = await prisma.message.count({ where: { clubId: club.id } });
    await expect(
      saveDraft(ctx.member, input({ audience: "DEPARTMENT", departmentId: fussball.id })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { departmentId: [expect.stringContaining("zu denen du gehörst")] },
    });
    await expect(
      saveDraft(ctx.helper, input({ audience: "DEPARTMENT", departmentId: handball.id })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { departmentId: [expect.any(String)] },
    });
    // Abgesagt ist nicht zugesagt; wer hilft, nimmt nicht automatisch teil – und umgekehrt.
    await expect(
      saveDraft(ctx.member, input({ audience: "EVENT_PARTICIPANTS", eventId: eventF.id })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { eventId: [expect.stringContaining("zugesagt")] },
    });
    await expect(
      saveDraft(ctx.member, input({ audience: "EVENT_PARTICIPANTS", eventId: eventH.id })),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { eventId: [expect.any(String)] } });
    await expect(
      saveDraft(ctx.helper, input({ audience: "EVENT_HELPERS", eventId: eventF.id })),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { eventId: [expect.any(String)] } });
    // Ein stornierter Helfereintrag zählt nicht.
    await expect(
      saveDraft(ctx.helper, input({ audience: "EVENT_HELPERS", eventId: eventH.id })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { eventId: [expect.stringContaining("selbst eingetragen")] },
    });
    await expect(
      previewRecipients(ctx.member, { audience: "DEPARTMENT", departmentId: fussball.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.message.count({ where: { clubId: club.id } })).toBe(drafts);
  });

  it("Mitglieder und Helfer: keine Ankündigung und keine E-Mail – weder beim Speichern noch beim Senden eines älteren Entwurfs", async () => {
    const { ctx, people, club } = await setup();
    await expect(saveDraft(ctx.member, input({ isAnnouncement: true }))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { isAnnouncement: [expect.any(String)] },
    });
    await expect(saveDraft(ctx.helper, input({ sendEmail: true }))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { sendEmail: [expect.any(String)] },
    });
    await expect(
      saveDraft(ctx.member, input({ isAnnouncement: true, sendEmail: true })),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { isAnnouncement: [expect.any(String)], sendEmail: [expect.any(String)] },
    });
    // Auch ein vorhandener Entwurf lässt sich nicht nachträglich zur Ankündigung machen.
    const own = await saveDraft(ctx.member, input());
    await expect(
      saveDraft(ctx.member, input({ isAnnouncement: true }), own.id),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { isAnnouncement: [expect.any(String)] },
    });
    expect(await prisma.message.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({
      isAnnouncement: false,
      sendEmail: false,
    });

    // Der Vorstand speichert eine Ankündigung mit E-Mail und ist danach nur noch einfaches Mitglied: so nicht mehr senden.
    const { id } = await saveDraft(
      ctx.board,
      input({ subject: "Jahreshauptversammlung", isAnnouncement: true, sendEmail: true }),
    );
    await prisma.clubMembership.update({
      where: { id: people.board.membershipId },
      data: { roleId: club.roleIds.MEMBER! },
    });
    const formerBoard = await contextFor(people.board.user.id, club.id);
    await expect(sendDraft(formerBoard, id)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { isAnnouncement: [expect.any(String)], sendEmail: [expect.any(String)] },
    });
    expect(await prisma.message.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DRAFT",
      sentAt: null,
    });
    expect(await prisma.notification.count({ where: { clubId: club.id, type: "MESSAGE" } })).toBe(
      0,
    );
    // Als einfache Nachricht geht es.
    await saveDraft(formerBoard, input({ subject: "Jahreshauptversammlung" }), id);
    await expect(sendDraft(formerBoard, id)).resolves.toMatchObject({ recipients: 4 });
  });

  it("wer die Gruppe verlässt, kann einen vorher gespeicherten Entwurf nicht mehr senden", async () => {
    const { ctx, people, club, handball, eventF } = await setup();
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: people.board.member.id, departmentId: handball.id },
    });
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
          memberId: people.board.member.id,
          status: "ACCEPTED",
        },
      ],
    });
    const toEvent = await saveDraft(
      ctx.helper,
      input({ audience: "EVENT_PARTICIPANTS", eventId: eventF.id }),
    );
    const toDept = await saveDraft(
      ctx.member,
      input({ audience: "DEPARTMENT", departmentId: handball.id }),
    );
    const toAll = await saveDraft(ctx.member, input());

    // Hanna sagt ab, Max wird aus der Handballabteilung ausgetragen.
    await prisma.eventParticipant.updateMany({
      where: { eventId: eventF.id, memberId: people.helper.member.id },
      data: { status: "DECLINED" },
    });
    await prisma.memberDepartment.deleteMany({
      where: { memberId: people.member.member.id, departmentId: handball.id },
    });
    await expect(sendDraft(ctx.helper, toEvent.id)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { eventId: [expect.any(String)] },
    });
    await expect(sendDraft(ctx.member, toDept.id)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { departmentId: [expect.any(String)] },
    });
    // Aus dem Verein ausgetreten: dann auch nicht mehr an alle Mitglieder.
    await prisma.member.update({
      where: { id: people.member.member.id },
      data: { status: "LEFT" },
    });
    await expect(sendDraft(ctx.member, toAll.id)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { audience: [expect.any(String)] },
    });

    expect(await prisma.message.count({ where: { clubId: club.id, status: "DRAFT" } })).toBe(3);
    expect(await prisma.messageRecipient.count({ where: { clubId: club.id } })).toBe(0);
  });

  it("Mitglieder sehen und verwalten nur ihre eigenen Nachrichten; der Vorstand ruft auch ihre zurück", async () => {
    const { ctx, fussball } = await setup();
    const fromMember = await send(ctx.member, { subject: "Von Max" });
    const fromHelper = await send(ctx.helper, {
      subject: "Von Hanna",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    const fromAdmin = await send(ctx.admin, {
      subject: "Vom Admin an Fußball",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    await getMessage(ctx.helper, fromMember.id); // Hanna liest die Nachricht von Max

    expect(
      (await listSent(ctx.member, "sent", first)).items.map((m) => [m.subject, m.readCount]),
    ).toEqual([["Von Max", 1]]);
    expect((await listSent(ctx.helper, "sent", first)).items.map((m) => m.subject)).toEqual([
      "Von Hanna",
    ]);
    expect(await getMessage(ctx.member, fromMember.id)).toMatchObject({
      readCount: 1,
      readByMe: null,
      can: { edit: false, delete: true },
    });
    // Weder an Max adressiert noch von ihm: "nicht gefunden".
    await expect(getMessage(ctx.member, fromHelper.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getMessage(ctx.member, fromAdmin.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Als Empfängerin sieht Hanna keine Lesestatistik und kann nicht zurückrufen.
    expect(await getMessage(ctx.helper, fromMember.id)).toMatchObject({
      readCount: null,
      can: { edit: false, delete: false },
    });
    for (const [c, id] of [
      [ctx.member, fromHelper.id],
      [ctx.helper, fromMember.id],
      [ctx.lead, fromMember.id],
      [ctx.lead, fromHelper.id],
    ] as const)
      await expect(deleteMessage(c, id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Der Vorstand sieht alle gesendeten Nachrichten (mit Lesestatistik) und ruft auch die von Mitgliedern zurück.
    expect((await listSent(ctx.board, "sent", first)).items.map((m) => m.subject).sort()).toEqual(
      ["Vom Admin an Fußball", "Von Hanna", "Von Max"].sort(),
    );
    expect(await getMessage(ctx.board, fromHelper.id)).toMatchObject({
      readCount: 0,
      can: { delete: true },
    });
    await deleteMessage(ctx.board, fromMember.id);
    expect(await subjects(ctx.helper)).toEqual(["Vom Admin an Fußball"]);
    expect(
      await prisma.auditLog.count({
        where: { action: "message.deleted", entityId: fromMember.id },
      }),
    ).toBe(1);
    expect((await listSent(ctx.member, "sent", first)).items).toEqual([]);

    // Die eigene Nachricht ruft die Helferin selbst zurück.
    await deleteMessage(ctx.helper, fromHelper.id);
    expect(await subjects(ctx.lead)).toEqual(["Vom Admin an Fußball"]);
  });

  it("Obergrenze je Stunde für Nachrichten als Mitglied – nicht für den Vorstand und nicht für die Leitung in der eigenen Abteilung", async () => {
    const { ctx, people, club, fussball } = await setup();
    // Zähler über das Rate-Limit selbst vorbelegen, statt 30 Nachrichten zu senden.
    const prime = async (userId: string, count: number) => {
      for (let i = 0; i < count; i++)
        await checkRateLimit(`message-send:${userId}`, MEMBER_MESSAGES_PER_HOUR, 3600);
    };

    await prime(people.member.user.id, MEMBER_MESSAGES_PER_HOUR - 1);
    const { id } = await saveDraft(ctx.member, input({ subject: "Eine zu viel" })); // noch unter der Grenze
    await expect(send(ctx.member, { subject: "Die letzte erlaubte" })).resolves.toMatchObject({
      recipients: 4,
    });
    // Der vorher gespeicherte Entwurf geht nicht mehr raus …
    await expect(sendDraft(ctx.member, id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await prisma.message.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DRAFT",
    });
    expect(
      await prisma.notification.count({
        where: { clubId: club.id, linkUrl: `/nachrichten/${id}` },
      }),
    ).toBe(0);
    // … und an der Grenze wird gar nicht erst ein neuer Entwurf gespeichert (sonst läge bei jedem Versuch einer herum).
    await expect(saveDraft(ctx.member, input({ subject: "Noch eine" }))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(await prisma.message.count({ where: { clubId: club.id, subject: "Noch eine" } })).toBe(
      0,
    );

    // Leitung: in der eigenen Abteilung ohne Grenze, an alle Mitglieder (als Mitglied) begrenzt.
    await prime(people.lead.user.id, MEMBER_MESSAGES_PER_HOUR);
    await expect(
      send(ctx.lead, { audience: "DEPARTMENT", departmentId: fussball.id, isAnnouncement: true }),
    ).resolves.toMatchObject({ recipients: 1 });
    await expect(send(ctx.lead, { subject: "An alle" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    // Vorstand: keine Grenze – sein Zähler wird gar nicht angefasst.
    await prime(people.board.user.id, MEMBER_MESSAGES_PER_HOUR);
    await expect(send(ctx.board, { subject: "Vom Vorstand" })).resolves.toMatchObject({
      recipients: 4,
    });
    expect(
      (
        await prisma.rateLimitBucket.findUniqueOrThrow({
          where: { key: `message-send:${people.board.user.id}` },
        })
      ).count,
    ).toBe(MEMBER_MESSAGES_PER_HOUR);
  });

  it("Auswahl im Formular: Mitglieder sehen „alle Mitglieder“ und nur ihre eigenen Gruppen (nicht als Leitung) – ohne Mitgliedsdatensatz nichts", async () => {
    const { ctx, people, club, fussball, handball, eventF } = await setup();
    const fest = await createEvent(club.id, {
      title: "Vereinsfest",
      startsAt: new Date(Date.now() + 96 * HOUR),
    });
    const old = await createEvent(club.id, {
      title: "Altes Turnier",
      startsAt: new Date(Date.now() - 60 * 24 * HOUR),
    });
    const secret = await createEvent(club.id, { title: "Noch geheim", status: "DRAFT" });
    const without = await createEvent(club.id, { title: "Ohne Max" });
    // Max hat beim Fußballturnier (fremde Abteilung), beim alten Turnier und beim Entwurf zugesagt, bei "Ohne Max" abgesagt;
    // beim Vereinsfest hilft er, bei "Ohne Max" ist sein Helfereintrag storniert. Beim Handballturnier ist er nicht dabei.
    await prisma.eventParticipant.createMany({
      data: [
        { eventId: eventF.id, status: "ACCEPTED" as const },
        { eventId: old.id, status: "ACCEPTED" as const },
        { eventId: secret.id, status: "ACCEPTED" as const },
        { eventId: without.id, status: "DECLINED" as const },
      ].map((p) => ({ ...p, clubId: club.id, memberId: people.member.member.id })),
    });
    const festShift = await createShift(club.id, fest.id);
    const withoutShift = await createShift(club.id, without.id);
    await prisma.shiftAssignment.createMany({
      data: [
        { clubId: club.id, shiftId: festShift.id, memberId: people.member.member.id },
        {
          clubId: club.id,
          shiftId: withoutShift.id,
          memberId: people.member.member.id,
          status: "CANCELLED",
        },
      ],
    });

    expect(await getComposeOptions(ctx.member)).toEqual({
      scope: "OWN",
      allMembers: true,
      departments: [{ id: handball.id, name: "Handball", managed: false }],
      events: [
        // Zugesagt: an die Teilnehmer; als Helfer eingetragen: an die Helfer – nicht umgekehrt.
        {
          id: eventF.id,
          title: "Fußballturnier",
          startsAt: eventF.startsAt,
          managed: false,
          asParticipant: true,
          asHelper: false,
        },
        {
          id: fest.id,
          title: "Vereinsfest",
          startsAt: fest.startsAt,
          managed: false,
          asParticipant: false,
          asHelper: true,
        },
      ],
    });
    expect(await getComposeOptions(ctx.helper)).toEqual({
      scope: "OWN",
      allMembers: true,
      departments: [{ id: fussball.id, name: "Fußball", managed: false }],
      events: [],
    });

    // Die Leiterin ist zusätzlich einfaches Mitglied im Handball: dort nur einfache Nachrichten.
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: people.lead.member.id, departmentId: handball.id },
    });
    expect(
      (await getComposeOptions(ctx.lead))!.departments.map((d) => [d.name, d.managed]),
    ).toEqual([
      ["Fußball", true],
      ["Handball", false],
    ]);
    await expect(
      saveDraft(ctx.lead, input({ audience: "DEPARTMENT", departmentId: handball.id })),
    ).resolves.toHaveProperty("id");
    await expect(
      saveDraft(
        ctx.lead,
        input({ audience: "DEPARTMENT", departmentId: handball.id, isAnnouncement: true }),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { isAnnouncement: [expect.any(String)] },
    });

    // Der Verein wählt aus allem – überall als Verein.
    const admin = await getComposeOptions(ctx.admin);
    expect(admin).toMatchObject({ scope: "CLUB", allMembers: true });
    expect(admin!.departments.map((d) => [d.name, d.managed])).toEqual([
      ["Fußball", true],
      ["Handball", true],
    ]);
    expect(admin!.events.every((e) => e.managed)).toBe(true);

    // Konto mit Rolle, aber ohne Mitgliedsdatensatz: kann nirgendwohin schreiben.
    const external = await createUser({ firstName: "Ext", lastName: "Ern" });
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: external.id, roleId: club.roleIds.MEMBER! },
    });
    const externalCtx = await contextFor(external.id, club.id);
    expect(await getComposeOptions(externalCtx)).toBeNull();
    await expect(saveDraft(externalCtx, input())).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { audience: [expect.any(String)] },
    });
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

  it("Rückruf: Löschen blendet die Nachricht bei allen aus (weich), Protokoll; Leitung und Helfer löschen nur eigene", async () => {
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
    // Die Helferin darf inzwischen selbst schreiben – fremde Nachrichten sind für sie aber "nicht gefunden".
    await expect(deleteMessage(ctx.helper, fromAdmin.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
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

describe("Vorschau, fehlende Angaben, Entwürfe und Datenschutz", () => {
  it("die Vorschau zählt den Absender nicht mit – ist er der Einzige mit Konto, sagt der Versand das klar", async () => {
    const { ctx, handball } = await setup();
    const preview = await previewRecipients(ctx.member, { audience: "ALL_MEMBERS" });
    expect(preview.reachable).toBe((await send(ctx.member, { subject: "An alle" })).recipients);

    // Im Handball hat nur Max selbst ein Konto: Vorschau 0, Versand scheitert mit einem verständlichen Grund.
    const department = { audience: "DEPARTMENT" as const, departmentId: handball.id };
    expect(await previewRecipients(ctx.member, department)).toMatchObject({ reachable: 0 });
    await expect(send(ctx.member, department)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { audience: [expect.stringContaining("Außer dir")] },
    });
  });

  it("ohne Abteilung bzw. Veranstaltung weder Vorschau noch Entwurf (keine Zahlen über irgendeine Gruppe)", async () => {
    const { ctx } = await setup();
    for (const who of [ctx.member, ctx.admin]) {
      await expect(previewRecipients(who, { audience: "DEPARTMENT" })).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { departmentId: [expect.any(String)] },
      });
      for (const audience of ["EVENT_PARTICIPANTS", "EVENT_HELPERS"] as const)
        await expect(previewRecipients(who, { audience })).rejects.toMatchObject({
          code: "VALIDATION",
          fieldErrors: { eventId: [expect.any(String)] },
        });
    }
  });

  it("ein verworfener Entwurf verschwindet – nur der eigene und nur, solange er nicht gesendet ist", async () => {
    const { ctx } = await setup();
    const mine = await saveDraft(ctx.member, input({ subject: "Verwerfen" }));
    const theirs = await saveDraft(ctx.helper, input({ subject: "Fremder Entwurf" }));
    const sent = await send(ctx.member, { subject: "Schon gesendet" });

    await discardDraft(ctx.member, theirs.id); // fremd: bleibt
    await discardDraft(ctx.member, sent.id); // gesendet: bleibt
    await discardDraft(ctx.member, mine.id);
    expect(await prisma.message.findUnique({ where: { id: mine.id } })).toBeNull();
    expect(await prisma.message.findUnique({ where: { id: theirs.id } })).not.toBeNull();
    expect(await prisma.message.findUnique({ where: { id: sent.id } })).toMatchObject({
      status: "SENT",
    });
  });

  it("„Mit Betreff schreiben“ aus dem Chat einer länger zurückliegenden Veranstaltung: die Gruppe steht in der Auswahl", async () => {
    const { ctx, people, club, fussball } = await setup();
    const old = await createEvent(club.id, {
      title: "Altes Turnier",
      startsAt: new Date(Date.now() - 60 * 24 * HOUR),
    });
    await prisma.eventParticipant.create({
      data: {
        clubId: club.id,
        eventId: old.id,
        memberId: people.member.member.id,
        status: "ACCEPTED",
      },
    });
    const target = { audience: "EVENT_PARTICIPANTS" as const, eventId: old.id };
    expect((await getComposeOptions(ctx.member))!.events.map((e) => e.id)).not.toContain(old.id);
    expect((await getComposeOptions(ctx.member, { include: target }))!.events).toContainEqual({
      id: old.id,
      title: "Altes Turnier",
      startsAt: old.startsAt,
      managed: false,
      asParticipant: true,
      asHelper: false,
    });
    // Eine Gruppe, in die man nicht schreiben darf, kommt so nicht in die Auswahl.
    const foreign = await getComposeOptions(ctx.member, {
      include: { audience: "DEPARTMENT", departmentId: fussball.id },
    });
    expect(foreign!.departments.map((d) => d.id)).not.toContain(fussball.id);
  });

  it("Chat einer gelöschten Veranstaltung: niemand schreibt mehr – mit dem richtigen Grund", async () => {
    const { ctx, people, club, eventF } = await setup();
    await prisma.eventParticipant.create({
      data: {
        clubId: club.id,
        eventId: eventF.id,
        memberId: people.member.member.id,
        status: "ACCEPTED",
      },
    });
    await send(ctx.admin, { audience: "EVENT_PARTICIPANTS", eventId: eventF.id });
    const key = chatKeyOf({
      audience: "EVENT_PARTICIPANTS",
      departmentId: null,
      eventId: eventF.id,
    });
    expect(await getChat(ctx.member, key)).toMatchObject({ canPost: true, postBlocked: null });

    await prisma.event.update({ where: { id: eventF.id }, data: { deletedAt: new Date() } });
    for (const who of [ctx.member, ctx.admin])
      expect(await getChat(who, key)).toMatchObject({ canPost: false, postBlocked: "gone" });
  });

  it("Datenschutz: eigene Nachrichten stehen im Export; nach der Kontolöschung bleiben gesendete ohne Absender, Entwürfe nicht", async () => {
    const { ctx, people } = await setup();
    const sent = await send(ctx.member, { subject: "Grillabend", body: "Wer bringt Kohle mit?" });
    const draft = await saveDraft(ctx.member, input({ subject: "Halb fertig" }));

    const exported = (await buildUserDataExport(people.member.user.id))!;
    expect(exported.vereine[0]).toMatchObject({
      geschriebeneNachrichten: expect.arrayContaining([
        expect.objectContaining({
          betreff: "Grillabend",
          text: "Wer bringt Kohle mit?",
          an: "Alle Mitglieder",
          status: "gesendet",
        }),
        expect.objectContaining({ betreff: "Halb fertig", status: "Entwurf" }),
      ]),
    });

    const request = await prisma.deletionRequest.create({
      data: { userId: people.member.user.id, scheduledFor: new Date(Date.now() - HOUR) },
    });
    expect(await executeDeletionRequest(request.id)).toBe("COMPLETED");
    expect(await prisma.message.findUnique({ where: { id: draft.id } })).toBeNull();
    expect(await prisma.message.findUnique({ where: { id: sent.id } })).toMatchObject({
      status: "SENT",
      authorUserId: null,
      subject: "Grillabend",
    });
  });
});
