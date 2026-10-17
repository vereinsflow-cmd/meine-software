import { describe, expect, it } from "vitest";
import { addChatMembers, getAddMembersOptions } from "@/modules/messages/chat-members";
import { getChat, listChats } from "@/modules/messages/chats";
import { parseChatKey } from "@/modules/messages/chat-format";
import { messageFormSchema } from "@/modules/messages/schemas";
import { saveDraft, sendDraft } from "@/modules/messages/service";
import { prisma } from "@/server/db/client";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
  createMember,
} from "../helpers/factories";

/**
 * Mitglieder einer Chat-Gruppe später hinzufügen: Abteilung (nur Vorstand/Verwaltung) bzw. zugesagte Teilnehmer einer
 * Veranstaltung (wer die Teilnehmerliste verwaltet). Im Verlauf steht „Anna hat Max hinzugefügt“; die Neuen finden den
 * Chat in ihrer Liste, ältere Nachrichten sehen sie nicht.
 */
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
  // Ohne Benutzerkonto (z. B. aus dem Import): gehört nach dem Hinzufügen zur Gruppe, liest aber (noch) nicht mit.
  const paula = await createMember(club.id, { firstName: "Paula", lastName: "Papier" });
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
  return { club, fussball, handball, people: { admin, lead, helper, member, paula }, ctx };
}

const notes = (clubId: string) =>
  prisma.message.count({ where: { clubId, kind: "MEMBERS_ADDED" } });
const inDepartment = (memberId: string, departmentId: string) =>
  prisma.memberDepartment.count({ where: { memberId, departmentId } });

describe("Chat-Gruppen: Mitglieder hinzufügen", () => {
  it("Vorstand nimmt in die Abteilung auf: Hinweis im Verlauf, die Neuen finden den Chat – ohne ältere Nachrichten", async () => {
    const { club, fussball, people, ctx } = await setup();
    const { id: old } = await saveDraft(
      ctx.admin,
      messageFormSchema.parse({
        subject: "Training",
        body: "Training am Dienstag",
        audience: "DEPARTMENT",
        departmentId: fussball.id,
        isAnnouncement: false,
        sendEmail: false,
      }),
    );
    await sendDraft(ctx.admin, old);
    const chat = `abteilung-${fussball.id}`;

    // Zur Auswahl steht, wer noch nicht dazugehört (Hanna schon, Lea als Leitung schon) – alphabetisch, mit Kontohinweis.
    const options = await getAddMembersOptions(ctx.admin, parseChatKey(chat)!);
    expect(options).toMatchObject({ audience: "DEPARTMENT", name: "Fußball" });
    const names = options!.candidates.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(["Mitglied, Max", "Papier, Paula", "Admin, Anna"]),
    );
    expect(names).not.toContain("Helfer, Hanna");
    expect(names).not.toContain("Leitung, Lea");
    expect(options!.candidates.find((c) => c.name === "Papier, Paula")?.hasAccount).toBe(false);
    expect(options!.candidates.find((c) => c.name === "Mitglied, Max")?.hasAccount).toBe(true);

    const result = await addChatMembers(ctx.admin, {
      chat,
      memberIds: [people.paula.id, people.member.member.id],
    });
    expect(result.added).toBe(2);
    expect(await inDepartment(people.member.member.id, fussball.id)).toBe(1);
    expect(await inDepartment(people.paula.id, fussball.id)).toBe(1);

    // Max findet den Chat in seiner Liste – ungelesen, mit dem Hinweis als Vorschau.
    const maxChats = await listChats(ctx.member);
    expect(maxChats[0]).toMatchObject({ title: "Abteilung Fußball", unread: 1 });
    expect(maxChats[0]!.last).toMatchObject({
      note: true,
      preview: "Anna Admin hat Max Mitglied und Paula Papier hinzugefügt",
    });
    expect(
      await prisma.notification.count({
        where: {
          userId: ctx.member.userId,
          type: "MESSAGE",
          title: "Abteilung Fußball: Anna Admin hat dich hinzugefügt",
        },
      }),
    ).toBe(1);
    // Im Chat sieht er nur den Hinweis (wie bei WhatsApp) und schreibt ab jetzt mit.
    const maxChat = await getChat(ctx.member, chat);
    expect(maxChat?.messages.map((m) => m.kind)).toEqual(["MEMBERS_ADDED"]);
    expect(maxChat?.messages[0]).toMatchObject({
      author: "Anna Admin",
      mine: false,
      body: "Max Mitglied und Paula Papier",
      canDelete: false,
      readCount: null,
    });
    expect(maxChat?.canPost).toBe(true);

    // Für Hanna (schon dabei) ist der Hinweis kein „Ungelesen“; die Leitung bekommt ihn ebenso.
    const hannaChat = (await listChats(ctx.helper)).find((c) => c.title === "Abteilung Fußball");
    expect(hannaChat?.unread).toBe(1); // nur das Training von vorher
    expect(hannaChat?.last.preview).toBe(
      "Anna Admin hat Max Mitglied und Paula Papier hinzugefügt",
    );
    // Anna sieht „Du hast …“ – ohne Häkchen und ohne Zurückrufen.
    const own = await getChat(ctx.admin, chat);
    expect(own?.messages.at(-1)).toMatchObject({
      kind: "MEMBERS_ADDED",
      mine: true,
      canDelete: false,
      readCount: null,
    });
    expect((await listChats(ctx.admin))[0]!.last).toMatchObject({
      note: true,
      preview: "Du hast Max Mitglied und Paula Papier hinzugefügt",
    });

    // Protokoll wie auf der Abteilungsseite.
    expect(
      await prisma.auditLog.count({
        where: { clubId: club.id, action: "department.member_added", entityId: fussball.id },
      }),
    ).toBe(2);
    // Keine Auswahl mehr für die Hinzugefügten.
    const after = await getAddMembersOptions(ctx.admin, parseChatKey(chat)!);
    expect(after!.candidates.map((c) => c.name)).not.toContain("Mitglied, Max");
  });

  it("Rechte: Leitung, Helfer und Mitglieder nehmen niemanden in eine Abteilung auf; „Alle Mitglieder“ und Helfer-Chats gar nicht", async () => {
    const { club, fussball, people, ctx } = await setup();
    const chat = `abteilung-${fussball.id}`;
    const target = parseChatKey(chat)!;
    for (const who of [ctx.lead, ctx.helper, ctx.member]) {
      expect(await getAddMembersOptions(who, target)).toBeNull();
      await expect(
        addChatMembers(who, { chat, memberIds: [people.paula.id] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    const fest = await createEvent(club.id, { title: "Sommerfest" });
    for (const other of ["alle", `helfer-${fest.id}`]) {
      expect(await getAddMembersOptions(ctx.admin, parseChatKey(other)!)).toBeNull();
      await expect(
        addChatMembers(ctx.admin, { chat: other, memberIds: [people.paula.id] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      addChatMembers(ctx.admin, { chat: "unsinn", memberIds: [people.paula.id] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await inDepartment(people.paula.id, fussball.id)).toBe(0);
    expect(await notes(club.id)).toBe(0);
  });

  it("Keine Doppelten: wer schon dazugehört, wird übersprungen; gehören alle schon dazu, gibt es einen Hinweis", async () => {
    const { club, fussball, people, ctx } = await setup();
    const chat = `abteilung-${fussball.id}`;
    const result = await addChatMembers(ctx.admin, {
      chat,
      // Hanna ist schon in Fußball, Max steht doppelt in der Auswahl.
      memberIds: [people.helper.member.id, people.member.member.id, people.member.member.id],
    });
    expect(result.added).toBe(1);
    expect(await inDepartment(people.member.member.id, fussball.id)).toBe(1);
    expect(await inDepartment(people.helper.member.id, fussball.id)).toBe(1);
    expect(
      (await prisma.message.findFirst({ where: { clubId: club.id, kind: "MEMBERS_ADDED" } }))?.body,
    ).toBe("Max Mitglied");

    await expect(
      addChatMembers(ctx.admin, { chat, memberIds: [people.member.member.id] }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Diese Person gehört schon zur Abteilung.",
    });
    expect(await notes(club.id)).toBe(1);
    // Der Hinweis ging einmal an jeden in der Gruppe (Hanna, Lea, Max) – nicht an Anna selbst.
    const note = await prisma.message.findFirst({
      where: { clubId: club.id, kind: "MEMBERS_ADDED" },
    });
    expect(note?.recipientCount).toBe(3);
    expect(await prisma.messageRecipient.count({ where: { messageId: note!.id } })).toBe(3);
  });

  it("Nur der eigene Verein: Mitglieder und Abteilungen anderer Vereine sind nicht erreichbar, archivierte auch nicht", async () => {
    const { club, fussball, people, ctx } = await setup();
    const other = await createClub("Anderer Verein");
    const stranger = await createMember(other.id, { firstName: "Fritz", lastName: "Fremd" });
    const otherDepartment = await createDepartment(other.id, "Schach");
    const archived = await createMember(club.id, { firstName: "Alf", lastName: "Archiv" });
    await prisma.member.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    const chat = `abteilung-${fussball.id}`;
    await expect(
      addChatMembers(ctx.admin, { chat, memberIds: [stranger.id] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Auch zusammen mit einem gültigen: alles oder nichts.
    await expect(
      addChatMembers(ctx.admin, { chat, memberIds: [people.paula.id, archived.id] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addChatMembers(ctx.admin, {
        chat: `abteilung-${otherDepartment.id}`,
        memberIds: [people.paula.id],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await getAddMembersOptions(ctx.admin, parseChatKey(`abteilung-${otherDepartment.id}`)!),
    ).toBeNull();
    expect(
      (await getAddMembersOptions(ctx.admin, parseChatKey(chat)!))!.candidates.map((c) => c.name),
    ).not.toEqual(expect.arrayContaining(["Fremd, Fritz", "Archiv, Alf"]));

    expect(
      await prisma.memberDepartment.count({
        where: { memberId: { in: [stranger.id, archived.id, people.paula.id] } },
      }),
    ).toBe(0);
    expect(await notes(club.id)).toBe(0);
    expect(await notes(other.id)).toBe(0);
  });

  it("Veranstaltung: Leitung meldet im Teilnehmer-Chat an – nur bei Veranstaltungen ihrer Abteilung; das Limit gilt", async () => {
    const { club, fussball, handball, people, ctx } = await setup();
    const turnier = await createEvent(club.id, { title: "Turnier", departmentId: fussball.id });
    // Hanna hat schon abgesagt – ihre Antwort bleibt, sie steht nicht zur Auswahl.
    await prisma.eventParticipant.create({
      data: {
        clubId: club.id,
        eventId: turnier.id,
        memberId: people.helper.member.id,
        status: "DECLINED",
        respondedAt: new Date(),
      },
    });
    const chat = `teilnehmer-${turnier.id}`;
    const options = await getAddMembersOptions(ctx.lead, parseChatKey(chat)!);
    expect(options).toMatchObject({ audience: "EVENT_PARTICIPANTS", name: "Turnier" });
    expect(options!.candidates.map((c) => c.name)).not.toContain("Helfer, Hanna");
    await expect(
      addChatMembers(ctx.lead, { chat, memberIds: [people.helper.member.id] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(
      await addChatMembers(ctx.lead, { chat, memberIds: [people.member.member.id] }),
    ).toMatchObject({ added: 1 });
    expect(
      await prisma.eventParticipant.findFirst({
        where: { eventId: turnier.id, memberId: people.member.member.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ACCEPTED" });
    const maxChat = (await listChats(ctx.member)).find((c) => c.title === "Teilnehmer · Turnier");
    expect(maxChat).toMatchObject({ unread: 1 });
    expect(maxChat!.last.preview).toBe("Lea Leitung hat Max Mitglied hinzugefügt");
    expect((await getChat(ctx.member, chat))?.canPost).toBe(true);

    // Eine Veranstaltung von Handball verwaltet Lea nicht; Mitglieder dürfen gar nicht anmelden.
    const spiel = await createEvent(club.id, { title: "Spiel", departmentId: handball.id });
    expect(
      await getAddMembersOptions(ctx.lead, parseChatKey(`teilnehmer-${spiel.id}`)!),
    ).toBeNull();
    await expect(
      addChatMembers(ctx.lead, { chat: `teilnehmer-${spiel.id}`, memberIds: [people.paula.id] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      addChatMembers(ctx.member, { chat, memberIds: [people.paula.id] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Limit: Nur ein Platz frei, zwei ausgewählt – niemand wird angemeldet, kein Hinweis.
    const kurs = await createEvent(club.id, {
      title: "Kurs",
      departmentId: fussball.id,
      maxParticipants: 1,
    });
    await expect(
      addChatMembers(ctx.admin, {
        chat: `teilnehmer-${kurs.id}`,
        memberIds: [people.member.member.id, people.paula.id],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Teilnehmerlimit"),
    });
    expect(await prisma.eventParticipant.count({ where: { eventId: kurs.id } })).toBe(0);
    expect(await prisma.message.count({ where: { eventId: kurs.id } })).toBe(0);

    // Abgesagte Veranstaltung: kein Knopf, keine Anmeldung.
    const abgesagt = await createEvent(club.id, { departmentId: fussball.id, status: "CANCELLED" });
    expect(
      await getAddMembersOptions(ctx.admin, parseChatKey(`teilnehmer-${abgesagt.id}`)!),
    ).toBeNull();
    await expect(
      addChatMembers(ctx.admin, {
        chat: `teilnehmer-${abgesagt.id}`,
        memberIds: [people.paula.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
