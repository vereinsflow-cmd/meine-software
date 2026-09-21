import { z } from "zod";

/**
 * Läuft im Browser, bevor die Anwendung startet (Next.js: instrumentation-client).
 *
 * Zod übersetzt Schemas standardmäßig zur Laufzeit in schnellen Code (`new Function`) und prüft vorab, ob das erlaubt ist.
 * Die strenge Content-Security-Policy (kein `unsafe-eval`, siehe src/proxy.ts) verbietet das – der Versuch würde bei jeder
 * Seite als Verstoß gemeldet und in der Konsole als Fehler erscheinen. Im Browser genügt der normale Prüfweg; auf dem Server
 * (ohne diese Einschränkung) bleibt die schnelle Variante aktiv.
 */
z.config({ jitless: true });
