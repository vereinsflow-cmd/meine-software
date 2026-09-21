import { describe, expect, it } from "vitest";
import { getClubPrivacyInfo } from "@/modules/clubs/service";
import { getOwnConsents, setOwnConsent } from "@/modules/privacy/consents";
import {
  getOwnAccount,
  listOwnSessions,
  revokeOtherSessions,
  revokeOwnSession,
  setEmailNotifications,
  updateOwnName,
} from "@/server/auth/profile";
import { prisma } from "@/server/db/client";
import { addUserToClub, contextFor, createClub, unique } from "../helpers/factories";

const DAY = 86_400_000;
const MIN = 60_000;
const meta = { ipPrefix: "10.0.0.0" };

async function setup() {
  const club = await createClub("Profilverein");
  const person = await addUserToClub(club, "MEMBER", { firstName: "Paula", lastName: "Person" });
  const other = await addUserToClub(club, "MEMBER", { firstName: "Otto", lastName: "Anders" });
  return {
    club,
    person,
    other,
    ctx: await contextFor(person.user.id, club.id),
    otherCtx: await contextFor(other.user.id, club.id),
  };
}

describe("Einwilligungen (Selbstbedienung)", () => {
  it("zeigt den aktuellen Stand je Art in fester Reihenfolge – jüngster Eintrag gilt", async () => {
    const { ctx, club, person } = await setup();
    let states = (await getOwnConsents(ctx))!;
    expect(states.map((s) => s.type)).toEqual([
      "PRIVACY_POLICY",
      "DATA_PROCESSING",
      "NEWSLETTER",
      "PHOTO_PUBLICATION",
    ]);
    expect(states.every((s) => s.granted === null)).toBe(true);
    expect(states.map((s) => s.selfService)).toEqual([false, false, true, true]);

    const base = { clubId: club.id, memberId: person.member.id };
    await prisma.consent.create({
      data: {
        ...base,
        type: "NEWSLETTER",
        granted: true,
        source: "paper",
        recordedAt: new Date(Date.now() - 3 * DAY),
      },
    });
    await prisma.consent.create({
      data: {
        ...base,
        type: "NEWSLETTER",
        granted: false,
        source: "app",
        recordedAt: new Date(Date.now() - DAY),
      },
    });
    await prisma.consent.create({
      data: { ...base, type: "PRIVACY_POLICY", granted: true, source: "paper" },
    });
    states = (await getOwnConsents(ctx))!;
    expect(states.find((s) => s.type === "NEWSLETTER")).toMatchObject({
      granted: false,
      source: "app",
    });
    expect(states.find((s) => s.type === "PRIVACY_POLICY")).toMatchObject({
      granted: true,
      source: "paper",
      selfService: false,
    });
  });

  it("erteilen und widerrufen: jede Änderung ist ein neuer Nachweis mit Herkunft 'app' und ein Protokolleintrag", async () => {
    const { ctx, club, person } = await setup();
    await setOwnConsent(ctx, { type: "PHOTO_PUBLICATION", granted: true });
    await setOwnConsent(ctx, { type: "PHOTO_PUBLICATION", granted: false });

    const rows = await prisma.consent.findMany({
      where: { memberId: person.member.id },
      orderBy: { recordedAt: "asc" },
    });
    expect(rows.map((r) => [r.type, r.granted, r.source, r.recordedBy])).toEqual([
      ["PHOTO_PUBLICATION", true, "app", person.user.id],
      ["PHOTO_PUBLICATION", false, "app", person.user.id],
    ]);
    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "member.consent_changed" },
      orderBy: { createdAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      actorUserId: person.user.id,
      entityType: "Member",
      entityId: person.member.id,
    });
    expect(audit[0]!.summary).toContain("erteilt (durch das Mitglied selbst)");
    expect(audit[1]!.summary).toContain("widerrufen");
  });

  it("ist idempotent: gleicher Zustand erzeugt keinen neuen Eintrag; Widerruf ohne Einwilligung hält nichts fest", async () => {
    const { ctx, person } = await setup();
    await setOwnConsent(ctx, { type: "NEWSLETTER", granted: false }); // noch nie erteilt
    expect(await prisma.consent.count({ where: { memberId: person.member.id } })).toBe(0);
    await setOwnConsent(ctx, { type: "NEWSLETTER", granted: true });
    await setOwnConsent(ctx, { type: "NEWSLETTER", granted: true }); // doppelter Klick
    expect(await prisma.consent.count({ where: { memberId: person.member.id } })).toBe(1);
  });

  it("nur freiwillige Einwilligungen; ohne Mitgliedsdatensatz geht nichts", async () => {
    const { ctx, club } = await setup();
    await expect(
      setOwnConsent(ctx, { type: "PRIVACY_POLICY", granted: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      setOwnConsent(ctx, { type: "DATA_PROCESSING", granted: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await prisma.consent.count({ where: { clubId: club.id } })).toBe(0);

    const withoutMember = { ...ctx, memberId: null };
    expect(await getOwnConsents(withoutMember)).toBeNull();
    await expect(
      setOwnConsent(withoutMember, { type: "NEWSLETTER", granted: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("wirkt immer nur auf das EIGENE Mitglied – auch wenn jemand eine fremde ID einschleusen wollte", async () => {
    const { ctx, otherCtx, person, other } = await setup();
    // Die API kennt keinen Parameter für die Mitglieds-ID: Es zählt allein ctx.memberId.
    await setOwnConsent(ctx, {
      type: "NEWSLETTER",
      granted: true,
      memberId: other.member.id,
    } as never);
    expect(await prisma.consent.count({ where: { memberId: person.member.id } })).toBe(1);
    expect(await prisma.consent.count({ where: { memberId: other.member.id } })).toBe(0);
    expect(
      (await getOwnConsents(otherCtx))!.find((s) => s.type === "NEWSLETTER")!.granted,
    ).toBeNull();
  });

  it("Datenschutz-Angaben des Vereins sind für alle Mitglieder lesbar – mit Fristen, ohne interne Einstellungen", async () => {
    const { ctx, club } = await setup();
    await prisma.club.update({
      where: { id: club.id },
      data: {
        street: "Vereinsweg 1",
        postalCode: "12345",
        city: "Musterstadt",
        contactEmail: "info@verein.example",
        privacyContact: "Frau Datenschutz\ndatenschutz@verein.example",
        settings: { retention: { trashDays: 14 }, geheim: "x" },
      },
    });
    const info = await getClubPrivacyInfo(ctx);
    expect(info).toEqual({
      name: "Profilverein",
      address: "Vereinsweg 1, 12345 Musterstadt",
      contactEmail: "info@verein.example",
      privacyContact: "Frau Datenschutz\ndatenschutz@verein.example",
      retention: { leftMembersMonths: 24, trashDays: 14, auditMonths: 36 },
    });
    expect(JSON.stringify(info)).not.toContain("geheim");
  });
});

describe("Profil", () => {
  it("Name ändern: getrimmt, protokolliert; E-Mail-Benachrichtigungen umschalten", async () => {
    const { person } = await setup();
    await updateOwnName(person.user.id, { firstName: "  Paulina ", lastName: " Neu  " }, meta);
    const account = await getOwnAccount(person.user.id);
    expect(account).toMatchObject({
      firstName: "Paulina",
      lastName: "Neu",
      email: person.user.email,
      emailNotifications: true,
      totpEnabledAt: null,
    });
    expect(JSON.stringify(account)).not.toContain("passwordHash");
    expect(
      await prisma.auditLog.findFirst({
        where: { actorUserId: person.user.id, action: "auth.profile_updated" },
      }),
    ).toMatchObject({ entityId: person.user.id, ipPrefix: "10.0.0.0" });

    await setEmailNotifications(person.user.id, false);
    expect((await getOwnAccount(person.user.id)).emailNotifications).toBe(false);
    await setEmailNotifications(person.user.id, true);
    expect((await getOwnAccount(person.user.id)).emailNotifications).toBe(true);
  });

  it("gelöschte Konten lassen sich nicht ändern oder lesen", async () => {
    const { person } = await setup();
    await prisma.user.update({ where: { id: person.user.id }, data: { deletedAt: new Date() } });
    await expect(
      updateOwnName(person.user.id, { firstName: "X", lastName: "Y" }, meta),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getOwnAccount(person.user.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setEmailNotifications(person.user.id, false)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("Angemeldete Geräte", () => {
  const session = (
    userId: string,
    id: string,
    over: { lastSeenAt?: Date; expiresAt?: Date; userAgent?: string | null; createdAt?: Date } = {},
  ) =>
    prisma.session.create({
      data: {
        id,
        userId,
        createdAt: over.createdAt ?? new Date(Date.now() - 3 * DAY),
        lastSeenAt: over.lastSeenAt ?? new Date(Date.now() - 5 * MIN),
        expiresAt: over.expiresAt ?? new Date(Date.now() + 5 * DAY),
        userAgent:
          over.userAgent === undefined
            ? "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36 Edg/126.0"
            : over.userAgent,
        ipPrefix: "192.168.1.0",
      },
    });

  it("listet aktive Sitzungen (nicht abgelaufen, nicht im Leerlauf), die aktuelle zuerst – ohne Token", async () => {
    const { person } = await setup();
    const id = () => `sess-${unique()}`;
    const [current, older, expired, idle] = [id(), id(), id(), id()];
    await session(person.user.id, older, {
      lastSeenAt: new Date(Date.now() - 20 * MIN),
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile Safari/537.36",
    });
    await session(person.user.id, current, { lastSeenAt: new Date(Date.now() - 10 * MIN) });
    await session(person.user.id, expired, { expiresAt: new Date(Date.now() - MIN) });
    await session(person.user.id, idle, { lastSeenAt: new Date(Date.now() - 3 * 60 * MIN) }); // Leerlauf-Timeout im Test: 60 min

    const list = await listOwnSessions(person.user.id, current);
    expect(list.map((s) => [s.id, s.current, s.device])).toEqual([
      [current, true, "Edge auf Windows"],
      [older, false, "Chrome auf Android"],
    ]);
    expect(list[0]).toMatchObject({ ipPrefix: "192.168.1.0" });
  });

  it("fremde Sitzungen lassen sich nicht beenden (kein Zugriff per ID), die eigene aktuelle nicht über diesen Weg", async () => {
    const { person, other } = await setup();
    const mine = `sess-${unique()}`;
    const mine2 = `sess-${unique()}`;
    const theirs = `sess-${unique()}`;
    await session(person.user.id, mine);
    await session(person.user.id, mine2);
    await session(other.user.id, theirs);

    await expect(revokeOwnSession(person.user.id, theirs, mine)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await prisma.session.count({ where: { id: theirs } })).toBe(1);
    await expect(revokeOwnSession(person.user.id, mine, mine)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await revokeOwnSession(person.user.id, mine2, mine);
    expect(await prisma.session.count({ where: { id: mine2 } })).toBe(0);
    await expect(revokeOwnSession(person.user.id, mine2, mine)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("'Auf allen anderen Geräten abmelden' behält nur die aktuelle Sitzung und berührt andere Benutzer nicht", async () => {
    const { person, other } = await setup();
    const ids = [`sess-${unique()}`, `sess-${unique()}`, `sess-${unique()}`];
    for (const id of ids) await session(person.user.id, id);
    const theirs = `sess-${unique()}`;
    await session(other.user.id, theirs);

    expect(await revokeOtherSessions(person.user.id, ids[0]!)).toBe(2);
    expect(
      (await prisma.session.findMany({ where: { userId: person.user.id } })).map((s) => s.id),
    ).toEqual([ids[0]]);
    expect(await prisma.session.count({ where: { id: theirs } })).toBe(1);
  });
});
