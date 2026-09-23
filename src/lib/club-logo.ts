import {
  ALLOWED_TYPES,
  checkUpload,
  extensionOf,
  formatBytes,
  sanitizeFileName,
  type AllowedType,
} from "./uploads";

/**
 * Regeln und Hilfen rund um das Vereinslogo (reine Funktionen – im Browser und auf dem Server gleich, einzeln testbar).
 *
 * Sicherheit:
 *  - Nur Rasterbilder (PNG, JPEG, WebP). SVG ist ausgeschlossen, weil es Skripte enthalten kann – das Logo wird im
 *    Browser angezeigt, nicht nur heruntergeladen.
 *  - Der Typ wird am Inhalt erkannt (Signatur, wie bei Dokumenten), nicht an Endung oder Browser-Angabe.
 *  - Breite und Höhe werden aus dem Dateikopf gelesen und begrenzt: Eine kleine, stark komprimierte Datei kann sonst
 *    ein riesiges Bild beschreiben, das den Browser beim Entpacken lahmlegt („Dekompressionsbombe“). Lässt sich der
 *    Kopf nicht lesen, wird abgelehnt.
 *  - Bewegte Bilder (animiertes PNG/WebP) sind nicht erlaubt – ein Logo neben dem Vereinsnamen soll ruhig bleiben.
 */

/** Höchstgröße der Logo-Datei (1 MiB). Dieselbe Grenze prüft die Datenbank (`Club_logo_size_chk`). */
export const CLUB_LOGO_MAX_BYTES = 1024 * 1024;
export const CLUB_LOGO_MIN_EDGE = 16;
export const CLUB_LOGO_MAX_EDGE = 4096;

/** Erlaubte Formate – als Ausschnitt der allgemeinen Positivliste, damit die Medientypen überall gleich lauten. */
export const CLUB_LOGO_TYPES: readonly AllowedType[] = ALLOWED_TYPES.filter((type) =>
  ["png", "jpg", "jpeg", "webp"].includes(type.ext),
);
export const CLUB_LOGO_ACCEPT = CLUB_LOGO_TYPES.map((type) => `.${type.ext}`).join(",");
export const CLUB_LOGO_TYPES_TEXT = "PNG, JPEG oder WebP";

export interface ImageSize {
  width: number;
  height: number;
  /** Enthält das Bild mehrere Einzelbilder (APNG, animiertes WebP)? */
  animated: boolean;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const fourCC = (b: Uint8Array, i: number) =>
  String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);

function pngSize(b: Uint8Array): ImageSize | null {
  // Signatur (8) + Länge (4) + "IHDR" (4) + Breite (4) + Höhe (4)
  if (b.length < 24 || fourCC(b, 12) !== "IHDR") return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  // Animiertes PNG: ein "acTL"-Abschnitt steht vor den eigentlichen Bilddaten ("IDAT").
  let animated = false;
  let offset = 8;
  for (let guard = 0; guard < 64 && offset + 8 <= b.length; guard += 1) {
    const length = u32be(b, offset);
    const type = fourCC(b, offset + 4);
    if (type === "acTL") animated = true;
    if (type === "IDAT" || type === "IEND") break;
    offset += 12 + length; // Länge + Typ + Daten + Prüfsumme
  }
  return { width, height, animated };
}

function jpegSize(b: Uint8Array): ImageSize | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null; // kein Marker, wo einer stehen müsste → beschädigt
    while (b[i] === 0xff) i += 1; // Füllbytes
    const marker = b[i];
    i += 1;
    if (marker === undefined) return null;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // ohne Länge
    if (marker === 0xd9 || marker === 0xda) return null; // Ende oder Bilddaten, bevor die Maße kamen
    if (i + 1 >= b.length) return null;
    const length = u16be(b, i);
    if (length < 2) return null;
    // Bildrahmen (SOF0–SOF15 außer DHT/JPG/DAC): Länge (2), Genauigkeit (1), Höhe (2), Breite (2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 6 >= b.length) return null;
      return { height: u16be(b, i + 3), width: u16be(b, i + 5), animated: false };
    }
    i += length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 16 || fourCC(b, 0) !== "RIFF" || fourCC(b, 8) !== "WEBP") return null;
  const chunk = fourCC(b, 12);
  if (chunk === "VP8 ") {
    if (b.length < 30) return null;
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null; // Startcode eines Schlüsselbilds
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, animated: false };
  }
  if (chunk === "VP8L") {
    // Verlustfrei: Kennbyte 0x2F, danach Breite und Höhe (je 14 Bit, minus 1) – sehr kleine Dateien sind möglich.
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const width = 1 + (b[21]! | ((b[22]! & 0x3f) << 8));
    const height = 1 + (((b[22]! & 0xc0) >> 6) | (b[23]! << 2) | ((b[24]! & 0x0f) << 10));
    return { width, height, animated: false };
  }
  if (chunk === "VP8X") {
    if (b.length < 30) return null;
    return {
      width: 1 + u24le(b, 24),
      height: 1 + u24le(b, 27),
      animated: (b[20]! & 0x02) !== 0,
    };
  }
  return null;
}

/**
 * Liest Breite und Höhe aus dem Dateikopf – ohne das Bild zu entpacken. `null`, wenn der Kopf fehlt, abgeschnitten
 * oder unbekannt ist (dann wird das Bild abgelehnt, statt es ungeprüft anzunehmen).
 */
export function readImageSize(bytes: Uint8Array, ext: string): ImageSize | null {
  switch (ext) {
    case "png":
      return pngSize(bytes);
    case "jpg":
    case "jpeg":
      return jpegSize(bytes);
    case "webp":
      return webpSize(bytes);
    default:
      return null;
  }
}

export type ClubLogoCheck =
  | { ok: true; type: AllowedType; safeName: string; width: number; height: number }
  | { ok: false; reason: string };

/** Prüft eine Datei als Vereinslogo: Format, Inhalt, Dateigröße und Bildmaße. */
export function checkClubLogo(fileName: string, bytes: Uint8Array): ClubLogoCheck {
  const ext = extensionOf(sanitizeFileName(fileName));
  if (!CLUB_LOGO_TYPES.some((type) => type.ext === ext))
    return {
      ok: false,
      reason: "Als Logo sind nur PNG-, JPEG- und WebP-Bilder erlaubt (kein SVG).",
    };
  if (bytes.length === 0) return { ok: false, reason: "Die Datei ist leer." };
  if (bytes.length > CLUB_LOGO_MAX_BYTES)
    return {
      ok: false,
      reason: `Das Logo ist zu groß (höchstens ${formatBytes(CLUB_LOGO_MAX_BYTES)}, deine Datei hat ${formatBytes(bytes.length)}).`,
    };
  const upload = checkUpload(fileName, bytes); // Signatur passend zur Endung – wie bei Dokumenten
  if (!upload.ok) return upload;

  const size = readImageSize(bytes, ext);
  if (!size || size.width === 0 || size.height === 0)
    return {
      ok: false,
      reason: `Das Bild konnte nicht gelesen werden. Bitte speichere es erneut als ${CLUB_LOGO_TYPES_TEXT}.`,
    };
  if (size.animated)
    return {
      ok: false,
      reason: "Bewegte Bilder sind als Logo nicht möglich. Bitte verwende ein Einzelbild.",
    };
  if (size.width > CLUB_LOGO_MAX_EDGE || size.height > CLUB_LOGO_MAX_EDGE)
    return {
      ok: false,
      reason: `Das Bild ist zu groß (höchstens ${CLUB_LOGO_MAX_EDGE} × ${CLUB_LOGO_MAX_EDGE} Pixel, deins hat ${size.width} × ${size.height}).`,
    };
  if (size.width < CLUB_LOGO_MIN_EDGE || size.height < CLUB_LOGO_MIN_EDGE)
    return {
      ok: false,
      reason: `Das Bild ist zu klein (mindestens ${CLUB_LOGO_MIN_EDGE} × ${CLUB_LOGO_MIN_EDGE} Pixel).`,
    };
  return { ok: true, type: upload.type, safeName: upload.safeName, ...size };
}

/** Version des Logos für die Bildadresse: ändert sich mit jedem neuen Inhalt (Anfang der Prüfsumme). */
export const clubLogoVersion = (sha256: string): string => sha256.slice(0, 16);

/**
 * Adresse des Logos eines Vereins – `null`, wenn keins hinterlegt ist (dann zeigt die Oberfläche die Anfangsbuchstaben
 * und fragt gar nicht erst ein Bild an). Die Version in der Adresse erlaubt langes Zwischenspeichern im Browser: Ein
 * neues Logo hat eine neue Adresse.
 */
export function clubLogoUrl(clubId: string, logoSha256: string | null | undefined): string | null {
  return logoSha256 ? `/api/vereine/${clubId}/logo?v=${clubLogoVersion(logoSha256)}` : null;
}

/**
 * Ein bis zwei Anfangsbuchstaben als Ersatz, solange kein Logo hinterlegt ist: „TSV Musterstadt 1898 e.V.“ → „TM“.
 * Rechtsform („e.V.“) und reine Zahlen zählen nicht mit; Umlaute bleiben erhalten.
 */
export function clubInitials(name: string): string {
  const words = name
    .normalize("NFC")
    .replace(/(^|\s)e\.\s?V\.?(?=\s|$)/giu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return "V";
  const letters =
    words.length === 1
      ? [...words[0]!.replace(/[^\p{L}]/gu, "")].slice(0, 2)
      : words.slice(0, 2).map((word) => [...word.replace(/[^\p{L}]/gu, "")][0]!);
  return letters.join("").toLocaleUpperCase("de-DE");
}
