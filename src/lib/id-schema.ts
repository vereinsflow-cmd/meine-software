import { z } from "zod";

/**
 * Datensatz-IDs in Eingaben – eine Regel für alle Bereiche (Browser und Server, ohne Server-Code). Eine ID ist nie leer
 * und höchstens 64 Zeichen lang; ob es den Datensatz gibt und ob er zum aktiven Verein gehört, prüft erst der Dienst.
 *
 * Es gibt bewusst ZWEI Varianten, weil die Bereiche Leerraum unterschiedlich behandeln – sie zusammenzulegen würde das
 * Verhalten ändern:
 *  - `idString` nimmt die ID unverändert. So prüfen Mitglieder, Veranstaltungen, Schichten, Aufgaben usw.: Die IDs
 *    kommen dort aus der Oberfläche, Leerraum bleibt Teil der ID (eine solche gibt es nicht – „nicht gefunden“).
 *  - `trimmedIdString` schneidet vorher Leerraum ab – wie alle übrigen Felder der Beitrags- und Kassenbuch-Schemas.
 *    „ abc “ wird dort zu „abc“, ein reines „   “ ist leer und damit ungültig.
 */
export const idString = z.string().min(1).max(64);
export const trimmedIdString = z.string().trim().min(1).max(64);

/**
 * Freiwillige Auswahl (z. B. „Abteilung: keine“): leer oder fehlend wird `undefined`, sonst höchstens 64 Zeichen. Die
 * Variante mit `trimmed` schneidet wie oben vorher Leerraum ab („ “ wird dort `undefined`).
 */
export const optionalIdString = z
  .string()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));
export const trimmedOptionalIdString = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));

/** `{ id }` – das häufigste Eingabe-Schema der Server Actions (Löschen, Archivieren, Freigeben …). */
export const idSchema = z.object({ id: idString });
