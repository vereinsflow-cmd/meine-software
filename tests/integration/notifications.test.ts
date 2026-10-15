import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions laufen hier ohne Next.js: Cookies/Kopfzeilen der Anfrage und das Neuladen des Caches werden ersetzt.
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { NotificationType } from "@/generated/prisma/enums";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "@/modules/notifications/actions";
import {
  countUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  notifyUsers,
} from "@/modules/notifications/service";
import { prisma } from "@/server/db/client";
import { addUserToClub, contextFor, createClub, createUser } from "../helpers/factories";
import { loginAs, request } from "../helpers/next-request";

/**
 * Benachrichtigungen: Jeder sieht und ändert ausschließlich seine EIGENEN – und auch die nur im gerade aktiven
 * Verein. Wer in zwei Vereinen Mitglied ist, hat dort getrennte Benachrichtigungen.
 */
const MIN = 60_000;
const page = (pageNumber = 1, pageSize = 20) => ({
  page: pageNumber,
  pageSize,
  skip: (pageNumber - 1) * pageSize,
});

beforeEach(() => {
  request.token = null;
});

async function setup() {
  const clubA = await createClub("Benachrichtigungsverein A");
  const clubB = await createClub("Benachrichtigungsverein B");
  const paula = await addUserToClub(clubA, "MEMBER", { firstName: "Paula", lastName: "Person" });
  // Dieselbe Person ist auch im Verein B Mitglied.
  await addUserToClub(clubB, "MEMBER", { user: paula.user });
  const otto = await addUserToClub(clubA, "MEMBER", { firstName: "Otto", lastName: "Anders" });
  return {
    clubA,
    clubB,
    paula,
    otto,
    ctx: {
      paulaA: await contextFor(paula.user.id, clubA.id),
      paulaB: await contextFor(paula.user.id, clubB.id),
      otto: await contextFor(otto.user.id, clubA.id),
    },
  };
}

function createNotification(
  clubId: string,
  userId: string,
  over: {
    title?: string;
    minutesAgo?: number;
    readAt?: Date | null;
    linkUrl?: string | null;
    type?: NotificationType;
  } = {},
) {
  return prisma.notification.create({
    data: {
      clubId,
      userId,
      type: over.type ?? "SYSTEM",
      title: over.title ?? "Hinweis",
      linkUrl: over.linkUrl ?? null,
      readAt: over.readAt ?? null,
      createdAt: new Date(Date.now() - (over.minutesAgo ?? 0) * MIN),
    },
  });
}

describe("Benachrichtigungen lesen", () => {
  it("listet nur die eigenen Benachrichtigungen dieses Vereins, neueste zuerst, seitenweise", async () => {
    const { clubA, clubB, paula, otto, ctx } = await setup();
    await createNotification(clubA.id, paula.user.id, { title: "Alt", minutesAgo: 30 });
    await createNotification(clubA.id, paula.user.id, { title: "Mitte", minutesAgo: 20 });
    await createNotification(clubA.id, paula.user.id, { title: "Neu", minutesAgo: 10 });
    await createNotification(clubA.id, otto.user.id, { title: "Für Otto" });
    await createNotification(clubB.id, paula.user.id, { title: "Aus Verein B" });

    const first = await listNotifications(ctx.paulaA, { request: page(1, 2) });
    expect(first.items.map((n) => n.title)).toEqual(["Neu", "Mitte"]);
    expect(first).toMatchObject({ total: 3, page: 1, pageSize: 2, pageCount: 2 });
    const second = await listNotifications(ctx.paulaA, { request: page(2, 2) });
    expect(second.items.map((n) => n.title)).toEqual(["Alt"]);

    expect(
      (await listNotifications(ctx.paulaB, { request: page() })).items.map((n) => n.title),
    ).toEqual(["Aus Verein B"]);
    expect(
      (await listNotifications(ctx.otto, { request: page() })).items.map((n) => n.title),
    ).toEqual(["Für Otto"]);
  });

  it("liefert nur die Anzeigefelder – keine Empfänger-, Vereins- oder Versanddaten", async () => {
    const { clubA, paula, ctx } = await setup();
    await createNotification(clubA.id, paula.user.id, { linkUrl: "/veranstaltungen" });
    const [item] = (await listNotifications(ctx.paulaA, { request: page() })).items;
    expect(Object.keys(item!).sort()).toEqual(
      ["body", "createdAt", "id", "linkUrl", "readAt", "title", "type"].sort(),
    );
  });

  it("zählt und filtert ungelesene je Person und Verein", async () => {
    const { clubA, clubB, paula, otto, ctx } = await setup();
    await createNotification(clubA.id, paula.user.id, { title: "Ungelesen 1", minutesAgo: 2 });
    await createNotification(clubA.id, paula.user.id, { title: "Ungelesen 2", minutesAgo: 1 });
    await createNotification(clubA.id, paula.user.id, { title: "Gelesen", readAt: new Date() });
    await createNotification(clubA.id, otto.user.id);
    await createNotification(clubB.id, paula.user.id);

    expect(await countUnread(ctx.paulaA)).toBe(2);
    expect(await countUnread(ctx.paulaB)).toBe(1);
    expect(await countUnread(ctx.otto)).toBe(1);
    const unread = await listNotifications(ctx.paulaA, { unreadOnly: true, request: page() });
    expect(unread.items.map((n) => n.title)).toEqual(["Ungelesen 2", "Ungelesen 1"]);
    expect(unread.total).toBe(2);
  });
});

describe("Als gelesen / ungelesen markieren", () => {
  it("markiert die eigene Benachrichtigung als gelesen und liefert ihr Ziel; ein zweiter Klick ändert nichts", async () => {
    const { clubA, paula, ctx } = await setup();
    const own = await createNotification(clubA.id, paula.user.id, { linkUrl: "/aufgaben" });

    expect(await markNotificationRead(ctx.paulaA, own.id)).toEqual({ linkUrl: "/aufgaben" });
    const readAt = (await prisma.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt;
    expect(readAt).toBeInstanceOf(Date);

    expect(await markNotificationRead(ctx.paulaA, own.id)).toEqual({ linkUrl: "/aufgaben" });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt).toEqual(
      readAt,
    );
    expect(await countUnread(ctx.paulaA)).toBe(0);
  });

  it("fremde Benachrichtigungen bleiben unberührt – auch mit bekannter ID (gleicher Verein)", async () => {
    const { clubA, otto, ctx } = await setup();
    const theirs = await createNotification(clubA.id, otto.user.id, { linkUrl: "/geheim" });

    await expect(markNotificationRead(ctx.paulaA, theirs.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(markNotificationUnread(ctx.paulaA, theirs.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt,
    ).toBeNull();

    await prisma.notification.update({ where: { id: theirs.id }, data: { readAt: new Date() } });
    await expect(markNotificationUnread(ctx.paulaA, theirs.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt,
    ).not.toBeNull();
  });

  it("die eigene Benachrichtigung aus einem anderen Verein ist im aktiven Verein nicht erreichbar", async () => {
    const { clubB, paula, ctx } = await setup();
    const inB = await createNotification(clubB.id, paula.user.id);

    await expect(markNotificationRead(ctx.paulaA, inB.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: inB.id } })).readAt,
    ).toBeNull();
    await markNotificationRead(ctx.paulaB, inB.id);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: inB.id } })).readAt,
    ).not.toBeNull();
  });

  it("als ungelesen markieren setzt den Lesezeitpunkt zurück; unbekannte IDs ergeben NOT_FOUND", async () => {
    const { clubA, paula, ctx } = await setup();
    const own = await createNotification(clubA.id, paula.user.id, { readAt: new Date() });

    await markNotificationUnread(ctx.paulaA, own.id);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt,
    ).toBeNull();
    expect(await countUnread(ctx.paulaA)).toBe(1);

    const missing = "00000000-0000-7000-8000-000000000000";
    await expect(markNotificationRead(ctx.paulaA, missing)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(markNotificationUnread(ctx.paulaA, missing)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("'Alle als gelesen' wirkt nur auf die eigenen ungelesenen Benachrichtigungen im aktiven Verein", async () => {
    const { clubA, clubB, paula, otto, ctx } = await setup();
    const earlier = new Date(Date.now() - 60 * MIN);
    await createNotification(clubA.id, paula.user.id);
    await createNotification(clubA.id, paula.user.id);
    const alreadyRead = await createNotification(clubA.id, paula.user.id, { readAt: earlier });
    const ottos = await createNotification(clubA.id, otto.user.id);
    const inB = await createNotification(clubB.id, paula.user.id);

    expect(await markAllNotificationsRead(ctx.paulaA)).toBe(2);
    expect(await countUnread(ctx.paulaA)).toBe(0);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: alreadyRead.id } })).readAt,
    ).toEqual(earlier);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: ottos.id } })).readAt,
    ).toBeNull();
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: inB.id } })).readAt,
    ).toBeNull();
    expect(await markAllNotificationsRead(ctx.paulaA)).toBe(0);
  });
});

describe("Benachrichtigungen erzeugen (notifyUsers)", () => {
  it("benachrichtigt nur aktive Mitglieder DIESES Vereins – je Person höchstens einmal", async () => {
    const { clubA, clubB, paula, otto, ctx } = await setup();
    const outsider = await createUser();
    const onlyInB = await addUserToClub(clubB, "MEMBER");
    const suspended = await addUserToClub(clubA, "MEMBER");
    await prisma.clubMembership.update({
      where: { id: suspended.membershipId },
      data: { status: "SUSPENDED" },
    });
    const disabled = await addUserToClub(clubA, "MEMBER");
    await prisma.user.update({ where: { id: disabled.user.id }, data: { disabledAt: new Date() } });
    const deleted = await addUserToClub(clubA, "MEMBER");
    await prisma.user.update({ where: { id: deleted.user.id }, data: { deletedAt: new Date() } });

    const count = await notifyUsers(ctx.paulaA.db, clubA.id, {
      userIds: [
        paula.user.id,
        paula.user.id,
        otto.user.id,
        outsider.id,
        onlyInB.user.id,
        suspended.user.id,
        disabled.user.id,
        deleted.user.id,
      ],
      type: "EVENT_PUBLISHED",
      title: "Neues Fest",
      linkUrl: "/veranstaltungen",
    });

    expect(count).toBe(2);
    const rows = await prisma.notification.findMany({ where: { title: "Neues Fest" } });
    expect(rows.map((r) => r.userId).sort()).toEqual([paula.user.id, otto.user.id].sort());
    expect(rows.every((r) => r.clubId === clubA.id)).toBe(true);
    expect(await countUnread(ctx.paulaB)).toBe(0);
  });

  it("ohne Empfänger passiert nichts", async () => {
    const { clubA, ctx } = await setup();
    expect(
      await notifyUsers(ctx.paulaA.db, clubA.id, { userIds: [], type: "SYSTEM", title: "Leer" }),
    ).toBe(0);
    expect(await prisma.notification.count({ where: { clubId: clubA.id } })).toBe(0);
  });

  it("Ziel-Links bleiben intern: fremde Adressen werden auf die Benachrichtigungsliste umgelenkt", async () => {
    const { clubA, paula, ctx } = await setup();
    for (const linkUrl of ["/\\example.com", "//example.com", "https://example.com", "/aufgaben"]) {
      await notifyUsers(ctx.paulaA.db, clubA.id, {
        userIds: [paula.user.id],
        type: "SYSTEM",
        title: `Link ${linkUrl}`,
        linkUrl,
      });
    }
    const links = await prisma.notification.findMany({
      where: { clubId: clubA.id, userId: paula.user.id },
      orderBy: { createdAt: "asc" },
      select: { title: true, linkUrl: true },
    });
    expect(Object.fromEntries(links.map((n) => [n.title, n.linkUrl]))).toEqual({
      "Link /\\example.com": "/benachrichtigungen",
      "Link //example.com": "/benachrichtigungen",
      "Link https://example.com": "/benachrichtigungen",
      "Link /aufgaben": "/aufgaben",
    });
  });

  it("E-Mail nur auf Wunsch und nur an Personen, die E-Mail-Benachrichtigungen nicht abgeschaltet haben", async () => {
    const { clubA, paula, otto, ctx } = await setup();
    await prisma.user.update({ where: { id: otto.user.id }, data: { emailNotifications: false } });

    await notifyUsers(ctx.paulaA.db, clubA.id, {
      userIds: [paula.user.id, otto.user.id],
      type: "TASK_ASSIGNED",
      title: "Mit E-Mail",
      email: true,
    });
    await notifyUsers(ctx.paulaA.db, clubA.id, {
      userIds: [paula.user.id],
      type: "TASK_ASSIGNED",
      title: "Ohne E-Mail",
    });

    const status = async (userId: string, title: string) =>
      (await prisma.notification.findFirstOrThrow({ where: { userId, title } })).emailStatus;
    expect(await status(paula.user.id, "Mit E-Mail")).toBe("PENDING");
    expect(await status(otto.user.id, "Mit E-Mail")).toBe("NONE");
    expect(await status(paula.user.id, "Ohne E-Mail")).toBe("NONE");
  });

  it("kürzt überlange Titel und Texte, statt zu scheitern", async () => {
    const { clubA, paula, ctx } = await setup();
    await notifyUsers(ctx.paulaA.db, clubA.id, {
      userIds: [paula.user.id],
      type: "MESSAGE",
      title: "T".repeat(500),
      body: "B".repeat(5000),
    });
    const row = await prisma.notification.findFirstOrThrow({ where: { userId: paula.user.id } });
    expect(row.title).toHaveLength(200);
    expect(row.body).toHaveLength(2000);
  });

  it("ein Schlüssel gegen Doppelungen verhindert eine zweite gleiche Benachrichtigung", async () => {
    const { clubA, paula, otto, ctx } = await setup();
    const input = {
      userIds: [paula.user.id, otto.user.id],
      type: "SHIFT_REMINDER" as const,
      title: "Erinnerung",
      dedupeKey: (userId: string) => `test-reminder:${userId}`,
    };
    expect(await notifyUsers(ctx.paulaA.db, clubA.id, input)).toBe(2);
    expect(await notifyUsers(ctx.paulaA.db, clubA.id, input)).toBe(0);
    expect(await prisma.notification.count({ where: { title: "Erinnerung" } })).toBe(2);
  });

  // Direkt in die Datenbank (ohne notifyUsers, das fremde Links schon vorher umlenkt): prüft die Prüfregel selbst.
  it("die Datenbank lehnt externe Ziel-Links ab (nur interne Pfade)", async () => {
    const { clubA, paula, ctx } = await setup();
    for (const linkUrl of ["https://example.com/phish", "//example.com", "example.com"]) {
      await expect(
        prisma.notification.create({
          data: { clubId: clubA.id, userId: paula.user.id, type: "SYSTEM", title: "Link", linkUrl },
        }),
      ).rejects.toThrow(/Notification_link_chk/);
    }
    expect(await prisma.notification.count({ where: { userId: paula.user.id } })).toBe(0);
    expect(
      await notifyUsers(ctx.paulaA.db, clubA.id, {
        userIds: [paula.user.id],
        type: "SYSTEM",
        title: "Link",
        linkUrl: "/veranstaltungen/123?tab=helfer",
      }),
    ).toBe(1);
  });

  // Browser lesen "/\example.com" wie "//example.com" (fremde Seite), und Tabulator/Zeilenumbruch entfernen sie aus
  // Adressen ("/<Tab>/host" → "//host"). Bis Migration 20261014120200 sperrte die Prüfregel wegen der LIKE-Maskierung
  // nur den Text "/%" – jetzt prüft sie das zweite Zeichen direkt und lehnt Steuerzeichen ab.
  it("die Datenbank lehnt '/\\…' und Steuerzeichen ab (würden im Browser zu einer fremden Adresse)", async () => {
    const { clubA, paula } = await setup();
    for (const linkUrl of [
      "/\\example.com",
      "/\texample.com",
      "/\t/example.com",
      "/\n/example.com",
      "/a\u0001",
    ]) {
      await expect(
        prisma.notification.create({
          data: { clubId: clubA.id, userId: paula.user.id, type: "SYSTEM", title: "Link", linkUrl },
        }),
        JSON.stringify(linkUrl),
      ).rejects.toThrow(/Notification_link_chk/);
    }
    // Interne Pfade bleiben erlaubt – auch die Startseite "/" und ein "%" an zweiter Stelle.
    for (const linkUrl of ["/", "/%25", "/veranstaltungen/1?tab=helfer#schicht"]) {
      await expect(
        prisma.notification.create({
          data: { clubId: clubA.id, userId: paula.user.id, type: "SYSTEM", title: "Link", linkUrl },
        }),
      ).resolves.toMatchObject({ linkUrl });
    }
  });
});

describe("Server Actions der Benachrichtigungen", () => {
  it("ohne Anmeldung: UNAUTHENTICATED – nichts wird geändert", async () => {
    const { clubA, paula } = await setup();
    const own = await createNotification(clubA.id, paula.user.id);

    expect(await markNotificationReadAction({ id: own.id })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(await markAllNotificationsReadAction()).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt,
    ).toBeNull();
  });

  it("prüft die Eingabe, bevor etwas geschieht", async () => {
    const { clubA, paula } = await setup();
    await loginAs(paula.user.id, clubA.id);
    for (const input of [{}, { id: "" }, { id: "x".repeat(65) }, { id: 42 }, null]) {
      expect(await markNotificationReadAction(input)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    }
  });

  it("wirkt nur auf die eigenen Benachrichtigungen im Verein der Sitzung", async () => {
    const { clubA, clubB, paula, otto } = await setup();
    const own = await createNotification(clubA.id, paula.user.id, { linkUrl: "/kalender" });
    const ownInB = await createNotification(clubB.id, paula.user.id);
    const ottos = await createNotification(clubA.id, otto.user.id);
    await loginAs(paula.user.id, clubA.id);

    expect(await markNotificationReadAction({ id: own.id })).toEqual({
      ok: true,
      data: { linkUrl: "/kalender" },
    });
    expect(await markNotificationReadAction({ id: ottos.id })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Die Benachrichtigung wurde nicht gefunden." },
    });
    expect(await markNotificationUnreadAction({ id: ownInB.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await markNotificationUnreadAction({ id: own.id })).toEqual({
      ok: true,
      data: undefined,
    });

    await createNotification(clubA.id, paula.user.id);
    expect(await markAllNotificationsReadAction()).toEqual({ ok: true, data: { count: 2 } });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: ottos.id } })).readAt,
    ).toBeNull();
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: ownInB.id } })).readAt,
    ).toBeNull();
  });
});
