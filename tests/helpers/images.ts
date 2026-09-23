import { crc32, deflateSync } from "node:zlib";

/**
 * Testbilder für das Vereinslogo. `pngImage` erzeugt ein echtes, von Browsern darstellbares PNG (gültige Prüfsummen,
 * komprimierte Bilddaten); die übrigen Bausteine enthalten nur die Kopfdaten, die `readImageSize` liest.
 */
const u32be = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
};

function pngChunk(type: string, data: Uint8Array): Buffer {
  const name = Buffer.from(type, "ascii");
  return Buffer.concat([u32be(data.length), name, data, u32be(crc32(Buffer.concat([name, data])))]);
}

export function pngImage(
  width: number,
  height: number,
  {
    animated = false,
    rgba = [28, 74, 122, 255],
    textChunks = 0,
    withoutImageData = false,
  }: {
    animated?: boolean;
    rgba?: number[];
    /** So viele Textabschnitte („tEXt“) vor einer Animationskennung – versteckt sie weit hinten im Kopf. */
    textChunks?: number;
    /** Ohne Bilddaten („IDAT“) – eine unvollständige oder manipulierte Datei. */
    withoutImageData?: boolean;
  } = {},
): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // Bittiefe
  header[9] = 6; // RGBA
  const row = Buffer.alloc(1 + width * 4); // Filterbyte 0, dann die Bildpunkte
  for (let x = 0; x < width; x += 1) row.set(rgba, 1 + x * 4);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", header),
      ...Array.from({ length: textChunks }, (_, i) =>
        pngChunk("tEXt", Buffer.from(`Kommentar\0Nr. ${i}`, "latin1")),
      ),
      ...(animated ? [pngChunk("acTL", Buffer.from([0, 0, 0, 2, 0, 0, 0, 0]))] : []),
      ...(withoutImageData ? [] : [pngChunk("IDAT", pixels)]),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/** JPEG-Kopf: APP0/APP1 vor dem Bildrahmen (SOF0 = Grundform, SOF2 = progressiv), danach Bilddaten-Beginn. */
export function jpegHeader(width: number, height: number, sof = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from("JFIF\0"),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    0xe1,
    0x00,
    0x08,
    ...Buffer.from("Exif\0\0"),
    0xff,
    sof,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
    0xff,
    0xda,
    0x00,
    0x08,
    1,
    1,
    0,
    0,
    0x3f,
    0,
    0xff,
    0xd9,
  ]);
}

const riff = (chunk: string, payload: number[]) => {
  const body = Buffer.concat([
    Buffer.from("WEBP"),
    Buffer.from(chunk),
    u32le(payload.length),
    Buffer.from(payload),
  ]);
  return new Uint8Array(Buffer.concat([Buffer.from("RIFF"), u32le(body.length), body]));
};
const u32le = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
};

/** Verlustbehaftetes WebP (VP8): Schlüsselbild-Startcode, dann Breite/Höhe (je 14 Bit). */
export const webpLossy = (width: number, height: number) =>
  riff("VP8 ", [
    0x30,
    0x01,
    0x00,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >> 8) & 0x3f,
    height & 0xff,
    (height >> 8) & 0x3f,
    0,
    0,
    0,
    0,
  ]);

/** Verlustfreies WebP (VP8L): Kennbyte 0x2F, dann (Breite−1) und (Höhe−1) mit je 14 Bit. */
export function webpLossless(width: number, height: number) {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return riff("VP8L", [
    0x2f,
    bits & 0xff,
    (bits >> 8) & 0xff,
    (bits >> 16) & 0xff,
    (bits >>> 24) & 0xff,
    0,
  ]);
}

/** Erweitertes WebP (VP8X): Kennzeichen (Bit 2 = animiert), dann (Breite−1) und (Höhe−1) mit je 24 Bit. */
export const webpExtended = (width: number, height: number, { animated = false } = {}) =>
  riff("VP8X", [
    animated ? 0x02 : 0x00,
    0,
    0,
    0,
    (width - 1) & 0xff,
    ((width - 1) >> 8) & 0xff,
    ((width - 1) >> 16) & 0xff,
    (height - 1) & 0xff,
    ((height - 1) >> 8) & 0xff,
    ((height - 1) >> 16) & 0xff,
  ]);
