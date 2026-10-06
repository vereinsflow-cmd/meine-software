/**
 * Reine Hilfsfunktionen für die Bank-Vorschläge (`GET /api/banken`): Schreibweisen angleichen, Suchwörter bilden,
 * Bankleitzahl, BIC und IBAN erkennen. Ohne Server-Code – einzeln testbar.
 *
 * Grundidee: Jedes Suchwort muss der Anfang eines Wortes sein („spark vest“ findet „Sparkasse Vest Recklinghausen“, „ing“
 * aber nicht „Sparkasse Göttingen“). Umlaute werden auf beiden Seiten angeglichen: „münchen“, „muenchen“ und „munchen“
 * finden alle „München“; „gießen“ und „giessen“ finden „Gießen“.
 */

const UMLAUT_AE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
const UMLAUT_A: Record<string, string> = { ä: "a", ö: "o", ü: "u", ß: "ss" };

function fold(text: string, umlauts: Record<string, string>): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (ch) => umlauts[ch] ?? ch)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

/** Klein, Umlaute als „ae/oe/ue“, ß als „ss“, übrige Akzente entfernt: „Köln“ → „koeln“. */
export const foldAe = (text: string): string => fold(text, UMLAUT_AE);
/** Klein, Umlaute ohne „e“, ß als „ss“: „Köln“ → „koln“ – so, wie man ohne Umlaut-Taste oft tippt. */
export const foldA = (text: string): string => fold(text, UMLAUT_A);

const splitWords = (folded: string): string[] => folded.split(/[^a-z0-9]+/).filter(Boolean);

/** Suchtext bereinigen: Leerraum (auch Zeilenumbrüche) zu einem Leerzeichen, ohne Leerzeichen am Rand. */
export function normalizeBankQuery(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Suchwörter aus der Eingabe: angeglichen wie `foldAe`, Satzzeichen trennen („Sparda-Bank“ → sparda, bank), doppelte
 * Wörter entfallen. Zeichen außerhalb von a–z und 0–9 (Emoji, `<`, `%` …) bleiben einfach weg.
 */
export function queryWords(text: string): string[] {
  return [...new Set(splitWords(foldAe(text)))];
}

/**
 * Zusammengesetzte Namen, unter deren zweitem Teil man auch sucht: „Kreissparkasse“ findet man mit „sparkasse“ (eine
 * „Bausparkasse“ aber nicht – sie ist keine Sparkasse).
 */
const COMPOUND_ENDINGS = ["sparkasse", "volksbank", "raiffeisenbank"];
const isCompoundOf = (word: string, ending: string): boolean =>
  word.length > ending.length && word.endsWith(ending) && !word.endsWith(`bau${ending}`);

/**
 * Alle Wortanfänge, unter denen ein Text gefunden wird – je Schreibweise (ae und a):
 *   - die einzelnen Wörter („Sparda-Bank West“ → sparda, bank, west),
 *   - zusammengeschriebene Teile („spardabank“) und der ganze Name ohne Leerzeichen („spardabankwest“),
 *   - Binnenmajuskeln getrennt („KölnBonn“ → koeln, bonn; „apoBank“ → apo, bank),
 *   - der zweite Teil bekannter Zusammensetzungen („Stadtsparkasse“ → sparkasse).
 */
export function wordKeys(text: string): Set<string> {
  const keys = new Set<string>();
  const camel = text.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
  for (const folding of [foldAe, foldA]) {
    const folded = folding(text);
    const words = splitWords(folded);
    for (const word of [...words, ...splitWords(folding(camel))]) {
      keys.add(word);
      for (const ending of COMPOUND_ENDINGS) if (isCompoundOf(word, ending)) keys.add(ending);
    }
    for (const chunk of folded.split(/\s+/)) {
      const joined = chunk.replace(/[^a-z0-9]/g, "");
      if (joined) keys.add(joined);
    }
    const compact = words.join("");
    if (compact) keys.add(compact);
  }
  return keys;
}

/**
 * Such-Schlüssel mehrerer Texte als eine Zeichenkette „ wort1 wort2 … “. Ein Suchwort passt, wenn `" " + wort` darin
 * vorkommt (`matchesWordStart`) – das ist ein Wortanfang, ohne für jede Anfrage Listen durchlaufen zu müssen.
 */
export function searchKeys(texts: readonly string[]): string {
  const keys = new Set<string>();
  for (const text of texts) for (const key of wordKeys(text)) keys.add(key);
  return keys.size === 0 ? " " : ` ${[...keys].join(" ")} `;
}

/** Passt eine der Schreibweisen eines Suchworts auf einen Wortanfang in `keys` (aus `searchKeys`)? */
export function matchesWordStart(keys: string, alternatives: readonly string[]): boolean {
  return alternatives.some((word) => keys.includes(` ${word}`));
}

/** Der Name als Wortfolge je Schreibweise („sparkasse vest recklinghausen“) – für „Name beginnt mit der Eingabe“. */
export function namePhrases(name: string): string[] {
  return [...new Set([foldAe, foldA].map((folding) => splitWords(folding(name)).join(" ")))];
}

/** „42650150“ → „426 501 50“ (Schreibweise der Bundesbank: zwei Dreierblöcke und ein Zweierblock). */
export function formatBankCode(code: string): string {
  return /^\d{8}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}` : code;
}

/** Nur Ziffern, auch mit Leerzeichen („426 501 50“), 2 bis 8 Stellen → Bankleitzahl oder ihr Anfang. */
export function bankCodeQuery(text: string): string | null {
  const compact = text.replace(/\s+/g, "");
  return /^\d{2,8}$/.test(compact) ? compact : null;
}

/**
 * Eine deutsche BIC oder ihr Anfang (ab 6 Zeichen; Stelle 5–6 ist „DE“), in Großbuchstaben. „WELADED1“ (8 Zeichen) ist
 * dieselbe BIC wie „WELADED1XXX“.
 */
export function bicQuery(text: string): string | null {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{4}DE[A-Z0-9]{0,5}$/.test(compact) ? compact : null;
}

/**
 * Bankleitzahl aus einer angefangenen deutschen IBAN, sobald sie vollständig getippt ist (Stelle 5–12):
 * „DE12 4265 0150 …“ → „42650150“. Die ganze IBAN prüft `bankCodeFromIban` (src/lib/bank-suggestions.ts).
 */
export function bankCodeFromIbanStart(text: string): string | null {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  return /^DE\d{10,20}$/.test(compact) ? compact.slice(4, 12) : null;
}
