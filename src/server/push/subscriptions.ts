import "server-only";
import { describeDevice } from "@/lib/user-agent";
import { prisma } from "@/server/db/client";
import type { PushSubscribeInput } from "@/modules/notifications/push-schemas";

/**
 * Push-Geräte eines Benutzers. Jede Funktion arbeitet ausschließlich für die übergebene Benutzer-ID aus der Sitzung – fremde
 * Abos lassen sich weder anlegen noch abfragen noch löschen. Die Endpunkt-Adresse ist ein Geheimnis (wer sie kennt, kann dem
 * Gerät Meldungen schicken): Sie wird nie protokolliert und nur an das Gerät zurückgegeben, das sie selbst mitgeschickt hat.
 */
export const MAX_PUSH_DEVICES_PER_USER = 10;

/**
 * Meldet ein Gerät an (oder erneut an – idempotent über den Endpunkt). Gehörte der Endpunkt bisher einer anderen Person
 * (gemeinsam genutztes Gerät: wer sich zuletzt angemeldet und Push eingeschaltet hat, bekommt die Meldungen), wechselt das Abo
 * zu dieser Person. Mehr als `MAX_PUSH_DEVICES_PER_USER` Geräte je Person: die ältesten entfallen.
 */
export async function registerPushSubscription(
  userId: string,
  input: PushSubscribeInput,
  userAgent: string | null,
): Promise<void> {
  const deviceLabel = describeDevice(userAgent);
  await prisma.$transaction(async (tx) => {
    await tx.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        deviceLabel,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        deviceLabel,
        failureCount: 0,
      },
    });
    const surplus = await tx.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: MAX_PUSH_DEVICES_PER_USER,
      select: { id: true },
    });
    if (surplus.length > 0) {
      await tx.pushSubscription.deleteMany({ where: { id: { in: surplus.map((s) => s.id) } } });
    }
  });
}

/** Entfernt ein Gerät der Person; gibt es kein solches Abo, ist das kein Fehler (idempotent). */
export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/** Gehört dieser Endpunkt dieser Person? (Für die Anzeige „an/aus“ im Profil; ohne den Endpunkt zurückzugeben.) */
export async function ownsPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  return (await prisma.pushSubscription.count({ where: { userId, endpoint } })) > 0;
}
