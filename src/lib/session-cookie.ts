/**
 * Name des Sitzungs-Cookies. In Produktion mit dem Präfix `__Host-`: Der Browser akzeptiert das
 * Cookie dann nur über HTTPS, mit `Path=/` und ohne Domain-Attribut – es lässt sich nicht von
 * Subdomains überschreiben.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-vf_session"
    : // Zwei lokale Versionen (Vorschau auf :3000, leere auf :3001) teilen sich sonst das Cookie – der Browser trennt
      // Cookies nicht nach Port, eine Anmeldung würde die andere beenden.
      process.env.SESSION_COOKIE_NAME || "vf_session";

/**
 * Cookie für den zweiten Schritt der Anmeldung (Zwei-Faktor-Code): Es hält nur für 5 Minuten fest, wer das Passwort schon
 * richtig eingegeben hat – verschlüsselt, `HttpOnly`, `SameSite=Strict`. Der Name folgt dem Sitzungs-Cookie (in Produktion
 * mit `__Host-`, lokal je Version getrennt).
 */
export const SECOND_FACTOR_COOKIE_NAME = `${SESSION_COOKIE_NAME}_2fa`;
