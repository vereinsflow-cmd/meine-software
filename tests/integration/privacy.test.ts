import { describe, expect, it, vi } from "vitest";
import { toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { createEntry, listAccounts, listCategories, setupLedger } from "@/modules/finance/ledger";
import { createTicket } from "@/modules/help/service";
import { addChatMembers } from "@/modules/messages/chat-members";
import { signOut, signUp } from "@/modules/shifts/service";
import { hashPassword } from "@/server/auth/password";
import { updateOwnName } from "@/server/auth/profile";
import { prisma } from "@/server/db/client";
import { runJobs } from "@/server/jobs/runner";
import * as anonymize from "@/server/privacy/anonymize";
import { buildUserDataExport, EXPORT_FORMAT } from "@/server/privacy/export";
import {
  DELETION_GRACE_DAYS,
  cancelAccountDeletion,
  executeDeletionRequest,
  findDeletionBlockers,
  getPendingDeletion,
  listPendingDeletionRequests,
  processDueDeletionRequests,
  requestAccountDeletion,
} from "@/server/privacy/deletion";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
  createShift,
  unique,
} from "../helpers/factories";

const DAY = 86_400_000;
const PASSWORD = "Ein-Sehr-Sicheres-Passwort-2026!";
const meta = { ipPrefix: "10.0.0.0" };

/** Vereinsabschnitt des Exports (`vereine[]` ist absichtlich locker typisiert) – die Tests lesen nur diese Felder. */
interface ExportedClub {
  verein: string;
  mitglied: { email?: string } & Record<string, unknown>;
  benachrichtigungen: { titel: string }[];
  kalenderAbos: unknown[];
}
const asClub = (entry: Record<string, unknown> | undefined): ExportedClub =>
  entry as unknown as ExportedClub;

/** Vollständiger Verein: Personen mit echtem Passwort, Mitgliedsdaten, Anmeldungen, Schichten, Aufgaben, Einwilligungen. */
async function setup() {
  const passwordHash = await hashPassword(PASSWORD);
  const club = await createClub("Datenschutzverein");
  const dept = await createDepartment(club.id, "Fußball");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const admin2 = await addUserToClub(club, "CLUB_ADMIN", {
    firstName: "Adam",
    lastName: "Zweitadmin",
  });
  const person = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const other = await addUserToClub(club, "MEMBER", { firstName: "Otto", lastName: "Anders" });
  await prisma.user.updateMany({
    where: { id: { in: [admin.user.id, admin2.user.id, person.user.id, other.user.id] } },
    data: { passwordHash },
  });

  await prisma.member.update({
    where: { id: person.member.id },
    data: {
      email: "hanna@example.org",
      phone: "0170 123",
      street: "Weg 1",
      postalCode: "12345",
      city: "Musterstadt",
      birthDate: new Date(Date.UTC(1991, 2, 3)),
      internalNotes: "Zuverlässig",
      clubFunction: "Helferin",
      memberNumber: "M-42",
    },
  });
  await prisma.memberDepartment.create({
    data: { clubId: club.id, memberId: person.member.id, departmentId: dept.id },
  });
  await prisma.consent.create({
    data: {
      clubId: club.id,
      memberId: person.member.id,
      type: "NEWSLETTER",
      granted: true,
      source: "app",
      recordedBy: person.user.id,
    },
  });

  const event = await createEvent(club.id, {
    title: "Sommerfest",
    startsAt: new Date(Date.now() + 5 * DAY),
    endsAt: new Date(Date.now() + 5 * DAY + 6 * 3_600_000),
  });
  await prisma.eventParticipant.createMany({
    data: [
      {
        clubId: club.id,
        eventId: event.id,
        memberId: person.member.id,
        status: "ACCEPTED",
        note: "Bringe Kuchen mit",
      },
      {
        clubId: club.id,
        eventId: event.id,
        memberId: other.member.id,
        status: "ACCEPTED",
        note: "Geheimnis von Otto",
      },
    ],
  });
  const shift = await createShift(club.id, event.id, {
    title: "Aufbau",
    startsAt: new Date(Date.now() + 5 * DAY),
    endsAt: new Date(Date.now() + 5 * DAY + 2 * 3_600_000),
    requiredCount: 3,
  });
  await prisma.shiftAssignment.createMany({
    data: [
      { clubId: club.id, shiftId: shift.id, memberId: person.member.id, workedMinutes: 90 },
      { clubId: club.id, shiftId: shift.id, memberId: other.member.id },
    ],
  });
  await prisma.task.create({
    data: {
      clubId: club.id,
      title: "Plakate drucken",
      assigneeMemberId: person.member.id,
      status: "IN_PROGRESS",
    },
  });
  await prisma.task.create({
    data: { clubId: club.id, title: "Fremde Aufgabe", assigneeMemberId: other.member.id },
  });
  await prisma.notification.createMany({
    data: [
      {
        clubId: club.id,
        userId: person.user.id,
        type: "SYSTEM",
        title: "Hallo Hanna",
        body: "Willkommen",
      },
      { clubId: club.id, userId: other.user.id, type: "SYSTEM", title: "Nur für Otto" },
    ],
  });
  const secrets = { feedHash: `geheimer-hash-${unique()}`, sessionId: `hash-session-${unique()}` };
  await prisma.calendarFeedToken.create({
    data: { clubId: club.id, userId: person.user.id, tokenHash: secrets.feedHash },
  });
  await prisma.session.create({
    data: {
      id: secrets.sessionId,
      userId: person.user.id,
      createdAt: new Date(Date.now() - DAY),
      expiresAt: new Date(Date.now() + DAY),
      userAgent: "Edge auf Windows",
      ipPrefix: "192.168.1.0",
    },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        clubId: club.id,
        actorUserId: person.user.id,
        action: "shift.signed_up",
        entityType: "ShiftAssignment",
        entityId: "abc",
        summary: "Hanna Helfer hat sich eingetragen",
      },
      {
        clubId: club.id,
        actorUserId: admin.user.id,
        action: "member.updated",
        entityType: "Member",
        entityId: person.member.id,
        summary: "Mitglied Hanna Helfer geändert",
      },
      {
        clubId: club.id,
        actorUserId: person.user.id,
        action: "member.updated",
        entityType: "Member",
        entityId: other.member.id,
        summary: "Mitglied Otto Anders geändert – geheime Details",
      },
    ],
  });
  return { club, dept, event, shift, secrets, people: { admin, admin2, person, other } };
}

describe("Datenexport (Art. 15 und 20 DSGVO)", () => {
  it("enthält alle eigenen Daten – Konto, Stammdaten, Einwilligungen, Anmeldungen, Schichten, Aufgaben, Benachrichtigungen, Sitzungen", async () => {
    const { people, club } = await setup();
    const data = (await buildUserDataExport(people.person.user.id))!;

    expect(data).toMatchObject({ format: EXPORT_FORMAT, version: 1 });
    expect(data.konto).toMatchObject({
      email: people.person.user.email,
      vorname: "Hanna",
      nachname: "Helfer",
      zweiFaktorAktiv: false,
    });
    expect(data.vereine).toHaveLength(1);
    const verein = asClub(data.vereine[0]);
    expect(verein).toMatchObject({ verein: club.name, rolle: "Helfer" });
    expect(verein.mitglied).toMatchObject({
      mitgliedsnummer: "M-42",
      vorname: "Hanna",
      nachname: "Helfer",
      email: "hanna@example.org",
      telefon: "0170 123",
      strasse: "Weg 1",
      postleitzahl: "12345",
      ort: "Musterstadt",
      geburtsdatum: "1991-03-03",
      funktionImVerein: "Helferin",
      interneNotizen: "Zuverlässig",
    });
    expect(verein.mitglied.abteilungen).toMatchObject([{ abteilung: "Fußball", leitung: false }]);
    expect(verein.mitglied.einwilligungen).toMatchObject([
      { art: "NEWSLETTER", erteilt: true, quelle: "app" },
    ]);
    expect(verein.mitglied.veranstaltungen).toMatchObject([
      { veranstaltung: "Sommerfest", antwort: "ACCEPTED", notiz: "Bringe Kuchen mit" },
    ]);
    expect(verein.mitglied.helferschichten).toMatchObject([
      {
        veranstaltung: "Sommerfest",
        schicht: "Aufbau",
        status: "CONFIRMED",
        geleisteteMinuten: 90,
      },
    ]);
    expect(verein.mitglied.aufgaben).toMatchObject([
      { titel: "Plakate drucken", status: "IN_PROGRESS" },
    ]);
    expect(verein.benachrichtigungen).toMatchObject([{ titel: "Hallo Hanna", text: "Willkommen" }]);
    expect(verein.kalenderAbos).toHaveLength(1);
    expect(data.sitzungen).toMatchObject([
      { geraet: "Edge auf Windows", ipAdresseGekuerzt: "192.168.1.0" },
    ]);
    expect(data.protokoll.eintraege).toHaveLength(2); // nur die eigenen Aktionen
  });

  it("enthält NICHTS über andere Personen und keine Geheimnisse (Passwort-Hash, Token, Sitzungs-IDs, Protokolltexte)", async () => {
    const { people, secrets } = await setup();
    const json = JSON.stringify(await buildUserDataExport(people.person.user.id));

    for (const secret of [
      "Otto",
      "Anders",
      "Geheimnis von Otto",
      "Nur für Otto",
      "Fremde Aufgabe",
      "geheime Details",
      "Adam",
      "Zweitadmin",
      people.other.user.email,
      people.admin.user.email,
    ]) {
      expect(json, secret).not.toContain(secret);
    }
    for (const secret of [
      "argon2",
      secrets.feedHash,
      secrets.sessionId,
      "passwordHash",
      "totpSecret",
      "recoveryCode",
      "tokenHash",
    ]) {
      expect(json, secret).not.toContain(secret);
    }
    // Der Name in einem Protokolltext taucht nicht auf (Texte können Dritte nennen) – nur Aktion, Objekt-Typ, Zeitpunkt.
    expect(json).not.toContain("hat sich eingetragen");
    expect(json).toContain("shift.signed_up");
  });

  it("jede Person bekommt nur die eigenen Daten – auch der Administrator nicht die der anderen", async () => {
    const { people } = await setup();
    const admin = JSON.stringify(await buildUserDataExport(people.admin.user.id));
    expect(admin).not.toContain("Hanna");
    expect(admin).not.toContain("hanna@example.org");
    expect(admin).not.toContain("Plakate drucken");
    const other = JSON.stringify(await buildUserDataExport(people.other.user.id));
    expect(other).not.toContain("hanna@example.org");
    expect(other).not.toContain("Bringe Kuchen mit");
    expect(other).toContain("Geheimnis von Otto"); // die eigene Notiz schon
  });

  it("Personen in mehreren Vereinen: je Verein ein Abschnitt, mit den Daten des jeweiligen Vereins", async () => {
    const a = await setup();
    const b = await createClub("Zweiter Verein");
    const second = await addUserToClub(b, "MEMBER", { user: a.people.person.user });
    await prisma.member.update({
      where: { id: second.member.id },
      data: { email: "hanna-verein-b@example.org" },
    });
    await prisma.notification.create({
      data: {
        clubId: b.id,
        userId: a.people.person.user.id,
        type: "SYSTEM",
        title: "Nachricht aus Verein B",
      },
    });

    const data = (await buildUserDataExport(a.people.person.user.id))!;
    expect(data.vereine.map((v) => v.verein).sort()).toEqual([
      "Datenschutzverein",
      "Zweiter Verein",
    ]);
    const vereinB = asClub(data.vereine.find((v) => v.verein === "Zweiter Verein"));
    expect(vereinB.mitglied.email).toBe("hanna-verein-b@example.org");
    expect(vereinB.benachrichtigungen.map((n) => n.titel)).toEqual(["Nachricht aus Verein B"]);
    const vereinA = asClub(data.vereine.find((v) => v.verein === "Datenschutzverein"));
    expect(vereinA.benachrichtigungen.map((n) => n.titel)).toEqual(["Hallo Hanna"]);
  });

  describe("Buchungen im Kassenbuch", () => {
    /** Richtet das Kassenbuch des Vereins ein und liefert eine Funktion, die eine Einnahme bucht. */
    async function withLedger(clubId: string, adminUserId: string) {
      const ctx = await contextFor(adminUserId, clubId);
      await setupLedger(ctx, {
        ledgerStartDate: `${todayCalendarDate().getUTCFullYear()}-01-01`,
        bankName: "Girokonto",
        bankOpening: "1.000,00",
        withCash: false,
      });
      const bank = (await listAccounts(ctx)).find((a) => a.kind === "BANK")!;
      const category = (await listCategories(ctx)).find((c) => c.name === "Zuschüsse")!;
      return (
        description: string,
        counterparty: { counterparty?: string; counterpartyMemberId?: string } = {},
      ) =>
        createEntry(ctx, {
          kind: "INCOME",
          accountId: bank.id,
          bookingDate: toDateInputValue(todayCalendarDate()),
          description,
          ...counterparty,
          lines: [{ categoryId: category.id, amount: "10,00" }],
        });
    }
    const bookingTexts = async (userId: string) =>
      (
        asClub((await buildUserDataExport(userId))!.vereine[0]).mitglied.buchungen as {
          text: string;
        }[]
      ).map((b) => b.text);

    it("enthalten nur die dem Mitglied zugeordneten Buchungen – ein frei wählbarer Name findet keine fremden", async () => {
      const { people, club } = await setup();
      const book = await withLedger(club.id, people.admin.user.id);
      await book("Mitgliedsbeitrag eigene Buchung", {
        counterpartyMemberId: people.person.member.id,
      });
      await book("Spende 2026", {
        counterparty: "Otto Anders",
        counterpartyMemberId: people.other.member.id,
      });
      await book("Miete 2025", { counterparty: "Stadtwerke Musterstadt" });

      // Den Namen im Mitgliedsdatensatz kann die Person steuern (Abteilungsleiter mit members:update für den eigenen
      // Datensatz, beim Beitritt über eine Einladung ohne Mitglied wählt sie ihn selbst). „e 202“ steckt in „Spende 2026“.
      await prisma.member.update({
        where: { id: people.person.member.id },
        data: { firstName: "e", lastName: "202" },
      });
      expect(await bookingTexts(people.person.user.id)).toEqual([
        "Mitgliedsbeitrag eigene Buchung",
      ]);

      // Auch der exakte Name eines Gegenübers ohne Mitgliedszuordnung beweist keine Identität.
      await prisma.member.update({
        where: { id: people.person.member.id },
        data: { firstName: "Stadtwerke", lastName: "Musterstadt" },
      });
      expect(await bookingTexts(people.person.user.id)).toEqual([
        "Mitgliedsbeitrag eigene Buchung",
      ]);
    });

    it("gleichnamige Mitglieder sehen nicht die Buchungen des anderen", async () => {
      const { people, club } = await setup();
      const father = await addUserToClub(club, "MEMBER", {
        firstName: "Thomas",
        lastName: "Müller",
      });
      const son = await addUserToClub(club, "MEMBER", { firstName: "Thomas", lastName: "Müller" });
      const book = await withLedger(club.id, people.admin.user.id);
      await book("Beitrag Thomas Müller", {
        counterparty: "Thomas Müller",
        counterpartyMemberId: father.member.id,
      });

      expect(await bookingTexts(father.user.id)).toEqual(["Beitrag Thomas Müller"]);
      expect(await bookingTexts(son.user.id)).toEqual([]);
    });
  });

  it("unbekannte oder gelöschte Konten ergeben keinen Export", async () => {
    expect(await buildUserDataExport("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("Löschantrag", () => {
  it("verlangt das richtige Passwort, legt einen Antrag mit Bedenkzeit an und benachrichtigt Verantwortliche", async () => {
    const { people, club } = await setup();
    await expect(
      requestAccountDeletion({ userId: people.person.user.id, password: "falsch" }, meta),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { password: [expect.any(String)] },
    });
    expect(await getPendingDeletion(people.person.user.id)).toBeNull();

    // Bezogen auf jetzt, nicht auf ein festes Datum: Der Antrag bleibt offen und wäre nach Ablauf der Bedenkzeit fällig –
    // dann verarbeiteten ihn die Tests der Ausführung mit (so geschehen ab dem 15.10.2026, 12 Uhr, mit dem 01.10.2026).
    const now = new Date();
    const pending = await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD, reason: "  Ich ziehe um.  " },
      meta,
      now,
    );
    expect(pending.scheduledFor.getTime()).toBe(now.getTime() + DELETION_GRACE_DAYS * DAY);
    expect(await getPendingDeletion(people.person.user.id)).toMatchObject({ id: pending.id });
    expect(
      await prisma.deletionRequest.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({ status: "PENDING", reason: "Ich ziehe um.", userId: people.person.user.id });

    // Doppelter Antrag wird abgelehnt.
    await expect(
      requestAccountDeletion({ userId: people.person.user.id, password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Protokoll (ohne Namen) und Benachrichtigung der Datenschutz-Verantwortlichen (Vereinsadministratoren).
    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "privacy.deletion_requested" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorUserId: people.person.user.id, entityId: pending.id });
    const notes = await prisma.notification.findMany({
      where: { clubId: club.id, title: { startsWith: "Löschantrag" } },
    });
    expect(notes.map((n) => n.userId).sort()).toEqual(
      [people.admin.user.id, people.admin2.user.id].sort(),
    );
    expect(notes[0]!.linkUrl).toBe("/datenschutz");
  });

  it("kann jederzeit vor Ablauf zurückgezogen werden – danach ist ein neuer Antrag möglich", async () => {
    const { people } = await setup();
    await requestAccountDeletion({ userId: people.person.user.id, password: PASSWORD }, meta);
    await cancelAccountDeletion(people.person.user.id, meta);
    expect(await getPendingDeletion(people.person.user.id)).toBeNull();
    expect(
      await prisma.deletionRequest.findFirstOrThrow({ where: { userId: people.person.user.id } }),
    ).toMatchObject({ status: "CANCELLED", note: expect.stringContaining("zurückgezogen") });
    await expect(cancelAccountDeletion(people.person.user.id, meta)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      requestAccountDeletion({ userId: people.person.user.id, password: PASSWORD }, meta),
    ).resolves.toHaveProperty("id");
  });

  it("der letzte Vereinsadministrator und der letzte Plattform-Administrator können nicht löschen", async () => {
    const club = await createClub("Einzeladmin");
    const passwordHash = await hashPassword(PASSWORD);
    const only = await addUserToClub(club, "CLUB_ADMIN", {
      firstName: "Einziger",
      lastName: "Admin",
    });
    await prisma.user.update({ where: { id: only.user.id }, data: { passwordHash } });
    await expect(
      requestAccountDeletion({ userId: only.user.id, password: PASSWORD }, meta),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("letzte Vereinsadministrator von „Einzeladmin“"),
    });
    expect(await findDeletionBlockers(only.user.id)).toHaveLength(1);

    // Mit einem zweiten Administrator geht es.
    await addUserToClub(club, "CLUB_ADMIN", { firstName: "Zweiter", lastName: "Admin" });
    expect(await findDeletionBlockers(only.user.id)).toEqual([]);

    // Ein gesperrter zweiter Administrator zählt nicht.
    const solo = await createClub("Solo");
    const soloAdmin = await addUserToClub(solo, "CLUB_ADMIN");
    const disabled = await addUserToClub(solo, "CLUB_ADMIN");
    await prisma.user.update({ where: { id: disabled.user.id }, data: { disabledAt: new Date() } });
    expect(await findDeletionBlockers(soloAdmin.user.id)).toHaveLength(1);

    // Administrator in mehreren Vereinen: je Verein ohne weiteren Administrator ein Hinweis, Vereine mit einem weiteren
    // aktiven Administrator blockieren nicht.
    const multi = await addUserToClub(club, "CLUB_ADMIN", {
      firstName: "Mehrfach",
      lastName: "Admin",
    });
    const lonelyA = await createClub("Allein A");
    const lonelyB = await createClub("Allein B");
    await addUserToClub(lonelyA, "CLUB_ADMIN", { user: multi.user });
    await addUserToClub(lonelyB, "CLUB_ADMIN", { user: multi.user });
    const blockers = await findDeletionBlockers(multi.user.id);
    expect(blockers).toHaveLength(2);
    expect(blockers.join(" ")).toContain("„Allein A“");
    expect(blockers.join(" ")).toContain("„Allein B“");
    expect(blockers.join(" ")).not.toContain("„Einzeladmin“");
    // Ein Administrator, der nur in einem ANDEREN Verein aktiv ist, zählt nicht für „Allein B“.
    await addUserToClub(lonelyA, "CLUB_ADMIN", { firstName: "Zweit", lastName: "A" });
    expect(await findDeletionBlockers(multi.user.id)).toEqual([
      "Du bist der letzte Vereinsadministrator von „Allein B“. Bestimme zuerst einen weiteren Administrator.",
    ]);

    // Plattform-Administrator
    const superAdmin = await prisma.user.create({
      data: {
        email: `super-${Date.now()}@example.test`,
        firstName: "S",
        lastName: "A",
        passwordHash,
        isPlatformAdmin: true,
      },
    });
    await prisma.user.updateMany({
      where: { isPlatformAdmin: true, id: { not: superAdmin.id } },
      data: { isPlatformAdmin: false },
    });
    expect((await findDeletionBlockers(superAdmin.id)).join(" ")).toContain(
      "letzte Plattform-Administrator",
    );
  });

  it("Verantwortliche sehen offene Anträge der Personen ihres Vereins – andere Rollen und andere Vereine nicht", async () => {
    const { people, club } = await setup();
    const other = await setup();
    await requestAccountDeletion({ userId: people.person.user.id, password: PASSWORD }, meta);
    await requestAccountDeletion({ userId: other.people.person.user.id, password: PASSWORD }, meta);

    const adminCtx = await contextFor(people.admin.user.id, club.id);
    expect((await listPendingDeletionRequests(adminCtx)).map((r) => r.name)).toEqual([
      "Hanna Helfer",
    ]);
    await expect(
      listPendingDeletionRequests(await contextFor(people.person.user.id, club.id)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Ausführung der Löschung", () => {
  it("anonymisiert die Mitgliedsdaten in allen Vereinen, schwärzt Namen im Protokoll und löscht das Konto samt Zubehör", async () => {
    const { people, club, event } = await setup();
    // Zweiter Verein derselben Person
    const b = await createClub("Zweiter Verein");
    const inB = await addUserToClub(b, "MEMBER", { user: people.person.user });
    await prisma.member.update({
      where: { id: inB.member.id },
      data: { email: "hanna-b@example.org", phone: "999" },
    });
    await prisma.invitation.create({
      data: {
        clubId: club.id,
        email: people.person.user.email,
        roleId: club.roleIds.HELPER!,
        tokenHash: "inv-hash-1",
        expiresAt: new Date(Date.now() + DAY),
      },
    });
    await prisma.verificationToken.create({
      data: {
        userId: people.person.user.id,
        type: "PASSWORD_RESET",
        tokenHash: "vt-1",
        expiresAt: new Date(Date.now() + DAY),
      },
    });
    await prisma.auditLog.create({
      data: {
        clubId: club.id,
        action: "shift.assigned",
        entityType: "ShiftAssignment",
        entityId: "zz",
        summary: "Hanna Helfer wurde für Aufbau eingeteilt",
      },
    });

    const pending = await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 15 * DAY),
    );
    const email = people.person.user.email;
    expect(await executeDeletionRequest(pending.id)).toBe("COMPLETED");

    // Konto und Zubehör sind weg.
    expect(await prisma.user.findUnique({ where: { id: people.person.user.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull(); // Adresse ist frei
    expect(await prisma.session.count({ where: { userId: people.person.user.id } })).toBe(0);
    expect(await prisma.verificationToken.count({ where: { userId: people.person.user.id } })).toBe(
      0,
    );
    expect(await prisma.clubMembership.count({ where: { userId: people.person.user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: people.person.user.id } })).toBe(0);
    expect(await prisma.calendarFeedToken.count({ where: { userId: people.person.user.id } })).toBe(
      0,
    );
    expect(await prisma.invitation.count({ where: { email } })).toBe(0);

    // Mitgliedsdaten in BEIDEN Vereinen anonymisiert – als leere Hülle erhalten (Helferstunden bleiben statistisch nutzbar).
    for (const memberId of [people.person.member.id, inB.member.id]) {
      expect(await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({
        firstName: "Gelöschtes",
        lastName: "Mitglied",
        email: null,
        phone: null,
        street: null,
        birthDate: null,
        internalNotes: null,
        userId: null,
        status: "LEFT",
      });
    }
    expect(
      await prisma.shiftAssignment.findFirstOrThrow({
        where: { memberId: people.person.member.id },
      }),
    ).toMatchObject({ workedMinutes: 90 });
    expect(
      await prisma.eventParticipant.findFirstOrThrow({
        where: { memberId: people.person.member.id, eventId: event.id },
      }),
    ).toMatchObject({ note: null });
    expect(await prisma.consent.count({ where: { memberId: people.person.member.id } })).toBe(0);

    // Andere Personen sind unberührt.
    expect(
      await prisma.member.findUniqueOrThrow({ where: { id: people.other.member.id } }),
    ).toMatchObject({ firstName: "Otto", lastName: "Anders" });
    expect(await prisma.user.findUnique({ where: { id: people.other.user.id } })).not.toBeNull();

    // Protokoll: Name geschwärzt, Nachweis bleibt; Antrag bleibt als Nachweis.
    const entries = await prisma.auditLog.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: "asc" },
    });
    expect(entries.find((e) => e.action === "shift.assigned")!.summary).toBe(
      "Gelöschtes Mitglied wurde für Aufbau eingeteilt",
    );
    expect(entries.filter((e) => e.summary?.includes("Hanna")).map((e) => e.action)).toEqual([]);
    expect(entries.filter((e) => e.action === "privacy.deletion_completed")).toHaveLength(1);
    // Je Verein der Person genau ein Nachweis (auch im zweiten Verein), als Systemeintrag ohne Akteur.
    const completed = await prisma.auditLog.findMany({
      where: { action: "privacy.deletion_completed", entityId: people.person.user.id },
      select: { clubId: true, actorType: true, actorUserId: true, entityType: true, summary: true },
    });
    expect(completed.map((e) => e.clubId).sort()).toEqual([club.id, b.id].sort());
    for (const entry of completed)
      expect(entry).toMatchObject({
        actorType: "SYSTEM",
        actorUserId: null,
        entityType: "User",
        summary: "Konto und Mitgliedsdaten auf Antrag gelöscht",
      });
    expect(
      await prisma.deletionRequest.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({
      status: "COMPLETED",
      processedAt: expect.any(Date),
      note: expect.stringContaining("2 Mitgliedsdatensatz"),
    });
    // Der Antrag enthält keinen Klarnamen und keine Adresse.
    expect(
      JSON.stringify(await prisma.deletionRequest.findUniqueOrThrow({ where: { id: pending.id } })),
    ).not.toContain(email);
  });

  it("schwärzt den Namen auch in Benachrichtigungen anderer (Löschantrag, Schichten, Meldungen)", async () => {
    const { people, club } = await setup();
    // Der Mitgliedsdatensatz kann anders heißen als das Konto – beide Namen verschwinden.
    await prisma.member.update({
      where: { id: people.person.member.id },
      data: { firstName: "Johanna" },
    });
    const pending = await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 15 * DAY),
    );
    await prisma.notification.createMany({
      data: [
        {
          clubId: club.id,
          userId: people.other.user.id,
          type: "SHIFT_CHANGED",
          title: "Neue Eintragung: Aufbau",
          body: "Hanna Helfer hat sich für „Aufbau“ (Sommerfest) eingetragen.",
        },
        {
          clubId: club.id,
          userId: people.admin.user.id,
          type: "SYSTEM",
          title: "Neue Meldung: Hallenschlüssel",
          body: "Frage von Johanna Helfer",
        },
        {
          clubId: club.id,
          userId: people.admin2.user.id,
          type: "SHIFT_CHANGED",
          title: "Neue Eintragung: Abbau",
          body: "Otto Anders hat sich für „Abbau“ (Sommerfest) eingetragen.",
        },
      ],
    });
    const texts = async () =>
      (
        await prisma.notification.findMany({
          where: { clubId: club.id },
          select: { title: true, body: true },
        })
      ).map((n) => `${n.title} | ${n.body ?? ""}`);
    expect((await texts()).filter((t) => t.startsWith("Löschantrag: Hanna Helfer"))).toHaveLength(
      2,
    );

    expect(await executeDeletionRequest(pending.id)).toBe("COMPLETED");

    const after = await texts();
    expect(after.join("\n")).not.toContain("Hanna Helfer");
    expect(after.join("\n")).not.toContain("Johanna");
    expect(after.filter((t) => t.startsWith("Löschantrag: Gelöschtes Mitglied |"))).toHaveLength(2);
    expect(after).toContain(
      "Neue Eintragung: Aufbau | Gelöschtes Mitglied hat sich für „Aufbau“ (Sommerfest) eingetragen.",
    );
    expect(after).toContain("Neue Meldung: Hallenschlüssel | Frage von Gelöschtes Mitglied");
    // Benachrichtigungen über andere Personen bleiben unberührt.
    expect(after).toContain(
      "Neue Eintragung: Abbau | Otto Anders hat sich für „Abbau“ (Sommerfest) eingetragen.",
    );
  });

  it("schwärzt den Namen an jeder Stelle, an der die Anwendung ihn einsetzt – über die echten Abläufe", async () => {
    const { people, club, dept, event } = await setup();
    // Adam (Vereinsadministrator) trägt sich ein und aus, meldet etwas, fügt Otto einem Chat hinzu und stellt einen
    // Löschantrag. Ändert sich der Wortlaut einer dieser Benachrichtigungen, muss das Muster beim Schwärzen mitziehen.
    const adam = await contextFor(people.admin2.user.id, club.id);
    const abbau = await createShift(club.id, event.id, {
      title: "Abbau",
      startsAt: new Date(Date.now() + 5 * DAY + 4 * 3_600_000),
      endsAt: new Date(Date.now() + 5 * DAY + 6 * 3_600_000),
    });
    await prisma.eventShift.update({
      where: { id: abbau.id },
      data: { responsibleMemberId: people.admin.member.id },
    });
    await signUp(adam, abbau.id);
    await signOut(adam, abbau.id);
    await createTicket(
      adam,
      {
        category: "QUESTION",
        subject: "Hallenschlüssel",
        description: "Wo liegt der Schlüssel?",
        pagePath: undefined,
      },
      null,
    );
    await addChatMembers(adam, {
      chat: `abteilung-${dept.id}`,
      memberIds: [people.other.member.id],
    });
    const pending = await requestAccountDeletion(
      { userId: people.admin2.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 15 * DAY),
    );
    const texts = async () =>
      (
        await prisma.notification.findMany({
          where: { clubId: club.id },
          select: { title: true, body: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      ).map((n) => `${n.title} | ${n.body ?? ""}`);
    const before = await texts();
    // Eintragung, Abmeldung, Meldung, Chat, Löschantrag
    expect(before.filter((t) => t.includes("Adam Zweitadmin"))).toHaveLength(5);

    expect(await executeDeletionRequest(pending.id)).toBe("COMPLETED");

    // Genau der Name wird ersetzt – sonst ändert sich nichts.
    expect(await texts()).toEqual(
      before.map((t) => t.replace("Adam Zweitadmin", "Gelöschtes Mitglied")),
    );
  });

  it("ein umbenanntes Konto schwärzt keine freien Texte in Benachrichtigungen anderer", async () => {
    const { people, club } = await setup();
    // Missbrauch: Otto nennt sein Konto wie Wörter, die in fremden Benachrichtigungen stehen, und den eigenen
    // Mitgliedsdatensatz (das kann z. B. eine Abteilungsleitung) wie einen festen Teil der Vorlagen.
    await updateOwnName(
      people.other.user.id,
      { firstName: "Aufbau", lastName: "Sommerfest" },
      meta,
    );
    await prisma.member.update({
      where: { id: people.other.member.id },
      data: { firstName: "Neue", lastName: "Eintragung" },
    });
    const pending = await requestAccountDeletion(
      { userId: people.other.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 15 * DAY),
    );
    // Freie Texte: Betreff, Nachrichtenvorschau, Schicht-, Aufgaben- und Veranstaltungstitel, Antwort auf eine Meldung.
    const foreign = await prisma.notification.createManyAndReturn({
      data: [
        {
          clubId: club.id,
          userId: people.person.user.id,
          type: "MESSAGE",
          title: "Neue Nachricht: Aufbau Sommerfest",
          body: "Aufbau Sommerfest: Wer hilft am Samstag?",
        },
        {
          clubId: club.id,
          userId: people.admin.user.id,
          type: "SHIFT_CHANGED",
          title: "Neue Eintragung: Aufbau Sommerfest",
          body: "Hanna Helfer hat sich für „Aufbau Sommerfest“ (Sommerfest) eingetragen.",
        },
        {
          clubId: club.id,
          userId: people.admin.user.id,
          type: "SYSTEM",
          title: "Neue Meldung: Aufbau Sommerfest",
          body: "Frage von Hanna Helfer",
        },
        {
          clubId: club.id,
          userId: people.person.user.id,
          type: "SYSTEM",
          title: "Deine Meldung „Helferliste“: Erledigt",
          body: "Die Liste hängt am Brett, mit allen Schichten von Aufbau Sommerfest",
        },
        {
          clubId: club.id,
          userId: people.person.user.id,
          type: "TASK_ASSIGNED",
          title: "Neue Aufgabe: Aufbau Sommerfest",
        },
        {
          clubId: club.id,
          userId: people.person.user.id,
          type: "MESSAGE",
          title: "Teilnehmer · Aufbau Sommerfest: Anna Admin hat dich hinzugefügt",
          body: "Du bist jetzt für „Aufbau Sommerfest“ angemeldet und liest im Chat mit.",
        },
      ],
      select: { id: true, title: true, body: true },
    });
    const byId = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

    expect(await executeDeletionRequest(pending.id)).toBe("COMPLETED");

    expect(
      byId(
        await prisma.notification.findMany({
          where: { id: { in: foreign.map((note) => note.id) } },
          select: { id: true, title: true, body: true },
        }),
      ),
    ).toEqual(byId(foreign));
    // Die eigene Namensstelle verschwindet trotzdem.
    expect(
      await prisma.notification.findMany({
        where: { clubId: club.id, title: { startsWith: "Löschantrag: " } },
        select: { title: true },
      }),
    ).toEqual([
      { title: "Löschantrag: Gelöschtes Mitglied" },
      { title: "Löschantrag: Gelöschtes Mitglied" },
    ]);
  });

  it("wiederholte Ausführung ist harmlos; nicht fällige Anträge bleiben offen; der Job verarbeitet nur Fälliges", async () => {
    const { people } = await setup();
    const due = await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );
    const notYet = await requestAccountDeletion(
      { userId: people.other.user.id, password: PASSWORD },
      meta,
      new Date(),
    );

    expect(await processDueDeletionRequests()).toEqual({ completed: 1, rejected: 0, failed: 0 });
    expect(await executeDeletionRequest(due.id)).toBe("SKIPPED");
    expect(await prisma.user.findUnique({ where: { id: people.other.user.id } })).not.toBeNull();
    expect(
      (await prisma.deletionRequest.findUniqueOrThrow({ where: { id: notYet.id } })).status,
    ).toBe("PENDING");
    expect(await processDueDeletionRequests()).toEqual({ completed: 0, rejected: 0, failed: 0 });
  });

  it("wurde zwischenzeitlich der letzte Administrator, wird der Antrag abgelehnt – nichts wird gelöscht", async () => {
    const club = await createClub("Wechsel");
    const passwordHash = await hashPassword(PASSWORD);
    const a = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Alfred", lastName: "Eins" });
    const b = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Berta", lastName: "Zwei" });
    await prisma.user.updateMany({
      where: { id: { in: [a.user.id, b.user.id] } },
      data: { passwordHash },
    });
    const pending = await requestAccountDeletion(
      { userId: a.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );

    await prisma.user.update({ where: { id: b.user.id }, data: { disabledAt: new Date() } }); // der zweite Admin fällt aus

    expect(await executeDeletionRequest(pending.id)).toBe("REJECTED");
    expect(await prisma.user.findUnique({ where: { id: a.user.id } })).not.toBeNull();
    expect(await prisma.member.findUniqueOrThrow({ where: { id: a.member.id } })).toMatchObject({
      firstName: "Alfred",
      anonymizedAt: null,
    });
    expect(
      await prisma.deletionRequest.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({
      status: "REJECTED",
      note: expect.stringContaining("letzte Vereinsadministrator"),
    });
    // Danach ist ein neuer Antrag möglich, sobald es Ersatz gibt.
    await prisma.user.update({ where: { id: b.user.id }, data: { disabledAt: null } });
    await expect(
      requestAccountDeletion({ userId: a.user.id, password: PASSWORD }, meta),
    ).resolves.toHaveProperty("id");
  });

  it("läuft als Teil der Hintergrundjobs (Job 'privacy')", async () => {
    const { people } = await setup();
    await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );
    const summary = await runJobs({ only: ["privacy"] });
    expect(summary.reports).toMatchObject([
      { name: "privacy", ok: true, result: { completed: 1, rejected: 0 } },
    ]);
    expect(await prisma.user.findUnique({ where: { id: people.person.user.id } })).toBeNull();
  });

  it("schlägt die Ausführung fehl, bleibt alles unverändert (eine Transaktion)", async () => {
    const { people } = await setup();
    const pending = await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );
    // Ein erzwungener Fehler MITTEN in der Ausführung: Die Mitgliedsdaten sind zu diesem Zeitpunkt bereits anonymisiert
    // (innerhalb der Transaktion) – sie müssen mit zurückgerollt werden.
    const spy = vi
      .spyOn(anonymize, "scrubNamesInAudit")
      .mockRejectedValueOnce(new Error("simulierter Fehler"));
    await expect(executeDeletionRequest(pending.id)).rejects.toThrow("simulierter Fehler");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();

    expect(await prisma.user.findUnique({ where: { id: people.person.user.id } })).not.toBeNull();
    expect(
      await prisma.member.findUniqueOrThrow({ where: { id: people.person.member.id } }),
    ).toMatchObject({ firstName: "Hanna", email: "hanna@example.org", anonymizedAt: null });
    expect(
      (await prisma.deletionRequest.findUniqueOrThrow({ where: { id: pending.id } })).status,
    ).toBe("PENDING");
    // Beim nächsten Lauf klappt es.
    expect(await executeDeletionRequest(pending.id)).toBe("COMPLETED");
  });

  it("ein Eintritt in der Zukunft hält die Löschung nicht auf – Austritt am Eintrittstag", async () => {
    const { people } = await setup();
    const joinedAt = todayCalendarDate(new Date(Date.now() + 30 * DAY));
    await prisma.member.update({ where: { id: people.person.member.id }, data: { joinedAt } });
    await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );
    await requestAccountDeletion(
      { userId: people.other.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 19 * DAY),
    );

    expect(await processDueDeletionRequests()).toEqual({ completed: 2, rejected: 0, failed: 0 });
    // Der Austritt darf nicht vor dem Eintritt liegen (Prüfregel Member_dates_chk).
    expect(
      await prisma.member.findUniqueOrThrow({ where: { id: people.person.member.id } }),
    ).toMatchObject({ firstName: "Gelöschtes", joinedAt, leftAt: joinedAt });
    expect(await prisma.user.findUnique({ where: { id: people.other.user.id } })).toBeNull();
  });

  it("scheitert ein Antrag, laufen die übrigen weiter – er bleibt offen, das Protokoll nennt keinen Namen", async () => {
    const { people } = await setup();
    const failing = await requestAccountDeletion(
      { userId: people.person.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 20 * DAY),
    );
    await requestAccountDeletion(
      { userId: people.other.user.id, password: PASSWORD },
      meta,
      new Date(Date.now() - 19 * DAY),
    );
    // Der älteste Antrag steht immer vorn – scheitert er, dürfen die späteren nicht hängen bleiben.
    const spy = vi
      .spyOn(anonymize, "anonymizeMemberData")
      .mockRejectedValueOnce(new Error("Hanna Helfer: Prüfregel verletzt"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await processDueDeletionRequests()).toEqual({ completed: 1, rejected: 0, failed: 1 });
    expect(
      (await prisma.deletionRequest.findUniqueOrThrow({ where: { id: failing.id } })).status,
    ).toBe("PENDING");
    expect(await prisma.user.findUnique({ where: { id: people.other.user.id } })).toBeNull();
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("Löschantrag konnte nicht ausgeführt werden");
    expect(logged).not.toContain("Hanna");
    expect(logged).not.toContain(people.person.user.email);
    spy.mockRestore();
    error.mockRestore();

    // Der nächste Lauf holt den Antrag nach.
    expect(await processDueDeletionRequests()).toEqual({ completed: 1, rejected: 0, failed: 0 });
    expect(await prisma.user.findUnique({ where: { id: people.person.user.id } })).toBeNull();
  });
});
