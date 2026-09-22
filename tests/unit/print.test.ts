import { describe, expect, it } from "vitest";
import { buildPrintPageStyle, cssString } from "@/lib/print";

describe("cssString", () => {
  it("lässt unauffälligen Text unverändert", () => {
    expect(cssString("TSV Musterstadt 1898 e.V.")).toBe("TSV Musterstadt 1898 e.V.");
  });

  it("entschärft Anführungszeichen und Rückwärtsschrägstriche", () => {
    expect(cssString('Verein "Die Helfer" e.V.')).toBe('Verein \\"Die Helfer\\" e.V.');
    expect(cssString("C:\\Pfad\\Datei")).toBe("C:\\\\Pfad\\\\Datei");
  });

  it("glättet Zeilenumbrüche zu Leerzeichen (Kopf-/Fußzeile ist einzeilig)", () => {
    expect(cssString("Erste Zeile\nZweite Zeile")).toBe("Erste Zeile Zweite Zeile");
    expect(cssString("Windows\r\nZeilenende")).toBe("Windows Zeilenende");
  });
});

describe("buildPrintPageStyle", () => {
  const base = {
    clubName: "TSV Musterstadt",
    documentTitle: "Helferplan",
    generatedAtLabel: "22.09.2026, 14:32 Uhr",
  } as const;

  it("Hochformat: A4 im Hochformat, Vereinsname/Titel oben, Datum/Seitenzahl unten", () => {
    const style = buildPrintPageStyle({ ...base, orientation: "hoch" });
    expect(style).toContain("size: A4 portrait;");
    expect(style).toContain('@top-left { content: "TSV Musterstadt";');
    expect(style).toContain('@top-right { content: "Helferplan";');
    expect(style).toContain('@bottom-left { content: "Erstellt am 22.09.2026, 14:32 Uhr";');
    expect(style).toContain(
      '@bottom-right { content: "Seite " counter(page) " von " counter(pages);',
    );
  });

  it("Querformat: A4 im Querformat", () => {
    expect(buildPrintPageStyle({ ...base, orientation: "quer" })).toContain("size: A4 landscape;");
  });

  it("Vereinsname mit Anführungszeichen bricht die CSS-Regel nicht auf", () => {
    const style = buildPrintPageStyle({
      ...base,
      clubName: 'Verein "Die Helfer" e.V.',
      orientation: "hoch",
    });
    expect(style).toContain('@top-left { content: "Verein \\"Die Helfer\\" e.V.";');
    // Die Regel bleibt insgesamt eine gültige @page-Regel (ausgeglichene geschweifte Klammern).
    expect(style.match(/\{/g)?.length).toBe(style.match(/\}/g)?.length);
  });
});
