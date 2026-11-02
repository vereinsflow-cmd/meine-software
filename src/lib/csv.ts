import Papa from "papaparse";

/**
 * CSV-Import und -Export.
 *
 * Export: Zellen, die mit `=`, `+`, `-`, `@`, Tab oder Wagenrücklauf beginnen, würden Excel und
 * LibreOffice als FORMEL ausführen ("CSV-Injection", z. B. `=HYPERLINK(...)` zum Datenabfluss).
 * Papaparse stellt solchen Zellen deshalb ein Hochkomma voran (`escapeFormulae`).
 * Import: Ein solches Hochkomma wird wieder abgenommen – die eigene Exportdatei lässt sich unverändert einlesen.
 * Excel-Standard für Deutschland: Semikolon als Trennzeichen und UTF-8 mit BOM.
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

const BOM = "﻿";

/**
 * Anfangszeichen einer Formel. Eigene Prüfung statt `escapeFormulae: true`: Papaparse prüft dort mit
 * `/^[=+\-@\t\r].*$/`, und weil „.“ keinen Zeilenumbruch trifft, blieb z. B. „=HYPERLINK(…)\n…“ ungeschützt.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
/** Hochkomma des Formelschutzes (Umkehrung von `FORMULA_START` beim Import). */
const ESCAPED_FORMULA = /^'(?=[=+\-@\t\r])/;

function cellToString(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const data = [header, ...rows.map((row) => row.map(cellToString))];
  return (
    BOM +
    Papa.unparse(data as string[][], {
      delimiter: ";",
      newline: "\r\n",
      escapeFormulae: FORMULA_START,
    })
  );
}

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  /** Zeilennummer in der Datei je Eintrag in `rows` (Leerzeilen und Zeilenumbrüche in Zellen mitgezählt). */
  lines: number[];
}

export class CsvError extends Error {}

export const CSV_MAX_BYTES = 1_000_000;
export const CSV_MAX_ROWS = 2000;

const countOf = (text: string, part: string) => text.split(part).length - 1;

/** Liest CSV-Text (Trennzeichen wird erkannt: Semikolon, Komma oder Tab). */
export function parseCsv(text: string): ParsedCsv {
  if (text.length > CSV_MAX_BYTES) {
    throw new CsvError("Die Datei ist zu groß (höchstens 1 MB).");
  }
  const clean = text.replace(/^﻿/, "");
  const data: string[][] = [];
  const lines: number[] = [];
  const errors: Papa.ParseError[] = [];
  let cursor = 0; // Ende der vorigen Zeile in `clean`
  let line = 1; // Zeilennummer an `cursor`
  Papa.parse<string[]>(clean, {
    delimitersToGuess: [";", ",", "\t"],
    skipEmptyLines: "greedy",
    // Zeile für Zeile, damit die Zeilennummer in der Datei bekannt ist: Übersprungene Leerzeilen und Zeilenumbrüche in
    // Zellen verschieben sie gegenüber der Position in `data`.
    step: ({ data: row, errors: rowErrors, meta }) => {
      const lineBreak = meta.linebreak === "\r" ? "\r" : "\n";
      const raw = clean.slice(cursor, meta.cursor); // übersprungene Leerzeilen + diese Zeile samt Umbruch
      const breaks = countOf(raw, lineBreak);
      const lastLine = line + breaks - (raw.endsWith(lineBreak) ? 1 : 0);
      data.push(row);
      lines.push(lastLine - row.reduce((sum, cell) => sum + countOf(cell, lineBreak), 0));
      errors.push(...rowErrors);
      line += breaks;
      cursor = meta.cursor;
    },
  });
  // Ohne eine einzige Zeile (im Zeilenmodus meldet Papaparse dann auch kein „Delimiter“) ist es keine CSV-Datei.
  if (data.length === 0 || errors.some((error) => error.type === "Quotes"))
    throw new CsvError("Die Datei ist keine gültige CSV-Datei.");

  const [rawHeader, ...rows] = data;
  if (!rawHeader || rawHeader.length === 0)
    throw new CsvError("Die Datei enthält keine Kopfzeile.");
  if (rows.length > CSV_MAX_ROWS) {
    throw new CsvError(`Die Datei enthält zu viele Zeilen (höchstens ${CSV_MAX_ROWS}).`);
  }
  return {
    header: rawHeader.map((cell) => cell.trim()),
    rows: rows.map((row) => row.map((cell) => cell.replace(ESCAPED_FORMULA, ""))),
    lines: lines.slice(1),
  };
}

/** Vereinheitlicht Spaltennamen: klein, ohne Umlaute, Leer- und Sonderzeichen ("E-Mail" → "email"). */
export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}
