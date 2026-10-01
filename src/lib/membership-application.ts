import { clubLogoVersion } from "./club-logo";

/**
 * Mitglied werden per QR-Code – Werte, die Server und Oberfläche gemeinsam brauchen (reine Werte ohne Server-Code;
 * Formular-Schemas laufen im Browser).
 */

/** Adresse der öffentlichen Antragsseite zu einem Beitrittslink (ohne Anmeldung erreichbar). */
export const joinPath = (token: string): string => `/beitreten/${token}`;

/**
 * Logo auf der öffentlichen Beitrittsseite: eigene Adresse unter dem Beitrittslink, weil Besucher nicht angemeldet sind
 * (die normale Logo-Adresse liefert nur an Mitglieder). `null` ohne Logo – dann erscheinen die Anfangsbuchstaben.
 */
export const joinLogoUrl = (token: string, logoSha256: string | null): string | null =>
  logoSha256 ? `/api/beitreten/${token}/logo?v=${clubLogoVersion(logoSha256)}` : null;

/**
 * Entschiedene Anträge (angenommen oder abgelehnt) werden so viele Tage nach der Entscheidung gelöscht. So lange stehen
 * sie auch unter „Zuletzt entschieden“ – danach genügt das Mitglied selbst bzw. das Änderungsprotokoll (ohne Namen).
 */
export const APPLICATION_DECIDED_RETENTION_DAYS = 30;

/** Nie entschiedene Anträge werden nach so vielen Tagen gelöscht (Speicherbegrenzung – niemand wartet ein halbes Jahr). */
export const APPLICATION_PENDING_RETENTION_DAYS = 180;

/** Höchstlängen der freien Felder (dieselben Grenzen prüft die Datenbank). */
export const APPLICATION_LIMITS = { name: 80, email: 254, phone: 40, message: 1000 } as const;

/** Text des Pflicht-Kästchens – steht so im Formular und als Nachweis in der Doku. */
export const APPLICATION_CONSENT_TEXT =
  "Ich bin einverstanden, dass der Verein meine Angaben speichert, um meinen Antrag zu bearbeiten.";

/**
 * Fassung von {@link APPLICATION_CONSENT_TEXT}. Sie wird mit dem Zeitpunkt am Antrag gespeichert, damit sich auch nach einer
 * Änderung des Kästchens belegen lässt, welchem Text die Person zugestimmt hat (Art. 7 Abs. 1 DSGVO). Bei JEDER Änderung
 * des Texts eine neue Fassung vergeben. Bewusst getrennt von der Version der Plattform-Bedingungen (`TERMS_VERSION`): Das
 * Kästchen deckt nur die Bearbeitung des Antrags ab, nicht die Datenverarbeitung der Mitgliedschaft.
 */
export const APPLICATION_CONSENT_VERSION = "beitrittsantrag-2026-09";

export const INVALID_JOIN_LINK_TEXT =
  "Dieser Link ist nicht (mehr) gültig. Bitte frag im Verein nach dem aktuellen QR-Code.";

/** Höchstzahl der Anmeldungen, die ein QR-Code zulassen kann (Prüfregel `Club_join_limit_chk`). */
export const JOIN_LIMIT_MAX = 5000;

export const JOIN_LINK_FULL_TEXT =
  "Über diesen QR-Code sind schon alle Plätze vergeben. Bitte sprich den Verein direkt an.";

/** „12 von 50 Plätzen genutzt“ – Stand eines begrenzten QR-Codes. */
export interface JoinCapacity {
  /** Leer = unbegrenzt (QR-Code von vor der Begrenzung). */
  limit: number | null;
  used: number;
}

export const isJoinLinkFull = ({ limit, used }: JoinCapacity): boolean =>
  limit !== null && used >= limit;

export const APPLICATION_STATUS_LABEL = {
  PENDING: "Offen",
  ACCEPTED: "Angenommen",
  REJECTED: "Abgelehnt",
} as const;
