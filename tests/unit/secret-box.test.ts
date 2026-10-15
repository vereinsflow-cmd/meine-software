import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacSha256, openSecret, sealSecret } from "@/server/security/secret-box";

/** Ändert ein Byte im Datenteil (nach „v1.“) – wie eine Manipulation in der Datenbank. */
function flipByte(sealed: string, index: number): string {
  const [version, payload] = sealed.split(".");
  const data = Buffer.from(payload!, "base64url");
  data[index] = data[index]! ^ 0x01;
  return `${version}.${data.toString("base64url")}`;
}

describe("Verschlüsseln mit AES-256-GCM (secret-box)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("hin und zurück; das Ergebnis enthält den Klartext nicht", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP", "totp:user-1");
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(openSecret(sealed, "totp:user-1")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("jedes Mal ein anderer Geheimtext (zufälliger IV)", () => {
    const a = sealSecret("gleich", "aad");
    const b = sealSecret("gleich", "aad");
    expect(a).not.toBe(b);
    expect(openSecret(a, "aad")).toBe("gleich");
    expect(openSecret(b, "aad")).toBe("gleich");
  });

  it("an den Ort gebunden: andere AAD (z. B. anderes Konto) → nicht lesbar", () => {
    const sealed = sealSecret("geheim", "totp:user-1");
    expect(openSecret(sealed, "totp:user-2")).toBeNull();
    expect(openSecret(sealed, "")).toBeNull();
  });

  it("jede Veränderung fällt auf: IV, Prüfwert, Geheimtext", () => {
    const sealed = sealSecret("geheim-und-lang-genug", "aad");
    expect(openSecret(flipByte(sealed, 0), "aad")).toBeNull(); // IV
    expect(openSecret(flipByte(sealed, 12), "aad")).toBeNull(); // Prüfwert
    expect(openSecret(flipByte(sealed, 30), "aad")).toBeNull(); // Geheimtext
  });

  it("falsches Format → null statt Fehler", () => {
    const sealed = sealSecret("geheim", "aad");
    for (const bad of [
      "",
      "v1.",
      "v1",
      "v2." + sealed.slice(3),
      `${sealed}.mehr`,
      "v1.kurz",
      "kein-format",
      sealed.slice(0, 20),
    ]) {
      expect(openSecret(bad, "aad"), bad).toBeNull();
    }
  });

  it("mit anderem APP_SECRET nicht lesbar (deshalb darf er sich nicht ändern)", async () => {
    const sealed = sealSecret("geheim", "aad");
    vi.resetModules();
    vi.stubEnv("APP_SECRET", "ein-ganz-anderes-geheimnis-mit-mindestens-32-zeichen");
    const other = await import("@/server/security/secret-box");
    expect(other.openSecret(sealed, "aad")).toBeNull();
    expect(other.openSecret(other.sealSecret("geheim", "aad"), "aad")).toBe("geheim");
  });
});

describe("HMAC-SHA256", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("gleiche Eingabe → gleicher Wert; andere Eingabe → anderer", () => {
    expect(hmacSha256("abc")).toBe(hmacSha256("abc"));
    expect(hmacSha256("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256("abc")).not.toBe(hmacSha256("abd"));
  });

  it("ist kein einfacher Hash: ohne APP_SECRET nicht nachrechenbar", async () => {
    expect(hmacSha256("abc")).not.toBe(createHash("sha256").update("abc").digest("hex"));
    const before = hmacSha256("abc");
    vi.resetModules();
    vi.stubEnv("APP_SECRET", "ein-ganz-anderes-geheimnis-mit-mindestens-32-zeichen");
    const other = await import("@/server/security/secret-box");
    expect(other.hmacSha256("abc")).not.toBe(before);
  });
});
