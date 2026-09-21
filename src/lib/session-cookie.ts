/**
 * Name des Sitzungs-Cookies. In Produktion mit dem Präfix `__Host-`: Der Browser akzeptiert das
 * Cookie dann nur über HTTPS, mit `Path=/` und ohne Domain-Attribut – es lässt sich nicht von
 * Subdomains überschreiben.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-vf_session" : "vf_session";
