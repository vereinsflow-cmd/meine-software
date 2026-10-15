import { describe, expect, it } from "vitest";
import {
  RECOVERY_CODE_COUNT,
  formatRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  hashRecoveryCodes,
  normalizeRecoveryCode,
} from "@/server/auth/recovery-codes";

/** Crockford-Base32: Ziffern und Großbuchstaben ohne I, L, O, U. */
const CODE = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

describe("Wiederherstellungscodes", () => {
  it("10 verschiedene Codes der Form XXXXX-XXXXX ohne verwechselbare Zeichen", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(CODE);
  });

  it("jeder Satz ist neu (Zufall)", () => {
    const a = generateRecoveryCodes();
    const b = generateRecoveryCodes();
    expect(a.filter((code) => b.includes(code))).toEqual([]);
  });

  it("Eingabe: Klein-/Großschreibung, Leerzeichen und Bindestrich egal; O → 0, I/L → 1", () => {
    expect(normalizeRecoveryCode("7KQ2M-9XD4T")).toBe("7KQ2M9XD4T");
    expect(normalizeRecoveryCode(" 7kq2m 9xd4t ")).toBe("7KQ2M9XD4T");
    expect(normalizeRecoveryCode("7kq2m9xd4t")).toBe("7KQ2M9XD4T");
    expect(normalizeRecoveryCode("O0IL1-ABCDE")).toBe("00111ABCDE");
    expect(formatRecoveryCode("7KQ2M9XD4T")).toBe("7KQ2M-9XD4T");
  });

  it("verwirft alles, was kein Code sein kann", () => {
    for (const bad of ["", "123456", "7KQ2M-9XD4", "7KQ2M-9XD4TT", "7KQ2M-9XD4U", "7KQ2M-9XD4!"]) {
      expect(normalizeRecoveryCode(bad), bad).toBeNull();
    }
  });

  it("Hash: gleich für gleiche Eingabe, an das Konto gebunden, ohne den Code im Klartext", () => {
    const hash = hashRecoveryCode("user-1", "7KQ2M9XD4T");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("7KQ2M9XD4T");
    expect(hashRecoveryCode("user-1", "7KQ2M9XD4T")).toBe(hash);
    expect(hashRecoveryCode("user-2", "7KQ2M9XD4T")).not.toBe(hash);
    expect(hashRecoveryCode("user-1", "7KQ2M9XD4V")).not.toBe(hash);
  });

  it("Hashes zu Codes in Anzeigeform entsprechen den Hashes der normalisierten Eingabe", () => {
    const codes = generateRecoveryCodes();
    const hashes = hashRecoveryCodes("user-1", codes);
    expect(hashes).toHaveLength(codes.length);
    expect(hashes[0]).toBe(
      hashRecoveryCode("user-1", normalizeRecoveryCode(codes[0]!.toLowerCase())!),
    );
  });
});
