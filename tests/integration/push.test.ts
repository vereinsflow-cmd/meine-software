import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PUSH_DEVICES_PER_USER,
  ownsPushSubscription,
  registerPushSubscription,
  removePushSubscription,
} from "@/server/push/subscriptions";
import { notifyUsers } from "@/modules/notifications/service";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/client";
import { purgeStaleData } from "@/server/jobs/cleanup";
import { PUSH_RETRY_HOURS, sendPendingPushes } from "@/server/jobs/push-queue";
import { runJobs } from "@/server/jobs/runner";
import { executeDeletionRequest, requestAccountDeletion } from "@/server/privacy/deletion";
import { buildUserDataExport } from "@/server/privacy/export";
import { PushDeliveryError, type PushSender, type PushTarget } from "@/server/push/web-push";
import { addUserToClub, contextFor, createClub, createUser, unique } from "../helpers/factories";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PASSWORD = "Ein-Sehr-Sicheres-Passwort-2026!";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

const endpointOf = (label = "geraet") =>
  `https://fcm.googleapis.com/fcm/send/${unique(label)}:APA91bExample`;
const subscriptionInput = (endpoint = endpointOf()) => ({
  endpoint,
  keys: { p256dh: `B${"A".repeat(86)}`, auth: "a".repeat(22) },
});

async function clubWithPeople() {
  const club = await createClub("Pushverein");
  const helper = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const other = await addUserToClub(club, "MEMBER", { firstName: "Otto", lastName: "Anders" });
  return { club, helper, other };
}

/** Legt ein Abo an und liefert dessen Adresse. */
async function subscribe(userId: string, endpoint = endpointOf()) {
  await registerPushSubscription(userId, subscriptionInput(endpoint), CHROME_ANDROID);
  return endpoint;
}

const notesOf = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

/** Merkt eine Benachrichtigung direkt für den Push vor (unabhängig von notifyUsers). */
const queued = (clubId: string, userId: string, data: Record<string, unknown> = {}) =>
  prisma.notification.create({
    data: {
      clubId,
      userId,
      type: "MESSAGE",
      title: "Nachricht von Hanna Helfer",
      body: "Geheimer Text",
      linkUrl: "/nachrichten/abc",
      pushStatus: "PENDING",
      ...data,
    },
  });

/** Ein Sender, der alle Aufrufe festhält und je Adresse antwortet (Standard: Erfolg). */
function fakeSender(behaviour: Record<string, number | "ok"> = {}) {
  const calls: { target: PushTarget; payload: string; options: Parameters<PushSender>[2] }[] = [];
  const send = vi.fn<PushSender>(async (target, payload, options) => {
    calls.push({ target, payload, options });
    const answer = behaviour[target.endpoint] ?? "ok";
    if (answer !== "ok") throw new PushDeliveryError(answer === 0 ? null : answer);
  });
  return { send, calls };
}

const statusOf = async (id: string) =>
  (await prisma.notification.findUniqueOrThrow({ where: { id } })).pushStatus;

describe("Push-Geräte anmelden und abmelden", () => {
  it("legt ein Abo je Gerät an – mit Gerätebezeichnung, ohne Zustellzeitpunkt, mit Zähler 0", async () => {
    const { helper } = await clubWithPeople();
    const endpoint = await subscribe(helper.user.id);
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    expect(row).toMatchObject({
      userId: helper.user.id,
      deviceLabel: "Chrome auf Android",
      lastSuccessAt: null,
      failureCount: 0,
    });
    expect(await ownsPushSubscription(helper.user.id, endpoint)).toBe(true);
  });

  it("ist idempotent: erneutes Anmelden desselben Geräts ergibt genau ein Abo und setzt Fehlversuche zurück", async () => {
    const { helper } = await clubWithPeople();
    const endpoint = await subscribe(helper.user.id);
    await prisma.pushSubscription.update({ where: { endpoint }, data: { failureCount: 3 } });
    await subscribe(helper.user.id, endpoint);
    expect(await prisma.pushSubscription.count({ where: { userId: helper.user.id } })).toBe(1);
    expect(
      (await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).failureCount,
    ).toBe(0);
  });

  it("gehört ein Gerät nach neuer Anmeldung einer anderen Person, wechselt das Abo (geteiltes Gerät)", async () => {
    const { helper, other } = await clubWithPeople();
    const endpoint = await subscribe(helper.user.id);
    await subscribe(other.user.id, endpoint);
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).userId).toBe(
      other.user.id,
    );
    expect(await ownsPushSubscription(helper.user.id, endpoint)).toBe(false);
  });

  it("behält höchstens zehn Geräte je Person (die ältesten entfallen)", async () => {
    const { helper } = await clubWithPeople();
    const endpoints: string[] = [];
    for (let i = 0; i < MAX_PUSH_DEVICES_PER_USER + 2; i += 1) {
      endpoints.push(await subscribe(helper.user.id));
      // Erstellzeitpunkte unterscheiden sich in Tests um Millisekunden – sicherheitshalber staffeln.
      await prisma.pushSubscription.update({
        where: { endpoint: endpoints[i]! },
        data: { createdAt: new Date(Date.now() - (30 - i) * 1000) },
      });
    }
    const remaining = await prisma.pushSubscription.findMany({ where: { userId: helper.user.id } });
    expect(remaining).toHaveLength(MAX_PUSH_DEVICES_PER_USER);
    expect(remaining.map((r) => r.endpoint)).not.toContain(endpoints[0]);
    expect(remaining.map((r) => r.endpoint)).toContain(endpoints.at(-1));
  });

  it("melden ab: nur das eigene Gerät; unbekannte Adressen sind kein Fehler", async () => {
    const { helper, other } = await clubWithPeople();
    const own = await subscribe(helper.user.id);
    const foreign = await subscribe(other.user.id);
    await removePushSubscription(helper.user.id, foreign); // fremdes Gerät: bleibt
    expect(await prisma.pushSubscription.count({ where: { endpoint: foreign } })).toBe(1);
    await removePushSubscription(helper.user.id, own);
    await removePushSubscription(helper.user.id, own); // idempotent
    expect(await prisma.pushSubscription.count({ where: { endpoint: own } })).toBe(0);
  });

  it("die Datenbank lehnt Adressen ohne https und negative Zähler ab", async () => {
    const { helper } = await clubWithPeople();
    await expect(
      prisma.pushSubscription.create({
        data: {
          userId: helper.user.id,
          endpoint: "http://fcm.googleapis.com/x",
          p256dh: "a",
          auth: "b",
        },
      }),
    ).rejects.toThrow();
    const endpoint = await subscribe(helper.user.id);
    await expect(
      prisma.pushSubscription.update({ where: { endpoint }, data: { failureCount: -1 } }),
    ).rejects.toThrow();
  });
});

describe("notifyUsers merkt Push vor", () => {
  it("nur für Personen mit mindestens einem Gerät – Benachrichtigung bleibt die einzige Quelle", async () => {
    const { club, helper, other } = await clubWithPeople();
    await subscribe(helper.user.id);
    await subscribe(helper.user.id); // zweites Gerät: trotzdem EINE Benachrichtigung
    const ctx = await contextFor(helper.user.id, club.id);

    await notifyUsers(ctx.db, club.id, {
      userIds: [helper.user.id, other.user.id],
      type: "MESSAGE",
      title: "Neue Nachricht von Anna",
      linkUrl: "/nachrichten/1",
    });
    expect(await notesOf(helper.user.id)).toMatchObject([
      { pushStatus: "PENDING", emailStatus: "NONE" },
    ]);
    expect(await notesOf(other.user.id)).toMatchObject([{ pushStatus: "NONE" }]);
  });

  it("push: false verhindert Push; gesperrte oder gelöschte Personen bekommen gar keine Benachrichtigung", async () => {
    const { club, helper, other } = await clubWithPeople();
    await subscribe(helper.user.id);
    await subscribe(other.user.id);
    await prisma.user.update({ where: { id: other.user.id }, data: { disabledAt: new Date() } });
    const ctx = await contextFor(helper.user.id, club.id);

    await notifyUsers(ctx.db, club.id, {
      userIds: [helper.user.id, other.user.id],
      type: "SYSTEM",
      title: "Nur im Center",
      push: false,
    });
    expect(await notesOf(helper.user.id)).toMatchObject([{ pushStatus: "NONE" }]);
    expect(await notesOf(other.user.id)).toHaveLength(0);
  });
});

describe("Push-Versand (Job)", () => {
  // Die Warteschlange ist bewusst global – vorgemerkte Einträge früherer Tests dieser Datei würden hier mitzählen.
  beforeEach(async () => {
    await prisma.notification.updateMany({
      where: { pushStatus: "PENDING" },
      data: { pushStatus: "NONE" },
    });
  });

  it("sendet an ALLE Geräte der Person: Nutzlast ohne Personendaten, mit Lebensdauer und Dringlichkeit; markiert SENT und merkt sich den Erfolg", async () => {
    const { club, helper } = await clubWithPeople();
    const a = await subscribe(helper.user.id);
    const b = await subscribe(helper.user.id);
    const row = await queued(club.id, helper.user.id, { type: "SHIFT_REMINDER" });
    const { send, calls } = fakeSender();
    const now = new Date();

    expect(await sendPendingPushes({ send, now })).toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
      retry: 0,
      removed: 0,
    });
    expect(calls.map((c) => c.target.endpoint).sort()).toEqual([a, b].sort());
    for (const call of calls) {
      expect(call.options).toEqual({ ttlSeconds: 6 * 3600, urgency: "high" });
      expect(JSON.parse(call.payload)).toEqual({
        web_push: 8030,
        notification: {
          title: "Erinnerung an deine Schicht",
          body: "Deine Schicht steht bald an.",
          navigate: "http://localhost:3000/nachrichten/abc",
          lang: "de",
          dir: "ltr",
        },
      });
      // Datenschutz: weder Titel/Text der Benachrichtigung noch Namen.
      for (const secret of ["Hanna", "Helfer", "Geheimer Text", helper.user.email]) {
        expect(call.payload).not.toContain(secret);
      }
    }
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      pushStatus: "SENT",
      pushSentAt: now,
    });
    const subs = await prisma.pushSubscription.findMany({ where: { userId: helper.user.id } });
    expect(
      subs.every((s) => s.lastSuccessAt?.getTime() === now.getTime() && s.failureCount === 0),
    ).toBe(true);

    // Nichts wird doppelt gesendet.
    expect(await sendPendingPushes({ send })).toMatchObject({ sent: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("gibt nach Ende-zu-Ende über notifyUsers dieselbe Nutzlast: Typ MESSAGE → „Neue Nachricht“ mit Link", async () => {
    const { club, helper, other } = await clubWithPeople();
    await subscribe(other.user.id);
    const ctx = await contextFor(helper.user.id, club.id);
    await notifyUsers(ctx.db, club.id, {
      userIds: [other.user.id],
      type: "MESSAGE",
      title: "Anna Admin schreibt: Hallo!",
      body: "Vertraulicher Inhalt",
      linkUrl: "/nachrichten/xyz",
    });
    const { send, calls } = fakeSender();
    await sendPendingPushes({ send });
    expect(calls).toHaveLength(1);
    const { notification } = JSON.parse(calls[0]!.payload);
    expect(notification).toMatchObject({
      title: "Neue Nachricht",
      navigate: "http://localhost:3000/nachrichten/xyz",
    });
    expect(calls[0]!.payload).not.toMatch(/Anna|Hallo|Vertraulich/);
  });

  it("löscht Abos, die der Push-Dienst als erloschen meldet (410 und 404); bleibt ein Gerät übrig, gilt die Meldung als gesendet", async () => {
    const { club, helper } = await clubWithPeople();
    const gone = await subscribe(helper.user.id);
    const gone2 = await subscribe(helper.user.id);
    const alive = await subscribe(helper.user.id);
    const row = await queued(club.id, helper.user.id);
    const { send } = fakeSender({ [gone]: 410, [gone2]: 404 });

    expect(await sendPendingPushes({ send })).toMatchObject({ sent: 1, removed: 2 });
    expect(await statusOf(row.id)).toBe("SENT");
    const left = await prisma.pushSubscription.findMany({ where: { userId: helper.user.id } });
    expect(left.map((s) => s.endpoint)).toEqual([alive]);
  });

  it("sind alle Geräte erloschen, wird die Benachrichtigung ohne Push abgeschlossen (NONE) und die Abos sind weg", async () => {
    const { club, helper } = await clubWithPeople();
    const only = await subscribe(helper.user.id);
    const row = await queued(club.id, helper.user.id);
    const { send } = fakeSender({ [only]: 410 });

    expect(await sendPendingPushes({ send })).toMatchObject({ sent: 0, skipped: 1, removed: 1 });
    expect(await statusOf(row.id)).toBe("NONE");
    expect(await prisma.pushSubscription.count({ where: { userId: helper.user.id } })).toBe(0);
  });

  it("429, 5xx und Netzfehler: bleibt vorgemerkt und zählt einen Fehlversuch; nach der Frist FAILED", async () => {
    const { club, helper } = await clubWithPeople();
    const endpoint = await subscribe(helper.user.id);
    const fresh = await queued(club.id, helper.user.id);

    for (const status of [429, 503, 0]) {
      const { send } = fakeSender({ [endpoint]: status });
      expect(await sendPendingPushes({ send })).toMatchObject({ sent: 0, retry: 1, failed: 0 });
      expect(await statusOf(fresh.id)).toBe("PENDING");
    }
    const sub = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    expect(sub.failureCount).toBe(3);

    // Später erneut: geht durch → Zähler zurück auf 0.
    const { send: ok } = fakeSender();
    expect(await sendPendingPushes({ send: ok })).toMatchObject({ sent: 1 });
    expect(
      (await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).failureCount,
    ).toBe(0);

    // Alt und weiter erfolglos → FAILED.
    const old = await queued(club.id, helper.user.id, {
      createdAt: new Date(Date.now() - (PUSH_RETRY_HOURS + 1) * HOUR),
    });
    const { send: down } = fakeSender({ [endpoint]: 503 });
    expect(await sendPendingPushes({ send: down })).toMatchObject({ failed: 1, retry: 0 });
    expect(await statusOf(old.id)).toBe("FAILED");
  });

  it("endgültige Fehler (z. B. 400/403) werden nicht wiederholt", async () => {
    const { club, helper } = await clubWithPeople();
    const endpoint = await subscribe(helper.user.id);
    const row = await queued(club.id, helper.user.id);
    const { send } = fakeSender({ [endpoint]: 403 });
    expect(await sendPendingPushes({ send })).toMatchObject({ failed: 1, retry: 0 });
    expect(await statusOf(row.id)).toBe("FAILED");
    expect(
      (await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).failureCount,
    ).toBe(1);
  });

  it("prüft beim Versand erneut: gesperrte und gelöschte Personen, beendete Mitgliedschaften, ruhende Vereine, bereits Gelesenes – nichts wird gesendet", async () => {
    const club = await createClub("Prüfverein");
    const users = {
      disabled: await addUserToClub(club, "HELPER", { firstName: "Gesperrt" }),
      deleted: await addUserToClub(club, "HELPER", { firstName: "Gelöscht" }),
      ended: await addUserToClub(club, "HELPER", { firstName: "Ausgetreten" }),
      read: await addUserToClub(club, "HELPER", { firstName: "Gelesen" }),
      noDevice: await addUserToClub(club, "HELPER", { firstName: "Ohnegerät" }),
    };
    for (const key of ["disabled", "deleted", "ended", "read"] as const) {
      await subscribe(users[key].user.id);
    }
    const ids = {
      disabled: (await queued(club.id, users.disabled.user.id)).id,
      deleted: (await queued(club.id, users.deleted.user.id)).id,
      ended: (await queued(club.id, users.ended.user.id)).id,
      read: (await queued(club.id, users.read.user.id, { readAt: new Date() })).id,
      noDevice: (await queued(club.id, users.noDevice.user.id)).id,
    };
    await prisma.user.update({
      where: { id: users.disabled.user.id },
      data: { disabledAt: new Date() },
    });
    await prisma.user.update({
      where: { id: users.deleted.user.id },
      data: { deletedAt: new Date() },
    });
    await prisma.clubMembership.update({
      where: { id: users.ended.membershipId },
      data: { status: "SUSPENDED" },
    });
    const { send } = fakeSender();

    expect(await sendPendingPushes({ send })).toEqual({
      sent: 0,
      failed: 0,
      skipped: 5,
      retry: 0,
      removed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    for (const id of Object.values(ids)) expect(await statusOf(id)).toBe("NONE");

    // Verein nicht aktiv
    const inactive = await createClub("Ruhender Verein");
    const person = await addUserToClub(inactive, "HELPER");
    await subscribe(person.user.id);
    const row = await queued(inactive.id, person.user.id);
    await prisma.club.update({ where: { id: inactive.id }, data: { status: "DEACTIVATED" } });
    expect(await sendPendingPushes({ send })).toMatchObject({ sent: 0, skipped: 1 });
    expect(await statusOf(row.id)).toBe("NONE");
    expect(send).not.toHaveBeenCalled();
  });

  it("ohne VAPID-Einrichtung (Push abgeschaltet) schließt der Job vorgemerkte Einträge ohne Versand ab", async () => {
    const { club, helper } = await clubWithPeople();
    await subscribe(helper.user.id);
    const row = await queued(club.id, helper.user.id);
    // Der Testlauf hat keine VAPID-Werte und übergibt keinen Sender: Push ist abgeschaltet.
    expect(await sendPendingPushes()).toMatchObject({ sent: 0, skipped: 1 });
    expect(await statusOf(row.id)).toBe("NONE");
  });

  it("protokolliert weder Adresse noch Inhalt eines fehlgeschlagenen Versands", async () => {
    const { club, helper } = await clubWithPeople();
    const endpoint = await subscribe(helper.user.id);
    await queued(club.id, helper.user.id);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.fn<PushSender>().mockRejectedValue(new Error(`Fehler bei ${endpoint}`));
    await sendPendingPushes({ send });
    const logged = spy.mock.calls.flat().join(" ");
    spy.mockRestore();
    expect(logged).toContain("[push-queue]");
    expect(logged).not.toContain(endpoint);
    expect(logged).not.toContain("fcm.googleapis.com");
    expect(logged).not.toContain("Geheimer Text");
  });

  it("läuft als Job „push“ im Runner", async () => {
    const summary = await runJobs({ only: ["push"] });
    expect(summary.ran).toBe(true);
    expect(summary.reports.map((r) => r.name)).toEqual(["push"]);
    expect(summary.reports[0]).toMatchObject({ ok: true });
    expect(summary.reports[0]!.result).toEqual({
      sent: expect.any(Number),
      failed: expect.any(Number),
      skipped: expect.any(Number),
      retry: expect.any(Number),
      removed: expect.any(Number),
    });
  });
});

describe("Aufräumen und Löschen", () => {
  it("der Aufräum-Job entfernt Geräte mit Fehlversuchen und ohne Erfolg seit 30 Tagen – gesunde und junge bleiben", async () => {
    const { helper } = await clubWithPeople();
    const dead = await subscribe(helper.user.id);
    const deadNeverWorked = await subscribe(helper.user.id);
    const healthy = await subscribe(helper.user.id);
    const youngFailing = await subscribe(helper.user.id);
    const oldButNoFailures = await subscribe(helper.user.id);
    const old = new Date(Date.now() - 31 * DAY);
    await prisma.pushSubscription.update({
      where: { endpoint: dead },
      data: { failureCount: 5, lastSuccessAt: old },
    });
    await prisma.pushSubscription.update({
      where: { endpoint: deadNeverWorked },
      data: { failureCount: 2, lastSuccessAt: null, createdAt: old },
    });
    await prisma.pushSubscription.update({
      where: { endpoint: healthy },
      data: { failureCount: 0, lastSuccessAt: new Date() },
    });
    await prisma.pushSubscription.update({
      where: { endpoint: youngFailing },
      data: { failureCount: 4, lastSuccessAt: new Date(Date.now() - 2 * DAY) },
    });
    await prisma.pushSubscription.update({
      where: { endpoint: oldButNoFailures },
      data: { failureCount: 0, lastSuccessAt: old, createdAt: old },
    });

    expect(await purgeStaleData()).toMatchObject({ pushSubscriptions: 2 });
    const left = (
      await prisma.pushSubscription.findMany({ where: { userId: helper.user.id } })
    ).map((s) => s.endpoint);
    expect(left.sort()).toEqual([healthy, youngFailing, oldButNoFailures].sort());
  });

  it("der Aufräum-Job löscht keine Benachrichtigung, deren Push noch aussteht", async () => {
    const { club, helper } = await clubWithPeople();
    const pending = await queued(club.id, helper.user.id, {
      createdAt: new Date(Date.now() - 200 * DAY),
    });
    await purgeStaleData();
    expect(await prisma.notification.findUnique({ where: { id: pending.id } })).not.toBeNull();
  });

  it("Kontolöschung entfernt alle Push-Geräte der Person (Kaskade) und lässt fremde unberührt", async () => {
    const club = await createClub("Löschverein");
    const admin = await addUserToClub(club, "CLUB_ADMIN");
    const admin2 = await addUserToClub(club, "CLUB_ADMIN");
    const person = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
    await prisma.user.updateMany({
      where: { id: { in: [admin.user.id, admin2.user.id, person.user.id] } },
      data: { passwordHash: await hashPassword(PASSWORD) },
    });
    const mine1 = await subscribe(person.user.id);
    const mine2 = await subscribe(person.user.id);
    const theirs = await subscribe(admin.user.id);

    const pending = await requestAccountDeletion(
      { userId: person.user.id, password: PASSWORD },
      { ipPrefix: "10.0.0.0" },
      new Date(Date.now() - 20 * DAY),
    );
    expect(await executeDeletionRequest(pending.id)).toBe("COMPLETED");

    expect(await prisma.user.findUnique({ where: { id: person.user.id } })).toBeNull();
    expect(
      await prisma.pushSubscription.count({ where: { endpoint: { in: [mine1, mine2] } } }),
    ).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { endpoint: theirs } })).toBe(1);
  });

  it("der Datenexport nennt die Geräte (Bezeichnung, Zeitpunkte), aber weder Adresse noch Schlüssel", async () => {
    const user = await createUser();
    const endpoint = await subscribe(user.id);
    const json = JSON.stringify((await buildUserDataExport(user.id))!);
    expect(json).toContain("Chrome auf Android");
    expect(json).toContain("pushGeraete");
    expect(json).not.toContain(endpoint);
    expect(json).not.toContain("fcm.googleapis.com");
    expect(json).not.toContain("a".repeat(22));
  });
});
