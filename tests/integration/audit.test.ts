import { describe, expect, it } from "vitest";
import { listAuditActors, listAuditEntries } from "@/modules/audit/service";
import { prisma } from "@/server/db/client";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

const DAY = 86_400_000;
const first = { page: 1, pageSize: 25, skip: 0 };

async function setup() {
  const club = await createClub("Protokollverein");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    people: { admin, board, member },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

const log = (
  clubId: string | null,
  action: string,
  over: {
    actorUserId?: string | null;
    summary?: string;
    actorType?: "USER" | "SYSTEM";
    createdAt?: Date;
    changes?: object;
  } = {},
) =>
  prisma.auditLog.create({
    data: {
      clubId,
      action,
      entityType: action.split(".")[0]!,
      summary: over.summary ?? action,
      actorUserId: over.actorUserId ?? null,
      actorType: over.actorType ?? "USER",
      createdAt: over.createdAt,
      changes: over.changes,
    },
  });

describe("Änderungsprotokoll", () => {
  it("nur mit Berechtigung: Verwalter ja, Vorstand und Mitglieder nein", async () => {
    const { ctx } = await setup();
    await expect(listAuditEntries(ctx.admin, { request: first })).resolves.toHaveProperty("items");
    await expect(listAuditEntries(ctx.board, { request: first })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listAuditEntries(ctx.member, { request: first })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listAuditActors(ctx.member)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("zeigt nur Einträge des eigenen Vereins – nicht die anderer Vereine und nicht Plattform-Ereignisse", async () => {
    const a = await setup();
    const b = await setup();
    await log(a.club.id, "member.created", { summary: "Eintrag Verein A" });
    await log(b.club.id, "member.created", { summary: "Eintrag Verein B" });
    await log(null, "platform.club_created", { summary: "Plattform-Ereignis ohne Verein" });

    const result = await listAuditEntries(a.ctx.admin, { request: first });
    expect(result.items.map((i) => i.summary)).toEqual(["Eintrag Verein A"]);
    expect(result.total).toBe(1);
  });

  it("neueste zuerst, mit Seitenwechsel", async () => {
    const { ctx, club } = await setup();
    for (let index = 0; index < 7; index += 1)
      await log(club.id, "member.updated", {
        summary: `Eintrag ${index}`,
        createdAt: new Date(Date.now() - (7 - index) * 60_000),
      });

    const page1 = await listAuditEntries(ctx.admin, { request: { page: 1, pageSize: 3, skip: 0 } });
    expect(page1.items.map((i) => i.summary)).toEqual(["Eintrag 6", "Eintrag 5", "Eintrag 4"]);
    expect(page1).toMatchObject({ total: 7, pageCount: 3 });
    const page3 = await listAuditEntries(ctx.admin, { request: { page: 3, pageSize: 3, skip: 6 } });
    expect(page3.items.map((i) => i.summary)).toEqual(["Eintrag 0"]);
  });

  it("filtert nach Bereich, Person, Text und Zeitraum", async () => {
    const { ctx, club, people } = await setup();
    const adminId = people.admin.user.id;
    const boardId = people.board.user.id;
    await log(club.id, "member.created", {
      actorUserId: adminId,
      summary: "Mitglied Max angelegt",
    });
    await log(club.id, "members.imported", {
      actorUserId: adminId,
      summary: "12 Mitglieder importiert",
    });
    await log(club.id, "event.created", { actorUserId: boardId, summary: "Sommerfest angelegt" });
    await log(club.id, "shift.assigned", {
      actorUserId: boardId,
      summary: "Hanna für Aufbau eingetragen",
    });
    await log(club.id, "privacy.export_created", {
      actorUserId: adminId,
      summary: "Datenexport erstellt",
      createdAt: new Date(Date.now() - 10 * DAY),
    });
    const summaries = async (query: Parameters<typeof listAuditEntries>[1]) =>
      (await listAuditEntries(ctx.admin, query)).items.map((i) => i.summary).sort();

    expect(await summaries({ module: "mitglieder", request: first })).toEqual([
      "12 Mitglieder importiert",
      "Mitglied Max angelegt",
    ]); // member. und members.
    expect(await summaries({ module: "veranstaltungen", request: first })).toEqual([
      "Sommerfest angelegt",
    ]);
    expect(await summaries({ module: "helferplanung", request: first })).toEqual([
      "Hanna für Aufbau eingetragen",
    ]);
    expect(await summaries({ actorUserId: boardId, request: first })).toEqual([
      "Hanna für Aufbau eingetragen",
      "Sommerfest angelegt",
    ]);
    expect(await summaries({ q: "sommerfest", request: first })).toEqual(["Sommerfest angelegt"]); // ohne Beachtung der Groß-/Kleinschreibung
    expect(await summaries({ from: new Date(Date.now() - 2 * DAY), request: first })).toHaveLength(
      4,
    );
    expect(await summaries({ to: new Date(Date.now() - 5 * DAY), request: first })).toEqual([
      "Datenexport erstellt",
    ]);
    expect(await summaries({ module: "mitglieder", actorUserId: boardId, request: first })).toEqual(
      [],
    ); // Kombination
  });

  it("löst Akteure auf: Person, System, nicht mehr vorhandene Person", async () => {
    const { ctx, club, people } = await setup();
    await log(club.id, "member.created", {
      actorUserId: people.admin.user.id,
      summary: "durch Person",
    });
    await log(club.id, "event.auto_completed", { actorType: "SYSTEM", summary: "durch System" });
    await log(club.id, "member.deleted", {
      actorUserId: "00000000-0000-0000-0000-00000000dead",
      summary: "durch gelöschte Person",
    });

    const items = (await listAuditEntries(ctx.admin, { request: first })).items;
    const actor = (summary: string) => items.find((i) => i.summary === summary)!.actor;
    expect(actor("durch Person")).toEqual({ kind: "USER", name: "Anna Admin" });
    expect(actor("durch System")).toEqual({ kind: "SYSTEM" });
    expect(actor("durch gelöschte Person")).toEqual({ kind: "UNKNOWN" });
  });

  it("liefert Änderungsdetails mit und die Akteursliste für den Filter (nur Personen des eigenen Vereins, sortiert)", async () => {
    const a = await setup();
    const b = await setup();
    await log(a.club.id, "member.updated", {
      changes: { firstName: { from: "Max", to: "Moritz" } },
    });
    const [entry] = (await listAuditEntries(a.ctx.admin, { request: first })).items;
    expect(entry!.changes).toEqual({ firstName: { from: "Max", to: "Moritz" } });

    const actors = await listAuditActors(a.ctx.admin);
    expect(actors.map((x) => x.userId).sort()).toEqual(
      [a.people.admin.user.id, a.people.board.user.id, a.people.member.user.id].sort(),
    );
    expect(actors.some((x) => x.userId === b.people.admin.user.id)).toBe(false);
    expect(actors.map((x) => x.name)).toEqual(
      [...actors.map((x) => x.name)].sort((x, y) => x.localeCompare(y, "de")),
    );
  });
});
