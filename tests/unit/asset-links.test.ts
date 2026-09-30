import { describe, expect, it } from "vitest";
import {
  ANDROID_PACKAGE_PATTERN,
  buildAssetLinks,
  parseCertFingerprints,
} from "@/server/asset-links";
import { parseEnv } from "@/server/env";

/** Zwei gültige Fingerabdrücke (32 Hex-Paare) – Beispielwerte, keine echten Schlüssel. */
const FP_A = Array.from({ length: 32 }, (_, i) =>
  i.toString(16).padStart(2, "0").toUpperCase(),
).join(":");
const FP_B = Array.from({ length: 32 }, () => "AB").join(":");

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  APP_SECRET: "x".repeat(40),
  CRON_SECRET: "y".repeat(20),
};

describe("Digital Asset Links (Android-App)", () => {
  describe("parseCertFingerprints", () => {
    it("ohne Wert: keine Fingerabdrücke", () => {
      expect(parseCertFingerprints(undefined)).toEqual({ ok: true, fingerprints: [] });
      expect(parseCertFingerprints("   ")).toEqual({ ok: true, fingerprints: [] });
    });

    it("zerlegt die Liste, entfernt Leerzeichen und Doppelte, schreibt Hex groß", () => {
      expect(parseCertFingerprints(` ${FP_A.toLowerCase()} ,${FP_B}, ${FP_A}`)).toEqual({
        ok: true,
        fingerprints: [FP_A, FP_B],
      });
    });

    it("meldet ungültige Einträge nur mit ihrer Position, nicht mit ihrem Inhalt", () => {
      const tooShort = FP_A.split(":").slice(0, 31).join(":");
      const withoutColons = FP_A.replaceAll(":", "");
      const sha1 = FP_A.split(":").slice(0, 20).join(":");
      expect(
        parseCertFingerprints(`${FP_A},${tooShort},${withoutColons},${sha1},ZZ${FP_A.slice(2)}`),
      ).toEqual({
        ok: false,
        invalidPositions: [2, 3, 4, 5],
      });
      // Ein leerer Eintrag (doppeltes Komma) ist ebenfalls ein Fehler – sonst fiele ein fehlender Wert nicht auf.
      expect(parseCertFingerprints(`${FP_A},,${FP_B}`)).toEqual({
        ok: false,
        invalidPositions: [2],
      });
    });
  });

  describe("buildAssetLinks", () => {
    it("ohne Fingerabdruck eine leere Liste (keine App verknüpft)", () => {
      expect(buildAssetLinks("com.vereinsflow.app", [])).toEqual([]);
    });

    it("eine Aussage für alle Fingerabdrücke im Format von Google", () => {
      expect(buildAssetLinks("com.vereinsflow.app", [FP_A, FP_B])).toEqual([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "com.vereinsflow.app",
            sha256_cert_fingerprints: [FP_A, FP_B],
          },
        },
      ]);
    });
  });

  it("Paketnamen: mindestens zwei Teile, jeder beginnt mit einem Buchstaben", () => {
    for (const name of ["com.vereinsflow.app", "de.verein_1.app", "a.b"]) {
      expect(ANDROID_PACKAGE_PATTERN.test(name), name).toBe(true);
    }
    for (const name of [
      "vereinsflow",
      "com..app",
      "com.1app",
      ".com.app",
      "com.app.",
      "com.verein-flow",
    ]) {
      expect(ANDROID_PACKAGE_PATTERN.test(name), name).toBe(false);
    }
  });

  describe("Konfiguration (parseEnv)", () => {
    it("Standard: Paket com.vereinsflow.app, kein Fingerabdruck", () => {
      const env = parseEnv(valid);
      expect(env.ANDROID_APP_PACKAGE).toBe("com.vereinsflow.app");
      expect(env.ANDROID_APP_CERT_SHA256).toEqual([]);
      // Leere Werte in der .env gelten als nicht gesetzt.
      const empty = parseEnv({ ...valid, ANDROID_APP_PACKAGE: "", ANDROID_APP_CERT_SHA256: "" });
      expect(empty.ANDROID_APP_PACKAGE).toBe("com.vereinsflow.app");
      expect(empty.ANDROID_APP_CERT_SHA256).toEqual([]);
    });

    it("übernimmt Paketname und normalisierte Fingerabdrücke", () => {
      const env = parseEnv({
        ...valid,
        ANDROID_APP_PACKAGE: "de.meinverein.app",
        ANDROID_APP_CERT_SHA256: `${FP_A.toLowerCase()}, ${FP_B}`,
      });
      expect(env.ANDROID_APP_PACKAGE).toBe("de.meinverein.app");
      expect(env.ANDROID_APP_CERT_SHA256).toEqual([FP_A, FP_B]);
    });

    it("verweigert ungültige Werte mit verständlicher Meldung", () => {
      expect(() => parseEnv({ ...valid, ANDROID_APP_PACKAGE: "vereinsflow" })).toThrow(
        /ANDROID_APP_PACKAGE/,
      );
      expect(() =>
        parseEnv({ ...valid, ANDROID_APP_CERT_SHA256: `${FP_A},geheim-falsch-eingefuegt` }),
      ).toThrow(/ANDROID_APP_CERT_SHA256: Eintrag 2 ist kein SHA-256-Fingerabdruck/);
      expect(() => parseEnv({ ...valid, ANDROID_APP_CERT_SHA256: `x,${FP_A},y` })).toThrow(
        /Einträge 1, 3 sind keine SHA-256-Fingerabdrücke/,
      );
      // Der fehlerhafte Wert selbst erscheint nicht in der Meldung (könnte versehentlich etwas anderes sein).
      expect(() =>
        parseEnv({ ...valid, ANDROID_APP_CERT_SHA256: "geheim-falsch-eingefuegt" }),
      ).toThrow(expect.objectContaining({ message: expect.not.stringContaining("geheim") }));
    });
  });
});
