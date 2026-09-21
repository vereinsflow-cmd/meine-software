import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Erzeugt ein kryptografisch sicheres, URL-taugliches Token (Standard: 256 Bit). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * SHA-256 eines Tokens. In der Datenbank steht nur der Hash: Wird die Datenbank kopiert,
 * lassen sich damit weder Sitzungen übernehmen noch E-Mail-Links (Passwort-Reset, Einladung) nutzen.
 * Ein schneller Hash genügt, weil die Tokens zufällig und 256 Bit lang sind (kein Wörterbuch-Angriff).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Vergleich in konstanter Zeit (z. B. für Geheimnisse aus Headern). */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
