import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Die Suchaktion läuft hier ohne Next.js: Cookies/Kopfzeilen der Anfrage werden ersetzt.
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());

import type { Club } from "@/generated/prisma/client";
import type { PermissionKey } from "@/server/permissions/catalog";
import { searchEntitiesAction } from "@/modules/search/actions";
import { getStaticSearchEntries, searchEntities } from "@/modules/search/service";
import { prisma } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context-core";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
  createMember,
  unique,
} from "../helpers/factories";
import { loginAs, request } from "../helpers/next-request";

/**
 * Zentrale Suche (Strg/⌘+K): Sie darf nie mehr zeigen als die jeweiligen Fachseiten. Geprüft werden die
 * Mandantentrennung (Treffer eines fremden Vereins tauchen nie auf), die Rechte je Rolle und dass Mitgliedertreffer
 * keine Kontakt- oder privaten Daten enthalten.
 */
type TestClub = Club & { roleIds: Record<string, string> };

const titles = (items: { title: string }[]) => items.map((item) => item.title);

beforeEach(() => {
  request.token = null;
});

function createDocument(
  clubId: string,
  name: string,
  overrides: {
    access?: "ALL_MEMBERS" | "BOARD" | "ADMIN" | "FINANCE";
    category?: string | null;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
  } = {},
) {
  return prisma.document.create({
    data: {
      clubId,
      name,
      storageKey: unique("speicher"),
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "0".repeat(64),
      access: overrides.access ?? "ALL_MEMBERS",
      category: overrides.category ?? null,
      archivedAt: overrides.archivedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
    },
  });
}

/** Eigene Rolle mit genau den angegebenen Rechten (Reichweite Verein) – für Grenzfälle, die keine Standardrolle abdeckt. */
async function contextWithCustomRole(club: TestClub, name: string, keys: PermissionKey[]) {
  const role = await prisma.role.create({
    data: { clubId: club.id, key: `custom:${name}`, name },
  });
  await prisma.rolePermission.createMany({
    data: keys.map((permissionKey) => ({
      clubId: club.id,
      roleId: role.id,
      permissionKey,
      scope: "CLUB" as const,
    })),
  });
  const added = await addUserToClub(
    { ...club, roleIds: { ...club.roleIds, [name]: role.id } },
    name as never,
  );
  return contextFor(added.user.id, club.id);
}

describe("Zentrale Suche – Datensätze", () => {
  let clubA: TestClub;
  let clubB: TestClub;
  const ctx = {} as Record<"admin" | "board" | "lead" | "member" | "adminB", TenantContext>;
  const ids = {} as Record<string, string>;

  beforeAll(async () => {
    clubA = await createClub("Suchverein A");
    clubB = await createClub("Suchverein B");
    const handball = await createDepartment(clubA.id, "Handball");
    const tennis = await createDepartment(clubA.id, "Tennis");

    const admin = await addUserToClub(clubA, "CLUB_ADMIN", {
      firstName: "Anna",
      lastName: "Admin",
    });
    const board = await addUserToClub(clubA, "BOARD", { firstName: "Bert", lastName: "Vorstand" });
    const lead = await addUserToClub(clubA, "DEPARTMENT_LEAD", {
      firstName: "Lea",
      lastName: "Leitung",
      ledDepartmentIds: [handball.id],
    });
    const member = await addUserToClub(clubA, "MEMBER", { firstName: "Mia", lastName: "Mitglied" });
    const adminB = await addUserToClub(clubB, "CLUB_ADMIN", {
      firstName: "Bea",
      lastName: "Fremd",
    });

    // Gleicher Suchbegriff in beiden Vereinen – nur so fällt ein Leck zwischen Vereinen auf.
    const zora = await prisma.member.create({
      data: {
        clubId: clubA.id,
        firstName: "Zora",
        lastName: "Zander",
        memberNumber: "A-17",
        email: "kontakt-zz@example.test",
        phone: "0170 1234567",
        street: "Geheimweg 7",
        birthDate: new Date("1990-05-17T00:00:00Z"),
        internalNotes: "Vertrauliche Notiz",
      },
    });
    const zeno = await createMember(clubA.id, { firstName: "Zeno", lastName: "Zander" });
    const zacharias = await prisma.member.create({
      data: {
        clubId: clubB.id,
        firstName: "Zacharias",
        lastName: "Zander",
        memberNumber: "B-1",
        email: "kontakt-zb@example.test",
      },
    });
    await prisma.memberDepartment.create({
      data: { clubId: clubA.id, memberId: zora.id, departmentId: handball.id },
    });
    await prisma.memberDepartment.create({
      data: { clubId: clubA.id, memberId: zeno.id, departmentId: tennis.id },
    });

    const startsAt = new Date(Date.now() + 10 * 86_400_000);
    const published = await createEvent(clubA.id, {
      title: "Zanderfest",
      startsAt,
      locationName: "Vereinsheim",
    });
    const draftHandball = await createEvent(clubA.id, {
      title: "Zander-Entwurf Handball",
      status: "DRAFT",
      departmentId: handball.id,
      startsAt: new Date(startsAt.getTime() + 86_400_000),
    });
    const draftTennis = await createEvent(clubA.id, {
      title: "Zander-Entwurf Tennis",
      status: "DRAFT",
      departmentId: tennis.id,
      startsAt: new Date(startsAt.getTime() + 2 * 86_400_000),
    });
    const archived = await createEvent(clubA.id, {
      title: "Zander-Archiv",
      status: "ARCHIVED",
      startsAt: new Date(startsAt.getTime() + 3 * 86_400_000),
    });
    const removed = await createEvent(clubA.id, { title: "Zander-Gelöscht" });
    await prisma.event.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    const eventB = await createEvent(clubB.id, { title: "Zanderfest B" });

    const docs = {
      all: await createDocument(clubA.id, "Zander-Protokoll.pdf", { category: "Protokolle" }),
      board: await createDocument(clubA.id, "Zander-Vorstand.pdf", { access: "BOARD" }),
      admin: await createDocument(clubA.id, "Zander-Admin.pdf", { access: "ADMIN" }),
      finance: await createDocument(clubA.id, "Zander-Beleg.pdf", { access: "FINANCE" }),
      archived: await createDocument(clubA.id, "Zander-Alt.pdf", { archivedAt: new Date() }),
      deleted: await createDocument(clubA.id, "Zander-Weg.pdf", { deletedAt: new Date() }),
      clubB: await createDocument(clubB.id, "Zander-B.pdf"),
    };

    Object.assign(ids, {
      zora: zora.id,
      zeno: zeno.id,
      zacharias: zacharias.id,
      ownMember: member.member.id,
      published: published.id,
      draftHandball: draftHandball.id,
      draftTennis: draftTennis.id,
      archived: archived.id,
      removed: removed.id,
      eventB: eventB.id,
      docAll: docs.all.id,
      docClubB: docs.clubB.id,
    });
    Object.assign(ctx, {
      admin: await contextFor(admin.user.id, clubA.id),
      board: await contextFor(board.user.id, clubA.id),
      lead: await contextFor(lead.user.id, clubA.id),
      member: await contextFor(member.user.id, clubA.id),
      adminB: await contextFor(adminB.user.id, clubB.id),
    });
  });

  describe("Mandantentrennung", () => {
    it("zeigt nur Treffer des eigenen Vereins – auch bei gleichem Suchbegriff in einem anderen Verein", async () => {
      const result = await searchEntities(ctx.admin, "Zander");
      expect(titles(result.mitglieder)).toEqual(["Zeno Zander", "Zora Zander"]);
      expect(titles(result.veranstaltungen)).toEqual([
        "Zanderfest",
        "Zander-Entwurf Handball",
        "Zander-Entwurf Tennis",
        "Zander-Archiv",
      ]);
      expect(titles(result.dokumente).sort()).toEqual([
        "Zander-Admin.pdf",
        "Zander-Beleg.pdf",
        "Zander-Protokoll.pdf",
        "Zander-Vorstand.pdf",
      ]);

      const text = JSON.stringify(result);
      for (const foreign of [ids.zacharias, ids.eventB, ids.docClubB]) {
        expect(text).not.toContain(foreign);
      }
      expect(text).not.toContain("Zacharias");
      expect(text).not.toContain("Zanderfest B");
      expect(text).not.toContain("Zander-B.pdf");
    });

    it("umgekehrt sieht der fremde Verein nur seine eigenen Datensätze", async () => {
      const result = await searchEntities(ctx.adminB, "Zander");
      expect(result.mitglieder.map((m) => m.id)).toEqual([`member:${ids.zacharias}`]);
      expect(result.veranstaltungen.map((e) => e.id)).toEqual([`event:${ids.eventB}`]);
      expect(result.dokumente.map((d) => d.id)).toEqual([`document:${ids.docClubB}`]);
    });

    it("die E-Mail-Suche findet keine Mitglieder eines fremden Vereins", async () => {
      expect((await searchEntities(ctx.admin, "kontakt-zb")).mitglieder).toEqual([]);
      expect((await searchEntities(ctx.adminB, "kontakt-zz")).mitglieder).toEqual([]);
    });
  });

  describe("Mitglieder", () => {
    it("liefert nur Name, Nummer und Link – keine Kontakt- oder privaten Daten, auch nicht für Administratoren", async () => {
      const result = await searchEntities(ctx.admin, "Zora");
      expect(result.mitglieder).toEqual([
        {
          id: `member:${ids.zora}`,
          category: "mitglieder",
          title: "Zora Zander",
          description: "Mitglied Nr. A-17",
          href: `/mitglieder/${ids.zora}`,
          iconKey: "mitglied",
        },
      ]);
      const text = JSON.stringify(result);
      for (const secret of ["kontakt-zz", "0170", "Geheimweg", "1990", "Vertrauliche"]) {
        expect(text).not.toContain(secret);
      }
    });

    it("ohne Mitgliedsnummer steht ein neutraler Hinweis statt einer leeren Nummer", async () => {
      const result = await searchEntities(ctx.admin, "Zeno");
      expect(result.mitglieder).toEqual([
        expect.objectContaining({ title: "Zeno Zander", description: "Mitgliederdetails" }),
      ]);
    });

    it("Vorstand (Kontaktdaten im ganzen Verein) findet Mitglieder auch über die E-Mail-Adresse", async () => {
      const result = await searchEntities(ctx.board, "KONTAKT-ZZ");
      expect(result.mitglieder.map((m) => m.id)).toEqual([`member:${ids.zora}`]);
    });

    it("wer keine Kontaktdaten sehen darf, kann auch nicht nach der E-Mail-Adresse suchen", async () => {
      // Darf die Mitgliederliste lesen, aber keine Kontaktdaten – sonst ließe sich eine Adresse erraten.
      const reader = await contextWithCustomRole(clubA, "Listenleser", [
        "club:read",
        "members:read",
      ]);
      expect(titles((await searchEntities(reader, "Zander")).mitglieder)).toEqual([
        "Zeno Zander",
        "Zora Zander",
      ]);
      expect((await searchEntities(reader, "kontakt-zz")).mitglieder).toEqual([]);
      expect((await searchEntities(reader, "example.test")).mitglieder).toEqual([]);
    });

    it("Mitglieder (nur eigene Daten) finden keine anderen Mitglieder – weder über Namen noch über E-Mail", async () => {
      expect((await searchEntities(ctx.member, "Zander")).mitglieder).toEqual([]);
      expect((await searchEntities(ctx.member, "kontakt-zz")).mitglieder).toEqual([]);
      expect((await searchEntities(ctx.member, "Mitglied")).mitglieder.map((m) => m.id)).toEqual([
        `member:${ids.ownMember}`,
      ]);
    });

    it("Abteilungsleiter finden nur Mitglieder ihrer eigenen Abteilung", async () => {
      const result = await searchEntities(ctx.lead, "Zander");
      expect(result.mitglieder.map((m) => m.id)).toEqual([`member:${ids.zora}`]);
      expect((await searchEntities(ctx.lead, "Zeno")).mitglieder).toEqual([]);
    });

    it("mehrere Wörter müssen alle passen (Vor- und Nachname in beliebiger Reihenfolge)", async () => {
      expect(titles((await searchEntities(ctx.admin, "zander zora")).mitglieder)).toEqual([
        "Zora Zander",
      ]);
      expect((await searchEntities(ctx.admin, "Zora Zeno")).mitglieder).toEqual([]);
    });

    it("gelöschte Mitglieder (Papierkorb) erscheinen nie – auch nicht mit Papierkorb-Recht", async () => {
      const trashed = await createMember(clubA.id, { firstName: "Paul", lastName: "Papierkorb" });
      await prisma.member.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });
      expect(ctx.board.permissions.has("members:delete")).toBe(false);
      const found = (await searchEntities(ctx.board, "Papierkorb")).mitglieder.map((m) => m.id);
      expect(found).toEqual([]);
      expect((await searchEntities(ctx.admin, "Papierkorb")).mitglieder).toEqual([]);
    });

    it("zeigt höchstens fünf Mitglieder, alphabetisch nach Nach- und Vorname", async () => {
      const marker = unique("Grenze").replace("-", "");
      // Alle Nachnamen enthalten den Suchbegriff, unterscheiden sich aber: Der Nachname geht dem Vornamen vor.
      const people: [string, string][] = [
        ["Gustav", marker],
        ["Anton", `${marker}b`],
        ["Emil", marker],
        ["Frieda", `${marker}c`],
        ["Berta", `${marker}a`],
        ["Carla", marker],
        ["Dora", `${marker}c`],
      ];
      for (const [firstName, lastName] of people) {
        await createMember(clubA.id, { firstName, lastName });
      }
      const result = await searchEntities(ctx.admin, marker);
      expect(titles(result.mitglieder)).toEqual([
        `Carla ${marker}`,
        `Emil ${marker}`,
        `Gustav ${marker}`,
        `Berta ${marker}a`,
        `Anton ${marker}b`,
      ]);
    });
  });

  describe("Veranstaltungen", () => {
    it("Mitglieder sehen nur veröffentlichte Veranstaltungen – keine Entwürfe, kein Archiv, nichts Gelöschtes", async () => {
      const result = await searchEntities(ctx.member, "Zander");
      expect(result.veranstaltungen.map((e) => e.id)).toEqual([`event:${ids.published}`]);
    });

    it("Abteilungsleiter sehen Entwürfe nur ihrer eigenen Abteilung", async () => {
      const result = await searchEntities(ctx.lead, "Zander");
      expect(result.veranstaltungen.map((e) => e.id)).toEqual([
        `event:${ids.published}`,
        `event:${ids.draftHandball}`,
      ]);
    });

    it("der Vorstand sieht Entwürfe und Archiv; gelöschte Veranstaltungen findet niemand", async () => {
      const result = await searchEntities(ctx.board, "Zander");
      expect(result.veranstaltungen.map((e) => e.id)).toEqual([
        `event:${ids.published}`,
        `event:${ids.draftHandball}`,
        `event:${ids.draftTennis}`,
        `event:${ids.archived}`,
      ]);
      expect((await searchEntities(ctx.admin, "Gelöscht")).veranstaltungen).toEqual([]);
    });

    it("findet auch über den Ort und verlinkt auf die Veranstaltung", async () => {
      const result = await searchEntities(ctx.member, "vereinsheim");
      expect(result.veranstaltungen).toEqual([
        expect.objectContaining({
          id: `event:${ids.published}`,
          title: "Zanderfest",
          href: `/veranstaltungen/${ids.published}`,
          description: expect.stringContaining("Vereinsheim"),
        }),
      ]);
    });
  });

  describe("Dokumente", () => {
    it("Mitglieder und Abteilungsleiter sehen nur Dokumente für alle Mitglieder", async () => {
      for (const who of [ctx.member, ctx.lead]) {
        expect(titles((await searchEntities(who, "Zander")).dokumente)).toEqual([
          "Zander-Protokoll.pdf",
        ]);
      }
    });

    it("der Vorstand sieht zusätzlich Vorstands- und Finanzdokumente, aber keine Admin-Dokumente", async () => {
      expect(titles((await searchEntities(ctx.board, "Zander")).dokumente).sort()).toEqual([
        "Zander-Beleg.pdf",
        "Zander-Protokoll.pdf",
        "Zander-Vorstand.pdf",
      ]);
    });

    it("archivierte und gelöschte Dokumente erscheinen für niemanden", async () => {
      const text = JSON.stringify(await searchEntities(ctx.admin, "Zander"));
      expect(text).not.toContain("Zander-Alt.pdf");
      expect(text).not.toContain("Zander-Weg.pdf");
    });

    it("findet über die Kategorie und verlinkt auf die gefilterte Dokumentenliste", async () => {
      const result = await searchEntities(ctx.member, "protokolle");
      expect(result.dokumente).toEqual([
        {
          id: `document:${ids.docAll}`,
          category: "dokumente",
          title: "Zander-Protokoll.pdf",
          description: "Protokolle",
          href: `/dokumente?q=${encodeURIComponent("Zander-Protokoll.pdf")}`,
          iconKey: "dokument",
        },
      ]);
    });
  });

  describe("Anfragen und fehlende Rechte", () => {
    it("sehr kurze Anfragen liefern nichts (auch nicht für Administratoren)", async () => {
      const empty = { mitglieder: [], veranstaltungen: [], dokumente: [] };
      for (const q of ["", "   ", "Z", "  Z  "]) {
        expect(await searchEntities(ctx.admin, q)).toEqual(empty);
      }
      expect((await searchEntities(ctx.admin, " Zo ")).mitglieder.length).toBeGreaterThan(0);
    });

    it("ohne Leserechte bleiben die jeweiligen Gruppen leer – ohne Fehler", async () => {
      const nobody = await contextWithCustomRole(clubA, "Nur-Verein", ["club:read"]);
      expect(await searchEntities(nobody, "Zander")).toEqual({
        mitglieder: [],
        veranstaltungen: [],
        dokumente: [],
      });
    });

    it("Platzhalter wie % und _ sind gewöhnliche Zeichen", async () => {
      for (const q of ["%%", "__"]) {
        expect(await searchEntities(ctx.admin, q)).toEqual({
          mitglieder: [],
          veranstaltungen: [],
          dokumente: [],
        });
      }
      const percent = await createMember(clubA.id, {
        firstName: "Hundert",
        lastName: "Prozent%Zeichen",
      });
      expect((await searchEntities(ctx.admin, "t%Z")).mitglieder.map((m) => m.id)).toEqual([
        `member:${percent.id}`,
      ]);
    });

    it("Suchtext wie eine SQL-Einschleusung ist nur Text", async () => {
      expect(await searchEntities(ctx.admin, "' OR 1=1 --")).toEqual({
        mitglieder: [],
        veranstaltungen: [],
        dokumente: [],
      });
    });
  });

  describe("Suchaktion (Strg/⌘+K)", () => {
    it("ohne Anmeldung: UNAUTHENTICATED", async () => {
      expect(await searchEntitiesAction("Zander")).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    });

    it("überlange Anfragen werden abgelehnt, bevor gesucht wird", async () => {
      expect(await searchEntitiesAction("Z".repeat(101))).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    });

    it("sucht immer im aktiven Verein der Sitzung – auch wenn die Person in beiden Vereinen Rechte hat", async () => {
      const both = await addUserToClub(clubA, "CLUB_ADMIN", {
        firstName: "Doro",
        lastName: "Doppel",
      });
      await addUserToClub(clubB, "CLUB_ADMIN", { user: both.user });

      await loginAs(both.user.id, clubB.id);
      const inB = await searchEntitiesAction("Zander");
      expect(inB.ok && inB.data.mitglieder.map((m) => m.id)).toEqual([`member:${ids.zacharias}`]);

      await loginAs(both.user.id, clubA.id);
      const inA = await searchEntitiesAction("Zander");
      expect(inA.ok && titles(inA.data.mitglieder)).toEqual(["Zeno Zander", "Zora Zander"]);
    });
  });
});

describe("Zentrale Suche – Aktionen und Seiten", () => {
  let club: TestClub;
  const roles = ["CLUB_ADMIN", "BOARD", "DEPARTMENT_LEAD", "HELPER", "MEMBER"] as const;
  const entryIds = {} as Record<(typeof roles)[number], string[]>;

  beforeAll(async () => {
    club = await createClub("Seitenverein");
    for (const role of roles) {
      const added = await addUserToClub(club, role);
      const ctx = await contextFor(added.user.id, club.id);
      entryIds[role] = getStaticSearchEntries(ctx, { isPlatformAdmin: false }).map((e) => e.id);
    }
  });

  it("Seiten ohne besonderes Recht sieht jede Rolle", () => {
    for (const role of roles) {
      expect(entryIds[role]).toEqual(
        expect.arrayContaining(["page:dashboard", "page:profil", "page:hilfe", "page:datenschutz"]),
      );
    }
  });

  it("Mitglieder sehen keine Verwaltungsaktionen, keine Mitgliederliste (nur eigene Daten) und keine Finanzen", () => {
    const ids = entryIds.MEMBER;
    expect(ids).toEqual(expect.arrayContaining(["page:kalender", "page:dokumente"]));
    for (const hidden of [
      "action:mitglied-hinzufuegen",
      "action:veranstaltung-erstellen",
      "page:mitglieder",
      "page:finanzen",
      "page:kassenbuch",
      "page:benutzer",
      "page:einstellungen",
      "page:protokoll",
      "page:system",
    ]) {
      expect(ids).not.toContain(hidden);
    }
  });

  it("Abteilungsleiter sehen die Mitgliederliste (eigene Abteilung), aber keine Finanzen", () => {
    expect(entryIds.DEPARTMENT_LEAD).toEqual(
      expect.arrayContaining(["page:mitglieder", "action:mitglied-hinzufuegen"]),
    );
    expect(entryIds.DEPARTMENT_LEAD).not.toContain("page:finanzen");
    expect(entryIds.DEPARTMENT_LEAD).not.toContain("page:einstellungen");
  });

  it("der Vorstand sieht Finanzen, aber weder Vereinseinstellungen noch das Protokoll", () => {
    expect(entryIds.BOARD).toEqual(
      expect.arrayContaining(["page:finanzen", "page:kassenbuch", "page:benutzer"]),
    );
    expect(entryIds.BOARD).not.toContain("page:einstellungen");
    expect(entryIds.BOARD).not.toContain("page:protokoll");
  });

  it("die Systemverwaltung erscheint nur für Superadministratoren – unabhängig von der Vereinsrolle", async () => {
    expect(entryIds.CLUB_ADMIN).not.toContain("page:system");
    const admin = await addUserToClub(club, "CLUB_ADMIN");
    const ctx = await contextFor(admin.user.id, club.id);
    expect(getStaticSearchEntries(ctx, { isPlatformAdmin: true }).map((e) => e.id)).toContain(
      "page:system",
    );
    const member = await addUserToClub(club, "MEMBER");
    const memberCtx = await contextFor(member.user.id, club.id);
    expect(getStaticSearchEntries(memberCtx, { isPlatformAdmin: true }).map((e) => e.id)).toContain(
      "page:system",
    );
  });

  it("gibt keine internen Prüfangaben (Recht, Reichweite) an den Browser weiter", async () => {
    const admin = await addUserToClub(club, "CLUB_ADMIN");
    const ctx = await contextFor(admin.user.id, club.id);
    const allowed = ["id", "category", "title", "description", "href", "iconKey", "keywords"];
    for (const entry of getStaticSearchEntries(ctx, { isPlatformAdmin: true })) {
      for (const key of Object.keys(entry)) expect(allowed).toContain(key);
      expect(entry).not.toHaveProperty("permission");
      expect(entry).not.toHaveProperty("notOwnOnly");
      expect(entry).not.toHaveProperty("platformAdminOnly");
    }
  });
});
