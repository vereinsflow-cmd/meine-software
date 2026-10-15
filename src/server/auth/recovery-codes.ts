import "server-only";
import { randomInt } from "node:crypto";
import { hmacSha256 } from "@/server/security/secret-box";

/**
 * Wiederherstellungscodes für die Zwei-Faktor-Anmeldung („Handy verloren“).
 *
 * - 10 Codes der Form `XXXXX-XXXXX` aus dem Crockford-Base32-Alphabet (ohne I, L, O, U – nichts zum Verwechseln), je
 *   50 Bit Zufall. Beim Eintippen sind Klein-/Großschreibung, Leerzeichen und Bindestriche egal; O gilt als 0, I und L als 1.
 * - Gespeichert wird nur ein HMAC je Code (Schlüssel aus `APP_SECRET`, an die Benutzer-ID gebunden). Wer die Datenbank
 *   kopiert, kann daraus weder Codes ablesen noch durchprobieren; ein Hash passt nie zu einem anderen Konto.
 * - Jeder Code gilt einmal: Beim Einlösen wird sein Hash in EINER Anweisung entfernt (siehe `redeemRecoveryCode`).
 */
export const RECOVERY_CODE_COUNT = 10;
const CODE_LENGTH = 10;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Neue Codes in Anzeigeform (`XXXXX-XXXXX`). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let raw = "";
    for (let index = 0; index < CODE_LENGTH; index++) raw += CROCKFORD[randomInt(CROCKFORD.length)];
    codes.add(formatRecoveryCode(raw));
  }
  return [...codes];
}

export const formatRecoveryCode = (canonical: string): string =>
  `${canonical.slice(0, 5)}-${canonical.slice(5)}`;

/**
 * Bringt eine Eingabe in die gespeicherte Form (10 Zeichen, groß, ohne Bindestrich) – oder `null`, wenn sie kein
 * Wiederherstellungscode sein kann.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const canonical = input
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (canonical.length !== CODE_LENGTH) return null;
  for (const char of canonical) if (!CROCKFORD.includes(char)) return null;
  return canonical;
}

/** Hash eines (normalisierten) Codes für genau dieses Konto. */
export function hashRecoveryCode(userId: string, canonical: string): string {
  return hmacSha256(`recovery-code:${userId}:${canonical}`);
}

/** Hashes zu Codes in Anzeigeform (wie aus {@link generateRecoveryCodes}). */
export function hashRecoveryCodes(userId: string, codes: readonly string[]): string[] {
  return codes.map((code) => hashRecoveryCode(userId, normalizeRecoveryCode(code)!));
}
