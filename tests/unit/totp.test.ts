import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  formatTotpSecret,
  generateTotpSecret,
  hotp,
  matchTotpStep,
  otpauthUrl,
  totpAt,
  totpStep,
} from "@/server/auth/totp";

/** Prüfschlüssel aus RFC 4226 (Anhang D) und RFC 6238 (Anhang B, SHA-1): ASCII „12345678901234567890“. */
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("HOTP nach RFC 4226 (Anhang D)", () => {
  it("liefert die Prüfwerte für die Zähler 0 bis 9", () => {
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    expect(expected.map((_, counter) => hotp(RFC_SECRET, counter))).toEqual(expected);
  });

  it("lehnt ungültige Zähler ab", () => {
    expect(() => hotp(RFC_SECRET, -1)).toThrow(RangeError);
    expect(() => hotp(RFC_SECRET, 1.5)).toThrow(RangeError);
  });
});

describe("TOTP nach RFC 6238 (Anhang B, SHA-1, 8 Ziffern)", () => {
  const vectors: [seconds: number, code: string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  it.each(vectors)("Zeit %i s → %s", (seconds, code) => {
    expect(totpAt(RFC_SECRET, seconds * 1000, { digits: 8 })).toBe(code);
  });

  it("6 Ziffern sind die letzten 6 der 8-stelligen Werte (gleiche Kürzung)", () => {
    for (const [seconds, code] of vectors) {
      expect(totpAt(RFC_SECRET, seconds * 1000)).toBe(code.slice(2));
    }
  });

  it("Zeitschritte von 30 Sekunden", () => {
    expect(totpStep(0)).toBe(0);
    expect(totpStep(29_999)).toBe(0);
    expect(totpStep(30_000)).toBe(1);
    expect(totpStep(59_000)).toBe(1);
    expect(totpStep(20_000_000_000_000)).toBe(666_666_666);
  });
});

describe("Base32 (RFC 4648)", () => {
  it("kodiert den RFC-Schlüssel wie die Authenticator-Apps", () => {
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("hin und zurück für zufällige Längen", () => {
    for (let length = 0; length <= 40; length++) {
      const data = Buffer.from(Array.from({ length }, (_, index) => (index * 37 + length) % 256));
      expect(base32Decode(base32Encode(data))).toEqual(data);
    }
  });

  it("verzeiht Kleinschreibung, Leerzeichen, Bindestriche und Auffüllzeichen", () => {
    expect(base32Decode("gezd gnbv-gy3t qojq====")).toEqual(Buffer.from("1234567890"));
  });

  it("lehnt fremde Zeichen ab", () => {
    expect(base32Decode("GEZD1NBV")).toBeNull(); // 1 gehört nicht zum Alphabet
    expect(base32Decode("GEZD0NBV")).toBeNull();
  });

  it("neue Geheimnisse haben 160 Bit (32 Zeichen) und sind zufällig", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });
});

describe("Prüfen mit Zeitfenster ±1 Schritt", () => {
  const secret = base32Decode(generateTotpSecret())!;
  // Mitten in einem Zeitschritt, damit „jetzt“ eindeutig ist.
  const now = 1_800_000_015_000;
  const step = totpStep(now);
  const codeAt = (offsetSteps: number) => hotp(secret, step + offsetSteps);

  it("nimmt den aktuellen Code und je einen Schritt davor und danach an – mit dem passenden Zeitschritt", () => {
    expect(matchTotpStep(secret, codeAt(0), now)).toBe(step);
    expect(matchTotpStep(secret, codeAt(-1), now)).toBe(step - 1);
    expect(matchTotpStep(secret, codeAt(1), now)).toBe(step + 1);
  });

  it("lehnt zwei Schritte daneben ab", () => {
    expect(matchTotpStep(secret, codeAt(-2), now)).toBeNull();
    expect(matchTotpStep(secret, codeAt(2), now)).toBeNull();
  });

  it("Rand des Zeitschritts: letzte und erste Millisekunde", () => {
    const start = step * 30_000;
    expect(matchTotpStep(secret, codeAt(-1), start)).toBe(step - 1); // erste Millisekunde
    expect(matchTotpStep(secret, codeAt(-2), start + 29_999)).toBeNull(); // letzte Millisekunde
    expect(matchTotpStep(secret, codeAt(1), start + 29_999)).toBe(step + 1);
  });

  it("verzeiht Leerzeichen, lehnt andere Formate ab", () => {
    const code = codeAt(0);
    expect(matchTotpStep(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(step);
    expect(matchTotpStep(secret, code.slice(0, 5), now)).toBeNull();
    expect(matchTotpStep(secret, `${code}0`, now)).toBeNull();
    expect(matchTotpStep(secret, "abcdef", now)).toBeNull();
    expect(matchTotpStep(secret, "", now)).toBeNull();
  });

  it("ein anderes Geheimnis passt nicht", () => {
    const other = base32Decode(generateTotpSecret())!;
    expect(matchTotpStep(other, codeAt(0), now)).toBeNull();
  });
});

describe("Adresse für den QR-Code", () => {
  it("hat das Format der Authenticator-Apps", () => {
    expect(otpauthUrl("anna.admin@example.org", "JBSWY3DPEHPK3PXP")).toBe(
      "otpauth://totp/VereinsFlow:anna.admin%40example.org?secret=JBSWY3DPEHPK3PXP&issuer=VereinsFlow&digits=6&period=30",
    );
  });

  it("Schlüssel zum Abtippen in Vierergruppen", () => {
    expect(formatTotpSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(formatTotpSecret("ABCDEF")).toBe("ABCD EF");
  });
});
