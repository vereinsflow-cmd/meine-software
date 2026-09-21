import { describe, expect, it } from "vitest";
import {
  ALLOWED_TYPES,
  checkUpload,
  contentDisposition,
  extensionOf,
  formatBytes,
  sanitizeFileName,
} from "@/lib/uploads";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));

const PDF = concat(text("%PDF-1.7\n"), text("1 0 obj\n<<>>\nendobj\n"));
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const GIF = text("GIF89a\x01\x00\x01\x00");
const WEBP = concat(text("RIFF"), bytes(0x24, 0, 0, 0), text("WEBPVP8 "));
const ooxml = (folder: string) =>
  concat(
    bytes(0x50, 0x4b, 0x03, 0x04),
    new Uint8Array(26),
    text(`[Content_Types].xml`),
    new Uint8Array(20),
    text(folder),
  );
const odf = (kind: string) =>
  concat(
    bytes(0x50, 0x4b, 0x03, 0x04),
    new Uint8Array(26),
    text("mimetype"),
    text(`application/vnd.oasis.opendocument.${kind}`),
    new Uint8Array(40),
  );

describe("Dateityp wird am Inhalt erkannt", () => {
  const good: [string, Uint8Array][] = [
    ["Protokoll.pdf", PDF],
    ["Foto.PNG", PNG],
    ["Foto.jpg", JPEG],
    ["Foto.jpeg", JPEG],
    ["Anim.gif", GIF],
    ["Bild.webp", WEBP],
    ["Brief.docx", ooxml("word/document.xml")],
    ["Kasse.xlsx", ooxml("xl/workbook.xml")],
    ["Folien.pptx", ooxml("ppt/presentation.xml")],
    ["Brief.odt", odf("text")],
    ["Kasse.ods", odf("spreadsheet")],
    ["Folien.odp", odf("presentation")],
    ["Notiz.txt", text("Umlaute äöü ß – und Sonderzeichen €\nZweite Zeile")],
    ["Mitglieder.csv", text("Name;Ort\nMüller;Köln\n")],
  ];

  it.each(good)("erlaubt %s", (name, content) => {
    const result = checkUpload(name, content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.safeName).toBe(name);
      expect(ALLOWED_TYPES.some((t) => t.mime === result.type.mime)).toBe(true);
    }
  });

  it("liefert den Medientyp aus der Positivliste – nicht aus Angaben des Absenders", () => {
    const result = checkUpload("Foto.JPG", JPEG);
    expect(result).toMatchObject({ ok: true, type: { mime: "image/jpeg", ext: "jpg" } });
  });

  it("lehnt Dateien ab, deren Inhalt nicht zur Endung passt (Tarnung)", () => {
    const cases: [string, Uint8Array][] = [
      ["bild.png", PDF],
      ["dokument.pdf", text("<html><script>alert(1)</script></html>")],
      ["dokument.pdf", text("MZ\x90\x00 ausführbare Datei")],
      ["foto.jpg", PNG],
      ["brief.docx", PDF],
      ["brief.docx", bytes(0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4)], // ZIP ohne Office-Struktur
      ["brief.odt", ooxml("word/document.xml")], // falsches ZIP-Format
      ["tabelle.ods", odf("text")],
      ["notiz.txt", bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00)], // Nullbytes → Binärdatei
      ["notiz.txt", bytes(0xff, 0xfe, 0xfd, 0xfc, 0xfb)], // kein UTF-8
      ["anim.gif", text("GIF90a")],
      ["bild.webp", concat(text("RIFF"), bytes(0, 0, 0, 0), text("WAVEfmt "))],
    ];
    for (const [name, content] of cases) {
      const result = checkUpload(name, content);
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/passt nicht zur Endung/);
    }
  });

  it("lehnt nicht erlaubte Typen ab – auch mit harmlos wirkendem Inhalt", () => {
    for (const name of [
      "setup.exe",
      "skript.js",
      "seite.html",
      "seite.htm",
      "logo.svg",
      "makro.docm",
      "alt.doc",
      "alt.xls",
      "alt.ppt",
      "archiv.zip",
      "start.bat",
      "start.ps1",
      "start.sh",
      "datei.php",
      "datei.jar",
      "datei.msi",
      "datei.lnk",
      "ohne-endung",
      "endung.",
    ]) {
      const result = checkUpload(name, text("harmloser Text"));
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.reason).toContain("nicht erlaubt");
    }
  });

  it("Doppelendungen: maßgeblich ist die letzte Endung (gefährliche davor sind nur Namensbestandteil)", () => {
    expect(checkUpload("rechnung.exe.pdf", PDF)).toMatchObject({
      ok: true,
      safeName: "rechnung.exe.pdf",
    });
    expect(checkUpload("rechnung.pdf.exe", PDF).ok).toBe(false);
    expect(checkUpload("archiv.tar.gz", PDF).ok).toBe(false);
  });

  it("lehnt leere Dateien ab", () => {
    expect(checkUpload("leer.pdf", new Uint8Array())).toMatchObject({
      ok: false,
      reason: "Die Datei ist leer.",
    });
    expect(checkUpload("leer.txt", new Uint8Array())).toMatchObject({ ok: false });
  });

  it("Textdateien: UTF-8 mit BOM ist erlaubt, ein abgeschnittenes Mehrbyte-Zeichen am Ende einer großen Datei nicht schädlich", () => {
    expect(checkUpload("bom.txt", concat(bytes(0xef, 0xbb, 0xbf), text("Text"))).ok).toBe(true);
    const big = concat(text("ä".repeat(40_000))); // > 64 KB: die Stichprobe endet mitten in einem Zeichen
    expect(big.length).toBeGreaterThan(64 * 1024);
    expect(checkUpload("gross.txt", big).ok).toBe(true);
  });
});

describe("Dateinamen bereinigen", () => {
  it("entfernt Pfade, Steuer-, Richtungs- und Nullbreitenzeichen", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\Max\\Bericht.pdf")).toBe("Bericht.pdf");
    expect(sanitizeFileName("Bericht\u0000.pdf")).toBe("Bericht.pdf");
    expect(sanitizeFileName("Bericht\r\n.pdf")).toBe("Bericht.pdf");
    // "fdp.exe" mit Richtungsumkehr (U+202E) würde als "exe.pdf" erscheinen
    expect(sanitizeFileName("Rechnung\u202Efdp.exe")).toBe("Rechnungfdp.exe");
    expect(sanitizeFileName("a\u200bb\u200e\u2066c.pdf")).toBe("abc.pdf");
    expect(sanitizeFileName("\ufeffBericht.pdf")).toBe("Bericht.pdf");
  });

  it("ersetzt unter Windows verbotene Zeichen, entfernt führende Punkte und nie leer", () => {
    expect(sanitizeFileName('Was: "kostet" <viel>?.pdf')).toBe("Was_ _kostet_ _viel__.pdf");
    expect(sanitizeFileName(".htaccess")).toBe("htaccess");
    expect(sanitizeFileName("...")).toBe("Dokument");
    expect(sanitizeFileName("")).toBe("Dokument");
    expect(sanitizeFileName("   ")).toBe("Dokument");
    expect(sanitizeFileName("/")).toBe("Dokument");
  });

  it("kürzt lange Namen auf 120 Zeichen und behält die Endung", () => {
    const long = `${"a".repeat(300)}.pdf`;
    const result = sanitizeFileName(long);
    expect(result).toHaveLength(120);
    expect(result.endsWith(".pdf")).toBe(true);
    expect(sanitizeFileName("b".repeat(300))).toHaveLength(120);
  });

  it("normalisiert Unicode (NFC) und lässt Umlaute und Leerzeichen zu", () => {
    expect(sanitizeFileName("Schu\u0308tzenfest 2026.pdf")).toBe("Schützenfest 2026.pdf");
    expect(sanitizeFileName("Protokoll (Entwurf) – Vorstand.pdf")).toBe(
      "Protokoll (Entwurf) – Vorstand.pdf",
    );
  });

  it("Endung erkennen", () => {
    expect(extensionOf("a.PDF")).toBe("pdf");
    expect(extensionOf("a.tar.gz")).toBe("gz");
    expect(extensionOf("ohne")).toBe("");
    expect(extensionOf("endet.")).toBe("");
    expect(extensionOf("zulang.abcdefghijk")).toBe("");
  });
});

describe("Download-Header", () => {
  it("immer als Anhang; Name in ASCII-Ersatz und UTF-8; keine Einschleusung von Anführungszeichen oder Zeilenumbrüchen", () => {
    expect(contentDisposition("Bericht.pdf")).toBe(
      `attachment; filename="Bericht.pdf"; filename*=UTF-8''Bericht.pdf`,
    );
    expect(contentDisposition("Schützenfest €.pdf")).toBe(
      `attachment; filename="Sch_tzenfest _.pdf"; filename*=UTF-8''Sch%C3%BCtzenfest%20%E2%82%AC.pdf`,
    );

    const attack = contentDisposition('x".pdf\r\nSet-Cookie: a=b');
    expect(attack).not.toMatch(/[\r\n]/);
    expect(attack.match(/"/g)).toHaveLength(2); // nur die beiden Begrenzer
    expect(attack.startsWith("attachment;")).toBe(true);
  });
});

describe("Größenangabe", () => {
  it("formatiert Bytes lesbar", () => {
    expect(formatBytes(0)).toBe("0 Byte");
    expect(formatBytes(999)).toBe("999 Byte");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5 GB");
  });
});
