import "server-only";
import {
  bankCodeFromIbanStart,
  bankCodeQuery,
  bicQuery,
  formatBankCode,
  matchesWordStart,
  namePhrases,
  normalizeBankQuery,
  queryWords,
  searchKeys,
} from "@/lib/bank-search";
import {
  BANK_QUERY_MAX_LENGTH,
  BANK_QUERY_MIN_LENGTH,
  BANK_SUGGESTION_LIMIT,
  bankCodeFromIban,
  type BankSuggestion,
} from "@/lib/bank-suggestions";
import { BANK_ALIASES, WORD_ABBREVIATIONS } from "./aliases";
import file from "./bank-codes-de.json";

/*
 * Deutsche Banken für die Vorschläge im Feld „Bank“ (Konten der Finanzen). Liegen der Anwendung bei – keine Anfrage an
 * fremde Dienste, funktioniert auch ohne Internet.
 *
 * Quelle: Deutsche Bundesbank, Bankleitzahlendatei (gültig vom 07.09.2026 bis 06.12.2026, Stand in `BANK_DATA.meta`),
 * https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592
 * – ausgewählt und zusammengefasst mit `scripts/build-bank-codes.mjs` (dort auch, welche technischen Bankleitzahlen
 * wegfallen). Bezeichnungen und Orte sind unverändert. Aktualisieren: viermal im Jahr das Skript erneut ausführen.
 */

/** Zeile der JSON-Datei – Reihenfolge wie in `scripts/build-bank-codes.mjs` beschrieben. */
type Row = [
  id: string,
  name: string,
  place: string,
  plz: string,
  codes: string[],
  bics: string[],
  short: string,
  places: string[],
  branches: string[],
  otherNames: string[],
  count: number,
  deletion: number,
  value: string,
];

export interface BankEntry {
  /** Erste Bankleitzahl, bei Standorten mit eigenem Namen mit Zusatz („12030000-2“). */
  id: string;
  name: string;
  /** Leer, wenn die Bank unter diesem Namen an mehreren Orten sitzt (dann `places`). */
  place: string;
  plz: string;
  /** Alle Bankleitzahlen; die erste ist die angezeigte. */
  codes: readonly string[];
  bics: readonly string[];
  /** Kurzbezeichnung der Bundesbank, leer, wenn sie nichts Neues enthält. */
  short: string;
  places: readonly string[];
  /** Weitere Standorte (Merkmal 2) – nur Suchbegriffe. */
  branches: readonly string[];
  otherNames: readonly string[];
  /** Anzahl Orte insgesamt (Rangfolge: größere Banken zuerst). */
  count: number;
  /** Die Bundesbank hat die Löschung der Bankleitzahl angekündigt – weiter hinten einsortiert. */
  deletion: boolean;
  /** Was ins Feld geschrieben wird. */
  value: string;
}

export const BANK_DATA = {
  meta: file.meta,
  banks: (file.banks as unknown as Row[]).map((row): BankEntry => ({
    id: row[0],
    name: row[1],
    place: row[2],
    plz: row[3],
    codes: row[4],
    bics: row[5],
    short: row[6],
    places: row[7],
    branches: row[8],
    otherNames: row[9],
    count: row[10],
    deletion: row[11] === 1,
    value: row[12] || row[1],
  })),
};

// ---------------------------------------------------------------------------------------------------------------------
// Suchindex – einmal beim Laden des Moduls, danach nur gelesen
// ---------------------------------------------------------------------------------------------------------------------

interface IndexedBank {
  bank: BankEntry;
  /** Wortanfänge der Bezeichnung. */
  name: string;
  /** Bezeichnung als Wortfolge (beide Umlaut-Schreibweisen) – „beginnt mit“. */
  phrases: readonly string[];
  /** Dieselben Wortfolgen als Wörter – an welcher Stelle der Bezeichnung passt die Eingabe? */
  nameWords: readonly (readonly string[])[];
  /** Wortanfänge des Ortes bzw. der Orte. */
  place: string;
  /** Wortanfänge von Kurzbezeichnung, Zweigorten, weiteren Namen und eigenen Kurzformen. */
  other: string;
  /** Alles zusammen – schneller Vorfilter. */
  all: string;
  /** Eigene Kurzformen als ganze Wortfolge („dkb“, „ing diba“). */
  aliases: ReadonlySet<string>;
}

const INDEX: readonly IndexedBank[] = (() => {
  const aliasNames = new Map<BankEntry, string[]>();
  for (const alias of BANK_ALIASES) {
    for (const bank of BANK_DATA.banks) {
      if (!bank.codes.includes(alias.blz)) continue;
      if (alias.nameStart && !bank.name.startsWith(alias.nameStart)) continue;
      aliasNames.set(bank, [...(aliasNames.get(bank) ?? []), ...alias.names]);
    }
  }
  return BANK_DATA.banks.map((bank) => {
    const aliases = aliasNames.get(bank) ?? [];
    const name = searchKeys([bank.name]);
    const place = searchKeys([bank.place, ...bank.places]);
    const other = searchKeys([bank.short, ...bank.branches, ...bank.otherNames, ...aliases]);
    const phrases = namePhrases(bank.name);
    return {
      bank,
      name,
      phrases,
      nameWords: phrases.map((phrase) => phrase.split(" ")),
      place,
      other,
      all: `${name}${place}${other}`,
      aliases: new Set(aliases.map((alias) => queryWords(alias).join(" "))),
    };
  });
})();

// ---------------------------------------------------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------------------------------------------------

/** Rangstufen (höher = weiter vorn), nach der Prüfung der Bank-Vorschläge festgelegt. */
const TIER = {
  /** Bankleitzahl, BIC oder IBAN genau. */
  CODE: 100,
  /** Eigene Kurzform genau („dkb“, „ing“). */
  ALIAS: 90,
  /** Die Bezeichnung beginnt mit der Eingabe. */
  NAME_START: 80,
  /** Alle Wörter sind Wortanfänge der Bezeichnung. */
  NAME_WORDS: 70,
  /** Anfang einer Bankleitzahl oder BIC. */
  CODE_PREFIX: 65,
  /** Wörter in Bezeichnung und Ort – die Bank sitzt an diesem einen Ort. */
  NAME_SEAT: 62,
  /** Wörter in Bezeichnung und Orten einer Bank, die an vielen Orten sitzt („commerzbank recklinghausen“). */
  NAME_PLACE: 60,
  /** Auch Kurzbezeichnung, Zweigorte, weitere Namen, eigene Kurzformen. */
  OTHER: 50,
} as const;

interface ParsedQuery {
  /** Je Suchwort seine Schreibweisen (das Wort selbst und ggf. die ausgeschriebene Abkürzung). */
  words: readonly (readonly string[])[];
  /** Mehrere Wörter zusammengeschrieben („targo bank“ → „targobank“) – als ein Wort. */
  joined: string | null;
  /** Wortfolgen für „beginnt mit“ und für die eigenen Kurzformen. */
  phrases: readonly string[];
  /** Bankleitzahl (8 Stellen) oder ihr Anfang. */
  code: string | null;
  bic: string | null;
  /** Aus einer IBAN: dann wird nur die Bankleitzahl gesucht. */
  fromIban: boolean;
}

/**
 * Rechtsformen – in den Bezeichnungen der Bundesbank stehen sie (fast) nie, vom Kontoauszug abgeschrieben aber oft:
 * „Berliner Volksbank eG“ sucht „Berliner Volksbank“. In dieser Schreibweise fallen sie immer weg; anders geschrieben
 * („eg“, „Ag“) könnten sie auch ein angefangener Ort sein („Sparkasse eg…“ → Eggenfelden) – dann erst, wenn sonst nichts
 * passt.
 */
const LEGAL_FORMS = ["eG", "AG", "SE", "KGaA", "GmbH", "mbH"];
const LEGAL_FORM_KEYS = new Set(LEGAL_FORMS.map((form) => form.toLowerCase()));

/** Suchtext ohne Rechtsformen; `null`, wenn keine darin steht oder sonst nichts Suchbares übrig bliebe. */
function withoutLegalForms(text: string, anyCase: boolean): string | null {
  const tokens = text.split(" ");
  const kept = tokens.filter((token) => {
    const letters = token.replace(/[^\p{L}\p{N}]/gu, ""); // „e.G.“, „AG,“
    return !(anyCase ? LEGAL_FORM_KEYS.has(letters.toLowerCase()) : LEGAL_FORMS.includes(letters));
  });
  const rest = kept.join(" ");
  if (kept.length === tokens.length || rest.length < BANK_QUERY_MIN_LENGTH) return null;
  return queryWords(rest).length > 0 ? rest : null;
}

function parseQuery(text: string): ParsedQuery | null {
  const ibanCode = bankCodeFromIban(text) ?? bankCodeFromIbanStart(text);
  if (ibanCode) {
    return { words: [], joined: null, phrases: [], code: ibanCode, bic: null, fromIban: true };
  }
  const plain = queryWords(text);
  const expanded = plain.map((word) => WORD_ABBREVIATIONS[word] ?? word);
  const code = bankCodeQuery(text);
  const bic = bicQuery(text);
  if (plain.length === 0 && !code && !bic) return null;
  return {
    words: plain.map((word, i) => (expanded[i] === word ? [word] : [word, expanded[i]!])),
    joined: plain.length > 1 ? plain.join("") : null,
    phrases: [...new Set([plain.join(" "), expanded.join(" ")])],
    code,
    bic,
    fromIban: false,
  };
}

/** Rangstufe der Textsuche für eine Bank (0 = passt nicht). */
function textTier(entry: IndexedBank, query: ParsedQuery): number {
  if (query.words.length === 0) return 0;
  if (query.phrases.some((phrase) => entry.aliases.has(phrase))) return TIER.ALIAS;
  return Math.max(
    wordsTier(entry, query.words, query.phrases),
    query.joined ? wordsTier(entry, [[query.joined]], [query.joined]) : 0,
  );
}

function wordsTier(
  entry: IndexedBank,
  words: readonly (readonly string[])[],
  phrases: readonly string[],
): number {
  if (!words.every((alternatives) => matchesWordStart(entry.all, alternatives))) return 0;
  if (words.every((alternatives) => matchesWordStart(entry.name, alternatives))) {
    const starts = entry.phrases.some((name) => phrases.some((phrase) => name.startsWith(phrase)));
    return starts ? TIER.NAME_START : TIER.NAME_WORDS;
  }
  const inNameOrPlace = words.every(
    (alternatives) =>
      matchesWordStart(entry.name, alternatives) || matchesWordStart(entry.place, alternatives),
  );
  if (!inNameOrPlace) return TIER.OTHER;
  return entry.bank.place ? TIER.NAME_SEAT : TIER.NAME_PLACE;
}

/**
 * An welcher Stelle der Bezeichnung das erste Suchwort passt (0 = erstes Wort). Bei gleicher Rangstufe steht vorn, wessen
 * Name mit dem Gesuchten näher am Anfang steht: „köln“ → „Kreissparkasse Köln“ vor „Isbank Fil Köln“.
 */
function namePosition(entry: IndexedBank, query: ParsedQuery): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const alternatives of query.words) {
    for (const words of entry.nameWords) {
      const index = words.findIndex((word) => alternatives.some((alt) => word.startsWith(alt)));
      if (index >= 0 && index < best) best = index;
    }
  }
  return best;
}

/** Rangstufe für Bankleitzahl/BIC und die passende Bankleitzahl (für die Anzeige). */
function codeTier(bank: BankEntry, query: ParsedQuery): { tier: number; code?: string } {
  let best: { tier: number; code?: string } = { tier: 0 };
  if (query.code) {
    const exact = query.code.length === 8;
    for (const code of bank.codes) {
      if (exact ? code === query.code : code.startsWith(query.code)) {
        return { tier: exact ? TIER.CODE : TIER.CODE_PREFIX, code };
      }
    }
  }
  if (query.bic) {
    const bic = query.bic;
    if (bank.bics.some((own) => own === bic || (bic.length === 8 && own === `${bic}XXX`))) {
      best = { tier: TIER.CODE };
    } else if (bank.bics.some((own) => own.startsWith(bic))) {
      best = { tier: TIER.CODE_PREFIX };
    }
  }
  return best;
}

interface Candidate {
  bank: BankEntry;
  tier: number;
  /** Die Eingabe ist genau die Bezeichnung („Sparkasse Witten“ vor „Sparkasse Wittenberg“) – nur bei eindeutigen Namen. */
  exact: boolean;
  /** Gefundene Bankleitzahl, wenn danach gesucht wurde. */
  code?: string;
  /** Stelle des Treffers in der Bezeichnung (nur für „alle Wörter in der Bezeichnung“). */
  position: number;
}

const collator = new Intl.Collator("de");

/**
 * Reihenfolge: Rangstufe, dann genau die Bezeichnung (vor längeren mit gleichem Anfang), bei Bankleitzahl-Anfang die
 * Bankleitzahl, bei Wörtern der Bezeichnung die Stelle des Treffers, dann nicht zur Löschung angekündigt, mehr Orte, Name.
 */
function compare(a: Candidate, b: Candidate): number {
  return (
    b.tier - a.tier ||
    Number(b.exact) - Number(a.exact) ||
    (a.tier === TIER.CODE_PREFIX && a.code && b.code ? a.code.localeCompare(b.code) : 0) ||
    a.position - b.position ||
    Number(a.bank.deletion) - Number(b.bank.deletion) ||
    b.bank.count - a.bank.count ||
    collator.compare(a.bank.name, b.bank.name) ||
    collator.compare(a.bank.place, b.bank.place) ||
    a.bank.id.localeCompare(b.bank.id)
  );
}

/** Fügt in eine sortierte Bestenliste ein, ohne alle Treffer sortieren zu müssen. */
function insertTop(top: Candidate[], candidate: Candidate, limit: number): void {
  if (top.length === limit && compare(candidate, top[limit - 1]!) >= 0) return;
  let index = top.length;
  while (index > 0 && compare(candidate, top[index - 1]!) < 0) index--;
  top.splice(index, 0, candidate);
  if (top.length > limit) top.pop();
}

function detailOf(bank: BankEntry, code: string | undefined): string {
  const shown = formatBankCode(code ?? bank.codes[0]!);
  if (bank.place) return `${bank.place} · BLZ ${shown}`;
  const where = `an ${bank.count} Orten`;
  return code || bank.codes.length === 1 ? `${where} · BLZ ${shown}` : where;
}

/** Die besten Treffer zu einem Suchtext, sortiert (höchstens `max`). */
function bestMatches(text: string, max: number): Candidate[] {
  const query = parseQuery(text);
  const top: Candidate[] = [];
  if (!query) return top;
  for (const entry of INDEX) {
    const byCode = codeTier(entry.bank, query);
    const tier = query.fromIban ? byCode.tier : Math.max(byCode.tier, textTier(entry, query));
    if (tier === 0) continue;
    const position = tier === TIER.NAME_WORDS ? namePosition(entry, query) : 0;
    const exact =
      tier === TIER.NAME_START &&
      entry.bank.value === entry.bank.name && // „Volksbank“: gibt es oft – dann zählt das nicht
      entry.phrases.some((phrase) => query.phrases.includes(phrase));
    insertTop(top, { bank: entry.bank, tier, exact, code: byCode.code, position }, max);
  }
  return top;
}

/**
 * Vorschläge zu einer Eingabe – Name, Ort, Bankleitzahl (auch mit Leerzeichen), BIC oder IBAN, beste zuerst, höchstens
 * `BANK_SUGGESTION_LIMIT`. Zu kurze, zu lange oder unbrauchbare Eingaben liefern eine leere Liste.
 */
export function searchBanks(input: string, limit = BANK_SUGGESTION_LIMIT): BankSuggestion[] {
  const text = normalizeBankQuery(input);
  if (text.length < BANK_QUERY_MIN_LENGTH || text.length > BANK_QUERY_MAX_LENGTH) return [];
  const max = Number.isFinite(limit)
    ? Math.min(Math.max(0, Math.floor(limit)), BANK_SUGGESTION_LIMIT)
    : BANK_SUGGESTION_LIMIT;
  if (max === 0) return [];

  let top = bestMatches(withoutLegalForms(text, false) ?? text, max);
  if (top.length === 0) {
    const relaxed = withoutLegalForms(text, true);
    if (relaxed) top = bestMatches(relaxed, max);
  }
  return top.map(({ bank, code }) => ({
    id: bank.id,
    name: bank.name,
    place: bank.place,
    detail: detailOf(bank, code),
    value: bank.value,
  }));
}
