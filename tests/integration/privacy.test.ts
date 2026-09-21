import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/server/auth/password";
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

    const now = new Date("2026-10-01T10:00:00Z");
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

    expect(await processDueDeletionRequests()).toEqual({ completed: 1, rejected: 0 });
    expect(await executeDeletionRequest(due.id)).toBe("SKIPPED");
    expect(await prisma.user.findUnique({ where: { id: people.other.user.id } })).not.toBeNull();
    expect(
      (await prisma.deletionRequest.findUniqueOrThrow({ where: { id: notYet.id } })).status,
    ).toBe("PENDING");
    expect(await processDueDeletionRequests()).toEqual({ completed: 0, rejected: 0 });
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
});
