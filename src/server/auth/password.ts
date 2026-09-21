import "server-only";
import { hash, verify } from "@node-rs/argon2";

/**
 * Passwort-Hashing mit Argon2id (Standard-Algorithmus von @node-rs/argon2).
 * Parameter nach OWASP-Empfehlung (Minimum): 19 MiB Speicher, 2 Iterationen, 1 Thread.
 * Das Salz wird pro Hash zufällig erzeugt und im Hash-String mitgespeichert.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Gibt bei jedem Fehler (defekter Hash, falsches Passwort) `false` zurück – wirft nie. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Führt eine Passwortprüfung gegen einen Platzhalter-Hash aus. Wird aufgerufen, wenn es das
 * Benutzerkonto nicht gibt – so dauert die Antwort gleich lang wie bei einem falschen Passwort
 * und verrät nicht, ob eine E-Mail-Adresse registriert ist (Schutz vor Benutzer-Enumeration).
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("platzhalter-fuer-konstante-antwortzeit");
  await verifyPassword(await dummyHash, password);
}
