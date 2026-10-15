import { createHmac } from "node:crypto";

/**
 * Eine „Authenticator-App“ für die E2E-Tests: rechnet Einmalcodes nach RFC 6238 (HMAC-SHA1, 6 Ziffern, 30 Sekunden) –
 * bewusst unabhängig vom Code der Anwendung, damit der Test zeigt, dass echte Apps mit dem Schlüssel zurechtkommen.
 *
 * Der Server nimmt den aktuellen Zeitschritt ±1 an, jeden Schritt aber nur einmal und nur, wenn er später liegt als der
 * zuletzt angenommene. {@link TestAuthenticator.freshCode} liefert deshalb immer einen noch nicht benutzten Code und wartet
 * nötigenfalls, bis der nächste Zeitschritt nah genug ist (höchstens 30 Sekunden).
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/[\s=]/g, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`Kein Base32-Zeichen: ${char}`);
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

const currentStep = () => Math.floor(Date.now() / 30_000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class TestAuthenticator {
  private readonly key: Buffer;
  private lastStep = -1;

  /** `secret`: der Schlüssel zum Abtippen von der Profilseite (Leerzeichen egal). */
  constructor(secret: string) {
    this.key = base32Decode(secret);
  }

  /** Ein Code, den der Server jetzt annimmt und der noch nie benutzt wurde. */
  async freshCode(): Promise<string> {
    const step = Math.max(this.lastStep + 1, currentStep());
    while (step > currentStep() + 1) await sleep(500);
    this.lastStep = step;
    return hotp(this.key, step);
  }

  /** Ein Code, der sicher falsch ist (passt zu keinem Zeitschritt rund um jetzt). */
  wrongCode(): string {
    const now = currentStep();
    const valid = new Set([-2, -1, 0, 1, 2].map((offset) => hotp(this.key, now + offset)));
    let candidate = 314159;
    while (valid.has(String(candidate))) candidate += 1;
    return String(candidate);
  }
}
