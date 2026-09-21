import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { recordSystemAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { generateToken, hashToken } from "@/server/security/tokens";

/**
 * Erster Plattform-Administrator einer neuen Installation.
 *
 * VereinsFlow ist eine geschlossene Plattform: Konten entstehen nur durch die Einladung eines Vereins, und Vereine legt ein
 * Plattform-Administrator an. Für den allerersten gibt es niemanden, der einladen könnte – deshalb legt der Betreiber ihn auf dem
 * Server an (`npm run admin:create`, siehe docs/OPERATIONS.md).
 *
 * Sicherheit:
 *  - Das Konto bekommt ein zufälliges, nie bekanntes Passwort; anmelden kann man sich erst, nachdem man über den Einrichtungslink
 *    ein eigenes festgelegt hat. Der Link ist ein gewöhnlicher Passwort-Reset-Link (einmalig, {@link SETUP_LINK_HOURS} Stunden gültig,
 *    in der Datenbank nur als Hash) – er wird NICHT per E-Mail versendet, damit die Einrichtung auch vor dem Mailserver klappt.
 *  - Ein bestehendes Konto ohne Plattform-Rechte wird nie stillschweigend hochgestuft.
 */
export const SETUP_LINK_HOURS = 24;

const inputSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse an."))
    .transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1, "Der Vorname fehlt.").max(100),
  lastName: z.string().trim().min(1, "Der Nachname fehlt.").max(100),
});

export type PlatformAdminInput = z.input<typeof inputSchema>;

export interface PlatformAdminResult {
  userId: string;
  /** `true` = neues Konto, `false` = bestehender Plattform-Administrator (neuer Link). */
  created: boolean;
  /** Link zum Festlegen des Passworts – nur jetzt sichtbar (die Datenbank kennt nur den Hash). */
  setPasswordUrl: string;
  expiresAt: Date;
}

export async function createPlatformAdmin(
  input: PlatformAdminInput,
  now: Date = new Date(),
): Promise<PlatformAdminResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  const { email, firstName, lastName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && (existing.deletedAt || existing.disabledAt)) {
    throw new Error("Für diese Adresse gibt es ein deaktiviertes oder gelöschtes Konto.");
  }
  if (existing && !existing.isPlatformAdmin) {
    throw new Error(
      "Für diese Adresse gibt es bereits ein Konto ohne Plattform-Rechte. Aus Sicherheitsgründen wird es nicht automatisch hochgestuft – nimm eine andere Adresse.",
    );
  }

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        isPlatformAdmin: true,
      },
    }));

  const token = generateToken(32);
  const expiresAt = new Date(now.getTime() + SETUP_LINK_HOURS * 3_600_000);
  await prisma.$transaction([
    // Es gibt immer nur einen gültigen Link.
    prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
    }),
    prisma.verificationToken.create({
      data: { userId: user.id, type: "PASSWORD_RESET", tokenHash: hashToken(token), expiresAt },
    }),
  ]);

  await recordSystemAudit({
    actorType: "SYSTEM",
    action: "platform.admin_created",
    entityType: "User",
    entityId: user.id,
    summary: existing
      ? "Einrichtungslink für Plattform-Administrator erzeugt"
      : "Plattform-Administrator angelegt",
  });

  return {
    userId: user.id,
    created: !existing,
    setPasswordUrl: `${env.APP_URL}/passwort-zuruecksetzen?token=${token}`,
    expiresAt,
  };
}
