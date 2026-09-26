import type { MetadataRoute } from "next";

/**
 * Web-App-Manifest: Name und Symbol, wenn jemand VereinsFlow auf dem Smartphone zum Startbildschirm hinzufügt
 * (Android/Chrome; iPhone und iPad nehmen `apple-icon.png`). Die Symbole erzeugt docs/brand/generate-app-icons.mjs.
 *
 * `display: "browser"`: Das Symbol öffnet VereinsFlow wie gewohnt im Browser. Eine eigenständige App-Ansicht („standalone“)
 * wäre eine eigene Entscheidung – dort fehlen z. B. Adresszeile und Zurück-Knopf des Browsers.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VereinsFlow",
    short_name: "VereinsFlow",
    description: "Vereinsverwaltung für Mitglieder, Veranstaltungen und Helferplanung.",
    lang: "de",
    start_url: "/",
    display: "browser",
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
