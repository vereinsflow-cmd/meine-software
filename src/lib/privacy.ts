/**
 * Datenschutz-Konstanten, die Server und Oberfläche gemeinsam brauchen (reine Werte, keine Abhängigkeiten).
 */

/** Bedenkzeit in Tagen zwischen Löschantrag und automatischer Ausführung. Der Antrag ist bis dahin jederzeit widerrufbar. */
export const DELETION_GRACE_DAYS = 14;

/**
 * Einwilligungen, die Mitglieder selbst erteilen und widerrufen können (freiwillige). Bewusst HIER und nicht im
 * Fachmodul: Formular-Schemas laufen im Browser und dürfen keinen Server-Code (Datenbank) nachziehen.
 */
export const SELF_SERVICE_CONSENTS = ["NEWSLETTER", "PHOTO_PUBLICATION"] as const;
export type SelfServiceConsent = (typeof SELF_SERVICE_CONSENTS)[number];
