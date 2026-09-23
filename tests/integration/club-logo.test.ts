import { createHash } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clubLogoUrl, clubLogoVersion } from "@/lib/club-logo";
import {
  getClubSettings,
  openClubLogo,
  removeClubLogo,
  updateClubLogo,
  updateClubSettings,
} from "@/modules/clubs/service";
import { listDocuments, getStorageUsage } from "@/modules/documents/service";
import { prisma } from "@/server/db/client";
import { purgeDeletedDocuments } from "@/server/jobs/retention";
import { storageRoot } from "@/server/storage/files";
import { registerUploadScanner } from "@/server/storage/scan";
import { listUserClubs } from "@/server/tenancy/clubs";
import { loadTenantContextForUser } from "@/server/tenancy/context-core";
import { addUserToClub, contextFor, createClub, createUser } from "../helpers/factories";
import { jpegHeader, pngImage } from "../helpers/images";

async function setup(name = "Logoverein") {
  const club = await createClub(name);
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD");
  const helper = await addUserToClub(club, "HELPER");
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    users: { admin, member },
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

const upload = (ctx: Ctx, bytes: Uint8Array = pngImage(128, 128), fileName = "wappen.png") =>
  updateClubLogo(ctx, { fileName, bytes });
const filesOf = (clubId: string) =>
  existsSync(path.join(storageRoot(), clubId)) ? readdirSync(path.join(storageRoot(), clubId)) : [];
const readAll = async (stream: ReadableStream<Uint8Array>) =>
  Buffer.from(await new Response(stream).arrayBuffer());
const logoOf = (clubId: string) =>
  prisma.club.findUniqueOrThrow({
    where: { id: clubId },
    select: {
      logoStorageKey: true,
      logoMimeType: true,
      logoSizeBytes: true,
      logoSha256: true,
      logoUpdatedAt: true,
    },
  });

afterEach(() => registerUploadScanner(null));

describe("Vereinslogo hochladen", () => {
  it("speichert das Bild unter zufälligem Schlüssel mit Typ aus der Positivliste, Prüfsumme und Protokolleintrag", async () => {
    const { club, ctx } = await setup();
    const bytes = pngImage(200, 120);
    const { logoUrl } = await upload(ctx.admin, bytes, "Unser Wappen.PNG");

    const logo = await logoOf(club.id);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(logo).toMatchObject({
      logoMimeType: "image/png",
      logoSizeBytes: bytes.length,
      logoSha256: sha256,
    });
    expect(logo.logoStorageKey).toMatch(/^[0-9a-f]{32}$/); // nie der Dateiname
    expect(logo.logoUpdatedAt).toBeInstanceOf(Date);
    expect(filesOf(club.id)).toEqual([logo.logoStorageKey]);
    expect(logoUrl).toBe(`/api/vereine/${club.id}/logo?v=${clubLogoVersion(sha256)}`);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "club.logo_updated" },
    });
    expect(entry.summary).toBe("Vereinslogo hochgeladen");
    expect(entry.changes).toEqual({
      logo: { from: null, to: expect.stringMatching(/^PNG-Bild, \d+(,\d)? (Byte|KB)$/) },
    });
    // Weder Speicherschlüssel noch Prüfsumme gehören ins Protokoll.
    expect(JSON.stringify(entry)).not.toContain(logo.logoStorageKey!);
    expect(JSON.stringify(entry)).not.toContain(sha256);
  });

  it("jedes Mitglied kann das Logo abrufen – unverändert und mit dem gespeicherten Typ", async () => {
    const { ctx } = await setup();
    const bytes = jpegHeader(300, 300);
    await upload(ctx.admin, bytes, "logo.jpg");
    for (const viewer of [ctx.admin, ctx.board, ctx.lead, ctx.helper, ctx.member]) {
      const opened = await openClubLogo(viewer);
      expect(opened).toMatchObject({ mimeType: "image/jpeg", ext: "jpg", size: bytes.length });
      expect(await readAll(opened.stream)).toEqual(Buffer.from(bytes));
    }
  });

  it("Ersetzen tauscht die Datei (die alte wird gelöscht) und ändert die Version", async () => {
    const { club, ctx } = await setup();
    const first = await upload(ctx.admin, pngImage(64, 64));
    const before = await logoOf(club.id);
    const second = await upload(ctx.admin, pngImage(96, 96, { rgba: [200, 30, 30, 255] }));
    const after = await logoOf(club.id);

    expect(after.logoStorageKey).not.toBe(before.logoStorageKey);
    expect(filesOf(club.id)).toEqual([after.logoStorageKey]);
    expect(second.logoUrl).not.toBe(first.logoUrl);
    const summaries = (
      await prisma.auditLog.findMany({
        where: { clubId: club.id, action: "club.logo_updated" },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => entry.summary);
    expect(summaries).toEqual(["Vereinslogo hochgeladen", "Vereinslogo ersetzt"]);
  });

  it("nur die Vereinsverwaltung darf das Logo ändern oder entfernen", async () => {
    const { club, ctx } = await setup();
    for (const role of [ctx.board, ctx.lead, ctx.helper, ctx.member]) {
      await expect(upload(role)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(removeClubLogo(role)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getClubSettings(role)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await logoOf(club.id)).toMatchObject({ logoStorageKey: null });
    expect(filesOf(club.id)).toEqual([]);
  });
});

describe("Abgelehnte Logos hinterlassen nichts", () => {
  const cases: [string, string, Uint8Array, RegExp][] = [
    [
      "SVG",
      "logo.svg",
      new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      /kein SVG/,
    ],
    [
      "getarntes SVG",
      "logo.png",
      new TextEncoder().encode("<svg onload='alert(1)'/>"),
      /passt nicht zur Endung/,
    ],
    [
      "GIF",
      "logo.gif",
      new TextEncoder().encode("GIF89a\x01\x00\x01\x00"),
      /nur PNG-, JPEG- und WebP/,
    ],
    ["leere Datei", "logo.png", new Uint8Array(), /leer/],
    ["zu kleines Bild", "logo.png", pngImage(8, 8), /zu klein/],
    ["zu großes Bild", "logo.png", pngImage(5000, 16), /höchstens 4096 × 4096/],
    ["bewegtes Bild", "logo.png", pngImage(64, 64, { animated: true }), /Bewegte Bilder/],
  ];
  it.each(cases)("%s", async (_label, fileName, bytes, message) => {
    const { club, ctx } = await setup();
    await expect(upload(ctx.admin, bytes, fileName)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { file: [expect.stringMatching(message)] },
    });
    expect(await logoOf(club.id)).toMatchObject({ logoStorageKey: null, logoSha256: null });
    expect(filesOf(club.id)).toEqual([]);
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "club.logo_updated" } }),
    ).toBe(0);
  });

  it("der Scanner-Erweiterungspunkt kann ein Logo ablehnen", async () => {
    const { club, ctx } = await setup();
    registerUploadScanner(async (_bytes, meta) => ({
      clean: meta.mime !== "image/png",
      reason: "Schadsoftware erkannt.",
    }));
    await expect(upload(ctx.admin)).rejects.toMatchObject({
      fieldErrors: { file: ["Schadsoftware erkannt."] },
    });
    expect(filesOf(club.id)).toEqual([]);
  });

  it("begrenzt die Zahl der Uploads je Person und Stunde", async () => {
    const { ctx } = await setup();
    for (let i = 0; i < 20; i += 1) await upload(ctx.admin, pngImage(16 + i, 16));
    await expect(upload(ctx.admin)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("Logo entfernen", () => {
  it("leert alle Angaben, löscht die Datei und protokolliert es; ein zweites Mal ändert nichts", async () => {
    const { club, ctx } = await setup();
    await upload(ctx.admin);
    await removeClubLogo(ctx.admin);

    expect(await logoOf(club.id)).toEqual({
      logoStorageKey: null,
      logoMimeType: null,
      logoSizeBytes: null,
      logoSha256: null,
      logoUpdatedAt: null,
    });
    expect(filesOf(club.id)).toEqual([]);
    await expect(openClubLogo(ctx.member)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await prisma.auditLog.findFirst({ where: { clubId: club.id, action: "club.logo_removed" } }),
    ).toMatchObject({ summary: "Vereinslogo entfernt" });

    await removeClubLogo(ctx.admin);
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "club.logo_removed" } }),
    ).toBe(1);
  });

  it("fehlt die Datei (z. B. Wiederherstellung ohne Dateiablage), heißt es „nicht gefunden“ statt Serverfehler", async () => {
    const { club, ctx } = await setup();
    await upload(ctx.admin);
    const { logoStorageKey } = await logoOf(club.id);
    rmSync(path.join(storageRoot(), club.id, logoStorageKey!));
    await expect(openClubLogo(ctx.member)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Trennung der Vereine", () => {
  it("ein Logo-Upload betrifft nur den eigenen Verein", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    await upload(a.ctx.admin);
    expect(await logoOf(b.club.id)).toMatchObject({ logoStorageKey: null });
    expect(filesOf(b.club.id)).toEqual([]);
    await expect(openClubLogo(b.ctx.member)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("die Auslieferung prüft die Mitgliedschaft im Verein aus der Adresse – ohne Ausweichen auf den eigenen", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    await upload(a.ctx.admin);
    await upload(b.ctx.admin, pngImage(40, 40));

    // Mitglied von B fragt das Logo von A an: kein Kontext (die Route antwortet „nicht gefunden“), nie B's eigenes Logo.
    expect(await loadTenantContextForUser(b.users.member.user.id, a.club.id)).toBeNull();
    const own = await loadTenantContextForUser(a.users.member.user.id, a.club.id);
    expect(own?.clubId).toBe(a.club.id);
    expect((await openClubLogo(own!)).size).toBe(pngImage(128, 128).length);

    // Deaktivierter Verein: auch für eigene Mitglieder nicht mehr erreichbar.
    await prisma.club.update({
      where: { id: a.club.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });
    expect(await loadTenantContextForUser(a.users.member.user.id, a.club.id)).toBeNull();
  });

  it("der Vereinswechsler zeigt die Logos aller eigenen aktiven Vereine – sonst keine", async () => {
    const a = await setup("Alpha e.V.");
    const b = await setup("Beta e.V.");
    const c = await setup("Gamma e.V.");
    await upload(a.ctx.admin);
    await upload(c.ctx.admin);
    const both = await createUser();
    await addUserToClub(a.club, "MEMBER", { user: both });
    await addUserToClub(b.club, "MEMBER", { user: both });

    const clubs = await listUserClubs(both.id);
    const shaA = (await logoOf(a.club.id)).logoSha256;
    expect(clubs).toEqual([
      expect.objectContaining({ id: a.club.id, logoUrl: clubLogoUrl(a.club.id, shaA) }),
      expect.objectContaining({ id: b.club.id, logoUrl: null }),
    ]);
    expect(clubs.map((club) => club.id)).not.toContain(c.club.id);
  });
});

describe("Logo und übrige Vereinsdaten stören sich nicht", () => {
  it("Einstellungen speichern lässt das Logo stehen – und das Logo die Einstellungen", async () => {
    const { club, ctx } = await setup();
    await upload(ctx.admin);
    const logoBefore = await logoOf(club.id);
    await updateClubSettings(ctx.admin, {
      name: "Logoverein Neu",
      contactEmail: "info@example.org",
      phone: undefined,
      street: undefined,
      postalCode: undefined,
      city: undefined,
      website: undefined,
      privacyContact: undefined,
      leftMembersMonths: 24,
      trashDays: 30,
      auditMonths: 24,
    });
    expect(await logoOf(club.id)).toEqual(logoBefore);

    await upload(ctx.admin, pngImage(72, 72));
    const settings = await getClubSettings(ctx.admin);
    expect(settings).toMatchObject({ name: "Logoverein Neu", contactEmail: "info@example.org" });
    expect(settings.logo).toMatchObject({ mimeType: "image/png" });
    expect(settings.logo?.url).toMatch(
      new RegExp(`^/api/vereine/${club.id}/logo\\?v=[0-9a-f]{16}$`),
    );
  });

  it("das Logo ist kein Dokument: nicht in der Liste, nicht im Speicherkontingent, nicht beim Aufräumen", async () => {
    const { club, ctx } = await setup();
    await upload(ctx.admin);
    expect(
      (await listDocuments(ctx.admin, { request: { page: 1, pageSize: 25, skip: 0 } })).items,
    ).toEqual([]);
    expect((await getStorageUsage(ctx.admin)).usedBytes).toBe(0);
    await purgeDeletedDocuments(new Date(Date.now() + 365 * 24 * 3600 * 1000));
    expect(filesOf(club.id)).toHaveLength(1);
  });
});

describe("Die Datenbank lehnt ungültige Logo-Angaben ab (auch wenn der Code sie durchließe)", () => {
  it.each([
    ["halbe Angaben", { logoStorageKey: "a".repeat(32) }],
    [
      "SVG als Typ",
      {
        logoStorageKey: "b".repeat(32),
        logoMimeType: "image/svg+xml",
        logoSizeBytes: 10,
        logoSha256: "c".repeat(64),
        logoUpdatedAt: new Date(),
      },
    ],
    [
      "zu groß",
      {
        logoStorageKey: "d".repeat(32),
        logoMimeType: "image/png",
        logoSizeBytes: 2 * 1024 * 1024,
        logoSha256: "e".repeat(64),
        logoUpdatedAt: new Date(),
      },
    ],
    [
      "Schlüssel mit Pfad",
      {
        logoStorageKey: "../../etc/passwd",
        logoMimeType: "image/png",
        logoSizeBytes: 10,
        logoSha256: "f".repeat(64),
        logoUpdatedAt: new Date(),
      },
    ],
  ])("%s", async (_label, data) => {
    const club = await createClub();
    await expect(prisma.club.update({ where: { id: club.id }, data })).rejects.toThrow();
  });
});
