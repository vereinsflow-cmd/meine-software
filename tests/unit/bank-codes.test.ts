import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { queryWords } from "@/lib/bank-search";
import { BANK_QUERY_MAX_LENGTH, BANK_SUGGESTION_LIMIT } from "@/lib/bank-suggestions";
import { BANK_ALIASES, WORD_ABBREVIATIONS } from "@/server/banks/aliases";
import { BANK_DATA, searchBanks } from "@/server/banks/bank-codes";

const { meta, banks } = BANK_DATA;
const byId = new Map(banks.map((bank) => [bank.id, bank]));
const top = (query: string) => searchBanks(query)[0];

describe("Bankleitzahlendatei der Bundesbank (aufbereitet)", () => {
  it("nennt Quelle und Gültigkeit", () => {
    expect(meta.quelle).toBe("Deutsche Bundesbank");
    expect(meta.datei).toBe("Bankleitzahlendatei");
    expect(meta.gueltigAb).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.gueltigBis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.gueltigAb < meta.gueltigBis).toBe(true);
    // Absichtlich kein Vergleich mit dem heutigen Datum – ein Test, der an einem Kalendertag rot wird, hilft niemandem.
    // Ob die Datei veraltet ist, meldet `node scripts/build-bank-codes.mjs`.
  });

  it("Impressum, README und Modul nennen die Quelle mit der Gültigkeit der eingebauten Datei", () => {
    const german = (iso: string) => iso.split("-").reverse().join(".");
    const stated = `gültig vom ${german(meta.gueltigAb)} bis ${german(meta.gueltigBis)}`;
    const root = path.resolve(__dirname, "../..");
    for (const file of [
      "README.md",
      "src/app/(legal)/impressum/page.tsx",
      "src/server/banks/bank-codes.ts",
    ]) {
      const text = readFileSync(path.join(root, file), "utf8");
      expect(text, file).toContain("Deutsche Bundesbank");
      expect(text, `${file} – nach neuer Bankleitzahlendatei anpassen`).toContain(stated);
    }
  });

  it("hat eine plausible Zahl von Banken mit eindeutigen ids und gültigen Bankleitzahlen", () => {
    expect(banks.length).toBeGreaterThan(1200);
    expect(banks.length).toBeLessThan(3000);
    expect(byId.size).toBe(banks.length);
    for (const bank of banks) {
      expect(bank.id).toMatch(/^\d{8}(-\d+)?$/);
      expect(bank.codes.length).toBeGreaterThan(0);
      expect(bank.id.startsWith(bank.codes[0]!)).toBe(true);
      for (const code of bank.codes) expect(code).toMatch(/^\d{8}$/);
      for (const bic of bank.bics) expect(bic).toMatch(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/);
      expect(bank.count).toBeGreaterThanOrEqual(1);
    }
  });

  it("enthält keine gelöschten, alten oder technischen Bankleitzahlen", () => {
    const technical =
      /-alt(?:-|$)|Settlement|ITGK|\bGAA\b|\bG[fF] P\d|\bG[fF]-|Service\s*-\s*BZ|^Bundesbank\b|\bZ[wW] \d|\bCC\b|Processing|Sonder-BLZ/;
    for (const bank of banks) {
      expect(bank.name, bank.id).not.toMatch(technical);
      for (const other of bank.otherNames) expect(other, bank.id).not.toMatch(technical);
    }
    // Geschäftsfelder mit echten Kundenkonten bleiben
    const names = new Set(banks.map((bank) => bank.name));
    expect(names).toContain("Commerzbank - GF comdirect");
    expect(names).toContain("Frankfurter Sparkasse GF 1822direkt");
    expect(names).toContain("Hamburg Commercial Bank, Gf Hamburg Direct Bank");
    // … und Standorte mit eigenem Namen (Merkmal 2) werden eigene Vorschläge
    expect(names).toContain("Deutsche Kreditbank");
    expect(names).toContain("Volksbank Potsdam Zndl d Berliner Volksbank");
  });

  it("Namen und Feldwerte passen ins Feld, Bezeichnung und Ort sind unverändert", () => {
    for (const bank of banks) {
      expect(bank.name.length).toBeLessThanOrEqual(58); // Feld „Bezeichnung“ der Bundesbank
      expect(bank.name).toBe(bank.name.trim());
      expect(bank.value.length).toBeLessThanOrEqual(BANK_QUERY_MAX_LENGTH);
      // Feldwert: die Bezeichnung – nur bei gleichnamigen Genossenschaftsbanken mit Ort
      expect([bank.name, `${bank.name} ${bank.place}`]).toContain(bank.value);
      if (bank.value !== bank.name) expect(bank.place).not.toBe("");
      // Ort leer ⇔ die Bank sitzt unter diesem Namen an mehreren Orten
      if (bank.place === "") expect(bank.places.length).toBeGreaterThanOrEqual(2);
      else expect(bank.places).toEqual([]);
    }
  });

  it("jede Bezeichnung mit Ort gibt es nur einmal, und die Datei ist sortiert", () => {
    const keys = banks.map((bank) => `${bank.name}\u0000${bank.place}`);
    expect(new Set(keys).size).toBe(keys.length);
    const collator = new Intl.Collator("de");
    for (let i = 1; i < banks.length; i++) {
      const order =
        collator.compare(banks[i - 1]!.name, banks[i]!.name) ||
        collator.compare(banks[i - 1]!.place, banks[i]!.place);
      expect(order, banks[i]!.name).toBeLessThanOrEqual(0);
    }
  });

  it("fasst dieselbe Bank an vielen Orten zusammen, Genossenschaftsbanken gleichen Namens nicht", () => {
    const commerzbank = banks.filter((bank) => bank.name === "Commerzbank");
    expect(commerzbank).toHaveLength(1);
    expect(commerzbank[0]!.place).toBe("");
    expect(commerzbank[0]!.places).toContain("Recklinghausen");
    const raiffeisen = banks.filter((bank) => bank.name === "Raiffeisenbank");
    expect(raiffeisen.length).toBeGreaterThan(5);
    for (const bank of raiffeisen) {
      expect(bank.place).not.toBe("");
      expect(bank.value).toBe(`Raiffeisenbank ${bank.place}`);
    }
  });

  it("eigene Kurzformen zeigen auf Bankleitzahlen, die es gibt", () => {
    for (const alias of BANK_ALIASES) {
      const targets = banks.filter(
        (bank) =>
          bank.codes.includes(alias.blz) &&
          (!alias.nameStart || bank.name.startsWith(alias.nameStart)),
      );
      expect(targets.length, `${alias.names.join(", ")} → ${alias.blz}`).toBeGreaterThan(0);
      for (const name of alias.names) expect(queryWords(name).length).toBeGreaterThan(0);
    }
    for (const [short, long] of Object.entries(WORD_ABBREVIATIONS)) {
      expect(short).toMatch(/^[a-z0-9]+$/);
      expect(long).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("Bank-Vorschläge: die beste Bank steht vorn", () => {
  const vest = "Sparkasse Vest Recklinghausen";
  it.each([
    ["sparkasse vest", vest],
    ["Sparkasse Vest", vest],
    ["  sparkasse   vest ", vest],
    ["SPARKASSE VEST", vest],
    ["spark vest", vest],
    ["vest", vest],
    ["spk vest", vest],
    ["42650150", vest],
    ["426 501 50", vest],
    ["WELADED1REK", vest],
    ["weladed1rek", vest],
    ["DE12 4265 0150 0000 0000 00", vest], // IBAN (Prüfziffer egal) – nur die Bankleitzahl zählt
    ["DE12426501500000000000", vest],
    ["DE12 4265 0150", vest], // angefangene IBAN, Bankleitzahl vollständig
    ["sparkasse dorsten", vest], // Zweigort
    ["sparkasse recklinghausen", vest],
    ["ing", "ING-DiBa"],
    ["ING-DiBa", "ING-DiBa"],
    ["ing diba", "ING-DiBa"],
    ["dkb", "Deutsche Kreditbank Berlin"],
    ["hvb", "UniCredit Bank - HypoVereinsbank"],
    ["hypovereinsbank", "UniCredit Bank - HypoVereinsbank"],
    ["consorsbank", "BNP Paribas Niederlassung Deutschland"],
    ["comdirect", "Commerzbank - GF comdirect"],
    ["1822", "Frankfurter Sparkasse GF 1822direkt"],
    ["n26", "N26 Bank"],
    ["volksbank recklinghausen", "Volksbank Marl-Recklinghausen"],
    ["sparda münster", "Sparda-Bank West"],
    ["sparda muenster", "Sparda-Bank West"],
    ["spardabank west", "Sparda-Bank West"],
    ["targo bank", "TARGOBANK"],
    ["postbank", "Postbank Ndl der Deutsche Bank"],
    ["deutsche bank", "Deutsche Bank"],
    ["commerzbank", "Commerzbank"],
    ["commerzbank recklinghausen", "Commerzbank"],
    ["ksk köln", "Kreissparkasse Köln"],
    ["sparkasse gießen", "Sparkasse Gießen"],
    ["giessen", "Sparkasse Gießen"],
    ["gießen", "Sparkasse Gießen"],
    ["apobank", "apoBank"],
    ["gls", "GLS Gemeinschaftsbank"],
  ])("„%s“ → %s", (query, expected) => {
    expect(top(query)?.name).toBe(expected);
  });

  it("Sparkasse Vest: Ort, Bankleitzahl in der zweiten Zeile und Feldwert", () => {
    expect(top("sparkasse vest")).toEqual({
      id: "42650150",
      name: "Sparkasse Vest Recklinghausen",
      place: "Recklinghausen",
      detail: "Recklinghausen · BLZ 426 501 50",
      value: "Sparkasse Vest Recklinghausen",
    });
    expect(searchBanks("sparkasse vest")).toHaveLength(1);
  });

  it("Umlaute: münchen, muenchen und munchen finden dieselben Münchner Banken", () => {
    const results = ["münchen", "muenchen", "munchen", "MÜNCHEN"].map((query) =>
      searchBanks(query),
    );
    for (const result of results) {
      expect(result).toEqual(results[0]);
      expect(`${result[0]!.name} ${result[0]!.place}`).toMatch(/München/);
    }
    expect(searchBanks("sparkasse münchen").map((bank) => bank.name)).toContain(
      "Stadtsparkasse München",
    );
  });

  it("Umlaute: koln, koeln und köln finden eine Kölner Bank", () => {
    const results = ["koln", "koeln", "köln", "Köln"].map((query) => searchBanks(query));
    for (const result of results) {
      expect(result).toEqual(results[0]);
      expect(result[0]!.name).toMatch(/Köln/);
    }
    expect(searchBanks("sparkasse köln").map((bank) => bank.name)).toEqual(
      expect.arrayContaining(["Sparkasse KölnBonn", "Kreissparkasse Köln"]),
    );
  });

  it("Commerzbank ist ein Vorschlag „an … Orten“ – ohne Ort, mit dem Namen als Feldwert", () => {
    const results = searchBanks("commerzbank");
    expect(results.filter((bank) => bank.name === "Commerzbank")).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "Commerzbank", place: "", value: "Commerzbank" });
    expect(results[0]!.detail).toMatch(/^an \d+ Orten$/);
  });

  it("Raiffeisenbank: mehrere Banken, jede mit Ort", () => {
    const results = searchBanks("raiffeisenbank");
    expect(results.length).toBe(BANK_SUGGESTION_LIMIT);
    for (const bank of results) {
      expect(bank.name.startsWith("Raiffeisenbank")).toBe(true);
      expect(bank.place).not.toBe("");
    }
    // Die gleichnamigen „Raiffeisenbank“ unterscheiden sich im Feldwert durch den Ort
    const lauenburg = top("raiffeisenbank lauenburg");
    expect(lauenburg).toMatchObject({ name: "Raiffeisenbank", value: "Raiffeisenbank Lauenburg" });
  });

  it("DKB findet beide Einträge der Deutschen Kreditbank", () => {
    expect(searchBanks("dkb").map((bank) => bank.name)).toEqual([
      "Deutsche Kreditbank Berlin",
      "Deutsche Kreditbank",
    ]);
    expect(searchBanks("dkb")[1]!.detail).toMatch(/^an \d+ Orten · BLZ 120 300 00$/);
  });

  it("WELADED1 (8 Zeichen) findet Banken mit dieser BIC – genau oder als Anfang", () => {
    const results = searchBanks("WELADED1");
    expect(results).toHaveLength(BANK_SUGGESTION_LIMIT);
    for (const result of results) {
      expect(byId.get(result.id)!.bics.some((bic) => bic.startsWith("WELADED1"))).toBe(true);
    }
    // 8 Zeichen = 11 Zeichen mit „XXX“
    expect(top("COBADEFF")?.name).toBe("Commerzbank");
  });

  it("Bankleitzahl-Anfang: Treffer nach Bankleitzahl geordnet, die gefundene steht in der zweiten Zeile", () => {
    const results = searchBanks("4265");
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) expect(result.detail).toMatch(/BLZ 426 5\d\d \d\d$/);
    const commerzbank = searchBanks("42640048")[0]!;
    expect(commerzbank).toMatchObject({
      name: "Commerzbank",
      detail: expect.stringMatching(/BLZ 426 400 48$/),
    });
  });

  it("freier Text ohne passende Bank liefert nichts (und bleibt erlaubt)", () => {
    for (const query of ["Vereinsheim", "PayPal", "Sparkasse Musterstadt", "Barkasse"]) {
      expect(searchBanks(query)).toEqual([]);
    }
  });
});

describe("Bank-Vorschläge: robuste Eingaben", () => {
  const nasty = [
    "<script>alert(1)</script>",
    "%",
    "_",
    "%%",
    "__",
    "a",
    "x".repeat(BANK_QUERY_MAX_LENGTH),
    "x".repeat(BANK_QUERY_MAX_LENGTH + 1),
    "sparkasse ".repeat(7),
    "🏦🏦",
    "Sparkasse 🏦",
    "",
    "   ",
    "\n\t",
    "a b c d e f g h i j k l m n o p q r s t u v w x y z 1 2 3 4",
    "' OR 1=1 --",
    "../../etc/passwd",
    "\u0000\u0001",
    "Ⅻ ﬁ ẞ",
    "DE00",
    "DE12 4265 0150 0000 0000 0000 0000",
    "12345678901",
    "Сбербанк",
    "銀行",
  ];

  it.each(nasty)("%j: kein Fehler, höchstens 8 Vorschläge, immer gleich", (query) => {
    const first = searchBanks(query);
    expect(first.length).toBeLessThanOrEqual(BANK_SUGGESTION_LIMIT);
    expect(searchBanks(query)).toEqual(first);
    for (const bank of first) {
      expect(bank.value.length).toBeLessThanOrEqual(BANK_QUERY_MAX_LENGTH);
      expect(byId.has(bank.id)).toBe(true);
    }
    expect(new Set(first.map((bank) => bank.id)).size).toBe(first.length);
  });

  it("zu kurz, zu lang, nur Leerzeichen oder nur Zeichen ohne Buchstaben → leer", () => {
    for (const query of [
      "a",
      "",
      "   ",
      "%",
      "_",
      "🏦",
      "<>",
      "x".repeat(BANK_QUERY_MAX_LENGTH + 1),
    ]) {
      expect(searchBanks(query)).toEqual([]);
    }
    expect(searchBanks("<script>alert(1)</script>")).toEqual([]);
  });

  it("die Grenze lässt sich nur verkleinern", () => {
    expect(searchBanks("sparkasse", 3)).toHaveLength(3);
    expect(searchBanks("sparkasse", 1000)).toHaveLength(BANK_SUGGESTION_LIMIT);
    expect(searchBanks("sparkasse", 0)).toEqual([]);
    expect(searchBanks("sparkasse", -5)).toEqual([]);
  });

  it("die besten 8 sind dieselben wie nach vollständigem Sortieren (Bestenliste ohne Sortieren)", () => {
    for (const query of ["volksbank", "sparkasse", "bank", "ra", "18", "deutsche"]) {
      const eight = searchBanks(query);
      const three = searchBanks(query, 3);
      expect(three).toEqual(eight.slice(0, 3));
    }
  });
});
