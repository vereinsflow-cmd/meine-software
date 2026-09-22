/**
 * Reine Hilfsfunktionen für Druckansichten – ohne UI, einzeln testbar. Aktuell für den Helferplan-Ausdruck
 * (`(app)/helferplanung/drucken`), bei Bedarf für weitere Druckansichten wiederverwendbar.
 */

/** Ausrichtung der gedruckten Seite. */
export type PrintOrientation = "hoch" | "quer";

/**
 * Entschärft einen Text für den Gebrauch als CSS-String-Literal (`content: "…"`): Anführungszeichen und Rückwärts-
 * schrägstriche werden escaped, Zeilenumbrüche zu Leerzeichen geglättet (Kopf-/Fußzeilen sind einzeilig).
 */
export function cssString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ");
}

/**
 * Baut die `@page`-Regel für den Ausdruck: Papierformat samt Ausrichtung, Ränder, und eine wiederkehrende Kopf-/
 * Fußzeile (Vereinsname, Dokumenttitel, Erstellungsdatum, Seitenzahlen) auf **jeder** gedruckten Seite – nicht nur
 * auf der ersten. Reine CSS-Seitenränder (`@top-left` usw.) statt eines HTML-Kopfs, weil sie sich beim Drucken auf
 * jeder Seite wiederholen; ein normaler HTML-Kopf stünde nur auf der ersten Seite.
 */
export function buildPrintPageStyle(options: {
  clubName: string;
  documentTitle: string;
  /** Bereits formatiert, z. B. „22.09.2026, 14:32 Uhr“. */
  generatedAtLabel: string;
  orientation: PrintOrientation;
}): string {
  const size = options.orientation === "quer" ? "A4 landscape" : "A4 portrait";
  const club = cssString(options.clubName);
  const title = cssString(options.documentTitle);
  const created = cssString(options.generatedAtLabel);
  return `@page {
  size: ${size};
  margin: 20mm 14mm 16mm 14mm;
  @top-left { content: "${club}"; font-size: 9pt; color: #444444; }
  @top-right { content: "${title}"; font-size: 9pt; color: #444444; }
  @bottom-left { content: "Erstellt am ${created}"; font-size: 8pt; color: #666666; }
  @bottom-right { content: "Seite " counter(page) " von " counter(pages); font-size: 8pt; color: #666666; }
}`;
}
