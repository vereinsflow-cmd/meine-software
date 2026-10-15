import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOGIN_CHALLENGE_MINUTES,
  openLoginChallenge,
  sealLoginChallenge,
} from "@/server/auth/login-challenge";
import { sealSecret } from "@/server/security/secret-box";

// Cookie-Speicher von Next.js: hält fest, mit welchen Eigenschaften gesetzt und gelöscht wird.
const cookieCalls = vi.hoisted(() => ({
  set: [] as [string, string, Record<string, unknown>][],
  deleted: [] as Record<string, unknown>[],
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string, options: Record<string, unknown>) =>
      void cookieCalls.set.push([name, value, options]),
    delete: (options: Record<string, unknown>) => void cookieCalls.deleted.push(options),
  }),
}));

/**
 * Zwischenschritt der Zwei-Faktor-Anmeldung: Das Cookie hält nur „Passwort war richtig“ fest – verschlüsselt, 5 Minuten
 * gültig, nicht veränderbar und an das Passwort gebunden (Fingerabdruck des Hashs).
 */
describe("Zwischenschritt der Anmeldung (Cookie-Inhalt)", () => {
  const now = new Date("2026-10-14T10:00:00Z");
  const pwd = "0123456789abcdef0123456789abcdef";
  const challenge = (next: string | null) => ({ userId: "user-1", next, passwordFingerprint: pwd });

  it("hin und zurück mit Benutzer, Rücksprungziel und Passwort-Fingerabdruck; der Inhalt ist nicht lesbar", () => {
    const sealed = sealLoginChallenge(challenge("/veranstaltungen"), now);
    expect(sealed).not.toContain("user-1");
    expect(sealed).not.toContain("veranstaltungen");
    expect(sealed).not.toContain(pwd);
    expect(openLoginChallenge(sealed, now)).toEqual(challenge("/veranstaltungen"));
    expect(openLoginChallenge(sealLoginChallenge(challenge(null), now), now)).toEqual(
      challenge(null),
    );
  });

  it("ein Cookie ohne Passwort-Fingerabdruck (älteres Format) gilt nicht", () => {
    const old = sealSecret(
      JSON.stringify({ uid: "user-1", next: null, exp: now.getTime() + 60_000 }),
      "login-challenge:v1",
    );
    expect(openLoginChallenge(old, now)).toBeNull();
  });

  it(`gilt ${LOGIN_CHALLENGE_MINUTES} Minuten, danach nicht mehr`, () => {
    const sealed = sealLoginChallenge(challenge(null), now);
    const almost = new Date(now.getTime() + LOGIN_CHALLENGE_MINUTES * 60_000 - 1);
    const over = new Date(now.getTime() + LOGIN_CHALLENGE_MINUTES * 60_000);
    expect(openLoginChallenge(sealed, almost)).not.toBeNull();
    expect(openLoginChallenge(sealed, over)).toBeNull();
  });

  it("verändert, fremd verschlüsselt oder leer → nicht gültig", () => {
    const sealed = sealLoginChallenge(challenge(null), now);
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith("AA") ? "BB" : "AA"}`;
    expect(openLoginChallenge(tampered, now)).toBeNull();
    expect(openLoginChallenge(undefined, now)).toBeNull();
    expect(openLoginChallenge("", now)).toBeNull();
    expect(openLoginChallenge("x".repeat(5000), now)).toBeNull();
    // Gleicher Inhalt, aber mit einer anderen Zweckangabe verschlüsselt (z. B. ein Zwei-Faktor-Geheimnis) → passt nicht.
    const foreign = sealSecret(
      JSON.stringify({ uid: "user-1", next: null, exp: now.getTime() + 60_000 }),
      "totp:user-1",
    );
    expect(openLoginChallenge(foreign, now)).toBeNull();
  });

  it("unerwarteter Inhalt wird verworfen", () => {
    const wrongShape = sealSecret(JSON.stringify({ uid: 42, exp: "morgen" }), "login-challenge:v1");
    expect(openLoginChallenge(wrongShape, now)).toBeNull();
    const notJson = sealSecret("kein json", "login-challenge:v1");
    expect(openLoginChallenge(notJson, now)).toBeNull();
  });
});

describe("Zwischenschritt der Anmeldung (Cookie-Eigenschaften)", () => {
  const challenge = {
    userId: "user-1",
    next: null,
    passwordFingerprint: "0123456789abcdef0123456789abcdef",
  };

  afterEach(() => {
    cookieCalls.set.length = 0;
    cookieCalls.deleted.length = 0;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** Lädt Cookie-Name und Zwischenschritt neu – der Name hängt beim Laden von `NODE_ENV` ab. */
  async function load() {
    vi.resetModules();
    const { SECOND_FACTOR_COOKIE_NAME, SESSION_COOKIE_NAME } = await import("@/lib/session-cookie");
    const challengeModule = await import("@/server/auth/login-challenge");
    return { ...challengeModule, SECOND_FACTOR_COOKIE_NAME, SESSION_COOKIE_NAME };
  }

  it("HttpOnly, SameSite=Strict, Path=/ und 5 Minuten; gelöscht wird mit denselben Eigenschaften", async () => {
    const { startLoginChallenge, clearLoginChallenge, SECOND_FACTOR_COOKIE_NAME } = await load();

    await startLoginChallenge(challenge);
    expect(cookieCalls.set).toHaveLength(1);
    const [name, value, options] = cookieCalls.set[0]!;
    expect(name).toBe(SECOND_FACTOR_COOKIE_NAME);
    expect(value).toMatch(/^v1\./);
    expect(options).toEqual({
      httpOnly: true,
      secure: false, // lokal ohne HTTPS
      sameSite: "strict",
      path: "/",
      maxAge: 5 * 60,
    });
    expect(options).not.toHaveProperty("domain");
    expect(options).not.toHaveProperty("expires");

    await clearLoginChallenge();
    expect(cookieCalls.deleted).toEqual([
      {
        name: SECOND_FACTOR_COOKIE_NAME,
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path: "/",
      },
    ]);
  });

  it("in Produktion zusätzlich Secure und der Name mit __Host- (wie das Sitzungs-Cookie)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://verein.example");
    vi.stubEnv("MAIL_TRANSPORT", "smtp");
    // Lokal frei wählbar – in Produktion gilt immer der feste Name.
    vi.stubEnv("SESSION_COOKIE_NAME", "vf_session_vorschau");
    const {
      startLoginChallenge,
      clearLoginChallenge,
      SECOND_FACTOR_COOKIE_NAME,
      SESSION_COOKIE_NAME,
    } = await load();
    expect(SESSION_COOKIE_NAME).toBe("__Host-vf_session");
    expect(SECOND_FACTOR_COOKIE_NAME).toBe("__Host-vf_session_2fa");

    await startLoginChallenge(challenge);
    const [name, , options] = cookieCalls.set[0]!;
    expect(name).toBe("__Host-vf_session_2fa");
    // `__Host-` verlangt Secure und Path=/ und verbietet Domain – sonst verwirft der Browser das Cookie.
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 5 * 60,
    });
    expect(options).not.toHaveProperty("domain");

    await clearLoginChallenge();
    expect(cookieCalls.deleted).toEqual([
      {
        name: "__Host-vf_session_2fa",
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
      },
    ]);
  });
});
