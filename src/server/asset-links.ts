import "server-only";

/**
 * Digital Asset Links (`/.well-known/assetlinks.json`): Damit erklärt die Website, dass die Android-App (Trusted Web Activity)
 * zu ihr gehört. Erst dann zeigt Android die Seiten in der App ohne Adresszeile – sonst erscheint oben eine Browser-Leiste.
 * Geprüft wird über den Paketnamen der App und den SHA-256-Fingerabdruck des Zertifikats, mit dem sie signiert ist
 * (bei Google Play: „App-Signaturschlüssel“ in der Play Console; beim Hochladen mit eigenem Schlüssel gern beide angeben).
 *
 * Bewusst ohne Abhängigkeit von `env`: Die Konfiguration (src/server/env.ts) prüft ihre Werte mit diesen Regeln.
 */

/** Paketname der Android-App, falls nichts anderes konfiguriert ist. */
export const DEFAULT_ANDROID_APP_PACKAGE = "com.vereinsflow.app";

/** Java-Paketname: mindestens zwei Teile, jeder beginnt mit einem Buchstaben (z. B. `com.vereinsflow.app`). */
export const ANDROID_PACKAGE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/** SHA-256-Fingerabdruck in der Schreibweise von Play Console und keytool: 32 Hex-Paare mit Doppelpunkten. */
const FINGERPRINT_PATTERN = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

export type FingerprintParseResult =
  { ok: true; fingerprints: string[] } | { ok: false; invalidPositions: number[] };

/**
 * Zerlegt die kommagetrennte Liste aus `ANDROID_APP_CERT_SHA256`. Leerzeichen um die Einträge sind erlaubt, Kleinbuchstaben
 * werden zu Großbuchstaben (so steht es in der Play Console), doppelte Einträge fallen weg. Ungültige Einträge werden mit ihrer
 * Position (ab 1) gemeldet – nicht mit ihrem Inhalt, damit versehentlich eingefügte andere Werte nicht im Protokoll landen.
 */
export function parseCertFingerprints(value: string | undefined): FingerprintParseResult {
  if (value === undefined || value.trim() === "") return { ok: true, fingerprints: [] };
  const entries = value.split(",").map((entry) => entry.trim().toUpperCase());
  const invalidPositions = entries.flatMap((entry, index) =>
    FINGERPRINT_PATTERN.test(entry) ? [] : [index + 1],
  );
  if (invalidPositions.length > 0) return { ok: false, invalidPositions };
  return { ok: true, fingerprints: [...new Set(entries)] };
}

export interface AssetLinkStatement {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/**
 * Inhalt von `/.well-known/assetlinks.json`. Ohne Fingerabdruck eine leere Liste: Dann gehört keine App zur Website (gültiges
 * JSON, das Android als „keine Verknüpfung“ versteht) – etwa auf Test- und Vereinsservern ohne eigene App.
 */
export function buildAssetLinks(
  packageName: string,
  fingerprints: readonly string[],
): AssetLinkStatement[] {
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: [...fingerprints],
      },
    },
  ];
}
