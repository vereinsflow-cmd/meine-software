/*
 * Eigene Kurzformen für die Bank-Vorschläge – nicht von der Bundesbank, sondern so, wie Vereine ihre Bank nennen. Die
 * Bundesbank führt z. B. die DKB als „Deutsche Kreditbank Berlin“ und die Consorsbank als „BNP Paribas Niederlassung
 * Deutschland“; ohne diese Liste fände „dkb“ oder „consorsbank“ nichts.
 *
 * Ziel ist jeweils eine Bankleitzahl: Vorgeschlagen werden die Banken, zu denen sie gehört (Bezeichnung unverändert laut
 * Bundesbank). tests/unit/bank-codes.test.ts prüft, dass es jede Bankleitzahl in den Daten gibt – nach dem
 * vierteljährlichen Aktualisieren also den Test laufen lassen.
 */

export interface BankAlias {
  /** So schreiben es Leute, z. B. „dkb“ (Groß-/Kleinschreibung und Umlaute egal). */
  names: readonly string[];
  /** Bankleitzahl der gemeinten Bank. */
  blz: string;
  /** Nur Einträge unter dieser Bankleitzahl, deren Bezeichnung so beginnt (sonst alle, z. B. beide DKB-Einträge). */
  nameStart?: string;
}

export const BANK_ALIASES: readonly BankAlias[] = [
  { names: ["DKB"], blz: "12030000" }, // Deutsche Kreditbank Berlin
  { names: ["HVB", "Hypovereinsbank", "Hypo Vereinsbank"], blz: "70020270" }, // UniCredit Bank - HypoVereinsbank
  { names: ["Consorsbank", "Consors"], blz: "76030080" }, // BNP Paribas Niederlassung Deutschland, Nürnberg
  { names: ["DAB", "DAB BNP Paribas"], blz: "70120400" }, // BNP Paribas Niederlassung Deutschland, Nürnberg
  { names: ["comdirect", "com direct"], blz: "20041111" }, // Commerzbank - GF comdirect, Quickborn
  { names: ["1822", "1822direkt", "1822 direkt"], blz: "50050222" }, // Frankfurter Sparkasse GF 1822direkt
  { names: ["ING", "ING DiBa", "DiBa"], blz: "50010517" }, // ING-DiBa (vor „ING Bank“, der Firmenkundenbank)
  { names: ["Postbank"], blz: "10010010" }, // Postbank Ndl der Deutsche Bank
  { names: ["Targo", "Targobank", "Targo Bank"], blz: "30020900" }, // TARGOBANK, Düsseldorf
  { names: ["Santander", "Santander Consumer Bank"], blz: "31010833" }, // heute „Openbank Deutschland“
  { names: ["Santander"], blz: "50320500" }, // Banco Santander Filiale Frankfurt
  { names: ["GLS", "GLS Bank"], blz: "43060967" }, // GLS Gemeinschaftsbank, Bochum
  {
    names: ["apoBank", "Apobank", "Deutsche Apotheker- und Ärztebank", "Apotheker und Ärztebank"],
    blz: "30060601",
  }, // apoBank, Düsseldorf
  { names: ["VW Bank", "Volkswagen Bank"], blz: "27020000" },
  { names: ["BW Bank", "BW-Bank", "BWBank"], blz: "60020030" }, // Baden-Württembergische Bank, Stuttgart
  {
    names: ["LBBW"],
    blz: "60050101",
    nameStart: "Landesbank Baden-Württemberg/Baden-Württembergische Bank",
  },
  { names: ["Haspa"], blz: "20050550" }, // Hamburger Sparkasse
  { names: ["Naspa"], blz: "51050015" }, // Nassauische Sparkasse
  { names: ["Berliner Sparkasse"], blz: "10050000" },
  { names: ["OLB"], blz: "28020050" }, // Oldenburgische Landesbank (sonst gewinnt der Ort Olbernhau)
  { names: ["BFS", "Bank für Sozialwirtschaft"], blz: "37020500" }, // heute „SozialBank“
  { names: ["MBS"], blz: "16050000" }, // Mittelbrandenburgische Sparkasse in Potsdam
  { names: ["Fraspa"], blz: "50050201" }, // Frankfurter Sparkasse
  { names: ["Nospa"], blz: "21750000" }, // Nord-Ostsee Sparkasse
];

/**
 * Abkürzungen einzelner Wörter (wie in den Kurzbezeichnungen der Bundesbank): „ksk köln“ sucht auch „kreissparkasse
 * köln“, „spk vest“ auch „sparkasse vest“. Schlüssel und Wert klein und ohne Umlaute.
 */
export const WORD_ABBREVIATIONS: Readonly<Record<string, string>> = {
  ksk: "kreissparkasse",
  spk: "sparkasse",
  ssk: "stadtsparkasse",
  vb: "volksbank",
  voba: "volksbank",
  raiba: "raiffeisenbank",
  raika: "raiffeisenbank",
  rbk: "raiffeisenbank",
  raiffbk: "raiffeisenbank",
  spardabank: "sparda",
};
