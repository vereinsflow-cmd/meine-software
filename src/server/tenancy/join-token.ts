import "server-only";
import { prisma } from "@/server/db/client";
import { createTenantDb, type TenantDb } from "@/server/db/tenant";

/** Länge eines Schlüssels aus 32 zufälligen Bytes in base64url (ohne Auffüllung) – wie die Prüfregel der Datenbank. */
export const JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Bezug einer Anfrage auf der öffentlichen Beitrittsseite: der Verein hinter einem gültigen Beitrittslink und ein auf
 * diesen Verein begrenzter Datenbankzugriff. Es gibt dabei KEINEN Benutzer und keine Rechte – wer den Link kennt, darf
 * nur den Vereinsnamen, das Logo und die Abteilungen sehen und einen Antrag einreichen (siehe
 * `modules/membership-applications/service.ts`).
 */
export interface JoinContext {
  clubId: string;
  club: { name: string; logoSha256: string | null };
  /** Mandantengebundener Client – dieselbe Absicherung wie `ctx.db` angemeldeter Benutzer. */
  db: TenantDb;
}

/**
 * Löst einen Beitrittslink auf. `null` bei jedem Problem – unbekannt, erneuert, geschlossen oder Verein deaktiviert –,
 * damit die Seite nicht verrät, ob es einen Link je gab. Das Format wird vor jedem Datenbankzugriff geprüft.
 */
export async function resolveJoinToken(token: string): Promise<JoinContext | null> {
  if (!JOIN_TOKEN_PATTERN.test(token)) return null;
  const club = await prisma.club.findUnique({
    where: { joinToken: token },
    select: { id: true, name: true, status: true, logoSha256: true },
  });
  if (!club || club.status !== "ACTIVE") return null;
  return {
    clubId: club.id,
    club: { name: club.name, logoSha256: club.logoSha256 },
    db: createTenantDb(club.id),
  };
}
