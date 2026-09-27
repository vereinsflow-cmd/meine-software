import { describe, expect, it } from "vitest";
import { countDrafts, getChat, listChats } from "@/modules/messages/chats";
import { messageFormSchema, type MessageFormInput } from "@/modules/messages/schemas";
import {
  countUnreadMessages,
  deleteMessage,
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
} from "../helpers/factories";

/**
 * Nachrichten als Chats: dieselbe Sichtbarkeit wie Posteingang und „Gesendet“, gruppiert nach Zielgruppe. Schreiben darf
 * jeder in die Gruppen, zu denen er gehört (wie in einer WhatsApp-Gruppe); ankündigen und per E-Mail senden nur Verein
 * und Leitung.
 */
const input = (over: Partial<MessageFormInput> = {}) =>
  messageFormSchema.parse({
    subject: "Info",
    body: "Liebe Mitglieder, …",
    audience: "ALL_MEMBERS",
    isAnnouncement: false,
    sendEmail: false,
    ...over,
  });

async function setup() {
  const club = await createClub("Chatverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
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
  const ctx = {
    admin: await contextFor(admin.user.id, club.id),
    lead: await contextFor(lead.user.id, club.id),
    helper: await contextFor(helper.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  return { club, fussball, handball, people: { admin, lead, helper, member }, ctx };
}

type Ctx = Awaited<ReturnType<typeof setup>>["ctx"]["admin"];
const send = async (ctx: Ctx, over: Partial<MessageFormInput> = {}) => {
  const { id } = await saveDraft(ctx, input(over));
  await sendDraft(ctx, id);
  return id;
};

describe("Nachrichten als Chats", () => {
  it("gruppiert nach Zielgruppe, neuester Chat zuerst, mit ungelesenen Nachrichten", async () => {
    const { fussball, ctx } = await setup();
    await send(ctx.admin, { subject: "Willkommen", body: "Hallo alle" });
    await send(ctx.admin, { subject: "Sommerfest", body: "Bitte helft mit" });
    await send(ctx.lead, {
      subject: "Training",
      body: "Training fällt aus",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });

    // Hanna (Fußball) bekommt beides; der jüngste Chat steht oben.
    const helperChats = await listChats(ctx.helper);
    expect(helperChats.map((chat) => [chat.title, chat.unread])).toEqual([
      ["Abteilung Fußball", 1],
      ["Alle Mitglieder", 2],
    ]);
    expect(helperChats[0]!.last).toMatchObject({ author: "Lea Leitung", mine: false });
    expect(helperChats[0]!.last.preview).toBe("Training fällt aus"); // Betreff = Textanfang → der Text

    // Max (Handball) sieht den Fußball-Chat nicht; Anna (Verein) sieht als Absenderin alles – ihre eigenen als „Du“.
    expect((await listChats(ctx.member)).map((chat) => chat.title)).toEqual(["Alle Mitglieder"]);
    const adminChats = await listChats(ctx.admin);
    expect(adminChats.map((chat) => chat.title)).toEqual(["Abteilung Fußball", "Alle Mitglieder"]);
    expect(adminChats[1]!.last).toMatchObject({ mine: true, preview: "Sommerfest" });
  });

  it("Öffnen zeigt die Nachrichten in zeitlicher Folge und markiert sie samt Benachrichtigung als gelesen", async () => {
    const { ctx } = await setup();
    const first = await send(ctx.admin, { subject: "Erste", body: "Eins" });
    const second = await send(ctx.admin, { subject: "Zweite", body: "Zwei" });
    expect(await countUnreadMessages(ctx.helper)).toBe(2);

    const chat = await getChat(ctx.helper, "alle");
    expect(chat?.messages.map((message) => message.id)).toEqual([first, second]);
    expect(chat?.messages[0]).toMatchObject({
      author: "Anna Admin",
      mine: false,
      readCount: null, // Empfänger sehen keine Lesestatistik
      canDelete: false,
    });
    // Hanna gehört zu allen Mitgliedern: Sie schreibt mit – aber ohne Ankündigung und E-Mail.
    expect(chat).toMatchObject({ canPost: true, canAnnounce: false });

    expect(await countUnreadMessages(ctx.helper)).toBe(0);
    expect((await listChats(ctx.helper))[0]!.unread).toBe(0);
    expect(
      await prisma.notification.count({
        where: { userId: ctx.helper.userId, type: "MESSAGE", readAt: null },
      }),
    ).toBe(0);

    // Die Absenderin sieht ihre Nachrichten rechts („mine“) mit Lesestatistik und darf zurückrufen.
    const own = await getChat(ctx.admin, "alle");
    expect(own?.messages.at(-1)).toMatchObject({ mine: true, canDelete: true });
    expect(own?.messages.at(-1)?.readCount).toBe(1); // Hanna hat geöffnet
    expect(own).toMatchObject({ canPost: true, canAnnounce: true });
    expect(own?.reach).toBeGreaterThan(0);
  });

  it("Schreiben: Abteilungsleitung kündigt nur in der eigenen Abteilung an – auch in einem noch leeren Chat; bei allen schreibt sie als Mitglied", async () => {
    const { club, fussball, handball, ctx } = await setup();
    await send(ctx.admin, { subject: "Info", body: "An alle" });

    // Bei „Alle Mitglieder“ gehört Lea selbst dazu: einfache Nachrichten ja, Ankündigung und E-Mail nein.
    const leadAll = await getChat(ctx.lead, "alle");
    expect(leadAll).toMatchObject({ canPost: true, canAnnounce: false });
    const ownDept = await getChat(ctx.lead, `abteilung-${fussball.id}`);
    expect(ownDept).toMatchObject({
      canPost: true,
      canAnnounce: true,
      messages: [],
      title: "Abteilung Fußball",
    });
    expect(await getChat(ctx.lead, `abteilung-${handball.id}`)).toBeNull(); // weder geleitet noch Mitglied

    // Auch Veranstaltungen der eigenen Abteilung leitet sie – ohne selbst zugesagt zu haben.
    const turnier = await createEvent(club.id, { title: "Turnier", departmentId: fussball.id });
    expect(await getChat(ctx.lead, `teilnehmer-${turnier.id}`)).toMatchObject({
      canPost: true,
      canAnnounce: true,
      messages: [],
      title: "Teilnehmer · Turnier",
    });

    // Ohne Nachrichten und ohne Schreibrecht gibt es den Chat nicht – auch nicht über einen erratenen Schlüssel.
    expect(await getChat(ctx.member, `abteilung-${fussball.id}`)).toBeNull();
    expect(await getChat(ctx.member, `teilnehmer-${turnier.id}`)).toBeNull();
    expect(await getChat(ctx.member, "unsinn")).toBeNull();
  });

  it("Mitglieder schreiben in die Chats ihrer Gruppen – auch in noch leere; in fremden Abteilungen nicht", async () => {
    const { club, fussball, handball, people, ctx } = await setup();

    // Max gehört zu allen Mitgliedern und zu Handball: Dort gibt es den Chat für ihn schon, bevor jemand schreibt.
    expect(await getChat(ctx.member, "alle")).toMatchObject({
      canPost: true,
      canAnnounce: false,
      messages: [],
      title: "Alle Mitglieder",
    });
    expect(await getChat(ctx.member, `abteilung-${handball.id}`)).toMatchObject({
      canPost: true,
      canAnnounce: false,
      messages: [],
      title: "Abteilung Handball",
    });

    // Fußball ist nicht seine Abteilung – der Chat bleibt verborgen, auch wenn dort geschrieben wird.
    expect(await getChat(ctx.member, `abteilung-${fussball.id}`)).toBeNull();
    await send(ctx.admin, {
      audience: "DEPARTMENT",
      departmentId: fussball.id,
      body: "Nur Fußball",
    });
    expect(await getChat(ctx.member, `abteilung-${fussball.id}`)).toBeNull();

    // Verlässt er Handball, liest er dort weiter, was an ihn ging – schreiben kann er nicht mehr.
    const alt = await send(ctx.admin, {
      audience: "DEPARTMENT",
      departmentId: handball.id,
      subject: "Hallenzeiten",
      body: "Ab Montag neue Hallenzeiten",
    });
    await prisma.memberDepartment.deleteMany({
      where: { clubId: club.id, memberId: people.member.member.id, departmentId: handball.id },
    });
    const left = await getChat(ctx.member, `abteilung-${handball.id}`);
    expect(left).toMatchObject({ canPost: false, canAnnounce: false, reach: null });
    expect(left?.messages.map((message) => message.id)).toEqual([alt]);
  });

  it("Schreibt ein Mitglied, sehen die anderen es mit seinem Namen – verwalten dürfen nur es selbst und der Verein", async () => {
    const { club, people, ctx } = await setup();
    const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
    const boardCtx = await contextFor(board.user.id, club.id);
    const id = await send(ctx.member, {
      subject: "Wer fährt Samstag mit?",
      body: "Wer fährt Samstag mit?",
    });

    // Die anderen Mitglieder sehen die Nachricht links mit Max' Namen – ohne Lesestatistik und ohne Zurückrufen.
    expect((await listChats(ctx.helper))[0]).toMatchObject({
      title: "Alle Mitglieder",
      unread: 1,
      last: { author: "Max Mitglied", mine: false },
    });
    for (const other of [ctx.helper, ctx.lead]) {
      const chat = await getChat(other, "alle");
      expect(chat?.messages).toEqual([
        expect.objectContaining({
          id,
          author: "Max Mitglied",
          mine: false,
          readCount: null,
          canDelete: false,
        }),
      ]);
    }
    await expect(deleteMessage(ctx.helper, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteMessage(ctx.lead, id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Der Vorstand verwaltet alle Nachrichten: Er sieht, wie viele sie geöffnet haben, und darf zurückrufen.
    const boardChat = await getChat(boardCtx, "alle");
    expect(boardChat?.messages[0]).toMatchObject({
      id,
      author: "Max Mitglied",
      mine: false,
      readCount: 2, // Hanna und Lea
      canDelete: true,
    });

    // Max selbst sieht seine Nachricht rechts – er ist nicht ihr Empfänger (Anna, Lea, Hanna, Bernd).
    const own = await getChat(ctx.member, "alle");
    expect(own?.messages[0]).toMatchObject({
      id,
      mine: true,
      recipientCount: 4,
      readCount: 3,
      canDelete: true,
    });
    expect(await countUnreadMessages(ctx.member)).toBe(0);
    expect(
      await prisma.messageRecipient.count({
        where: { messageId: id, userId: people.member.user.id },
      }),
    ).toBe(0);

    // Ruft der Vorstand sie zurück, verschwindet sie – der Chat zum Schreiben bleibt.
    await deleteMessage(boardCtx, id);
    expect(await getChat(ctx.helper, "alle")).toMatchObject({ canPost: true, messages: [] });
  });

  it("Wer einer Veranstaltung absagt, schreibt nicht mehr im Teilnehmer-Chat – liest aber, was an ihn ging", async () => {
    const { club, people, ctx } = await setup();
    const fest = await createEvent(club.id, { title: "Sommerfest" });
    await prisma.eventParticipant.createMany({
      data: [people.helper, people.member].map((person) => ({
        clubId: club.id,
        eventId: fest.id,
        memberId: person.member.id,
        status: "ACCEPTED" as const,
      })),
    });
    const key = `teilnehmer-${fest.id}`;
    expect(await getChat(ctx.member, key)).toMatchObject({
      canPost: true,
      canAnnounce: false,
      messages: [],
      title: "Teilnehmer · Sommerfest",
    });
    const id = await send(ctx.admin, {
      audience: "EVENT_PARTICIPANTS",
      eventId: fest.id,
      subject: "Treffpunkt",
      body: "Treffpunkt 10 Uhr am Eingang",
    });

    await prisma.eventParticipant.updateMany({
      where: { eventId: fest.id, memberId: people.member.member.id },
      data: { status: "DECLINED" },
    });
    const chat = await getChat(ctx.member, key);
    expect(chat).toMatchObject({ canPost: false, canAnnounce: false, reach: null });
    expect(chat?.messages.map((message) => message.id)).toEqual([id]);
    // Der Versand prüft dieselbe Regel: Nach der Absage geht auch über das Formular nichts mehr an die Teilnehmer.
    await expect(
      saveDraft(ctx.member, input({ audience: "EVENT_PARTICIPANTS", eventId: fest.id })),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { eventId: [expect.any(String)] } });

    // Hanna hat weiter zugesagt und schreibt dort.
    expect(await getChat(ctx.helper, key)).toMatchObject({ canPost: true, canAnnounce: false });
  });

  it("Fremde Abteilung bleibt verborgen, Zurückgerufenes verschwindet, Entwürfe zählen nur für ihre Verfasser", async () => {
    const { fussball, ctx } = await setup();
    const training = await send(ctx.lead, {
      subject: "Training",
      body: "Heute 18 Uhr",
      audience: "DEPARTMENT",
      departmentId: fussball.id,
    });
    expect(await getChat(ctx.member, `abteilung-${fussball.id}`)).toBeNull(); // Max ist Handballer

    await deleteMessage(ctx.lead, training);
    expect((await listChats(ctx.helper)).map((chat) => chat.title)).toEqual([]);
    // Hanna (Fußball) kann in ihrer Abteilung weiter schreiben – die zurückgerufene Nachricht steht dort nicht mehr.
    expect(await getChat(ctx.helper, `abteilung-${fussball.id}`)).toMatchObject({
      canPost: true,
      messages: [],
    });
    expect(await getChat(ctx.member, `abteilung-${fussball.id}`)).toBeNull();

    await saveDraft(ctx.admin, input({ subject: "Später" }));
    await saveDraft(ctx.member, input({ subject: "Frage an alle" }));
    expect(await countDrafts(ctx.admin)).toBe(1);
    expect(await countDrafts(ctx.member)).toBe(1);
    expect(await countDrafts(ctx.lead)).toBe(0);
    expect(await countDrafts(ctx.helper)).toBe(0);
  });
});
