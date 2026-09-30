import "server-only";
import { after } from "next/server";
import { buildPushPayload, pushUrgency, PUSH_TTL_SECONDS } from "@/modules/notifications/push-payload";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { logUnexpectedError } from "@/server/log";
import {
  getPushConfig,
  PushDeliveryError,
  sendWebPush,
  type PushSender,
} from "@/server/push/web-push";
import { withJobLock } from "./lock";

/**
 * Versendet die Push-Benachrichtigungen zu Benachrichtigungen, die mit `pushStatus = PENDING` vorgemerkt wurden – der dritte
 * Weg neben Benachrichtigungscenter und E-Mail (siehe mail-queue.ts, dessen Regeln hier ebenso gelten).
 *
 * - Vorgemerkt wird beim Erzeugen der Benachrichtigung (`notifyUsers`), wenn die Person mindestens ein Gerät angemeldet hat.
 *   Gesendet wird an ALLE Geräte der Person. Konto, Mitgliedschaft und Verein werden HIER erneut geprüft: gesperrte oder
 *   gelöschte Personen, beendete Mitgliedschaften und nicht aktive Vereine bekommen nichts. Was bereits in der Anwendung
 *   gelesen wurde, wird nicht mehr gepusht.
 * - Der Inhalt hängt nur vom Typ der Benachrichtigung ab (siehe push-payload.ts) – keine Namen, kein Text.
 * - Antwort des Push-Dienstes je Gerät: Erfolg → Abo merkt sich den Zeitpunkt; 404/410 = Gerät abgemeldet oder App
 *   deinstalliert → Abo wird gelöscht; 429, 5xx oder Netzfehler → später erneut (höchstens `PUSH_RETRY_HOURS` Stunden lang, danach
 *   FAILED); andere Fehler (z. B. 400, 401, 403, 413) sind endgültig für dieses Gerät und zählen als Fehlversuch.
 *   Erreicht die Meldung mindestens ein Gerät, gilt sie als SENT – erneutes Senden würde die übrigen Geräte doppelt benachrichtigen.
 * - Ohne VAPID-Schlüssel (Push abgeschaltet) werden vorgemerkte Einträge ohne Versand als NONE abgeschlossen.
 * - Im Protokoll stehen weder Endpunkt-Adressen noch Inhalte, nur Zähler.
 */
export const PUSH_RETRY_HOURS = 2;

export interface PushQueueResult {
  sent: number;
  failed: number;
  skipped: number;
  retry: number;
  /** Abos, die der Push-Dienst als erloschen gemeldet hat (404/410) und die deshalb gelöscht wurden. */
  removed: number;
}

export async function sendPendingPushes(
  options: {
    now?: Date;
    batchSize?: number;
    send?: PushSender;
    /** Nur für Tests: erzwingt „Push ist eingerichtet“, wenn ein eigener Sender übergeben wird. */
    enabled?: boolean;
  } = {},
): Promise<PushQueueResult> {
  const now = options.now ?? new Date();
  const send = options.send ?? sendWebPush;
  const enabled = options.enabled ?? (options.send ? true : getPushConfig() !== null);
  const result: PushQueueResult = { sent: 0, failed: 0, skipped: 0, retry: 0, removed: 0 };

  const rows = await prisma.notification.findMany({
    where: { pushStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: options.batchSize ?? 100,
    select: {
      id: true,
      type: true,
      linkUrl: true,
      readAt: true,
      createdAt: true,
      membership: {
        select: {
          status: true,
          club: { select: { status: true } },
          user: {
            select: {
              disabledAt: true,
              deletedAt: true,
              pushSubscriptions: {
                select: { id: true, endpoint: true, p256dh: true, auth: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const mark = (id: string, pushStatus: "SENT" | "FAILED" | "NONE") =>
    prisma.notification.updateMany({
      where: { id, pushStatus: "PENDING" },
      data: { pushStatus, pushSentAt: pushStatus === "SENT" ? now : null },
    });

  for (const row of rows) {
    const { user, club } = row.membership;
    if (
      !enabled ||
      row.readAt ||
      user.disabledAt ||
      user.deletedAt ||
      row.membership.status !== "ACTIVE" ||
      club.status !== "ACTIVE" ||
      user.pushSubscriptions.length === 0
    ) {
      await mark(row.id, "NONE");
      result.skipped += 1;
      continue;
    }

    const payload = JSON.stringify(
      buildPushPayload({ type: row.type, linkUrl: row.linkUrl }, env.APP_URL),
    );
    const sendOptions = { ttlSeconds: PUSH_TTL_SECONDS, urgency: pushUrgency(row.type) };
    let delivered = 0;
    let transient = 0;
    let permanent = 0;

    for (const subscription of user.pushSubscriptions) {
      try {
        await send(subscription, payload, sendOptions);
        delivered += 1;
        await prisma.pushSubscription.updateMany({
          where: { id: subscription.id },
          data: { lastSuccessAt: now, failureCount: 0 },
        });
      } catch (error) {
        const status = error instanceof PushDeliveryError ? error.statusCode : null;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
          result.removed += 1;
          continue;
        }
        if (status === null || status === 429 || status >= 500) transient += 1;
        else permanent += 1;
        await prisma.pushSubscription.updateMany({
          where: { id: subscription.id },
          data: { failureCount: { increment: 1 } },
        });
        console.error(`[push-queue] Zustellung fehlgeschlagen: HTTP ${status ?? "ohne Antwort"}`);
      }
    }

    if (delivered > 0) {
      await mark(row.id, "SENT");
      result.sent += 1;
    } else if (transient === 0 && permanent === 0) {
      // Alle Geräte waren erloschen und wurden entfernt – niemand mehr, dem zuzustellen wäre.
      await mark(row.id, "NONE");
      result.skipped += 1;
    } else if (transient > 0 && now.getTime() - row.createdAt.getTime() <= PUSH_RETRY_HOURS * 3_600_000) {
      result.retry += 1;
    } else {
      await mark(row.id, "FAILED");
      result.failed += 1;
    }
  }
  return result;
}

/**
 * Stößt den Versand direkt nach der Antwort an den Browser an (Next.js `after`), damit Meldungen nicht bis zum nächsten
 * Lauf der Hintergrundjobs warten. Läuft unter demselben Schloss wie die Jobs (kein doppelter Versand); ist es belegt, holt
 * der laufende Job den Versand ohnehin nach. Außerhalb einer Anfrage (Jobs, Tests) tut die Funktion nichts – dort ist der Job
 * `push` ohnehin an der Reihe.
 */
export function flushPushesAfterResponse(): void {
  try {
    after(async () => {
      try {
        await withJobLock(() => sendPendingPushes());
      } catch (error) {
        logUnexpectedError("push-queue", error);
      }
    });
  } catch {
    // Keine Anfrage aktiv.
  }
}
