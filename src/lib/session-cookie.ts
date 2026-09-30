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
