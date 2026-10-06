import { describe, expect, it } from "vitest";
import {
  bankCodeFromIbanStart,
  bankCodeQuery,
  bicQuery,
  foldA,
  foldAe,
  formatBankCode,
  matchesWordStart,
  namePhrases,
  normalizeBankQuery,
  queryWords,
  searchKeys,
  wordKeys,
} from "@/lib/bank-search";
import { bankCodeFromIban, bankSearchQuery } from "@/lib/bank-suggestions";

describe("bankCodeFromIban (Vertrag zwischen Feld und API)", () => {
  it("liefert die Bankleitzahl einer deutschen IBAN – mit oder ohne Leerzeichen, auch klein geschrieben", () => {
    expect(bankCodeFromIban("DE12 4265 0150 0000 0000 00")).toBe("42650150");
    expect(bankCodeFromIban("DE12426501500000000000")).toBe("42650150");
    expect(bankCodeFromIban("de12426501500000000000")).toBe("42650150");
    expect(bankCodeFromIban("  DE12 4265\t0150 0000 0000 00 ")).toBe("42650150");
  });

  it("alles andere ist keine IBAN", () => {
    for (const text of [
      "",
      "DE12",
      "DE12 4265 0150", // angefangen
      "DE12 4265 0150 0000 0000 0", // eine Stelle zu wenig
      "DE12 4265 0150 0000 0000 000", // eine zu viel
      "AT61 1904 3002 3457 3201", // andere Länder
      "NL91ABNA0417164300",
      "DEAB 4265 0150 0000 0000 00",
      "42650150",
      "Sparkasse Vest",
    ]) {
      expect(bankCodeFromIban(text), text).toBeNull();
    }
  });
});

describe("bankSearchQuery: was das Feld an die Schnittstelle schickt (keine Kontonummer in der URL)", () => {
  it("eine deutsche IBAN – auch mit Text davor oder Leerzeichen darin – wird zur Bankleitzahl", () => {
    for (const text of [
      "DE12 4265 0150 0000 0000 00",
      "de12426501500000000000",
      "IBAN DE12 4265 0150 0000 0000 00", // so steht sie auf Briefbögen und Rechnungen
      "IBAN: DE12426501500000000000",
      "IBANDE12426501500000000000",
      "Konto DE12 4265 0150 0000 0000 00",
      "Sparkasse Vest DE12 4265 0150 0000 1234 56",
      "Sparkasse Vest, IBAN DE12 4265 0150 0000 0000 00",
      "DE 12 4265 0150 0000 0000 00",
      "DE12 4265 0150", // angefangen, Bankleitzahl vollständig
      "IBAN DE12 4265 0150 0000",
    ]) {
      expect(bankSearchQuery(text), text).toBe("42650150");
    }
  });

  it("angefangene oder ausländische IBAN und Kontonummern: nichts senden", () => {
    for (const text of [
      "DE00",
      "DE12 4265",
      "IBAN DE12",
      "AT61 1904 3002 3457 3201",
      "NL91 ABNA 0417 1643 00",
      "NL91ABNA0417164300",
      "Kto 1234567890",
      "4265015012345678", // Bankleitzahl und Kontonummer am Stück
    ]) {
      expect(bankSearchQuery(text), text).toBeNull();
    }
  });

  it("Namen, Bankleitzahl und BIC bleiben unverändert", () => {
    for (const text of [
      "sparkasse vest",
      "Deutsche Bank",
      "IBAN First", // gibt es als Bank
      "42650150",
      "426 501 50",
      "WELADED1REK",
      "GENODEM1GLS",
      "GENODE61FR1",
      "COBADEFF",
      "AABSDE31XXX",
      "1822direkt",
      "1822",
      "n26",
      "IBAN DE1",
    ]) {
      expect(bankSearchQuery(text), text).toBe(text);
    }
  });
});

describe("Schreibweisen angleichen", () => {
  it("Umlaute einmal mit e, einmal ohne; ß wird ss; übrige Akzente fallen weg", () => {
    expect(foldAe("Köln Gießen MÜNCHEN Ärztebank")).toBe("koeln giessen muenchen aerztebank");
    expect(foldA("Köln Gießen MÜNCHEN Ärztebank")).toBe("koln giessen munchen arztebank");
    expect(foldAe("Crédit Agricole")).toBe("credit agricole");
  });

  it("Suchwörter: klein, angeglichen, Satzzeichen trennen, doppelte fallen weg", () => {
    expect(queryWords("  Sparda-Bank   Münster ")).toEqual(["sparda", "bank", "muenster"]);
    expect(queryWords("ING-DiBa")).toEqual(["ing", "diba"]);
    expect(queryWords("vest vest")).toEqual(["vest"]);
    expect(queryWords("<script>alert(1)</script>")).toEqual(["script", "alert", "1"]);
    expect(queryWords("% _ 🏦")).toEqual([]);
  });

  it("normalizeBankQuery fasst Leerraum zusammen", () => {
    expect(normalizeBankQuery("  sparkasse \n\t vest  ")).toBe("sparkasse vest");
    expect(normalizeBankQuery("   ")).toBe("");
  });
});

describe("Wortanfänge der Daten", () => {
  it("Wörter, zusammengeschriebene Teile und der ganze Name ohne Leerzeichen – in beiden Schreibweisen", () => {
    const keys = wordKeys("Sparda-Bank Münster");
    for (const key of [
      "sparda",
      "bank",
      "spardabank",
      "muenster",
      "munster",
      "spardabankmuenster",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("Binnenmajuskeln trennen: KölnBonn, apoBank, HypoVereinsbank", () => {
    expect(wordKeys("Sparkasse KölnBonn")).toContain("bonn");
    expect(wordKeys("apoBank")).toContain("bank");
    expect(wordKeys("UniCredit Bank - HypoVereinsbank")).toContain("vereinsbank");
  });

  it("„Kreissparkasse“ und „Stadtsparkasse“ findet man auch mit „sparkasse“, eine Bausparkasse nicht", () => {
    expect(wordKeys("Kreissparkasse Köln")).toContain("sparkasse");
    expect(wordKeys("Stadtsparkasse München")).toContain("sparkasse");
    expect(wordKeys("Wüstenrot Bausparkasse")).not.toContain("sparkasse");
    expect(wordKeys("Raiffeisen-Volksbank")).toContain("volksbank");
  });

  it("matchesWordStart prüft Wortanfänge, nicht Wortmitten", () => {
    const keys = searchKeys(["Sparkasse Göttingen"]);
    expect(matchesWordStart(keys, ["gott"])).toBe(true);
    expect(matchesWordStart(keys, ["goett"])).toBe(true);
    expect(matchesWordStart(keys, ["ing"])).toBe(false);
    expect(matchesWordStart(keys, ["xyz", "spark"])).toBe(true);
    expect(searchKeys([])).toBe(" ");
    expect(matchesWordStart(searchKeys([""]), ["a"])).toBe(false);
  });

  it("namePhrases: die Bezeichnung als Wortfolge je Schreibweise", () => {
    expect(namePhrases("Sparkasse Vest Recklinghausen")).toEqual(["sparkasse vest recklinghausen"]);
    expect(namePhrases("Volksbank Köln Bonn")).toEqual([
      "volksbank koeln bonn",
      "volksbank koln bonn",
    ]);
  });
});

describe("Bankleitzahl, BIC und IBAN erkennen", () => {
  it("Bankleitzahl in Blöcken schreiben", () => {
    expect(formatBankCode("42650150")).toBe("426 501 50");
    expect(formatBankCode("4265")).toBe("4265");
  });

  it("nur Ziffern (auch mit Leerzeichen), 2 bis 8 Stellen", () => {
    expect(bankCodeQuery("426 501 50")).toBe("42650150");
    expect(bankCodeQuery("4265")).toBe("4265");
    expect(bankCodeQuery("42")).toBe("42");
    expect(bankCodeQuery("4")).toBeNull();
    expect(bankCodeQuery("426501501")).toBeNull();
    expect(bankCodeQuery("n26")).toBeNull();
  });

  it("deutsche BIC oder ihr Anfang ab 6 Zeichen", () => {
    expect(bicQuery("weladed1rek")).toBe("WELADED1REK");
    expect(bicQuery("WELA DED1")).toBe("WELADED1");
    expect(bicQuery("WELADE")).toBe("WELADE");
    expect(bicQuery("WELAD")).toBeNull();
    expect(bicQuery("ABNANL2A")).toBeNull(); // nicht deutsch
    expect(bicQuery("sparkasse")).toBeNull();
    expect(bicQuery("WELADED1REKX")).toBeNull();
  });

  it("angefangene IBAN: sobald die Bankleitzahl vollständig ist", () => {
    expect(bankCodeFromIbanStart("DE12 4265 0150")).toBe("42650150");
    expect(bankCodeFromIbanStart("de12 4265 0150 0000 0000 00")).toBe("42650150");
    expect(bankCodeFromIbanStart("DE12 4265 015")).toBeNull();
    expect(bankCodeFromIbanStart("DE12 4265 0150 0000 0000 0000")).toBeNull();
  });
});
