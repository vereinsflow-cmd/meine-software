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
import { addUserToClub, contextFor, createClub, createDepartment } from "../helpers/factories";

/** Nachrichten als Chats: dieselbe Sichtbarkeit wie Posteingang und „Gesendet“, gruppiert nach Zielgruppe. */
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
  return { fussball, handball, ctx };
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
    expect(chat?.canPost).toBe(false);

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
    expect(own?.canPost).toBe(true);
    expect(own?.reach).toBeGreaterThan(0);
  });

  it("Schreiben: Abteilungsleitung nur im Chat der eigenen Abteilung – auch in einem noch leeren", async () => {
    const { fussball, handball, ctx } = await setup();
    await send(ctx.admin, { subject: "Info", body: "An alle" });

    const leadAll = await getChat(ctx.lead, "alle");
    expect(leadAll?.canPost).toBe(false); // empfängt, darf dort aber nicht schreiben
    const ownDept = await getChat(ctx.lead, `abteilung-${fussball.id}`);
    expect(ownDept).toMatchObject({ canPost: true, messages: [], title: "Abteilung Fußball" });
    expect(await getChat(ctx.lead, `abteilung-${handball.id}`)).toBeNull();

    // Ohne Nachrichten und ohne Schreibrecht gibt es den Chat nicht – auch nicht über einen erratenen Schlüssel.
    expect(await getChat(ctx.member, `abteilung-${fussball.id}`)).toBeNull();
    expect(await getChat(ctx.member, "unsinn")).toBeNull();
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
    expect(await getChat(ctx.helper, `abteilung-${fussball.id}`)).toBeNull();

    await saveDraft(ctx.admin, input({ subject: "Später" }));
    expect(await countDrafts(ctx.admin)).toBe(1);
    expect(await countDrafts(ctx.lead)).toBe(0);
    expect(await countDrafts(ctx.member)).toBe(0);
  });
});
