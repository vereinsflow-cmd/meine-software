import { describe, expect, it, vi } from "vitest";

// Benachrichtigungen mit E-Mail würden sonst in die (globale) Mail-Warteschlange laufen; hier zählt nur, was in der Datenbank steht.
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async () => undefined,
  sendMail: async () => undefined,
}));

import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/client";
import {
  createTicket,
  getContactsForEdit,
  getHelpOverview,
  listMyTickets,
  listTickets,
  saveContacts,
  updateTicket,
} from "@/modules/help/service";
import type { TicketInput } from "@/modules/help/schemas";
import { purgeOldTickets } from "@/server/jobs/retention";
import { buildUserDataExport } from "@/server/privacy/export";
import { executeDeletionRequest, requestAccountDeletion } from "@/server/privacy/deletion";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

const first = { page: 1, pageSize: 25, skip: 0 };
const DAY = 86_400_000;
const PASSWORD = "Ein-Sehr-Langes-Passwort-2026";
const input = (over: Partial<TicketInput> = {}): TicketInput => ({
  category: "PROBLEM",
  subject: "Schicht lässt sich nicht buchen",
  description: "Ich klicke auf „Eintragen“ und es passiert nichts.",
  pagePath: undefined,
  ...over,
});

async function setup() {
  const club = await createClub("Hilfeverein");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const admin2 = await addUserToClub(club, "CLUB_ADMIN", {
    firstName: "Adam",
    lastName: "Zweitadmin",
  });
  const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
  const helper = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const member = await addUserToClub(club, "MEMBER", { firstName: "Maria", lastName: "Mitglied" });
  return {
    club,
    people: { admin, admin2, board, helper, member },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      admin2: await contextFor(admin2.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

describe("Support-Meldungen: erstellen", () => {
  it("jedes Mitglied kann melden; die Meldung wird gespeichert, protokolliert und die Verwaltung benachrichtigt", async () => {
    const { club, people, ctx } = await setup();
    const { id } = await createTicket(
      ctx.member,
      input({ pagePath: "/helferplanung" }),
      "Edge auf Windows",
    );

    const row = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      clubId: club.id,
      createdById: people.member.user.id,
      category: "PROBLEM",
      subject: "Schicht lässt sich nicht buchen",
      pagePath: "/helferplanung",
      userAgent: "Edge auf Windows",
      status: "OPEN",
      response: null,
    });

    // Nur wer den Verein verwalten darf (club:update), wird benachrichtigt – nicht Vorstand, Helfer oder die meldende Person.
    const notified = await prisma.notification.findMany({
      where: { clubId: club.id, title: { startsWith: "Neue Meldung" } },
    });
    expect(notified.map((n) => n.userId).sort()).toEqual(
      [people.admin.user.id, people.admin2.user.id].sort(),
    );
    expect(notified[0]).toMatchObject({
      type: "SYSTEM",
      linkUrl: "/hilfe/meldungen",
      emailStatus: "PENDING",
    });
    expect(notified[0]!.body).toBe("Fehler oder Problem von Maria Mitglied");
    expect(notified[0]!.body).not.toContain(input().description); // der Text steht nicht in der Benachrichtigung

    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "support.ticket_created" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: people.member.user.id, entityId: id });
  });

  it("auch Helfer und Verwaltung dürfen melden; ein Administrator meldet ohne sich selbst zu benachrichtigen", async () => {
    const { people, ctx } = await setup();
    await createTicket(ctx.helper, input(), null);
    await createTicket(ctx.admin, input({ subject: "Frage der Verwaltung" }), null);
    const forAdmin = await prisma.notification.findMany({
      where: { userId: people.admin.user.id, title: { startsWith: "Neue Meldung" } },
    });
    expect(forAdmin.map((n) => n.title)).toEqual(["Neue Meldung: Schicht lässt sich nicht buchen"]); // nur die des Helfers
  });

  it("Texte werden unverändert als Text gespeichert (nie ausgewertet) und Geräteangaben gekürzt", async () => {
    const { ctx } = await setup();
    const html = "<img src=x onerror=alert(1)> und <script>alert(2)</script>";
    const { id } = await createTicket(ctx.member, input({ description: html }), "x".repeat(300));
    const row = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(row.description).toBe(html);
    expect(row.userAgent).toHaveLength(100);
  });

  it("begrenzt Meldungen je Person auf 10 pro Stunde", async () => {
    const { ctx } = await setup();
    for (let i = 0; i < 10; i += 1)
      await createTicket(ctx.member, input({ subject: `Meldung ${i + 1}` }), null);
    await expect(
      createTicket(ctx.member, input({ subject: "Meldung 11" }), null),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    // andere Personen sind davon nicht betroffen
    await expect(createTicket(ctx.helper, input(), null)).resolves.toHaveProperty("id");
  });

  it("die Datenbank lehnt externe Seitenadressen ab (auch wenn der Code sie durchließe)", async () => {
    const { club, people } = await setup();
    const base = {
      clubId: club.id,
      createdById: people.member.user.id,
      category: "PROBLEM" as const,
      subject: "x",
      description: "y",
    };
    await expect(
      prisma.supportTicket.create({ data: { ...base, pagePath: "https://boese.example" } }),
    ).rejects.toThrow();
    await expect(
      prisma.supportTicket.create({ data: { ...base, pagePath: "//boese.example" } }),
    ).rejects.toThrow();
    await expect(
      prisma.supportTicket.create({ data: { ...base, subject: "   " } }),
    ).rejects.toThrow();
    await expect(
      prisma.supportTicket.create({ data: { ...base, pagePath: "/profil" } }),
    ).resolves.toBeTruthy();
  });
});

describe("Support-Meldungen: ansehen und bearbeiten", () => {
  it("die meldende Person sieht nur die EIGENEN Meldungen; die Verwaltung alle – mit Name und E-Mail", async () => {
    const { people, ctx } = await setup();
    await createTicket(ctx.member, input({ subject: "Von Maria" }), null);
    await createTicket(ctx.helper, input({ subject: "Von Hanna" }), null);

    expect((await listMyTickets(ctx.member)).map((t) => t.subject)).toEqual(["Von Maria"]);
    expect((await listMyTickets(ctx.helper)).map((t) => t.subject)).toEqual(["Von Hanna"]);

    const all = await listTickets(ctx.admin, { request: first });
    expect(all.total).toBe(2);
    const maria = all.items.find((t) => t.subject === "Von Maria")!;
    expect(maria.reporter).toEqual({ name: "Maria Mitglied", email: people.member.user.email });
  });

  it("Mitglieder, Helfer und Vorstand können die Meldungen des Vereins weder lesen noch bearbeiten", async () => {
    const { ctx } = await setup();
    const { id } = await createTicket(ctx.member, input(), null);
    for (const who of [ctx.member, ctx.helper, ctx.board]) {
      await expect(listTickets(who, { request: first })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        updateTicket(who, id, { status: "DONE", response: undefined }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getContactsForEdit(who)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(saveContacts(who, { contacts: [] })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });

  it("Mandantentrennung: ein anderer Verein sieht und ändert nichts", async () => {
    const { ctx } = await setup();
    const { id } = await createTicket(ctx.member, input({ subject: "Geheimes Anliegen" }), null);

    const other = await createClub("Fremdverein");
    const foreignAdmin = await addUserToClub(other, "CLUB_ADMIN");
    const foreign = await contextFor(foreignAdmin.user.id, other.id);
    expect((await listTickets(foreign, { request: first })).total).toBe(0);
    expect(await listMyTickets(foreign)).toEqual([]);
    await expect(
      updateTicket(foreign, id, { status: "DONE", response: "Hallo" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
    expect((await getHelpOverview(foreign)).openTickets).toBe(0);
  });

  it("Status und Antwort: Bearbeiter, Zeitpunkt, Protokoll – und die meldende Person wird benachrichtigt", async () => {
    const { club, people, ctx } = await setup();
    const { id } = await createTicket(ctx.member, input(), null);

    await updateTicket(ctx.admin, id, {
      status: "IN_PROGRESS",
      response: "Wir schauen es uns an.",
    });
    const row = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: "IN_PROGRESS",
      response: "Wir schauen es uns an.",
      respondedById: people.admin.user.id,
    });
    expect(row.respondedAt).toBeInstanceOf(Date);

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: people.member.user.id, title: { startsWith: "Deine Meldung" } },
    });
    expect(note).toMatchObject({
      title: "Deine Meldung „Schicht lässt sich nicht buchen“: In Bearbeitung",
      body: "Wir schauen es uns an.",
      linkUrl: "/hilfe",
    });

    const mine = await listMyTickets(ctx.member);
    expect(mine[0]).toMatchObject({ status: "IN_PROGRESS", response: "Wir schauen es uns an." });

    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "support.ticket_updated" },
    });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]!.changes)).not.toContain("Wir schauen es uns an"); // die Antwort selbst steht nicht im Protokoll
  });

  it("eine Änderung ohne Unterschied tut nichts (keine Doppel-Benachrichtigung, kein Protokoll)", async () => {
    const { club, ctx } = await setup();
    const { id } = await createTicket(ctx.member, input(), null);
    await updateTicket(ctx.admin, id, { status: "DONE", response: "Erledigt." });
    await updateTicket(ctx.admin, id, { status: "DONE", response: "Erledigt." });
    expect(
      await prisma.notification.count({
        where: { clubId: club.id, title: { startsWith: "Deine Meldung" } },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "support.ticket_updated" } }),
    ).toBe(1);
  });

  it("eine geleerte Antwort entfernt Zeitpunkt und Bearbeiter", async () => {
    const { ctx } = await setup();
    const { id } = await createTicket(ctx.member, input(), null);
    await updateTicket(ctx.admin, id, { status: "OPEN", response: "Erste Antwort" });
    await updateTicket(ctx.admin, id, { status: "OPEN", response: undefined });
    expect(await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).toMatchObject({
      response: null,
      respondedAt: null,
      respondedById: null,
    });
  });

  it("Filter nach Status und Zählung offener Meldungen", async () => {
    const { ctx } = await setup();
    const a = await createTicket(ctx.member, input({ subject: "Offen" }), null);
    const b = await createTicket(ctx.member, input({ subject: "Laufend" }), null);
    const c = await createTicket(ctx.member, input({ subject: "Fertig" }), null);
    await updateTicket(ctx.admin, b.id, { status: "IN_PROGRESS", response: undefined });
    await updateTicket(ctx.admin, c.id, { status: "DONE", response: undefined });
    void a;

    expect(
      (await listTickets(ctx.admin, { status: "OPEN_ALL", request: first })).items
        .map((t) => t.subject)
        .sort(),
    ).toEqual(["Laufend", "Offen"]);
    expect(
      (await listTickets(ctx.admin, { status: "DONE", request: first })).items.map(
        (t) => t.subject,
      ),
    ).toEqual(["Fertig"]);
    expect((await listTickets(ctx.admin, { request: first })).total).toBe(3);
    expect((await getHelpOverview(ctx.admin)).openTickets).toBe(2);
    expect((await getHelpOverview(ctx.member)).openTickets).toBeNull(); // Nur die Verwaltung sieht die Zahl
  });
});

describe("Ansprechpartner", () => {
  it("speichern, lesen, überschreiben – andere Vereinseinstellungen bleiben erhalten", async () => {
    const { club, ctx } = await setup();
    await prisma.club.update({
      where: { id: club.id },
      data: { settings: { retention: { trashDays: 60, leftMembersMonths: 12, auditMonths: 24 } } },
    });

    await saveContacts(ctx.admin, {
      contacts: [
        { name: "Anna Admin", role: "Technik", email: "anna@example.org", phone: undefined },
        { name: "Bernd Vorstand", role: undefined, email: undefined, phone: "0123 456" },
      ],
    });
    const overview = await getHelpOverview(ctx.member); // auch Mitglieder sehen sie
    expect(overview.contacts).toEqual([
      { name: "Anna Admin", role: "Technik", email: "anna@example.org", phone: null },
      { name: "Bernd Vorstand", role: null, email: null, phone: "0123 456" },
    ]);
    const settings = (await prisma.club.findUniqueOrThrow({ where: { id: club.id } }))
      .settings as Record<string, unknown>;
    expect(settings.retention).toEqual({ trashDays: 60, leftMembersMonths: 12, auditMonths: 24 });

    await saveContacts(ctx.admin, { contacts: [] });
    expect((await getHelpOverview(ctx.member)).contacts).toEqual([]);
    expect(await getContactsForEdit(ctx.admin)).toEqual([]);

    // Protokoll ohne Namen und Kontaktdaten
    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "support.contacts_updated" },
    });
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toMatch(/Anna|anna@example|0123/);
  });

  it("die Verwaltung der Vereinsdaten überschreibt die Ansprechpartner nicht (und umgekehrt)", async () => {
    const { ctx } = await setup();
    const { updateClubSettings } = await import("@/modules/clubs/service");
    await saveContacts(ctx.admin, {
      contacts: [{ name: "Anna", role: undefined, email: "a@example.org", phone: undefined }],
    });
    await updateClubSettings(ctx.admin, {
      name: "Hilfeverein",
      contactEmail: undefined,
      phone: undefined,
      street: undefined,
      postalCode: undefined,
      city: undefined,
      website: undefined,
      privacyContact: undefined,
      leftMembersMonths: 24,
      trashDays: 30,
      auditMonths: 36,
    });
    expect((await getContactsForEdit(ctx.admin)).map((c) => c.name)).toEqual(["Anna"]);
  });
});

describe("Datenschutz und Aufbewahrung", () => {
  it("erledigte Meldungen werden nach 12 Monaten gelöscht, offene und laufende nie", async () => {
    const { ctx } = await setup();
    const done = await createTicket(ctx.member, input({ subject: "Alt und erledigt" }), null);
    const doneNew = await createTicket(ctx.member, input({ subject: "Neu und erledigt" }), null);
    const open = await createTicket(ctx.member, input({ subject: "Alt und offen" }), null);
    const running = await createTicket(ctx.member, input({ subject: "Alt und laufend" }), null);
    await updateTicket(ctx.admin, done.id, { status: "DONE", response: undefined });
    await updateTicket(ctx.admin, doneNew.id, { status: "DONE", response: undefined });
    await updateTicket(ctx.admin, running.id, { status: "IN_PROGRESS", response: undefined });
    const old = new Date(Date.now() - 400 * DAY);
    // updatedAt lässt sich nur direkt in der Datenbank zurückdatieren
    await prisma.$executeRaw`UPDATE "SupportTicket" SET "updatedAt" = ${old} WHERE "id" IN (${done.id}, ${open.id}, ${running.id})`;

    const purged = await purgeOldTickets();
    expect(purged).toBeGreaterThanOrEqual(1);
    const left = await prisma.supportTicket.findMany({
      where: { id: { in: [done.id, doneNew.id, open.id, running.id] } },
      select: { subject: true },
    });
    expect(left.map((t) => t.subject).sort()).toEqual([
      "Alt und laufend",
      "Alt und offen",
      "Neu und erledigt",
    ]);
  });

  it("der Datenexport enthält die eigenen Meldungen samt Antwort – nicht die anderer", async () => {
    const { people, ctx } = await setup();
    const mine = await createTicket(ctx.member, input({ subject: "Meine Frage" }), null);
    await createTicket(ctx.helper, input({ subject: "Frage einer anderen Person" }), null);
    await updateTicket(ctx.admin, mine.id, { status: "DONE", response: "Hier die Antwort." });

    const data = (await buildUserDataExport(people.member.user.id))!;
    const club = data.vereine[0] as {
      supportMeldungen: { betreff: string; antwort: string | null; status: string; art: string }[];
    };
    expect(club.supportMeldungen).toEqual([
      expect.objectContaining({
        betreff: "Meine Frage",
        antwort: "Hier die Antwort.",
        status: "DONE",
        art: "PROBLEM",
      }),
    ]);
    expect(JSON.stringify(data)).not.toContain("Frage einer anderen Person");
  });

  it("beim Löschen des Kontos verschwinden die eigenen Meldungen; als Bearbeiter eingetragene Verweise werden gelöst", async () => {
    const { people, ctx } = await setup();
    await prisma.user.updateMany({
      where: { id: { in: [people.admin.user.id, people.admin2.user.id, people.member.user.id] } },
      data: { passwordHash: await hashPassword(PASSWORD) },
    });
    const meta = { ipPrefix: "10.0.0.0" };

    const own = await createTicket(
      ctx.member,
      input({ subject: "Meldung der zu löschenden Person" }),
      null,
    );
    const foreign = await createTicket(
      ctx.helper,
      input({ subject: "Meldung einer anderen Person" }),
      null,
    );
    await updateTicket(ctx.admin, foreign.id, { status: "DONE", response: "Erledigt." });

    // Die Bearbeiterin (Admin 1) löscht ihr Konto; ihre Antwort bleibt, der Verweis auf sie nicht.
    const pending = await requestAccountDeletion(
      { userId: people.admin.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );
    expect(await executeDeletionRequest(pending.id)).toBe("COMPLETED");
    expect(
      await prisma.supportTicket.findUniqueOrThrow({ where: { id: foreign.id } }),
    ).toMatchObject({ response: "Erledigt.", respondedById: null });

    // Die meldende Person löscht ihr Konto; ihre Meldung verschwindet.
    const pending2 = await requestAccountDeletion(
      { userId: people.member.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );
    expect(await executeDeletionRequest(pending2.id)).toBe("COMPLETED");
    expect(await prisma.supportTicket.findUnique({ where: { id: own.id } })).toBeNull();
    expect(await prisma.supportTicket.findUnique({ where: { id: foreign.id } })).not.toBeNull();
  });
});
