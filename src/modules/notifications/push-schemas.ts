import { z } from "zod";

/**
 * Eingaben für das Anmelden und Abmelden von Push-Geräten.
 *
 * SICHERHEIT (SSRF-Schutz): Der Server ruft die Adresse eines Abos selbst auf, um die Nachricht zuzustellen. Ein Angreifer mit
 * Konto könnte sonst eine beliebige Adresse eintragen (interne Dienste, Metadaten-Endpunkte der Cloud …). Deshalb akzeptiert
 * VereinsFlow nur https-Adressen der bekannten Push-Dienste der Browser-Hersteller – ohne Zugangsdaten, ohne fremden Port.
 */
const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com", // Chrome, Edge, Opera, Samsung Internet, Brave – Google
  ".push.services.mozilla.com", // Firefox – Mozilla
  ".push.apple.com", // Safari, iPhone und iPad, Home-Bildschirm-Apps – Apple
  ".notify.windows.com", // Edge auf Windows (teils) – Microsoft
] as const;

export function isAllowedPushEndpoint(value: string): boolean {
  if (value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suffix) =>
    suffix.startsWith(".") ? host.endsWith(suffix) : host === suffix,
  );
}

const endpoint = z
  .string()
  .min(20)
  .max(2048)
  .refine(isAllowedPushEndpoint, "Diese Push-Adresse wird nicht unterstützt.");

const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/, "Ungültiger Schlüssel.");

export const pushSubscribeSchema = z.object({
  endpoint,
  keys: z.object({
    // P-256-Schlüssel (65 Byte → 87 Zeichen) und Geheimnis (16 Byte → 22 Zeichen); großzügig, damit Browser-Varianten passen.
    p256dh: base64url(80, 100),
    auth: base64url(16, 40),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushEndpointSchema = z.object({ endpoint });
