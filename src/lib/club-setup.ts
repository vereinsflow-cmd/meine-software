/*
 * Einrichtung eines neuen Vereins (Assistent „Verein einrichten“) – gemeinsam für Server und Browser.
 *
 * Bis zum Abschluss arbeitet, wer den Verein verwaltet, nur im Assistenten: kein Menü, keine anderen Bereiche. Zuerst
 * sind die Pflichtangaben dran (Anschrift und Kontakt stehen in der Datenschutzerklärung, im Aushang zum Beitritt und in
 * E-Mails); danach sind zusätzlich die Seiten erreichbar, zu denen der Assistent selbst führt (Mitglieder anlegen,
 * importieren, per QR-Code aufnehmen; Zugänge und Rollen).
 */

export const SETUP_PATH = "/einrichtung";

/** Seiten, zu denen der Assistent führt – erreichbar, sobald die Pflichtangaben gespeichert sind. */
const SETUP_EXTRA_PATHS = ["/mitglieder", "/benutzer"];

export interface ClubRequiredData {
  contactEmail: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
}

/** Pflichtangaben vollständig: Kontakt-E-Mail und Anschrift (der Vereinsname ist ohnehin immer gesetzt). */
export const hasRequiredClubData = (club: ClubRequiredData): boolean =>
  Boolean(club.contactEmail && club.street && club.postalCode && club.city);

const isUnder = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

export function isAllowedDuringSetup(pathname: string, requiredDataDone: boolean): boolean {
  if (isUnder(pathname, SETUP_PATH)) return true;
  return requiredDataDone && SETUP_EXTRA_PATHS.some((base) => isUnder(pathname, base));
}
