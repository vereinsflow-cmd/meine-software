/**
 * Sicherheitsregeln für hochgeladene Dateien (reine Funktionen, ohne Dateisystem – einzeln testbar).
 *
 * Grundsätze:
 *  - Erlaubt sind nur bekannte, ungefährliche Formate (Positivliste). Ausführbares, HTML, SVG (kann Skripte enthalten)
 *    und Office-Dateien mit Makros (.doc/.xls/.docm …) sind ausgeschlossen.
 *  - Der Dateityp wird am INHALT erkannt (Signatur), nicht an Endung oder dem vom Browser gemeldeten Typ. Passen Endung
 *    und Inhalt nicht zusammen, wird abgelehnt.
 *  - Der angezeigte Dateiname wird bereinigt (kein Pfad, keine Steuer- und Richtungszeichen, begrenzte Länge). Er hat
 *    keinerlei Einfluss darauf, WO oder UNTER WELCHEM NAMEN die Datei gespeichert wird.
 *  - Downloads liefern den Typ aus der Positivliste, immer als Anhang und mit `nosniff`.
 */
export interface AllowedType {
  ext: string;
  mime: string;
  label: string;
}

const OOXML = "application/vnd.openxmlformats-officedocument";
const ODF = "application/vnd.oasis.opendocument";

/** Positivliste. Die Reihenfolge bestimmt die Anzeige in Fehlermeldungen. */
export const ALLOWED_TYPES: readonly AllowedType[] = [
  { ext: "pdf", mime: "application/pdf", label: "PDF" },
  { ext: "png", mime: "image/png", label: "PNG-Bild" },
  { ext: "jpg", mime: "image/jpeg", label: "JPEG-Bild" },
  { ext: "jpeg", mime: "image/jpeg", label: "JPEG-Bild" },
  { ext: "gif", mime: "image/gif", label: "GIF-Bild" },
  { ext: "webp", mime: "image/webp", label: "WebP-Bild" },
  { ext: "docx", mime: `${OOXML}.wordprocessingml.document`, label: "Word-Dokument" },
  { ext: "xlsx", mime: `${OOXML}.spreadsheetml.sheet`, label: "Excel-Tabelle" },
  { ext: "pptx", mime: `${OOXML}.presentationml.presentation`, label: "PowerPoint-Präsentation" },
  { ext: "odt", mime: `${ODF}.text`, label: "OpenDocument-Text" },
  { ext: "ods", mime: `${ODF}.spreadsheet`, label: "OpenDocument-Tabelle" },
  { ext: "odp", mime: `${ODF}.presentation`, label: "OpenDocument-Präsentation" },
  { ext: "txt", mime: "text/plain", label: "Textdatei" },
  { ext: "csv", mime: "text/csv", label: "CSV-Tabelle" },
];

/** Gelöschte Dokumente bleiben so viele Tage erhalten (Datei und Datensatz), bevor der Aufbewahrungsjob sie endgültig entfernt. */
export const DOCUMENT_TRASH_DAYS = 30;

export const ALLOWED_EXTENSIONS_TEXT =
  "PDF, Bilder (PNG, JPEG, GIF, WebP), Word, Excel, PowerPoint, OpenDocument, TXT und CSV";

export function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName.trim());
  return match ? match[1]!.toLowerCase() : "";
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
const ZIP = [0x50, 0x4b, 0x03, 0x04] as const;

/** Prüft, ob der Inhalt zum behaupteten Typ (Endung) passt. */
function contentMatches(ext: string, bytes: Uint8Array): boolean {
  switch (ext) {
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "gif":
      return ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a";
    case "webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
    case "docx":
    case "xlsx":
    case "pptx": {
      if (!startsWith(bytes, ZIP)) return false;
      // Office Open XML: ein ZIP mit [Content_Types].xml und dem typischen Ordner (word/, xl/, ppt/) in den Kopfdaten.
      const head = ascii(bytes, 0, 4096);
      const folder = ext === "docx" ? "word/" : ext === "xlsx" ? "xl/" : "ppt/";
      return head.includes("[Content_Types].xml") || head.includes(folder);
    }
    case "odt":
    case "ods":
    case "odp": {
      if (!startsWith(bytes, ZIP)) return false;
      // OpenDocument: erster Eintrag "mimetype" (unkomprimiert) mit dem Medientyp.
      const expected = ext === "odt" ? "text" : ext === "ods" ? "spreadsheet" : "presentation";
      return (
        ascii(bytes, 30, 30 + 8) === "mimetype" &&
        ascii(bytes, 38, 38 + 60).startsWith(`${ODF}.${expected}`)
      );
    }
    case "txt":
    case "csv":
      return isPlainText(bytes);
    default:
      return false;
  }
}

/** Reiner Text: gültiges UTF-8 (mit BOM erlaubt), keine Nullbytes und kaum Steuerzeichen. */
function isPlainText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    // Ein am Stichproben-Ende abgeschnittenes Mehrbyte-Zeichen ist kein Fehler.
    if (bytes.length <= sample.length) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, sample.length - 3));
    } catch {
      return false;
    }
  }
  let control = 0;
  for (const value of sample)
    if (value < 0x20 && value !== 0x09 && value !== 0x0a && value !== 0x0d) control += 1;
  return control / Math.max(1, sample.length) < 0.01;
}

export type FileCheck =
  { ok: true; type: AllowedType; safeName: string } | { ok: false; reason: string };

/** Prüft Name und Inhalt einer Datei. Bei "ok" stehen der bereinigte Name und der (aus der Positivliste stammende) Typ fest. */
export function checkUpload(fileName: string, bytes: Uint8Array): FileCheck {
  const safeName = sanitizeFileName(fileName);
  const ext = extensionOf(safeName);
  const type = ALLOWED_TYPES.find((entry) => entry.ext === ext);
  if (!type)
    return {
      ok: false,
      reason: `Dieser Dateityp ist nicht erlaubt. Erlaubt sind: ${ALLOWED_EXTENSIONS_TEXT}.`,
    };
  if (bytes.length === 0) return { ok: false, reason: "Die Datei ist leer." };
  if (!contentMatches(ext, bytes))
    return {
      ok: false,
      reason: `Der Inhalt der Datei passt nicht zur Endung „.${ext}“. Bitte prüfe die Datei.`,
    };
  return { ok: true, type, safeName };
}

/**
 * Bereinigt einen vom Benutzer gelieferten Dateinamen für die ANZEIGE: kein Pfad, keine Steuer-, Richtungs- und
 * Nullbreitenzeichen (verhindern optische Täuschung wie "gnp.exe" durch U+202E), keine unter Windows verbotenen Zeichen,
 * keine führenden Punkte, höchstens 120 Zeichen (die Endung bleibt erhalten).
 */
export function sanitizeFileName(input: string): string {
  let name = input.normalize("NFC");
  name = name.split(/[\\/]/).pop() ?? "";
  name = name.replace(
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
    "",
  );
  // Windows verbietet <>:"|?* und behandelt Punkte/Leerzeichen am Ende als nicht vorhanden – beides wird entfernt.
  name = name
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  const MAX = 120;
  if (name.length > MAX) {
    const ext = extensionOf(name);
    const base = ext ? name.slice(0, name.length - ext.length - 1) : name;
    name = ext ? `${base.slice(0, MAX - ext.length - 1)}.${ext}` : base.slice(0, MAX);
  }
  return name || "Dokument";
}

/** Anzeigename für den Download-Header (RFC 6266): ASCII-Ersatz und UTF-8-Variante; nie mit Anführungszeichen oder Zeilenumbrüchen. */
export function contentDisposition(fileName: string): string {
  const safe = sanitizeFileName(fileName);
  const fallback = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%]/g, "_");
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** "1,4 MB", "820 KB", "12 Byte" – für die Anzeige. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Byte`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}
