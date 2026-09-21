/**
 * Wird einmal beim Start des Servers ausgeführt (nicht beim Bauen, nicht je Anfrage).
 *
 * Prüft die Konfiguration sofort: Eine unsichere Produktionskonfiguration oder fehlende Pflichtwerte verhindern den
 * Start – statt erst bei der ersten Anfrage aufzufallen oder, schlimmer, unbemerkt mit unsicheren Werten zu laufen.
 * Die eigentliche Prüfung liegt in einer eigenen Datei, weil sie Node.js-Funktionen nutzt (nicht für die Edge-Laufzeit).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateConfigurationOrExit } = await import("./instrumentation-node");
  validateConfigurationOrExit();
}
