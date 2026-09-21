import Papa from "papaparse";

/**
 * CSV-Import und -Export.
 *
 * Export: Zellen, die mit `=`, `+`, `-`, `@`, Tab oder Zeilenumbruch beginnen, würden Excel und
 * LibreOffice als FORMEL ausführen ("CSV-Injection", z. B. `=HYPERLINK(...)` zum Datenabfluss).
 * Papaparse stellt solchen Zellen deshalb ein Hochkomma voran (`escapeFormulae`).
 * Excel-Standard für Deutschland: Semikolon als Trennzeichen und UTF-8 mit BOM.
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

const BOM = "﻿";

function cellToString(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const data = [header, ...rows.map((row) => row.map(cellToString))];
  return (
    BOM +
    Papa.unparse(data as string[][], { delimiter: ";", newline: "\r\n", escapeFormulae: true })
  );
}

export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

export class CsvError extends Error {}

export const CSV_MAX_BYTES = 1_000_000;
export const CSV_MAX_ROWS = 2000;

/** Liest CSV-Text (Trennzeichen wird erkannt: Semikolon, Komma oder Tab). */
export function parseCsv(text: string): ParsedCsv {
  if (text.length > CSV_MAX_BYTES) {
    throw new CsvError("Die Datei ist zu groß (höchstens 1 MB).");
  }
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<string[]>(clean, {
    delimitersToGuess: [";", ",", "\t"],
    skipEmptyLines: "greedy",
  });
  const fatal = result.errors.find(
    (error) => error.type === "Quotes" || (error.type === "Delimiter" && result.data.length === 0),
  );
  if (fatal) throw new CsvError("Die Datei ist keine gültige CSV-Datei.");

  const [rawHeader, ...rows] = result.data;
  if (!rawHeader || rawHeader.length === 0)
    throw new CsvError("Die Datei enthält keine Kopfzeile.");
  if (rows.length > CSV_MAX_ROWS) {
    throw new CsvError(`Die Datei enthält zu viele Zeilen (höchstens ${CSV_MAX_ROWS}).`);
  }
  return { header: rawHeader.map((cell) => cell.trim()), rows };
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
