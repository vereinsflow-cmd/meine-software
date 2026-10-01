import { beforeEach, describe, expect, it, vi } from "vitest";

// Einladungs-E-Mails abfangen: Hier zählt, dass sie an die richtige Adresse mit einem Einladungslink gehen.
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async (m: { to: string; subject: string; text: string }) =>
    void mail.sent.push(m),
  sendMail: async (m: { to: string; subject: string; text: string }) => void mail.sent.push(m),
}));
// Der echte Einladungsweg, nur umhüllt: So lässt sich ein Fehlschlag beim Verschicken gezielt auslösen.
vi.mock("@/server/auth/invitations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/invitations")>();
  return { ...actual, issueInvitation: vi.fn(actual.issueInvitation) };
});
// Ebenso die vorgeschlagene Mitgliedsnummer: Mit verschiedenen Nummern prüft der Gleichzeitigkeitstest wirklich die Sperre
// je E-Mail-Adresse – bei gleicher Nummer zwänge schon der eindeutige Index die Transaktionen nacheinander.
vi.mock("@/modules/members/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/members/service")>();
  return { ...actual, suggestNextMemberNumber: vi.fn(actual.suggestNextMemberNumber) };
});

import { todayCalendarDate } from "@/lib/dates";
import { APPLICATION_CONSENT_VERSION, JOIN_LINK_FULL_TEXT } from "@/lib/membership-application";
import { deleteDepartment } from "@/modules/departments/service";
import { suggestNextMemberNumber } from "@/modules/members/service";
import {
  applicationFormSchema,
  type ApplicationFormInput,
} from "@/modules/membership-applications/schemas";
import {
  APPLICATION_RATE_LIMITS,
  DUPLICATE_MEMBER_TEXT,
  EXISTING_ACCOUNT_TEXT,
  OPEN_INVITATION_TEXT,
  acceptApplication,
  closeJoinLink,
  countPendingApplications,
  enableJoinLink,
  getJoinLink,
  getJoinPage,
  listApplications,
  rejectApplication,
  renewJoinLink,
  setJoinLimit,
  resendApplicationInvitation,
  submitApplication,
} from "@/modules/membership-applications/service";
import { acceptInvitationAsNewUser, issueInvitation } from "@/server/auth/invitations";
import { prisma } from "@/server/db/client";
import { notFound } from "@/server/errors";
import { applyRetention, purgeOldApplications } from "@/server/jobs/retention";
import { anonymizeMemberData } from "@/server/privacy/anonymize";
import { buildUserDataExport } from "@/server/privacy/export";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createMember,
  unique,
} from "../helpers/factories";

const DAY = 86_400_000;

beforeEach(() => {
  mail.sent.length = 0;
});

let ipCounter = 0;
/** Jede Anfrage von einer eigenen IP, damit sich die Tests die IP-Grenze nicht gegenseitig verbrauchen. */
const freshIp = () => {
  ipCounter += 1;
  return { ip: `198.51.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`, ipPrefix: "198.51.0.0" };
};

async function setup(name = "Beitrittsverein") {
  const club = await createClub(name);
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
  const department = await createDepartment(club.id, "Tischtennis");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", {
    firstName: "Lea",
    lastName: "Leitung",
    ledDepartmentIds: [department.id],
  });
  const helper = await addUserToClub(club, "HELPER");
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    department,
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

type Setup = Awaited<ReturnType<typeof setup>>;

const form = (token: string, over: Partial<ApplicationFormInput> = {}) =>
  applicationFormSchema.parse({
    token,
    firstName: "Bea",
    lastName: "Beitritt",
    email: `${unique("bea")}@example.test`,
    consent: true,
    ...over,
  });

/** Richtet den Link ein und reicht einen Antrag ein; liefert den gespeicherten Antrag. */
async function applyOnce(s: Setup, over: Partial<ApplicationFormInput> = {}) {
  const link = await enableJoinLink(s.ctx.admin, 100);
  const input = form(link.token, over);
  await submitApplication(input, freshIp());
  // Der neueste mit dieser Adresse – dieselbe Person kann mehrere Anträge stellen (IDs aus uuid(7) steigen mit der Zeit).
  return prisma.membershipApplication.findFirstOrThrow({
    where: { clubId: s.club.id, email: input.email },
    orderBy: { id: "desc" },
  });
}

/** Offene Einladungen des Vereins an eine Adresse. */
const openInvitations = (clubId: string, email: string) =>
  prisma.invitation.findMany({ where: { clubId, email, acceptedAt: null, revokedAt: null } });

describe("Beitrittslink (QR-Code)", () => {
  it("einrichten, erneut einrichten (bleibt gleich), neu erzeugen (alter Link ungültig), schließen – alles protokolliert", async () => {
    const s = await setup();
    expect(await getJoinLink(s.ctx.admin)).toBeNull();

    const first = await enableJoinLink(s.ctx.admin, 100);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.url).toBe(`http://localhost:3000/beitreten/${first.token}`);
    expect((await enableJoinLink(s.ctx.board, 100)).token).toBe(first.token); // kein versehentliches Ungültigmachen
    expect((await getJoinPage(first.token))?.clubName).toBe("Beitrittsverein");

    const renewed = await renewJoinLink(s.ctx.board, 100);
    expect(renewed.token).not.toBe(first.token);
    expect(await getJoinPage(first.token)).toBeNull();
    expect(await getJoinPage(renewed.token)).not.toBeNull();
    await expect(submitApplication(form(first.token), freshIp())).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Dieser Link ist nicht (mehr) gültig. Bitte frag im Verein nach dem aktuellen QR-Code.",
    });

    await closeJoinLink(s.ctx.admin);
    expect(await getJoinLink(s.ctx.admin)).toBeNull();
    expect(await getJoinPage(renewed.token)).toBeNull();
    await closeJoinLink(s.ctx.admin); // schon geschlossen: ohne Wirkung und ohne weiteren Eintrag

    const actions = await prisma.auditLog.findMany({
      where: { clubId: s.club.id, action: { startsWith: "member.join_link_" } },
      orderBy: { createdAt: "asc" },
      select: { action: true, summary: true, changes: true },
    });
    expect(actions.map((a) => a.action)).toEqual([
      "member.join_link_created",
      "member.join_link_renewed",
      "member.join_link_closed",
    ]);
    // Der Schlüssel selbst steht nie im Protokoll.
    expect(JSON.stringify(actions)).not.toContain(first.token);
    expect(JSON.stringify(actions)).not.toContain(renewed.token);
  });

  it("die öffentliche Seite zeigt nur Name und aktive Abteilungen; ungültige Formate und deaktivierte Vereine ergeben nichts", async () => {
    const s = await setup("Öffentlicher Verein");
    const inactive = await prisma.department.create({
      data: { clubId: s.club.id, name: "Ruhende Abteilung", isActive: false },
    });
    const link = await enableJoinLink(s.ctx.admin, 100);

    const page = await getJoinPage(link.token);
    // Nur „voll oder nicht“ – wie viele Plätze es gibt, erfährt die Öffentlichkeit nicht
    expect(page).toEqual({
      clubName: "Öffentlicher Verein",
      logoUrl: null,
      full: false,
      departments: [{ id: s.department.id, name: "Tischtennis" }],
    });
    expect(page?.departments.map((d) => d.id)).not.toContain(inactive.id);

    for (const bad of ["", "zu-kurz", `${link.token}x`, link.token.replace(/./, "*")])
      expect(await getJoinPage(bad), bad).toBeNull();

    await prisma.club.update({ where: { id: s.club.id }, data: { status: "DEACTIVATED" } });
    expect(await getJoinPage(link.token)).toBeNull();
  });
});

describe("Begrenzte Anmeldungen je QR-Code", () => {
  it("nimmt nur so viele Anträge an wie festgelegt; abgelehnte geben ihren Platz zurück; ein neuer Code beginnt bei 0", async () => {
    const s = await setup();
    const link = await enableJoinLink(s.ctx.admin, 2);
    expect(link).toMatchObject({ limit: 2, used: 0 });
    await submitApplication(form(link.token), freshIp());
    // Honigtopf: vorgetäuschter Erfolg – verbraucht keinen Platz
    await submitApplication(form(link.token, { website: "https://spam.example" }), freshIp());
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ used: 1 });
    expect((await getJoinPage(link.token))?.full).toBe(false);

    await submitApplication(form(link.token), freshIp());
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ limit: 2, used: 2 });
    expect((await getJoinPage(link.token))?.full).toBe(true);
    await expect(submitApplication(form(link.token), freshIp())).rejects.toMatchObject({
      code: "CONFLICT",
      message: JOIN_LINK_FULL_TEXT,
    });
    expect(await prisma.membershipApplication.count({ where: { clubId: s.club.id } })).toBe(2);
    // Mit dem letzten Platz erfahren die Berechtigten, dass der Code ausgeschöpft ist
    const [latest] = await prisma.notification.findMany({
      where: { clubId: s.club.id, userId: s.people.admin.user.id, title: "Neuer Beitrittsantrag" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(latest?.body).toContain("alle 2 Plätze des QR-Codes vergeben");

    // Ablehnen gibt den Platz zurück
    const first = await prisma.membershipApplication.findFirstOrThrow({
      where: { clubId: s.club.id },
      orderBy: { id: "asc" },
    });
    await rejectApplication(s.ctx.admin, first.id);
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ used: 1 });
    expect((await getJoinPage(link.token))?.full).toBe(false);

    // Anzahl ändern (ohne neuen Code): weniger als genutzt → voll, mehr → wieder frei; protokolliert
    await setJoinLimit(s.ctx.board, 1);
    expect((await getJoinPage(link.token))?.full).toBe(true);
    expect(await setJoinLimit(s.ctx.admin, 5)).toMatchObject({
      token: link.token,
      limit: 5,
      used: 1,
    });
    expect(
      await prisma.auditLog.count({
        where: { clubId: s.club.id, action: "member.join_limit_changed" },
      }),
    ).toBe(2);

    // Neuer Code: Zählung von vorn – ein abgelehnter Antrag des alten Codes ändert sie nicht
    expect(await renewJoinLink(s.ctx.admin, 3)).toMatchObject({ limit: 3, used: 0 });
    const old = await prisma.membershipApplication.findFirstOrThrow({
      where: { clubId: s.club.id, status: "PENDING" },
    });
    await rejectApplication(s.ctx.admin, old.id);
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ limit: 3, used: 0 });

    // Schließen setzt alles zurück
    await closeJoinLink(s.ctx.admin);
    expect(
      await prisma.club.findUniqueOrThrow({
        where: { id: s.club.id },
        select: { joinLimit: true, joinUsed: true },
      }),
    ).toEqual({ joinLimit: null, joinUsed: 0 });
  });

  it("zweimal gleichzeitig „QR-Code einrichten“: derselbe Code – der zweite ersetzt den ersten nicht", async () => {
    const s = await setup();
    const [a, b] = await Promise.all([
      enableJoinLink(s.ctx.admin, 10),
      enableJoinLink(s.ctx.board, 20),
    ]);
    expect(a.token).toBe(b.token);
    expect(a.limit).toBe(b.limit);
    expect(
      await prisma.auditLog.count({
        where: { clubId: s.club.id, action: "member.join_link_created" },
      }),
    ).toBe(1);
  });

  it("jeder Antrag merkt sich seinen Code: nur Anträge des aktuellen Codes geben beim Ablehnen ihren Platz zurück", async () => {
    const s = await setup();
    const first = await enableJoinLink(s.ctx.admin, 5);
    await submitApplication(form(first.token), freshIp());
    const old = await prisma.membershipApplication.findFirstOrThrow({
      where: { clubId: s.club.id },
    });
    expect(old.joinLinkCreatedAt?.getTime()).toBe(first.createdAt.getTime());

    const second = await renewJoinLink(s.ctx.admin, 5);
    await submitApplication(form(second.token), freshIp());
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ used: 1 });
    await rejectApplication(s.ctx.admin, old.id); // vom alten Code: ändert die neue Zählung nicht
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ used: 1 });
    const current = await prisma.membershipApplication.findFirstOrThrow({
      where: { clubId: s.club.id, status: "PENDING" },
    });
    await rejectApplication(s.ctx.admin, current.id);
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ used: 0 });
  });

  it("gleichzeitige Anträge auf den letzten Platz: genau einer kommt durch", async () => {
    const s = await setup();
    const link = await enableJoinLink(s.ctx.admin, 1);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => submitApplication(form(link.token), freshIp())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.membershipApplication.count({ where: { clubId: s.club.id } })).toBe(1);
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ limit: 1, used: 1 });
  });

  it("die Anzahl ändern nur Vereinsadministrator und Vorstand – und nur, wenn es einen QR-Code gibt", async () => {
    const s = await setup();
    await expect(setJoinLimit(s.ctx.admin, 5)).rejects.toMatchObject({ code: "CONFLICT" });
    await enableJoinLink(s.ctx.admin, 5);
    for (const ctx of [s.ctx.lead, s.ctx.helper, s.ctx.member]) {
      await expect(setJoinLimit(ctx, 50)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(renewJoinLink(ctx, 50)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ limit: 5 });
  });

  it("ein QR-Code von vor der Begrenzung (ohne Anzahl) nimmt weiter Anträge an und zählt mit", async () => {
    const s = await setup();
    const link = await enableJoinLink(s.ctx.admin, 5);
    await prisma.club.update({ where: { id: s.club.id }, data: { joinLimit: null } });
    await submitApplication(form(link.token), freshIp());
    expect(await getJoinLink(s.ctx.admin)).toMatchObject({ limit: null, used: 1 });
    expect((await getJoinPage(link.token))?.full).toBe(false);
  });

  it("die Datenbank lässt keine unsinnige Anzahl zu", async () => {
    const s = await setup();
    await enableJoinLink(s.ctx.admin, 5);
    for (const joinLimit of [0, 5001]) {
      await expect(
        prisma.club.update({ where: { id: s.club.id }, data: { joinLimit } }),
      ).rejects.toThrow();
    }
    await expect(
      prisma.club.update({ where: { id: s.club.id }, data: { joinUsed: -1 } }),
    ).rejects.toThrow();
  });
});

describe("Antrag einreichen (öffentlich)", () => {
  it("legt einen offenen Antrag an, protokolliert ohne Namen und benachrichtigt nur Vereinsadministrator und Vorstand", async () => {
    const s = await setup();
    const link = await enableJoinLink(s.ctx.admin, 100);
    const input = form(link.token, {
      email: "Neu.Person@Example.test",
      phone: "0170 1234567",
      birthDate: "2001-04-05",
      departmentId: s.department.id,
      message: "Ich spiele seit Jahren Tischtennis.",
    });
    await submitApplication(input, { ip: "203.0.113.7", ipPrefix: "203.0.113.0" });

    const application = await prisma.membershipApplication.findFirstOrThrow({
      where: { clubId: s.club.id },
    });
    expect(application).toMatchObject({
      firstName: "Bea",
      lastName: "Beitritt",
      email: "neu.person@example.test",
      phone: "0170 1234567",
      departmentId: s.department.id,
      message: "Ich spiele seit Jahren Tischtennis.",
      status: "PENDING",
      decidedAt: null,
      memberId: null,
      ipPrefix: "203.0.113.0",
    });
    expect(application.birthDate?.toISOString()).toBe("2001-04-05T00:00:00.000Z");
    // Nachweis der Einwilligung: Zeitpunkt und Fassung des Kästchen-Texts.
    expect(Date.now() - application.consentAt.getTime()).toBeLessThan(60_000);
    expect(application.consentTextVersion).toBe(APPLICATION_CONSENT_VERSION);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: s.club.id, action: "member.application_received" },
    });
    expect(audit).toMatchObject({
      actorType: "SYSTEM",
      actorUserId: null,
      entityType: "MembershipApplication",
      entityId: application.id,
      ipPrefix: "203.0.113.0",
    });
    expect(audit.summary).not.toContain("Bea");

    const notified = await prisma.notification.findMany({
      where: { clubId: s.club.id, title: "Neuer Beitrittsantrag" },
      select: { userId: true, linkUrl: true, emailStatus: true, body: true },
    });
    expect(notified.map((n) => n.userId).sort()).toEqual(
      [s.people.admin.user.id, s.people.board.user.id].sort(),
    );
    expect(notified.every((n) => n.linkUrl === "/mitglieder/antraege")).toBe(true);
    expect(notified.every((n) => n.emailStatus === "PENDING")).toBe(true);
    expect(notified.every((n) => !n.body?.includes("Beitritt"))).toBe(true); // ohne Namen
  });

  it("Honigtopf ausgefüllt: vorgetäuschter Erfolg, nichts gespeichert, niemand benachrichtigt", async () => {
    const s = await setup();
    const link = await enableJoinLink(s.ctx.admin, 100);
    await expect(
      submitApplication(form(link.token, { website: "https://spam.example" }), freshIp()),
    ).resolves.toBeUndefined();
    expect(await prisma.membershipApplication.count({ where: { clubId: s.club.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { clubId: s.club.id } })).toBe(0);
  });

  it("nur Abteilungen dieses Vereins, und nur aktive", async () => {
    const s = await setup();
    const other = await setup("Anderer Verein");
    const inactive = await prisma.department.create({
      data: { clubId: s.club.id, name: "Ruhend", isActive: false },
    });
    const link = await enableJoinLink(s.ctx.admin, 100);
    for (const departmentId of [other.department.id, inactive.id, "gibt-es-nicht"]) {
      await expect(
        submitApplication(form(link.token, { departmentId }), freshIp()),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { departmentId: ["Bitte wähle eine Abteilung aus der Liste."] },
      });
    }
    expect(await prisma.membershipApplication.count({ where: { clubId: s.club.id } })).toBe(0);
  });

  it(`Rate-Limit: höchstens ${APPLICATION_RATE_LIMITS.perIp.limit} Anträge je IP und Stunde`, async () => {
    const s = await setup();
    const link = await enableJoinLink(s.ctx.admin, 100);
    const meta = { ip: "192.0.2.44", ipPrefix: "192.0.2.0" };
    for (let i = 0; i < APPLICATION_RATE_LIMITS.perIp.limit; i++)
      await submitApplication(form(link.token), meta);
    // Eigene Meldung statt „Bitte warte einen Moment“: Die Sperre dauert bis zu einer Stunde.
    const limited = await submitApplication(form(link.token), meta).catch(
      (error: unknown) => error,
    );
    expect(limited).toMatchObject({ code: "RATE_LIMITED" });
    expect((limited as Error).message).toMatch(
      /^Von diesem Anschluss sind gerade mehrere Anträge gekommen\. Bitte versuche es in (einer Minute|\d+ Minuten) noch einmal\.$/,
    );
    expect((limited as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
    // Auch der Honigtopf-Roboter bleibt an der IP-Grenze hängen.
    await expect(submitApplication(form(link.token, { website: "x" }), meta)).rejects.toMatchObject(
      { code: "RATE_LIMITED" },
    );
    await expect(submitApplication(form(link.token), freshIp())).resolves.toBeUndefined();
  });

  it("Rate-Limit bei IPv6: gezählt wird das ganze /64-Netz – ein Wechsel der Adresse darin hilft nicht", async () => {
    const s = await setup();
    const link = await enableJoinLink(s.ctx.admin, 100);
    const net = "2001:db8:4711:42";
    for (let i = 1; i <= APPLICATION_RATE_LIMITS.perIp.limit; i++)
      await submitApplication(form(link.token), {
        ip: `${net}::${i}`,
        ipPrefix: "2001:db8:4711:*",
      });
    // Andere Adresse, anders geschrieben – dasselbe Netz.
    await expect(
      submitApplication(form(link.token), {
        ip: "2001:0DB8:4711:0042:abcd:1:2:3",
        ipPrefix: "2001:0DB8:4711:*",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    // Das Nachbarnetz ist ein anderer Anschluss.
    await expect(
      submitApplication(form(link.token), {
        ip: "2001:db8:4711:43::1",
        ipPrefix: "2001:db8:4711:*",
      }),
    ).resolves.toBeUndefined();
  });

  it(`Rate-Limit: höchstens ${APPLICATION_RATE_LIMITS.perClub.limit} Anträge je Verein und Tag – auch ohne bekannte IP`, async () => {
    const s = await setup();
    const other = await setup("Nachbarverein");
    const link = await enableJoinLink(s.ctx.admin, 100);
    const otherLink = await enableJoinLink(other.ctx.admin, 100);
    const noIp = { ip: "unknown", ipPrefix: null };
    for (let i = 0; i < APPLICATION_RATE_LIMITS.perClub.limit; i++)
      await submitApplication(form(link.token), noIp);
    await expect(submitApplication(form(link.token), noIp)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message:
        "Beim Verein sind heute schon sehr viele Anträge eingegangen. Bitte versuche es in 24 Stunden noch einmal oder sprich den Verein direkt an.",
    });
    // Andere Vereine sind davon nicht betroffen.
    await expect(submitApplication(form(otherLink.token), noIp)).resolves.toBeUndefined();
  });
});

describe("Rechte und Mandantentrennung", () => {
  it("nur Vereinsadministrator und Vorstand (Mitglieder anlegen für den ganzen Verein) – alle anderen werden abgewiesen", async () => {
    const s = await setup();
    const application = await applyOnce(s);
    for (const ctx of [s.ctx.lead, s.ctx.helper, s.ctx.member]) {
      await expect(getJoinLink(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(enableJoinLink(ctx, 100)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(renewJoinLink(ctx, 100)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(closeJoinLink(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listApplications(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(acceptApplication(ctx, application.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(rejectApplication(ctx, application.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(resendApplicationInvitation(ctx, application.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await countPendingApplications(ctx)).toBeNull();
    }
    expect(await countPendingApplications(s.ctx.admin)).toBe(1);
    expect(await countPendingApplications(s.ctx.board)).toBe(1);
    expect(
      (await prisma.membershipApplication.findUniqueOrThrow({ where: { id: application.id } }))
        .status,
    ).toBe("PENDING");
  });

  it("ein anderer Verein sieht und entscheidet fremde Anträge nicht (IDOR)", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    const application = await applyOnce(a);

    expect((await listApplications(b.ctx.admin)).pending).toEqual([]);
    expect(await countPendingApplications(b.ctx.admin)).toBe(0);
    await expect(acceptApplication(b.ctx.admin, application.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(rejectApplication(b.ctx.admin, application.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(resendApplicationInvitation(b.ctx.admin, application.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await listApplications(a.ctx.admin)).pending.map((p) => p.id)).toEqual([
      application.id,
    ]);
    // Der Link von Verein A führt nie zu Verein B.
    const linkA = await getJoinLink(a.ctx.admin);
    expect((await getJoinPage(linkA!.token))?.clubName).toBe("Verein A");
  });

  it("die Datenbank verhindert Abteilungen oder Mitglieder eines anderen Vereins am Antrag", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    const memberB = await createMember(b.club.id);
    const base = {
      clubId: a.club.id,
      firstName: "X",
      lastName: "Y",
      email: "x@example.test",
      consentAt: new Date(),
      consentTextVersion: APPLICATION_CONSENT_VERSION,
    };
    await expect(
      prisma.membershipApplication.create({ data: { ...base, departmentId: b.department.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.membershipApplication.create({
        data: { ...base, status: "ACCEPTED", decidedAt: new Date(), memberId: memberB.id },
      }),
    ).rejects.toThrow();
  });
});

describe("Annehmen", () => {
  it("legt das Mitglied an und lädt mit der Rolle „Mitglied“ ein – auch durch den Vorstand", async () => {
    const s = await setup();
    await createMember(s.club.id, { firstName: "Alt", lastName: "Bestand" });
    await prisma.member.updateMany({
      where: { clubId: s.club.id, firstName: "Alt" },
      data: { memberNumber: "M-0041" },
    });
    const application = await applyOnce(s, {
      phone: "0170 7654321",
      birthDate: "1990-12-24",
      departmentId: s.department.id,
    });

    const result = await acceptApplication(s.ctx.board, application.id);
    expect(result).toMatchObject({ name: "Bea Beitritt", invitationSent: true });

    const member = await prisma.member.findUniqueOrThrow({
      where: { id: result.memberId },
      include: { departments: true, consents: true },
    });
    expect(member).toMatchObject({
      clubId: s.club.id,
      firstName: "Bea",
      lastName: "Beitritt",
      email: application.email,
      phone: "0170 7654321",
      status: "ACTIVE",
      memberNumber: "M-0042", // wie beim normalen Anlegen: höchste Nummer + 1
      userId: null,
    });
    expect(member.birthDate?.toISOString()).toBe("1990-12-24T00:00:00.000Z");
    expect(member.joinedAt?.getTime()).toBe(todayCalendarDate().getTime());
    expect(member.departments.map((d) => [d.departmentId, d.isLeader])).toEqual([
      [s.department.id, false],
    ]);
    // Die Einwilligung im Formular galt nur der Bearbeitung des Antrags: Sie wird NICHT als „Einwilligung in die
    // Datenverarbeitung“ ans Mitglied übertragen, sondern bleibt mit Zeitpunkt und Fassung am Antrag.
    expect(member.consents).toEqual([]);

    const decided = await prisma.membershipApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(decided).toMatchObject({
      status: "ACCEPTED",
      memberId: member.id,
      decidedById: s.people.board.user.id,
      consentAt: application.consentAt,
      consentTextVersion: APPLICATION_CONSENT_VERSION,
    });
    expect(decided.decidedAt).not.toBeNull();

    const invitation = await prisma.invitation.findFirstOrThrow({
      where: { clubId: s.club.id, email: application.email },
      include: { role: true },
    });
    expect(invitation).toMatchObject({
      memberId: member.id,
      invitedByUserId: s.people.board.user.id,
      acceptedAt: null,
      revokedAt: null,
    });
    expect(invitation.role.key).toBe("MEMBER");
    expect(mail.sent.map((m) => m.to)).toEqual([application.email]);
    expect(mail.sent[0]!.text).toMatch(/http:\/\/localhost:3000\/einladung\/[A-Za-z0-9_-]{43}/);

    const actions = await prisma.auditLog.findMany({
      where: { clubId: s.club.id, actorUserId: s.people.board.user.id },
      select: { action: true, entityId: true },
    });
    expect(actions).toEqual(
      expect.arrayContaining([
        { action: "member.created", entityId: member.id },
        { action: "member.application_accepted", entityId: application.id },
        { action: "invitation.created", entityId: invitation.id },
      ]),
    );

    // Danach steht der Antrag unter „Zuletzt entschieden“ – mit Name der entscheidenden Person.
    const overview = await listApplications(s.ctx.admin);
    expect(overview.pending).toEqual([]);
    expect(overview.decided).toMatchObject([
      {
        id: application.id,
        status: "ACCEPTED",
        decidedByName: "Bernd Vorstand",
        memberId: member.id,
        canResendInvitation: true, // noch kein Konto
        invitationExpiresAt: invitation.expiresAt,
      },
    ]);
    // Ein zweites Annehmen geht nicht.
    await expect(acceptApplication(s.ctx.admin, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("gibt es schon ein Mitglied mit der E-Mail-Adresse (egal wie geschrieben), wird nichts angelegt", async () => {
    const s = await setup();
    // Mitgliedsadressen werden nicht klein geschrieben gespeichert – der Vergleich muss Groß-/Kleinschreibung ignorieren.
    await prisma.member.create({
      data: {
        clubId: s.club.id,
        firstName: "Dora",
        lastName: "Doppelt",
        email: "Doppelt@Example.test",
      },
    });
    const application = await applyOnce(s, { email: "doppelt@example.test" });
    expect((await listApplications(s.ctx.admin)).pending[0]!.conflict).toMatchObject({
      kind: "member",
      memberName: "Dora Doppelt",
      archived: false,
    });

    await expect(acceptApplication(s.ctx.admin, application.id)).rejects.toMatchObject({
      code: "VALIDATION",
      message: DUPLICATE_MEMBER_TEXT,
    });
    expect(DUPLICATE_MEMBER_TEXT).toBe(
      "Es gibt schon ein Mitglied mit dieser E-Mail-Adresse – bitte prüfe die Mitgliederliste.",
    );
    const sameAddress = {
      clubId: s.club.id,
      email: { equals: "doppelt@example.test", mode: "insensitive" as const },
    };
    expect(await prisma.member.count({ where: sameAddress })).toBe(1);
    expect(
      (await prisma.membershipApplication.findUniqueOrThrow({ where: { id: application.id } }))
        .status,
    ).toBe("PENDING");
    expect(await prisma.invitation.count({ where: { clubId: s.club.id } })).toBe(0);
    expect(mail.sent).toEqual([]);

    // Ein gelöschtes Mitglied (Papierkorb) zählt nicht mehr.
    await prisma.member.updateMany({ where: sameAddress, data: { deletedAt: new Date() } });
    await expect(acceptApplication(s.ctx.admin, application.id)).resolves.toMatchObject({
      invitationSent: true,
    });
  });

  it("hat die Adresse schon einen Zugang zum Verein, wird nichts angelegt", async () => {
    const s = await setup();
    const existing = await addUserToClub(s.club, "HELPER", {
      firstName: "Karl",
      lastName: "Konto",
    });
    // Der Mitgliedsdatensatz trägt eine andere Adresse – dann greift erst die Prüfung auf den Zugang.
    await prisma.member.update({ where: { id: existing.member.id }, data: { email: null } });
    const application = await applyOnce(s, { email: existing.user.email });
    expect((await listApplications(s.ctx.admin)).pending[0]!.conflict).toEqual({
      kind: "account",
    });

    await expect(acceptApplication(s.ctx.admin, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: EXISTING_ACCOUNT_TEXT,
    });
    expect(await prisma.member.count({ where: { email: existing.user.email } })).toBe(0);
    expect(await prisma.invitation.count({ where: { clubId: s.club.id } })).toBe(0);
    expect(
      (await prisma.membershipApplication.findUniqueOrThrow({ where: { id: application.id } }))
        .status,
    ).toBe("PENDING");
  });

  it("eine offene Einladung an dieselbe Adresse wird nicht still ersetzt – eine abgelaufene hindert nicht", async () => {
    const s = await setup();
    const application = await applyOnce(s);
    // Die Vereinsadministration hat dieselbe Person schon als Vorstandsmitglied eingeladen.
    const board = await issueInvitation({
      clubId: s.club.id,
      email: application.email,
      roleId: s.club.roleIds.BOARD!,
      invitedByUserId: s.people.admin.user.id,
      inviterName: "Anna Admin",
    });
    expect((await listApplications(s.ctx.board)).pending[0]!.conflict).toEqual({
      kind: "invitation",
    });

    await expect(acceptApplication(s.ctx.board, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: OPEN_INVITATION_TEXT,
    });
    expect((await openInvitations(s.club.id, application.email)).map((i) => i.id)).toEqual([
      board.id,
    ]);
    expect(await prisma.member.count({ where: { email: application.email } })).toBe(0);

    await prisma.invitation.update({
      where: { id: board.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect((await listApplications(s.ctx.board)).pending[0]!.conflict).toBeNull();
    await expect(acceptApplication(s.ctx.board, application.id)).resolves.toMatchObject({
      invitationSent: true,
    });
  });

  it("eine inzwischen deaktivierte Abteilung wird trotzdem zugeordnet (wie beim normalen Anlegen) und vorher gekennzeichnet", async () => {
    const s = await setup();
    const application = await applyOnce(s, { departmentId: s.department.id });
    await prisma.department.update({ where: { id: s.department.id }, data: { isActive: false } });
    expect((await listApplications(s.ctx.admin)).pending[0]).toMatchObject({
      departmentName: "Tischtennis",
      departmentInactive: true,
    });

    const { memberId } = await acceptApplication(s.ctx.admin, application.id);
    expect(
      (await prisma.memberDepartment.findMany({ where: { memberId } })).map((d) => d.departmentId),
    ).toEqual([s.department.id]);
  });

  it("offene Anträge bleiben entscheidbar, nachdem der Link erneuert oder geschlossen wurde", async () => {
    const s = await setup();
    const first = await applyOnce(s);
    const second = await applyOnce(s);
    await renewJoinLink(s.ctx.admin, 100);
    await closeJoinLink(s.ctx.board);

    await expect(acceptApplication(s.ctx.board, first.id)).resolves.toMatchObject({
      invitationSent: true,
    });
    await rejectApplication(s.ctx.admin, second.id);
    const statuses = await prisma.membershipApplication.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { id: true, status: true },
    });
    expect(Object.fromEntries(statuses.map((a) => [a.id, a.status]))).toEqual({
      [first.id]: "ACCEPTED",
      [second.id]: "REJECTED",
    });
  });

  it("scheitert die Einladung, bleibt das Mitglied angelegt – und die Einladung lässt sich erneut senden", async () => {
    const s = await setup();
    const application = await applyOnce(s);
    vi.mocked(issueInvitation).mockRejectedValueOnce(notFound("Der Verein"));

    const result = await acceptApplication(s.ctx.board, application.id);
    expect(result.invitationSent).toBe(false);
    expect(await prisma.member.count({ where: { id: result.memberId } })).toBe(1);
    expect(
      await prisma.membershipApplication.findUniqueOrThrow({ where: { id: application.id } }),
    ).toMatchObject({ status: "ACCEPTED", memberId: result.memberId });
    expect(await prisma.invitation.count({ where: { clubId: s.club.id } })).toBe(0);
    expect((await listApplications(s.ctx.board)).decided[0]).toMatchObject({
      canResendInvitation: true,
      invitationExpiresAt: null, // keine gültige Einladung
    });

    // Der Vorstand darf das (ohne `users:invite`) – dieselbe Regel wie beim Annehmen, Rolle fest „Mitglied“.
    await expect(resendApplicationInvitation(s.ctx.board, application.id)).resolves.toEqual({
      email: application.email,
    });
    const [invitation] = await openInvitations(s.club.id, application.email);
    expect(invitation).toMatchObject({
      memberId: result.memberId,
      invitedByUserId: s.people.board.user.id,
    });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: invitation!.roleId } })).key).toBe(
      "MEMBER",
    );
    expect(mail.sent.map((m) => m.to)).toEqual([application.email]);

    // Nochmals senden ersetzt die eigene Einladung (es bleibt genau eine offene).
    await resendApplicationInvitation(s.ctx.admin, application.id);
    expect(await openInvitations(s.club.id, application.email)).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: { clubId: s.club.id, action: "invitation.created" },
      }),
    ).toBe(2);
  });

  it("„Einladung erneut senden“ nur für angenommene Anträge ohne Konto, nie über eine fremde Einladung hinweg", async () => {
    const s = await setup();
    const pending = await applyOnce(s);
    await expect(resendApplicationInvitation(s.ctx.admin, pending.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const application = await applyOnce(s);
    const { memberId } = await acceptApplication(s.ctx.admin, application.id);
    // Eine Einladung derselben Adresse mit anderer Rolle (ohne Mitglied) darf nicht ersetzt werden.
    const own = (await openInvitations(s.club.id, application.email))[0]!;
    await prisma.invitation.update({ where: { id: own.id }, data: { revokedAt: new Date() } });
    const foreign = await issueInvitation({
      clubId: s.club.id,
      email: application.email,
      roleId: s.club.roleIds.HELPER!,
      invitedByUserId: s.people.admin.user.id,
      inviterName: "Anna Admin",
    });
    await expect(resendApplicationInvitation(s.ctx.board, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: OPEN_INVITATION_TEXT,
    });
    expect((await openInvitations(s.club.id, application.email)).map((i) => i.id)).toEqual([
      foreign.id,
    ]);
    await prisma.invitation.update({ where: { id: foreign.id }, data: { revokedAt: new Date() } });

    // Archiviertes Mitglied: keine Einladung.
    await prisma.member.update({ where: { id: memberId }, data: { archivedAt: new Date() } });
    expect((await listApplications(s.ctx.admin)).decided[0]!.canResendInvitation).toBe(false);
    await expect(resendApplicationInvitation(s.ctx.admin, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await prisma.member.update({ where: { id: memberId }, data: { archivedAt: null } });

    // Mit Konto ist keine Einladung mehr nötig.
    const user = await addUserToClub(s.club, "MEMBER");
    await prisma.member.delete({ where: { id: user.member.id } });
    await prisma.member.update({ where: { id: memberId }, data: { userId: user.user.id } });
    expect((await listApplications(s.ctx.admin)).decided[0]!.canResendInvitation).toBe(false);
    await expect(resendApplicationInvitation(s.ctx.admin, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("hat schon ein Konto"),
    });
  });

  it("zwei Anträge derselben Person gleichzeitig angenommen: genau ein Mitglied, der andere bleibt offen", async () => {
    const s = await setup();
    const email = `${unique("zweimal")}@example.test`;
    const one = await applyOnce(s, { email });
    const two = await applyOnce(s, { email });
    expect(one.id).not.toBe(two.id);
    const hints = (await listApplications(s.ctx.admin)).pending.filter((p) => p.email === email);
    expect(hints.map((p) => p.samePendingEmail)).toEqual([1, 1]);

    vi.mocked(suggestNextMemberNumber)
      .mockResolvedValueOnce("M-9001")
      .mockResolvedValueOnce("M-9002");
    const results = await Promise.allSettled([
      acceptApplication(s.ctx.admin, one.id),
      acceptApplication(s.ctx.board, two.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "VALIDATION", message: DUPLICATE_MEMBER_TEXT });
    expect(await prisma.member.count({ where: { clubId: s.club.id, email } })).toBe(1);
    expect(await openInvitations(s.club.id, email)).toHaveLength(1);
    const statuses = await prisma.membershipApplication.findMany({
      where: { id: { in: [one.id, two.id] } },
      select: { status: true },
    });
    expect(statuses.map((a) => a.status).sort()).toEqual(["ACCEPTED", "PENDING"]);
  });

  it("die Karte nennt ein archiviertes Mitglied mit derselben Adresse vorab", async () => {
    const s = await setup();
    const archived = await prisma.member.create({
      data: {
        clubId: s.club.id,
        firstName: "Frieda",
        lastName: "Früher",
        email: "wieder@example.test",
        archivedAt: new Date(),
      },
    });
    const application = await applyOnce(s, { email: "Wieder@Example.test" });
    const plain = await applyOnce(s);
    const pending = new Map((await listApplications(s.ctx.board)).pending.map((p) => [p.id, p]));
    expect(pending.get(application.id)).toMatchObject({
      conflict: {
        kind: "member",
        memberId: archived.id,
        memberName: "Frieda Früher",
        archived: true,
      },
      samePendingEmail: 0,
    });
    expect(pending.get(plain.id)).toMatchObject({ conflict: null, samePendingEmail: 0 });
  });

  it("gleichzeitiges Annehmen durch zwei Personen gelingt genau einmal", async () => {
    const s = await setup();
    const application = await applyOnce(s);

    const results = await Promise.allSettled([
      acceptApplication(s.ctx.admin, application.id),
      acceptApplication(s.ctx.board, application.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "CONFLICT" });
    expect(
      await prisma.member.count({ where: { clubId: s.club.id, email: application.email } }),
    ).toBe(1);
    expect(
      await prisma.invitation.count({ where: { clubId: s.club.id, email: application.email } }),
    ).toBe(1);
  });

  it("gleichzeitiges Annehmen zweier Anträge vergibt verschiedene Mitgliedsnummern", async () => {
    const s = await setup();
    const one = await applyOnce(s);
    const two = await applyOnce(s);
    const [a, b] = await Promise.all([
      acceptApplication(s.ctx.admin, one.id),
      acceptApplication(s.ctx.board, two.id),
    ]);
    const numbers = await prisma.member.findMany({
      where: { id: { in: [a.memberId, b.memberId] } },
      select: { memberNumber: true },
    });
    expect(new Set(numbers.map((n) => n.memberNumber)).size).toBe(2);
  });
});

describe("Nach der Einladung", () => {
  it("wer die Einladung annimmt, wird mit dem angelegten Mitglied verknüpft; der Datenexport enthält den eigenen Antrag", async () => {
    const s = await setup();
    const application = await applyOnce(s, { message: "Hallo Verein!" });
    const { memberId } = await acceptApplication(s.ctx.admin, application.id);
    const token = /\/einladung\/([A-Za-z0-9_-]{43})/.exec(mail.sent[0]!.text)?.[1];
    expect(token).toBeDefined();

    const { userId } = await acceptInvitationAsNewUser(
      {
        token: token!,
        firstName: "Bea",
        lastName: "Beitritt",
        password: "Ein-Sehr-Langes-Passwort-2026",
      },
      { ip: "unknown", ipPrefix: null },
    );
    expect((await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).userId).toBe(
      userId,
    );
    expect(
      await prisma.member.count({ where: { clubId: s.club.id, email: application.email } }),
    ).toBe(1); // kein zweiter Mitgliedsdatensatz

    const data = await buildUserDataExport(userId);
    const club = data!.vereine[0] as {
      mitglied: { beitrittsantraege: Record<string, unknown>[] } | null;
    };
    expect(club.mitglied?.beitrittsantraege).toMatchObject([
      {
        vorname: "Bea",
        nachricht: "Hallo Verein!",
        status: "ACCEPTED",
        einwilligungFassung: APPLICATION_CONSENT_VERSION,
      },
    ]);
    // Nach dem Anlegen des Kontos: keine erneute Einladung mehr angeboten.
    expect((await listApplications(s.ctx.admin)).decided[0]!.canResendInvitation).toBe(false);
    expect(JSON.stringify(club.mitglied?.beitrittsantraege)).not.toContain("198.51"); // keine IP
  });
});

describe("Ablehnen", () => {
  it("markiert den Antrag als abgelehnt, protokolliert ohne Namen und schickt keine E-Mail", async () => {
    const s = await setup();
    const application = await applyOnce(s);
    await rejectApplication(s.ctx.admin, application.id);

    expect(
      await prisma.membershipApplication.findUniqueOrThrow({ where: { id: application.id } }),
    ).toMatchObject({ status: "REJECTED", memberId: null, decidedById: s.people.admin.user.id });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: s.club.id, action: "member.application_rejected" },
    });
    expect(audit).toMatchObject({ entityId: application.id, actorUserId: s.people.admin.user.id });
    expect(audit.summary).not.toContain("Bea");
    expect(mail.sent).toEqual([]);
    expect(await prisma.member.count({ where: { email: application.email } })).toBe(0);

    await expect(rejectApplication(s.ctx.board, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(acceptApplication(s.ctx.board, application.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      rejectApplication(s.ctx.board, "00000000-0000-7000-8000-000000000000"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("Übersicht und Aufbewahrung", () => {
  it("offene zuerst (älteste oben), entschiedene nur aus den letzten 30 Tagen", async () => {
    const s = await setup();
    const older = await applyOnce(s, { firstName: "Olga" });
    const newer = await applyOnce(s, { firstName: "Nina" });
    const recent = await applyOnce(s, { firstName: "Rita" });
    const old = await applyOnce(s, { firstName: "Otto" });
    await prisma.membershipApplication.update({
      where: { id: older.id },
      data: { createdAt: new Date(Date.now() - 5 * DAY) },
    });
    await rejectApplication(s.ctx.admin, recent.id);
    await rejectApplication(s.ctx.admin, old.id);
    await prisma.membershipApplication.update({
      where: { id: old.id },
      data: { decidedAt: new Date(Date.now() - 31 * DAY) },
    });

    const overview = await listApplications(s.ctx.admin);
    expect(overview.pending.map((a) => a.firstName)).toEqual(["Olga", "Nina"]);
    expect(overview.decided.map((a) => a.firstName)).toEqual(["Rita"]);
    void newer;
  });

  it("der Aufbewahrungsjob löscht entschiedene nach 30 Tagen und offene nach 180 Tagen", async () => {
    const s = await setup();
    const now = new Date();
    const make = (
      status: "PENDING" | "ACCEPTED" | "REJECTED",
      createdDaysAgo: number,
      decidedDaysAgo?: number,
    ) =>
      prisma.membershipApplication.create({
        data: {
          clubId: s.club.id,
          firstName: `${status}-${createdDaysAgo}`,
          lastName: "Frist",
          email: `${unique("frist")}@example.test`,
          consentAt: new Date(now.getTime() - createdDaysAgo * DAY),
          consentTextVersion: APPLICATION_CONSENT_VERSION,
          createdAt: new Date(now.getTime() - createdDaysAgo * DAY),
          status,
          decidedAt:
            decidedDaysAgo === undefined ? null : new Date(now.getTime() - decidedDaysAgo * DAY),
        },
      });
    await make("PENDING", 181);
    const pendingKept = await make("PENDING", 179);
    await make("REJECTED", 60, 31);
    const rejectedKept = await make("REJECTED", 60, 29);
    const acceptedMember = await createMember(s.club.id);
    const acceptedOld = await make("ACCEPTED", 90, 40);
    await prisma.membershipApplication.update({
      where: { id: acceptedOld.id },
      data: { memberId: acceptedMember.id },
    });

    // Mindestens die drei fälligen hier (andere Tests dieser Datei können weitere alte Anträge hinterlassen).
    expect(await purgeOldApplications(now)).toBeGreaterThanOrEqual(3);
    expect(
      (await prisma.membershipApplication.findMany({ where: { clubId: s.club.id } }))
        .map((a) => a.id)
        .sort(),
    ).toEqual([pendingKept.id, rejectedKept.id].sort());
    // Das Mitglied bleibt, nur der Antrag ist weg.
    expect(await prisma.member.count({ where: { id: acceptedMember.id } })).toBe(1);

    // Über den gesamten Aufbewahrungsjob: nichts mehr fällig.
    expect(await applyRetention(now)).toMatchObject({ applicationsPurged: 0 });
  });

  it("wird die Abteilung gelöscht, bleibt der Antrag – ohne Abteilung", async () => {
    const s = await setup();
    const spare = await createDepartment(s.club.id, "Einmalig");
    const application = await applyOnce(s, { departmentId: spare.id });
    await deleteDepartment(s.ctx.admin, spare.id);
    expect(
      await prisma.membershipApplication.findUniqueOrThrow({ where: { id: application.id } }),
    ).toMatchObject({ departmentId: null, status: "PENDING" });
  });

  it("wird ein aus einem Antrag angelegtes Mitglied anonymisiert, verschwindet auch der Antrag", async () => {
    const s = await setup();
    const application = await applyOnce(s);
    const { memberId } = await acceptApplication(s.ctx.admin, application.id);
    await prisma.$transaction((tx) => anonymizeMemberData(tx, s.club.id, memberId));
    expect(await prisma.membershipApplication.count({ where: { id: application.id } })).toBe(0);
  });
});
