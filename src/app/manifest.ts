import type { MetadataRoute } from "next";

/**
 * Web-App-Manifest: Name, Symbol und Darstellung, wenn jemand VereinsFlow installiert – auf Android über „App installieren“
 * bzw. als Android-App (Trusted Web Activity, lädt dieselbe Adresse), auf iPhone und iPad über „Zum Home-Bildschirm“ (das Symbol
 * dort ist `apple-icon.png`). Die Symbole erzeugt docs/brand/generate-app-icons.mjs.
 *
 * `display: "standalone"`: Vom Startbildschirm geöffnet, läuft VereinsFlow in einem eigenen Fenster ohne Adresszeile – wie eine
 * App. Das verlangt auch das iPhone für Web-Push (ab iOS 16.4 nur für Web-Apps auf dem Home-Bildschirm). Den Zurück-Knopf des
 * Browsers braucht es dort nicht: Detail- und Formularseiten haben ihren eigenen Zurück-Link (`BackLink`), auf Android kommt die
 * Zurück-Geste bzw. -Taste des Systems dazu. Im normalen Browser-Tab ändert sich nichts.
 *
 * `start_url: "/"`: Die Startseite leitet selbst weiter – angemeldet zum Dashboard, sonst zur Anmeldung (ohne `?next=`). So öffnet
 * das Symbol immer die passende Seite, auch nach Ablauf der Sitzung. `id` und `scope` stehen fest auf „/“: Die Kennung der App
 * bleibt gleich, selbst wenn sich die Startadresse einmal ändert (sonst hielte der Browser sie für eine neue App), und alle Seiten
 * der Anwendung gehören zur App.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "VereinsFlow",
    short_name: "VereinsFlow",
    description: "Vereinsverwaltung für Mitglieder, Veranstaltungen und Helferplanung.",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
