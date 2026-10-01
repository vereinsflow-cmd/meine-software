import "server-only";
import { isGermanPostalCode } from "@/lib/postal-code";
import table from "./postal-codes-de.json";

/*
 * Deutsche Postleitzahlen → Orte, für „Ort automatisch ergänzen“ in Adressformularen. Liegt der Anwendung bei – keine
 * Anfrage an fremde Dienste, funktioniert auch ohne Internet.
 *
 * Quelle: GeoNames (https://www.geonames.org), CC BY 4.0 – bereinigt und erzeugt mit `scripts/build-postal-codes.mjs`
 * (dort auch, wie Großkunden und Ortsteile herausgefiltert werden). Aktualisieren: das Skript erneut ausführen.
 */
const PLACES = table as Record<string, string[]>;

export function placesForPostalCode(postalCode: string): string[] {
  const code = postalCode.trim();
  return isGermanPostalCode(code) ? (PLACES[code] ?? []) : [];
}
