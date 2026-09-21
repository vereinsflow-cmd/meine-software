import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteDocument,
  getStorageUsage,
  listCategories,
  listDocuments,
  listUploadEvents,
  openDocument,
  updateDocument,
  uploadDocument,
} from "@/modules/documents/service";
import { documentFormSchema } from "@/modules/documents/schemas";
import { prisma } from "@/server/db/client";
import { purgeDeletedDocuments } from "@/server/jobs/retention";
import { deleteFile, openFile, saveFile, storageRoot } from "@/server/storage/files";
import { registerUploadScanner } from "@/server/storage/scan";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
} from "../helpers/factories";

const first = { page: 1, pageSize: 25, skip: 0 };
const PDF = (content = "Inhalt") => new TextEncoder().encode(`%PDF-1.7\n${content}\n%%EOF`);
const meta = (
  over: { category?: string; access?: "ALL_MEMBERS" | "BOARD" | "ADMIN"; eventId?: string } = {},
) => ({ access: "ALL_MEMBERS" as const, ...over });

async function setup() {
  const club = await createClub("Dokumentenverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", {
    ledDepartmentIds: [fussball.id],
    firstName: "Lea",
    lastName: "Leitung",
  });
  const helper = await addUserToClub(club, "HELPER");
  const member = await addUserToClub(club, "MEMBER");
  const eventF = await createEvent(club.id, { title: "Fußballturnier", departmentId: fussball.id });
  const eventH = await createEvent(club.id, {
    title: "Handballturnier",
    departmentId: handball.id,
  });
  return {
    club,
    eventF,
    eventH,
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}
type Ctx = Awaited<ReturnType<typeof setup>>["ctx"]["admin"];
const upload = (
  ctx: Ctx,
  fileName: string,
  bytes: Uint8Array = PDF(),
  over: Parameters<typeof meta>[0] = {},
) => uploadDocument(ctx, { fileName, bytes, ...meta(over) });
const names = async (ctx: Ctx) =>
  (await listDocuments(ctx, { request: first })).items.map((d) => d.name).sort();
const filesOf = (clubId: string) =>
  existsSync(path.join(storageRoot(), clubId)) ? readdirSync(path.join(storageRoot(), clubId)) : [];
const readAll = async (stream: ReadableStream<Uint8Array>) =>
  Buffer.from(await new Response(stream).arrayBuffer());

afterEach(() => registerUploadScanner(null));

describe("Hochladen", () => {
  it("speichert die Datei unter zufälligem Schlüssel, den Typ aus der Positivliste und den Prüfwert – und liefert sie unverändert aus", async () => {
    const { ctx, club } = await setup();
    const bytes = PDF("Protokoll der Mitgliederversammlung");
    const { id } = await upload(ctx.admin, "Protokoll MV 2026.pdf", bytes, {
      category: "Protokolle",
    });

    const row = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      clubId: club.id,
      name: "Protokoll MV 2026.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      category: "Protokolle",
      access: "ALL_MEMBERS",
      eventId: null,
    });
    expect(row.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(row.storageKey).toMatch(/^[0-9a-f]{32}$/);
    expect(row.storageKey).not.toContain("Protokoll"); // nie aus dem Dateinamen
    expect(filesOf(club.id)).toEqual([row.storageKey]);
    expect(readFileSync(path.join(storageRoot(), club.id, row.storageKey))).toEqual(
      Buffer.from(bytes),
    );

    const opened = await openDocument(ctx.member, id);
    expect(opened.document).toMatchObject({
      name: "Protokoll MV 2026.pdf",
      mimeType: "application/pdf",
      uploader: "Anna Admin",
    });
    expect(opened.size).toBe(bytes.length);
    expect(await readAll(opened.stream)).toEqual(Buffer.from(bytes));

    expect(
      await prisma.auditLog.findFirst({
        where: { clubId: club.id, action: "document.uploaded", entityId: id },
      }),
    ).toMatchObject({ summary: "Dokument „Protokoll MV 2026.pdf“ hochgeladen" });
  });

  it("bereinigt gefährliche Dateinamen und ignoriert den vom Browser gemeldeten Typ", async () => {
    const { ctx, club } = await setup();
    const { id } = await upload(ctx.admin, "..\\..\\etc\\Bericht‮fdp.pdf");
    const row = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe("Berichtfdp.pdf");
    expect(row.storageKey).toMatch(/^[0-9a-f]{32}$/);
    expect(filesOf(club.id)).toHaveLength(1);
  });

  it("lehnt ab und speichert NICHTS: falscher Inhalt, verbotener Typ, leer, zu groß", async () => {
    const { ctx, club } = await setup();
    const cases: [string, Uint8Array, RegExp][] = [
      [
        "tarnung.pdf",
        new TextEncoder().encode("<html><script>alert(1)</script></html>"),
        /passt nicht zur Endung/,
      ],
      ["programm.exe", new TextEncoder().encode("MZ"), /nicht erlaubt/],
      ["seite.html", new TextEncoder().encode("<h1>x</h1>"), /nicht erlaubt/],
      ["bild.svg", new TextEncoder().encode("<svg onload=alert(1)/>"), /nicht erlaubt/],
      ["leer.pdf", new Uint8Array(), /leer/],
      [
        "riesig.pdf",
        new Uint8Array(5 * 1024 * 1024 + 1)
          .fill(0x41)
          .map((v, i) => (i < 5 ? "%PDF-".charCodeAt(i) : v)),
        /zu groß/,
      ],
    ];
    for (const [name, bytes, message] of cases) {
      await expect(upload(ctx.admin, name, bytes)).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { file: [expect.stringMatching(message)] },
      });
    }
    expect(await prisma.document.count({ where: { clubId: club.id } })).toBe(0);
    expect(filesOf(club.id)).toEqual([]);
  });

  it("Speicherkontingent des Vereins wird eingehalten", async () => {
    const { ctx, club } = await setup();
    const quota = 1024 * 1024 * 1024;
    await prisma.document.create({
      data: {
        clubId: club.id,
        name: "Riese.pdf",
        storageKey: "a".repeat(32),
        mimeType: "application/pdf",
        sizeBytes: quota - 100,
        sha256: "0".repeat(64),
      },
    });
    await expect(upload(ctx.admin, "klein.pdf", PDF("x".repeat(200)))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { file: [expect.stringContaining("Speicherplatz")] },
    });
    expect(await getStorageUsage(ctx.admin)).toEqual({ usedBytes: quota - 100, quotaBytes: quota });
    // Gelöschte Dokumente zählen nicht mehr.
    await prisma.document.updateMany({
      where: { clubId: club.id },
      data: { deletedAt: new Date() },
    });
    await expect(upload(ctx.admin, "klein.pdf", PDF())).resolves.toHaveProperty("id");
  });

  it("Virenscanner-Erweiterungspunkt: eine abgelehnte Datei wird nie gespeichert", async () => {
    const { ctx, club } = await setup();
    registerUploadScanner(async (_bytes, meta) => ({
      clean: meta.name !== "verseucht.pdf",
      reason: "Schadsoftware erkannt.",
    }));
    await expect(upload(ctx.admin, "verseucht.pdf")).rejects.toMatchObject({
      fieldErrors: { file: ["Schadsoftware erkannt."] },
    });
    expect(filesOf(club.id)).toEqual([]);
    await expect(upload(ctx.admin, "sauber.pdf")).resolves.toHaveProperty("id");
    expect(filesOf(club.id)).toHaveLength(1);
  });

  it("Rate-Limit: höchstens 30 Uploads pro Stunde und Person", async () => {
    const { ctx } = await setup();
    for (let index = 0; index < 30; index += 1)
      await upload(ctx.admin, `Datei ${index}.txt`, new TextEncoder().encode(`Nr. ${index}`));
    await expect(
      upload(ctx.admin, "Datei 31.txt", new TextEncoder().encode("zu viel")),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(
      upload(ctx.board, "Andere Person.txt", new TextEncoder().encode("geht")),
    ).resolves.toHaveProperty("id");
  });
});

describe("Wer hochladen darf", () => {
  it("Verwaltung und Vorstand ja; Helfer und Mitglieder nein", async () => {
    const { ctx } = await setup();
    await expect(upload(ctx.admin, "a.pdf")).resolves.toHaveProperty("id");
    await expect(upload(ctx.board, "b.pdf")).resolves.toHaveProperty("id");
    await expect(upload(ctx.helper, "c.pdf")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(upload(ctx.member, "d.pdf")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Abteilungsleiter: nur zu Veranstaltungen der eigenen Abteilung und nur mit Stufe 'Alle Mitglieder'", async () => {
    const { ctx, eventF, eventH } = await setup();
    await expect(upload(ctx.lead, "ohne-termin.pdf")).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { eventId: [expect.any(String)] },
    });
    await expect(
      upload(ctx.lead, "fremd.pdf", PDF(), { eventId: eventH.id }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { eventId: [expect.any(String)] } });
    await expect(
      upload(ctx.lead, "eigen.pdf", PDF(), { eventId: eventF.id }),
    ).resolves.toHaveProperty("id");
    await expect(
      upload(ctx.lead, "intern.pdf", PDF(), { eventId: eventF.id, access: "BOARD" }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { access: [expect.any(String)] } });
    expect((await listUploadEvents(ctx.lead)).map((e) => e.title)).toEqual(["Fußballturnier"]);
    expect((await listUploadEvents(ctx.admin)).map((e) => e.title).sort()).toEqual([
      "Fußballturnier",
      "Handballturnier",
    ]);
    expect(await listUploadEvents(ctx.member)).toEqual([]);
  });

  it("Zugriffsstufen kann nur vergeben, wer sie selbst sieht; unbekannte Veranstaltungen werden abgelehnt", async () => {
    const { ctx, club } = await setup();
    await expect(
      upload(ctx.board, "vorstand.pdf", PDF(), { access: "BOARD" }),
    ).resolves.toHaveProperty("id");
    await expect(
      upload(ctx.board, "verwaltung.pdf", PDF(), { access: "ADMIN" }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { access: [expect.any(String)] } });
    await expect(
      upload(ctx.admin, "verwaltung.pdf", PDF(), { access: "ADMIN" }),
    ).resolves.toHaveProperty("id");
    await expect(
      upload(ctx.admin, "x.pdf", PDF(), { eventId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { eventId: [expect.any(String)] } });
    const other = await setup();
    await expect(
      upload(ctx.admin, "y.pdf", PDF(), { eventId: other.eventF.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.document.count({ where: { clubId: club.id } })).toBe(2);
  });
});

describe("Wer was sieht", () => {
  it("Zugriffsstufen: Alle Mitglieder / Vorstand / Verwaltung – in Liste UND Download; Unsichtbares ist 'nicht gefunden'", async () => {
    const { ctx } = await setup();
    const all = await upload(ctx.admin, "alle.pdf");
    const board = await upload(ctx.admin, "vorstand.pdf", PDF(), { access: "BOARD" });
    const admin = await upload(ctx.admin, "verwaltung.pdf", PDF(), { access: "ADMIN" });

    expect(await names(ctx.admin)).toEqual(["alle.pdf", "verwaltung.pdf", "vorstand.pdf"]);
    expect(await names(ctx.board)).toEqual(["alle.pdf", "vorstand.pdf"]);
    for (const c of [ctx.lead, ctx.helper, ctx.member])
      expect(await names(c)).toEqual(["alle.pdf"]);

    await expect(openDocument(ctx.board, admin.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(openDocument(ctx.member, board.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(openDocument(ctx.lead, board.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(openDocument(ctx.member, all.id)).resolves.toHaveProperty("size");
    await expect(
      updateDocument(
        ctx.board,
        admin.id,
        documentFormSchema.parse({ name: "x.pdf", access: "ALL_MEMBERS" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteDocument(ctx.board, admin.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Mandantentrennung: Dokumente anderer Vereine sind weder listbar noch ladbar, änderbar oder löschbar", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await upload(b.ctx.admin, "geheim-b.pdf");
    expect(await names(a.ctx.admin)).toEqual([]);
    await expect(openDocument(a.ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateDocument(
        a.ctx.admin,
        id,
        documentFormSchema.parse({ name: "x.pdf", access: "ALL_MEMBERS" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteDocument(a.ctx.admin, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });

  it("Suche, Kategorie-Filter, Veranstaltung und Seitenwechsel; Kategorien nur der sichtbaren Dokumente", async () => {
    const { ctx, eventF } = await setup();
    await upload(ctx.admin, "Satzung 2026.pdf", PDF(), { category: "Satzung" });
    await upload(ctx.admin, "Protokoll Januar.pdf", PDF(), { category: "Protokolle" });
    await upload(ctx.admin, "Protokoll Februar.pdf", PDF(), {
      category: "Protokolle",
      eventId: eventF.id,
    });
    await upload(ctx.admin, "Intern.pdf", PDF(), { category: "Nur intern", access: "BOARD" });

    const list = async (query: object) =>
      (await listDocuments(ctx.member, { request: first, ...query })).items
        .map((d) => d.name)
        .sort();
    expect(await list({ category: "Protokolle" })).toEqual([
      "Protokoll Februar.pdf",
      "Protokoll Januar.pdf",
    ]);
    expect(await list({ q: "satzung" })).toEqual(["Satzung 2026.pdf"]);
    expect(await list({ q: "protokolle" })).toHaveLength(2); // Suche erfasst auch die Kategorie
    expect(await list({ eventId: eventF.id })).toEqual(["Protokoll Februar.pdf"]);
    expect(await listCategories(ctx.member)).toEqual(["Protokolle", "Satzung"]); // "Nur intern" bleibt unsichtbar
    expect(await listCategories(ctx.board)).toEqual(["Nur intern", "Protokolle", "Satzung"]);

    const page = await listDocuments(ctx.member, { request: { page: 2, pageSize: 2, skip: 2 } });
    expect(page).toMatchObject({ total: 3, pageCount: 2 });
    expect(page.items).toHaveLength(1);
  });
});

describe("Ändern und Löschen", () => {
  it("Umbenennen behält die Endung; Stufe und Kategorie ändern; Protokoll mit Änderungen", async () => {
    const { ctx, club } = await setup();
    const { id } = await upload(ctx.admin, "Alt.pdf", PDF(), { category: "Sonstiges" });
    await updateDocument(
      ctx.admin,
      id,
      documentFormSchema.parse({ name: "Neuer Name", category: "Protokolle", access: "BOARD" }),
    );
    expect(await prisma.document.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: "Neuer Name.pdf",
      category: "Protokolle",
      access: "BOARD",
    });
    await updateDocument(
      ctx.admin,
      id,
      documentFormSchema.parse({ name: "Tarnung.exe", access: "BOARD" }),
    ); // Endung bleibt .pdf
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).name).toBe(
      "Tarnung.exe.pdf",
    );
    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "document.updated", entityId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit[0]!.changes).toEqual({
      name: { from: "Alt.pdf", to: "Neuer Name.pdf" },
      access: { from: "ALL_MEMBERS", to: "BOARD" },
      category: { from: "Sonstiges", to: "Protokolle" },
    });
  });

  it("Hochladende verwalten ihr eigenes Dokument, fremde nicht; Vorstand und Verwaltung alle", async () => {
    const { ctx, eventF } = await setup();
    const own = await upload(ctx.lead, "eigen.pdf", PDF(), { eventId: eventF.id });
    const foreign = await upload(ctx.admin, "fremd.pdf");
    const form = documentFormSchema.parse({ name: "Neu", access: "ALL_MEMBERS" });

    expect(
      (await listDocuments(ctx.lead, { request: first })).items
        .map((d) => [d.name, d.can.manage])
        .sort(),
    ).toEqual([
      ["eigen.pdf", true],
      ["fremd.pdf", false],
    ]);
    await expect(updateDocument(ctx.lead, own.id, form)).resolves.toBeUndefined();
    await expect(updateDocument(ctx.lead, foreign.id, form)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(deleteDocument(ctx.lead, foreign.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteDocument(ctx.helper, foreign.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateDocument(ctx.board, own.id, form)).resolves.toBeUndefined();
    await expect(deleteDocument(ctx.lead, own.id)).resolves.toBeUndefined();
  });

  it("Löschen ist weich (Datei bleibt); nach 30 Tagen räumt der Aufbewahrungsjob Datei UND Datensatz weg – Frisches nicht", async () => {
    const { ctx, club } = await setup();
    const old = await upload(ctx.admin, "alt.pdf");
    const recent = await upload(ctx.admin, "kuerzlich.pdf");
    const kept = await upload(ctx.admin, "bleibt.pdf");
    await deleteDocument(ctx.admin, old.id);
    await deleteDocument(ctx.admin, recent.id);

    expect(await names(ctx.member)).toEqual(["bleibt.pdf"]);
    await expect(openDocument(ctx.member, old.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(filesOf(club.id)).toHaveLength(3); // noch alles da
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "document.deleted" } }),
    ).toBe(2);

    await prisma.document.update({
      where: { id: old.id },
      data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    const oldKey = (await prisma.document.findUniqueOrThrow({ where: { id: old.id } })).storageKey;
    expect(await purgeDeletedDocuments()).toBe(1);
    expect(await prisma.document.findUnique({ where: { id: old.id } })).toBeNull();
    expect(filesOf(club.id)).toHaveLength(2);
    expect(filesOf(club.id)).not.toContain(oldKey);
    expect(await prisma.document.count({ where: { id: { in: [recent.id, kept.id] } } })).toBe(2);
    expect(await purgeDeletedDocuments()).toBe(0);
  });

  it("fehlt die Datei schon, wird der Datensatz beim Aufräumen trotzdem entfernt; der Download meldet 'nicht gefunden' statt eines Fehlers", async () => {
    const { ctx, club } = await setup();
    const { id } = await upload(ctx.admin, "weg.pdf");
    const { storageKey } = await prisma.document.findUniqueOrThrow({ where: { id } });
    await deleteFile(club.id, storageKey);
    await expect(openDocument(ctx.member, id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    expect(await purgeDeletedDocuments()).toBe(1);
    expect(await prisma.document.findUnique({ where: { id } })).toBeNull();
  });
});

describe("Dateiablage (Pfadsicherheit)", () => {
  it("nimmt nur UUID-Vereine und 32-stellige Hex-Schlüssel an – kein Ausbruch aus dem Speicherverzeichnis", async () => {
    const validClub = "01a0c0c9-35c1-77a4-9d37-0e1287c00f5b";
    const validKey = "0123456789abcdef0123456789abcdef";
    for (const clubId of [
      "..",
      "../x",
      "a/b",
      "",
      "01a0c0c9-35c1-77a4-9d37-0e1287c00f5b/../..",
      "%2e%2e",
    ]) {
      await expect(saveFile(clubId, new Uint8Array([1]))).rejects.toThrow(
        "Ungültiger Speicherschlüssel",
      );
      await expect(openFile(clubId, validKey)).rejects.toThrow("Ungültiger Speicherschlüssel");
    }
    for (const key of [
      "..",
      "../../etc/passwd",
      `${validKey}/..`,
      "xyz",
      validKey.toUpperCase(),
      `${validKey}0`,
      "0123456789abcdef0123456789abcde",
    ]) {
      await expect(openFile(validClub, key)).rejects.toThrow("Ungültiger Speicherschlüssel");
      await expect(deleteFile(validClub, key)).rejects.toThrow("Ungültiger Speicherschlüssel");
    }
  });

  it("Schlüssel sind zufällig und eindeutig; bestehende Dateien werden nie überschrieben", async () => {
    const clubId = "01a0c0c9-35c1-77a4-9d37-0e1287c00f5b";
    const keys = new Set<string>();
    for (let index = 0; index < 20; index += 1)
      keys.add((await saveFile(clubId, new Uint8Array([index]))).storageKey);
    expect(keys.size).toBe(20);
    for (const key of keys) await deleteFile(clubId, key);
  });
});
