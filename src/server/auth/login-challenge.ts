import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { SECOND_FACTOR_COOKIE_NAME } from "@/lib/session-cookie";
import { env } from "@/server/env";
import { openSecret, sealSecret } from "@/server/security/secret-box";

/**
 * Zwischenschritt der Anmeldung mit Zwei-Faktor: Das Passwort war richtig, der Code aus der App fehlt noch.
 *
 * Festgehalten wird das in einem kurzlebigen Cookie statt in der Datenbank:
 *  - Inhalt `{ uid, next, pwd, exp }`, mit AES-256-GCM verschlüsselt und damit auch gegen Veränderung geschützt (eigene AAD,
 *    ein anderes verschlüsseltes Feld der Anwendung passt hier nie). Wer das Cookie nicht hat, kommt nicht zur Code-Eingabe.
 *  - 5 Minuten gültig (geprüft wird der Zeitpunkt im Inhalt, nicht nur das Ablaufdatum des Browsers).
 *  - An das Passwort gebunden (`pwd`, Fingerabdruck des Passwort-Hashs, siehe `passwordFingerprint`): Ändert die Person ihr
 *    Passwort oder setzt es zurück, endet jede offene Code-Eingabe sofort – auch ein kopiertes Cookie.
 *  - `HttpOnly`, `SameSite=Strict`, in Produktion `Secure` und `__Host-` (wie das Sitzungs-Cookie).
 *  - Es ist KEINE Anmeldung: Eine Sitzung entsteht erst nach dem richtigen Code. Brute-Force bremsen die Zähler in
 *    `two-factor.ts` (je Konto und IP), nicht dieses Cookie.
 */
export const LOGIN_CHALLENGE_MINUTES = 5;
const AAD = "login-challenge:v1";

const payloadSchema = z.object({
  uid: z.string().min(1).max(64),
  next: z.string().max(2000).nullable(),
  pwd: z.string().length(32),
  exp: z.number().int(),
});

export interface LoginChallenge {
  userId: string;
  next: string | null;
  /** Fingerabdruck des Passwort-Hashs beim ersten Schritt (`passwordFingerprint` in `service.ts`). */
  passwordFingerprint: string;
}

export function sealLoginChallenge(challenge: LoginChallenge, now = new Date()): string {
  return sealSecret(
    JSON.stringify({
      uid: challenge.userId,
      next: challenge.next,
      pwd: challenge.passwordFingerprint,
      exp: now.getTime() + LOGIN_CHALLENGE_MINUTES * 60_000,
    }),
    AAD,
  );
}

/** Liest den Inhalt eines Cookies; verändert, fremd oder abgelaufen → `null`. */
export function openLoginChallenge(
  value: string | undefined,
  now = new Date(),
): LoginChallenge | null {
  if (!value || value.length > 4096) return null;
  const plaintext = openSecret(value, AAD);
  if (!plaintext) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }
  const result = payloadSchema.safeParse(parsed);
  if (!result.success || result.data.exp <= now.getTime()) return null;
  return {
    userId: result.data.uid,
    next: result.data.next,
    passwordFingerprint: result.data.pwd,
  };
}

const cookieOptions = () =>
  ({
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  }) as const;

/** Nur in Server Actions/Route Handlern aufrufen. */
export async function startLoginChallenge(challenge: LoginChallenge): Promise<void> {
  const store = await cookies();
  store.set(SECOND_FACTOR_COOKIE_NAME, sealLoginChallenge(challenge), {
    ...cookieOptions(),
    maxAge: LOGIN_CHALLENGE_MINUTES * 60,
  });
}

export async function readLoginChallenge(): Promise<LoginChallenge | null> {
  const store = await cookies();
  return openLoginChallenge(store.get(SECOND_FACTOR_COOKIE_NAME)?.value);
}

/** Löscht das Cookie – mit denselben Eigenschaften wie beim Setzen (ein `__Host-`-Cookie verlangt `Secure` und `Path=/`). */
export async function clearLoginChallenge(): Promise<void> {
  const store = await cookies();
  store.delete({ name: SECOND_FACTOR_COOKIE_NAME, ...cookieOptions() });
}
