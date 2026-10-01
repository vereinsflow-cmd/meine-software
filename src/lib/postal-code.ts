/*
 * „Ort automatisch ergänzen“ zur Postleitzahl – die Entscheidung, was mit dem Feld „Ort“ geschieht, gemeinsam für
 * Browser und Tests. Die Orte liefert `/api/postleitzahlen/<PLZ>` (Daten: `server/geo/postal-codes.ts`).
 */

/** Deutsche Postleitzahl: genau fünf Ziffern (führende Null möglich, z. B. 01067). */
export const isGermanPostalCode = (value: string | null | undefined): value is string =>
  typeof value === "string" && /^\d{5}$/.test(value.trim());

export interface CityDecision {
  /** Dieser Ort wird eingetragen (genau ein Ort zur Postleitzahl, Feld leer oder zuvor automatisch gefüllt). */
  fill: string | null;
  /** Den zuvor automatisch eingetragenen Ort wieder entfernen – er passt nicht zur neuen Postleitzahl. */
  clear: boolean;
}

/**
 * Was jemand selbst ins Feld „Ort“ geschrieben hat, wird nie überschrieben. Ersetzt wird nur ein leeres Feld oder ein
 * Ort, den die App selbst eingetragen hat (`autoFilled`) – etwa nachdem die Postleitzahl korrigiert wurde. Passt der
 * selbst eingetragene Ort nicht mehr (mehrere oder keine Orte zur neuen Postleitzahl), wird er wieder entfernt.
 */
export function decideCity(
  places: readonly string[],
  city: string | null | undefined,
  autoFilled: string | null,
): CityDecision {
  const current = (city ?? "").trim();
  const ours = current !== "" && current === autoFilled;
  if (current !== "" && !ours) return { fill: null, clear: false };
  if (places.length === 1) return { fill: places[0] === current ? null : places[0]!, clear: false };
  return { fill: null, clear: ours && !places.includes(current) };
}

/** Auswahl bei mehreren Orten – solange das Feld „Ort“ leer ist. */
export const cityChoices = (
  places: readonly string[],
  city: string | null | undefined,
): string[] => (places.length > 1 && (city ?? "").trim() === "" ? [...places] : []);
