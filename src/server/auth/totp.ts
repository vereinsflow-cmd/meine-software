import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Einmalcodes nach RFC 4226 (HOTP) und RFC 6238 (TOTP) – wie sie Authenticator-Apps (Google, Microsoft, 2FAS, Aegis …)
 * anzeigen: HMAC-SHA1, 6 Ziffern, alle 30 Sekunden ein neuer Code. Nur mit `node:crypto`, ohne Zusatzpaket.
 *
 * Bei der Prüfung gilt ein Zeitschritt Spielraum in beide Richtungen (±30 Sekunden), weil Handy- und Serveruhr selten
 * genau gleich gehen. Welcher Zeitschritt gepasst hat, gibt {@link matchTotpStep} zurück: Der Aufrufer speichert ihn und
 * nimmt danach nur noch Codes aus späteren Schritten an (derselbe Code gilt nie zweimal).
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_WINDOW = 1;
/** 160 Bit, wie von RFC 4226 empfohlen (Länge des SHA-1-Ergebnisses). */
export const TOTP_SECRET_BYTES = 20;
export const TOTP_ISSUER = "VereinsFlow";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 nach RFC 4648 ohne Auffüllzeichen – so erwarten es Authenticator-Apps im QR-Code und bei der Eingabe von Hand. */
export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Liest Base32 (Groß-/Kleinschreibung egal, Leerzeichen, Bindestriche und `=` werden ignoriert). Ungültig → `null`. */
export function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Neues zufälliges Geheimnis für die Authenticator-App (Base32). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

/** HOTP-Wert für einen Zähler (RFC 4226, Abschnitt 5.3: dynamische Kürzung). */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new RangeError("Ungültiger Zähler");
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Zeitschritt (RFC 6238: T = floor(Unixzeit / 30)). */
export function totpStep(timeMs: number, period = TOTP_PERIOD_SECONDS): number {
  return Math.floor(timeMs / 1000 / period);
}

/** TOTP-Wert zu einem Zeitpunkt. */
export function totpAt(
  secret: Uint8Array,
  timeMs: number,
  options: { digits?: number; period?: number } = {},
): string {
  return hotp(secret, totpStep(timeMs, options.period), options.digits ?? TOTP_DIGITS);
}

function sameCode(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Prüft einen Code im Fenster ±{@link TOTP_WINDOW} Zeitschritte um `timeMs` und liefert den passenden Zeitschritt – oder
 * `null`. Jeder Schritt des Fensters wird gerechnet und verglichen (in konstanter Zeit), damit die Antwortzeit nicht verrät,
 * welcher Schritt gepasst hat.
 */
export function matchTotpStep(
  secret: Uint8Array,
  code: string,
  timeMs: number,
  window = TOTP_WINDOW,
): number | null {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d+$/.test(normalized) || normalized.length !== TOTP_DIGITS) return null;
  const current = totpStep(timeMs);
  let match: number | null = null;
  for (let offset = -window; offset <= window; offset++) {
    const step = current + offset;
    if (step < 0) continue;
    if (sameCode(hotp(secret, step), normalized) && match === null) match = step;
  }
  return match;
}

/**
 * Adresse für den QR-Code (Key-URI-Format der Authenticator-Apps). Die App zeigt danach „VereinsFlow (<E-Mail>)“ an.
 * Algorithmus SHA1 ist die Vorgabe und wird deshalb nicht extra genannt – manche Apps lesen die Angabe falsch.
 */
export function otpauthUrl(email: string, secretBase32: string): string {
  const label = `${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: TOTP_ISSUER,
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Schlüssel zum Abtippen in Vierergruppen („ABCD EFGH …“). */
export function formatTotpSecret(secretBase32: string): string {
  return secretBase32.replace(/(.{4})(?=.)/g, "$1 ");
}
