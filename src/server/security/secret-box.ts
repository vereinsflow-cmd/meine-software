import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/server/env";

/**
 * Verschlüsseln und Signieren mit Schlüsseln aus `APP_SECRET`.
 *
 * - Aus `APP_SECRET` werden per HKDF-SHA256 zwei getrennte Unterschlüssel abgeleitet (eigene `info`-Angaben): einer zum
 *   Verschlüsseln, einer für HMAC. Ein Schlüssel dient nie zwei Zwecken.
 * - Verschlüsselt wird mit AES-256-GCM: zufälliger 96-Bit-IV je Wert, 128-Bit-Prüfwert. Die „zusätzlichen Daten“ (AAD)
 *   binden den Wert an seinen Ort – z. B. an die Benutzer-ID. Ein verschlüsseltes Zwei-Faktor-Geheimnis, das jemand in der
 *   Datenbank in ein anderes Konto kopiert, lässt sich dort nicht entschlüsseln.
 * - Ergebnis: `v1.<base64url(IV ‖ Prüfwert ‖ Geheimtext)>` – die Versionsangabe erlaubt später einen Schlüsselwechsel.
 *
 * WICHTIG: `APP_SECRET` darf sich nicht mehr ändern, sobald Zwei-Faktor-Anmeldungen eingerichtet sind – sonst lassen sich
 * die gespeicherten Geheimnisse und Wiederherstellungscodes nicht mehr prüfen (siehe docs/OPERATIONS.md).
 */
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = "vereinsflow-secret-box";

let keys: { encryption: Buffer; mac: Buffer } | undefined;

function deriveKeys(): { encryption: Buffer; mac: Buffer } {
  keys ??= {
    encryption: Buffer.from(hkdfSync("sha256", env.APP_SECRET, HKDF_SALT, "vf:aes-256-gcm:v1", 32)),
    mac: Buffer.from(hkdfSync("sha256", env.APP_SECRET, HKDF_SALT, "vf:hmac-sha256:v1", 32)),
  };
  return keys;
}

/** Verschlüsselt einen Text. `aad` (z. B. `totp:<Benutzer-ID>`) muss beim Entschlüsseln exakt gleich sein. */
export function sealSecret(plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKeys().encryption, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

/**
 * Entschlüsselt einen Wert aus {@link sealSecret}. Liefert `null`, wenn er verändert wurde, zu einem anderen Ort (`aad`)
 * gehört, mit einem anderen `APP_SECRET` verschlüsselt wurde oder kein gültiges Format hat – wirft nie.
 */
export function openSecret(sealed: string, aad: string): string | null {
  const [version, payload, extra] = sealed.split(".");
  if (version !== VERSION || !payload || extra !== undefined) return null;
  const data = Buffer.from(payload, "base64url");
  if (data.length < IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKeys().encryption,
      data.subarray(0, IV_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plaintext = Buffer.concat([
      decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * HMAC-SHA256 (hex) mit dem eigenen HMAC-Unterschlüssel. Für Werte, die nur verglichen, nie zurückgelesen werden müssen
 * (z. B. Wiederherstellungscodes). Ohne `APP_SECRET` lässt sich aus der Datenbank nichts durchprobieren.
 */
export function hmacSha256(data: string): string {
  return createHmac("sha256", deriveKeys().mac).update(data, "utf8").digest("hex");
}
