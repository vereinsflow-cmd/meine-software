import "server-only";
import * as webPushModule from "web-push";
import { env } from "@/server/env";

/**
 * Web-Push (VAPID) über das npm-Paket `web-push` – Standard-Web-Push ohne Firebase oder sonstige Zwischenstation.
 * Ohne die drei VAPID-Angaben in der Umgebung ist Push abgeschaltet (`getPushConfig()` liefert `null`).
 *
 * `web-push` ist ein CommonJS-Paket: Im Next.js-Build stehen die Funktionen direkt am Modul, unter Node im reinen ESM-Betrieb
 * (Kommandozeilen-Jobs mit tsx, Vitest) nur an `default` – beides wird unterstützt.
 */
const webPush =
  (webPushModule as unknown as { default?: typeof webPushModule }).default ?? webPushModule;

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getPushConfig(): PushConfig | null {
  const {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject,
  } = env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Nur der öffentliche Schlüssel darf zum Browser – nie `privateKey`. */
export function getPublicPushKey(): string | null {
  return getPushConfig()?.publicKey ?? null;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendOptions {
  ttlSeconds: number;
  urgency: "high" | "normal";
}

/** Fehler des Push-Dienstes: nur der Statuscode wird ausgewertet – Adresse und Antworttext bleiben außen vor. */
export class PushDeliveryError extends Error {
  constructor(readonly statusCode: number | null) {
    super(`Push-Zustellung fehlgeschlagen${statusCode ? ` (HTTP ${statusCode})` : ""}`);
    this.name = "PushDeliveryError";
  }
}

/** Ein Sender bekommt Ziel, fertigen Text (JSON) und Optionen; bei Fehlern wirft er `PushDeliveryError`. */
export type PushSender = (
  target: PushTarget,
  payload: string,
  options: PushSendOptions,
) => Promise<void>;

/** Der echte Sender: verschlüsselt die Nachricht für das Gerät und stellt sie über den Push-Dienst zu. */
export const sendWebPush: PushSender = async (target, payload, options) => {
  const config = getPushConfig();
  if (!config) throw new PushDeliveryError(null);
  try {
    await webPush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      {
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
        TTL: options.ttlSeconds,
        urgency: options.urgency,
        timeout: 10_000,
      },
    );
  } catch (error) {
    // Das Fehlerobjekt der Bibliothek enthält die Endpunkt-Adresse (ein Geheimnis) – nicht weiterreichen.
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    throw new PushDeliveryError(typeof statusCode === "number" ? statusCode : null);
  }
};
