import { LoginStage } from "@/modules/auth/components/login-stage";

/**
 * Anmelden, zweiter Schritt (Code), Passwort vergessen und neues Passwort: alle auf derselben Kinobühne über den ganzen
 * Bildschirm (`LoginStage`, siehe docs/DESIGN.md „Anmeldeseiten als Kinobühne“). Als Layout bleibt die Bühne beim Wechsel
 * zwischen diesen Seiten stehen und dreht weiter; jede Seite liefert nur den Inhalt der Glasfläche (`StageCard`).
 * Registrierung, Einladung, Beitritt, Ersteinrichtung und „Kein Verein“ bleiben im schmalen Rahmen von `(auth)`.
 *
 * Prüfungen (angemeldet? Ersteinrichtung offen? Zwischenstand des Codes?) stehen in den Seiten selbst – ein Layout wird beim
 * Seitenwechsel nicht neu ausgeführt.
 */
export default function StageLayout({ children }: { children: React.ReactNode }) {
  return <LoginStage>{children}</LoginStage>;
}
