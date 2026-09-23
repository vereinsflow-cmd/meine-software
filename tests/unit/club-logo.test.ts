import { describe, expect, it } from "vitest";
import {
  CLUB_LOGO_ACCEPT,
  CLUB_LOGO_MAX_BYTES,
  checkClubLogo,
  clubInitials,
  clubLogoUrl,
  clubLogoVersion,
  readImageSize,
} from "@/lib/club-logo";
import { jpegHeader, pngImage, webpExtended, webpLossless, webpLossy } from "../helpers/images";

const text = (value: string) => new TextEncoder().encode(value);

describe("Bildmaße werden aus dem Dateikopf gelesen", () => {
  it("PNG (IHDR)", () => {
    expect(readImageSize(pngImage(320, 200), "png")).toEqual({
      width: 320,
      height: 200,
      animated: false,
    });
  });

  it("erkennt animierte PNG (acTL vor den Bilddaten)", () => {
    expect(readImageSize(pngImage(64, 64, { animated: true }), "png")?.animated).toBe(true);
  });

  it("JPEG mit APP0/APP1 vor dem Bildrahmen – Grundform und progressiv", () => {
    expect(readImageSize(jpegHeader(1024, 768), "jpg")).toEqual({
      width: 1024,
      height: 768,
      animated: false,
    });
    expect(readImageSize(jpegHeader(300, 400, 0xc2), "jpeg")).toMatchObject({
      width: 300,
      height: 400,
    });
  });

  it("WebP in allen drei Varianten (VP8, VP8L, VP8X)", () => {
    expect(readImageSize(webpLossy(500, 250), "webp")).toMatchObject({ width: 500, height: 250 });
    expect(readImageSize(webpLossless(16, 4096), "webp")).toMatchObject({
      width: 16,
      height: 4096,
    });
    expect(readImageSize(webpExtended(2000, 1000), "webp")).toEqual({
      width: 2000,
      height: 1000,
      animated: false,
    });
    expect(readImageSize(webpExtended(64, 64, { animated: true }), "webp")?.animated).toBe(true);
  });

  it("abgeschnittene oder unbekannte Köpfe ergeben null statt geratener Werte", () => {
    expect(readImageSize(pngImage(32, 32).subarray(0, 20), "png")).toBeNull();
    expect(readImageSize(jpegHeader(32, 32).subarray(0, 30), "jpg")).toBeNull();
    // Bilddaten (SOS) vor jedem Bildrahmen: Maße nicht bestimmbar
    expect(
      readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x04, 0, 0]), "jpg"),
    ).toBeNull();
    expect(readImageSize(webpLossy(64, 64).subarray(0, 24), "webp")).toBeNull();
    expect(readImageSize(text("kein Bild, nur Text"), "png")).toBeNull();
    expect(readImageSize(pngImage(32, 32), "gif")).toBeNull();
  });
});

describe("Prüfung einer Datei als Vereinslogo", () => {
  it("nimmt PNG, JPEG und WebP an – der Medientyp stammt aus der Positivliste", () => {
    const png = checkClubLogo("Wappen.PNG", pngImage(256, 256));
    expect(png).toMatchObject({ ok: true, width: 256, height: 256 });
    expect(png.ok && png.type.mime).toBe("image/png");
    expect(checkClubLogo("logo.jpg", jpegHeader(512, 512))).toMatchObject({ ok: true });
    expect(checkClubLogo("logo.webp", webpLossless(128, 128))).toMatchObject({ ok: true });
  });

  it("lehnt SVG, GIF, PDF und andere Formate ab – mit eigenem Hinweis für Logos", () => {
    for (const name of ["logo.svg", "logo.gif", "logo.pdf", "logo.heic", "logo"]) {
      const result = checkClubLogo(name, text("<svg xmlns='http://www.w3.org/2000/svg'/>"));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toMatch(/nur PNG-, JPEG- und WebP-Bilder.*kein SVG/);
    }
  });

  it("lehnt getarnte Dateien ab (Inhalt passt nicht zur Endung)", () => {
    const svg = checkClubLogo("logo.png", text("<svg onload='alert(1)'></svg>"));
    expect(!svg.ok && svg.reason).toMatch(/passt nicht zur Endung „\.png“/);
    const jpegAsPng = checkClubLogo("logo.png", jpegHeader(64, 64));
    expect(jpegAsPng.ok).toBe(false);
  });

  it("lehnt leere und zu große Dateien ab", () => {
    expect(checkClubLogo("logo.png", new Uint8Array())).toEqual({
      ok: false,
      reason: "Die Datei ist leer.",
    });
    const big = new Uint8Array(CLUB_LOGO_MAX_BYTES + 1);
    big.set(pngImage(64, 64));
    const result = checkClubLogo("logo.png", big);
    expect(!result.ok && result.reason).toMatch(/zu groß \(höchstens 1 MB/);
  });

  it("begrenzt die Bildmaße (Schutz vor Dekompressionsbomben) und verlangt eine Mindestgröße", () => {
    const huge = checkClubLogo("logo.webp", webpExtended(20000, 20000));
    expect(!huge.ok && huge.reason).toMatch(/höchstens 4096 × 4096 Pixel, deins hat 20000 × 20000/);
    const wide = checkClubLogo("logo.png", pngImage(4097, 16));
    expect(wide.ok).toBe(false);
    const tiny = checkClubLogo("logo.png", pngImage(8, 8));
    expect(!tiny.ok && tiny.reason).toMatch(/zu klein \(mindestens 16 × 16 Pixel\)/);
    expect(checkClubLogo("logo.png", pngImage(4096, 16))).toMatchObject({ ok: true });
  });

  it("lehnt bewegte Bilder und unlesbare Köpfe ab", () => {
    const apng = checkClubLogo("logo.png", pngImage(64, 64, { animated: true }));
    expect(!apng.ok && apng.reason).toMatch(/Bewegte Bilder/);
    const webp = checkClubLogo("logo.webp", webpExtended(64, 64, { animated: true }));
    expect(webp.ok).toBe(false);
    const broken = checkClubLogo("logo.png", pngImage(64, 64).subarray(0, 16));
    expect(!broken.ok && broken.reason).toMatch(/konnte nicht gelesen werden/);
  });

  it("die Dateiauswahl bietet nur die erlaubten Endungen an", () => {
    expect(CLUB_LOGO_ACCEPT).toBe(".png,.jpg,.jpeg,.webp");
  });
});

describe("Adresse und Version des Logos", () => {
  const sha = "ab".repeat(32);
  const clubId = "0192f3a4-5b6c-7d8e-9f01-23456789abcd";

  it("ohne Logo keine Adresse (die Oberfläche fragt dann gar kein Bild an)", () => {
    expect(clubLogoUrl(clubId, null)).toBeNull();
    expect(clubLogoUrl(clubId, undefined)).toBeNull();
  });

  it("mit Logo eine Adresse mit Version aus der Prüfsumme – neues Logo, neue Adresse", () => {
    expect(clubLogoVersion(sha)).toBe("abababababababab");
    expect(clubLogoUrl(clubId, sha)).toBe(`/api/vereine/${clubId}/logo?v=abababababababab`);
    expect(clubLogoUrl(clubId, "cd".repeat(32))).not.toBe(clubLogoUrl(clubId, sha));
  });
});

describe("Anfangsbuchstaben als Ersatz für das Logo", () => {
  it.each([
    ["TSV Musterstadt 1898 e.V.", "TM"],
    ["Anderer Verein e.V.", "AV"],
    ["Musikfreunde e. V.", "MU"],
    ["Ökumenischer Chor", "ÖC"],
    ["tennisclub", "TE"],
    ["SV Blau-Weiß 1920", "SB"],
    ["1898", "V"],
    ["   ", "V"],
  ])("„%s“ → „%s“", (name, expected) => {
    expect(clubInitials(name)).toBe(expected);
  });
});
