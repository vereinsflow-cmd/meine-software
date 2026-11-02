import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions laufen hier ohne Next.js: Cookies/Kopfzeilen der Anfrage und das Neuladen des Caches werden ersetzt.
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { addQualificationAction, updateQualificationAction } from "@/modules/members/actions";
import {
  qualificationSchema,
  type QualificationFormInput,
} from "@/modules/members/qualification-schemas";
import {
  addQualification,
  listMemberQualifications,
  removeQualification,
  updateQualification,
} from "@/modules/members/qualifications";
import { archiveMember, deleteMember, getMemberHistory } from "@/modules/members/service";
import { prisma } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { ANONYMOUS_AUDIT_SUMMARY, anonymizeMemberData } from "@/server/privacy/anonymize";
import { buildUserDataExport } from "@/server/privacy/export";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createMember,
} from "../helpers/factories";
import { loginAs, request } from "../helpers/next-request";

/**
 * Qualifikationen und Lizenzen von Mitgliedern: Rechte wie beim Mitglied selbst (lesen mit `members:read`, pflegen mit
 * `members:update` – Abteilungsleitung nur für ihre Abteilungen), Mandantentrennung, Prüfregeln (gültig bis nie vor
 * ausgestellt am), Änderungsverlauf, Datenexport und Anonymisierung.
 */

const input = (overrides: Partial<QualificationFormInput> = {}) =>
  qualificationSchema.parse({ kind: "INSTRUCTOR_LICENSE", ...overrides });

beforeEach(() => {
  request.token = null;
  vi.mocked(revalidatePath).mockClear();
});

async function setup(name = "Lizenzverein") {
  const club = await createClub(name);
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", {
    firstName: "Tamara",
    lastName: "Trainerin",
    ledDepartmentIds: [fussball.id],
  });
  const mia = await addUserToClub(club, "MEMBER", { firstName: "Mia", lastName: "Mitglied" });
  // Ohne Konto: Lena spielt Fußball, Hanna Handball.
  const lena = await createMember(club.id, { firstName: "Lena", lastName: "Läuferin" });
  const hanna = await createMember(club.id, { firstName: "Hanna", lastName: "Werfer" });
  await prisma.memberDepartment.createMany({
    data: [
      { clubId: club.id, memberId: mia.member.id, departmentId: fussball.id },
      { clubId: club.id, memberId: lena.id, departmentId: fussball.id },
      { clubId: club.id, memberId: hanna.id, departmentId: handball.id },
    ],
  });
  return {
    club,
    people: { admin, board, lead, mia },
    members: { mia: mia.member, lena, hanna },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      mia: await contextFor(mia.user.id, club.id),
    },
  };
}

describe("Qualifikationen eintragen, ändern, entfernen", () => {
  it("trägt eine Lizenz mit allen Angaben ein und vermerkt es im Verlauf des Mitglieds", async () => {
    const { ctx, members, people } = await setup();
    const { id } = await addQualification(
      ctx.board,
      members.lena.id,
      input({
        kind: "TRAINER_LICENSE",
        title: "C-Lizenz Breitensport",
        number: "LSB-12345",
        issuedOn: "2024-03-01",
        validUntil: "2028-03-31",
        issuer: "Landessportbund",
        note: "Verlängerung über Fortbildung",
      }),
    );

    const { items, canManage } = await listMemberQualifications(ctx.board, members.lena.id);
    expect(canManage).toBe(true);
    expect(items).toEqual([
      {
        id,
        kind: "TRAINER_LICENSE",
        title: "C-Lizenz Breitensport",
        number: "LSB-12345",
        issuedOn: new Date("2024-03-01T00:00:00.000Z"),
        validUntil: new Date("2028-03-31T00:00:00.000Z"),
        issuer: "Landessportbund",
        note: "Verlängerung über Fortbildung",
      },
    ]);

    const history = await getMemberHistory(ctx.admin, members.lena.id);
    expect(history[0]).toMatchObject({
      action: "member.qualification_added",
      summary: "Qualifikation von Lena Läuferin eingetragen: Trainerlizenz – C-Lizenz Breitensport",
      actorName: "Bernd Vorstand",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: members.lena.id, action: "member.qualification_added" },
    });
    expect(audit).toMatchObject({ entityType: "Member", actorUserId: people.board.user.id });
  });

  it("ändert nur, was sich ändert – Nummer und Notiz stehen im Protokoll ohne Werte", async () => {
    const { ctx, members } = await setup();
    const { id } = await addQualification(
      ctx.admin,
      members.lena.id,
      input({ kind: "FIRST_AID", number: "EH-1", validUntil: "2026-05-31" }),
    );

    // Unverändert gespeichert: kein Eintrag.
    await updateQualification(
      ctx.admin,
      id,
      input({ kind: "FIRST_AID", number: "EH-1", validUntil: "2026-05-31" }),
    );
    expect(
      await prisma.auditLog.count({
        where: { entityId: members.lena.id, action: "member.qualification_updated" },
      }),
    ).toBe(0);

    await updateQualification(
      ctx.admin,
      id,
      input({
        kind: "FIRST_AID",
        number: "EH-2",
        issuedOn: "2026-06-01",
        validUntil: "2028-05-31",
        issuer: "DRK",
        note: "Auffrischung",
      }),
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: members.lena.id, action: "member.qualification_updated" },
    });
    expect(audit.summary).toBe("Qualifikation von Lena Läuferin geändert: Erste Hilfe");
    expect(audit.changes).toEqual({
      nummer: { changed: true },
      ausgestelltAm: { from: null, to: "01.06.2026" },
      gueltigBis: { from: "31.05.2026", to: "31.05.2028" },
      aussteller: { from: null, to: "DRK" },
      notiz: { changed: true },
    });
    expect(JSON.stringify(audit.changes)).not.toContain("EH-");
    expect(JSON.stringify(audit.changes)).not.toContain("Auffrischung");
    expect(await prisma.memberQualification.findUniqueOrThrow({ where: { id } })).toMatchObject({
      number: "EH-2",
      issuer: "DRK",
      validUntil: new Date("2028-05-31T00:00:00.000Z"),
    });
  });

  it("entfernt eine Qualifikation und vermerkt es", async () => {
    const { ctx, members } = await setup();
    const { id } = await addQualification(
      ctx.admin,
      members.lena.id,
      input({ kind: "OTHER", title: "Kampfrichter Leichtathletik" }),
    );
    await removeQualification(ctx.admin, id);
    expect(await prisma.memberQualification.count({ where: { id } })).toBe(0);
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: { entityId: members.lena.id, action: "member.qualification_removed" },
      }),
    ).toMatchObject({
      summary: "Qualifikation von Lena Läuferin entfernt: Kampfrichter Leichtathletik",
    });
    await expect(removeQualification(ctx.admin, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("Rechte", () => {
  it("Abteilungsleitung: nur Mitglieder der eigenen Abteilung – andere sind „nicht gefunden“", async () => {
    const { ctx, members } = await setup();
    const own = await addQualification(ctx.lead, members.lena.id, input());
    await updateQualification(ctx.lead, own.id, input({ number: "UL-1" }));
    expect(await listMemberQualifications(ctx.lead, members.lena.id)).toMatchObject({
      canManage: true,
      items: [{ id: own.id, number: "UL-1" }],
    });

    const foreign = await addQualification(ctx.admin, members.hanna.id, input());
    await expect(listMemberQualifications(ctx.lead, members.hanna.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(addQualification(ctx.lead, members.hanna.id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(updateQualification(ctx.lead, foreign.id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(removeQualification(ctx.lead, foreign.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await prisma.memberQualification.count({ where: { memberId: members.hanna.id } })).toBe(
      1,
    );

    await removeQualification(ctx.lead, own.id);
    expect(await prisma.memberQualification.count({ where: { memberId: members.lena.id } })).toBe(
      0,
    );
  });

  it("Mitglied: sieht die eigenen Qualifikationen, darf sie aber nicht ändern; fremde sind unsichtbar", async () => {
    const { ctx, members } = await setup();
    const own = await addQualification(ctx.admin, members.mia.id, input({ kind: "LIFEGUARD" }));
    await addQualification(ctx.admin, members.lena.id, input());

    expect(await listMemberQualifications(ctx.mia, members.mia.id)).toMatchObject({
      canManage: false,
      items: [{ id: own.id, kind: "LIFEGUARD" }],
    });
    await expect(addQualification(ctx.mia, members.mia.id, input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateQualification(ctx.mia, own.id, input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(removeQualification(ctx.mia, own.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listMemberQualifications(ctx.mia, members.lena.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await prisma.memberQualification.count({ where: { memberId: members.mia.id } })).toBe(1);
  });

  it("im Papierkorb: nur wer löschen darf sieht die Liste, ändern kann niemand", async () => {
    const { ctx, members } = await setup();
    const { id } = await addQualification(ctx.admin, members.lena.id, input());
    await archiveMember(ctx.admin, members.lena.id);
    await deleteMember(ctx.admin, members.lena.id);

    expect(await listMemberQualifications(ctx.admin, members.lena.id)).toMatchObject({
      canManage: false,
      items: [{ id }],
    });
    await expect(listMemberQualifications(ctx.board, members.lena.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(addQualification(ctx.admin, members.lena.id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(removeQualification(ctx.admin, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("Server Action: ohne Anmeldung und ohne Recht nichts, sonst gespeichert und die Seite des Mitglieds neu geladen", async () => {
    const { club, people, members } = await setup();
    expect(await addQualificationAction(members.lena.id, { kind: "REFEREE" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    await loginAs(people.mia.user.id, club.id);
    expect(await addQualificationAction(members.mia.id, { kind: "REFEREE" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(revalidatePath).not.toHaveBeenCalled();

    await loginAs(people.board.user.id, club.id);
    const result = await addQualificationAction(members.lena.id, {
      kind: "REFEREE",
      title: "",
      validUntil: "",
    });
    expect(result).toMatchObject({ ok: true, data: { id: expect.any(String) } });
    expect(revalidatePath).toHaveBeenCalledWith(`/mitglieder/${members.lena.id}`);
    expect(
      await prisma.memberQualification.findFirstOrThrow({ where: { memberId: members.lena.id } }),
    ).toMatchObject({ kind: "REFEREE", title: null, validUntil: null });
  });
});

describe("Prüfregeln", () => {
  it("gültig bis nie vor ausgestellt am, „Sonstige“ nur mit Bezeichnung, gültige Daten und Längen", () => {
    expect(
      qualificationSchema.safeParse({
        kind: "FIRST_AID",
        issuedOn: "2026-01-01",
        validUntil: "2026-01-01",
      }).success,
    ).toBe(true);
    for (const bad of [
      { kind: "FIRST_AID", issuedOn: "2026-01-02", validUntil: "2026-01-01" },
      { kind: "OTHER" },
      { kind: "OTHER", title: "   " },
      { kind: "UNBEKANNT" },
      { kind: "FIRST_AID", validUntil: "31.12.2026" },
      { kind: "FIRST_AID", issuedOn: "2026-02-30" },
      { kind: "FIRST_AID", number: "1".repeat(61) },
      { kind: "FIRST_AID", note: "x".repeat(1001) },
    ]) {
      expect(qualificationSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("die Server Action meldet den Fehler am Feld „Gültig bis“ und speichert nichts", async () => {
    const { club, ctx, people, members } = await setup();
    await loginAs(people.board.user.id, club.id);
    const result = await addQualificationAction(members.lena.id, {
      kind: "FIRST_AID",
      issuedOn: "2026-03-01",
      validUntil: "2025-03-01",
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { validUntil: ["„Gültig bis“ darf nicht vor „Ausgestellt am“ liegen."] },
      },
    });

    const { id } = await addQualification(ctx.board, members.lena.id, input());
    expect(await updateQualificationAction(id, { kind: "OTHER", title: "" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { title: [expect.any(String)] } },
    });
    expect(await prisma.memberQualification.count({ where: { memberId: members.lena.id } })).toBe(
      1,
    );
  });

  it("die Datenbank sichert die Regeln zusätzlich ab", async () => {
    const { club, members } = await setup();
    const base = { clubId: club.id, memberId: members.lena.id };
    for (const data of [
      {
        ...base,
        kind: "FIRST_AID" as const,
        issuedOn: new Date("2026-02-01"),
        validUntil: new Date("2026-01-31"),
      },
      { ...base, kind: "OTHER" as const },
      { ...base, kind: "OTHER" as const, title: "  " },
      { ...base, kind: "FIRST_AID" as const, number: "" },
      { ...base, kind: "FIRST_AID" as const, note: "x".repeat(1001) },
    ])
      await expect(
        prisma.memberQualification.create({ data }),
        JSON.stringify(data),
      ).rejects.toThrow();
  });
});

describe("Mandantentrennung", () => {
  it("ein anderer Verein sieht, ändert und löscht nichts; die Datenbank verknüpft keine Vereine", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    const { id } = await addQualification(a.ctx.admin, a.members.lena.id, input());

    await expect(listMemberQualifications(b.ctx.admin, a.members.lena.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(addQualification(b.ctx.admin, a.members.lena.id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(updateQualification(b.ctx.admin, id, input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(removeQualification(b.ctx.admin, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await prisma.memberQualification.count({ where: { id } })).toBe(1);

    // Selbst mit dem UNGESCHÜTZTEN Client: zusammengesetzter Fremdschlüssel (clubId, memberId).
    await expect(
      prisma.memberQualification.create({
        data: { clubId: b.club.id, memberId: a.members.lena.id, kind: "FIRST_AID" },
      }),
    ).rejects.toThrow();
    const dbB = createTenantDb(b.club.id);
    expect(await dbB.memberQualification.findMany()).toEqual([]);
    expect(
      await dbB.memberQualification.updateMany({ where: { id }, data: { number: "fremd" } }),
    ).toEqual({ count: 0 });
  });
});

describe("Datenschutz", () => {
  it("die eigenen Qualifikationen stehen im Datenexport – die anderer nicht", async () => {
    const { ctx, people, members } = await setup();
    await addQualification(
      ctx.admin,
      members.mia.id,
      input({
        kind: "YOUTH_LEADER_CARD",
        number: "JULEICA-77",
        issuedOn: "2025-04-01",
        validUntil: "2028-03-31",
        issuer: "Landesjugendring",
        note: "Gruppenleitung U12",
      }),
    );
    await addQualification(ctx.admin, members.lena.id, input({ number: "FREMD-1" }));

    const data = (await buildUserDataExport(people.mia.user.id))!;
    const mitglied = data.vereine[0]?.mitglied as { qualifikationen: Record<string, unknown>[] };
    expect(mitglied.qualifikationen).toEqual([
      {
        art: "Jugendleiter-Card (Juleica)",
        bezeichnung: null,
        nummer: "JULEICA-77",
        ausgestelltAm: "2025-04-01",
        gueltigBis: "2028-03-31",
        aussteller: "Landesjugendring",
        notiz: "Gruppenleitung U12",
        eingetragenAm: expect.any(String),
      },
    ]);
    expect(JSON.stringify(data)).not.toContain("FREMD-1");
  });

  it("beim Anonymisieren entfallen die Qualifikationen der Person – die anderer bleiben", async () => {
    const { club, ctx, members } = await setup();
    await addQualification(
      ctx.admin,
      members.lena.id,
      input({ kind: "LIFEGUARD", number: "DLRG-9", note: "Silber" }),
    );
    await addQualification(ctx.admin, members.lena.id, input());
    const other = await addQualification(ctx.admin, members.hanna.id, input());

    expect(
      await prisma.$transaction((tx) => anonymizeMemberData(tx, club.id, members.lena.id)),
    ).toBe(true);

    expect(await prisma.memberQualification.count({ where: { memberId: members.lena.id } })).toBe(
      0,
    );
    expect(await prisma.memberQualification.count({ where: { id: other.id } })).toBe(1);
    // Auch der Verlauf nennt die Person nicht mehr.
    const logs = await prisma.auditLog.findMany({
      where: { entityId: members.lena.id, action: "member.qualification_added" },
    });
    expect(logs.map((log) => log.summary)).toEqual([
      ANONYMOUS_AUDIT_SUMMARY,
      ANONYMOUS_AUDIT_SUMMARY,
    ]);
  });
});
