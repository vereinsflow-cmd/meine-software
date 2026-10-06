#!/usr/bin/env node
/**
 * Erzeugt `src/server/banks/bank-codes-de.json`: deutsche Banken für die Vorschläge im Feld „Bank“ (Konten der Finanzen).
 *
 *   node scripts/build-bank-codes.mjs                         (lädt die aktuelle Datei von der Bundesbank, braucht Internet)
 *   node scripts/build-bank-codes.mjs --file blz.txt --page download-seite.html
 *   node scripts/build-bank-codes.mjs --file blz.txt --gueltig-ab 07.09.2026 --gueltig-bis 06.12.2026
 *   … --pruefen                                               (zeigt zusätzlich, welche Namen der Filter verwirft)
 *
 * Quelle: Deutsche Bundesbank, Bankleitzahlendatei (Textformat, „blz-aktuell-txt-data.txt“) von
 * https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592
 * Nutzungsbedingungen der Bundesbank (Abschnitt 4.1): Speichern und Weitergeben ist auch geschäftlich erlaubt, wenn der
 * Inhalt nicht verändert wird und die Quelle genannt ist – „Quelle: Deutsche Bundesbank“ steht im Impressum, in der
 * README und in `src/server/banks/bank-codes.ts`. Bezeichnung, Ort, Postleitzahl, Bankleitzahl und BIC bleiben deshalb
 * Zeichen für Zeichen unverändert; das Skript wählt nur aus und fasst zusammen.
 *
 * Aktualisieren: Die Bundesbank gibt die Datei viermal im Jahr neu heraus – gültig ab dem Montag nach dem ersten Samstag
 * im März, Juni, September und Dezember, veröffentlicht bis zum 20. Februar, Mai, August und November. Danach dieses
 * Skript erneut ausführen und die JSON-Datei einchecken (gleiche Datei → gleiche Ausgabe, kein Zeitstempel).
 *
 * Auswahl (Satzaufbau: Merkblatt der Bundesbank, Anhang 1 – 168 Zeichen je Zeile, ISO-8859-1):
 *   - Datensätze mit Änderungskennzeichen „D“ (gelöscht) fallen weg.
 *   - Grundlage sind die Hauptdatensätze (Merkmal 1) ohne technische Bezeichnungen: alte Bankleitzahlen nach Fusionen
 *     („-alt-“), Verrechnungs- und Geldautomaten-Bankleitzahlen (Settlement, ITGK, GAA, Zw 55, Service-BZ …) und interne
 *     Geschäftsfelder („Gf P2“, „GF-B48“). Echte Marken in einem Geschäftsfeld bleiben (comdirect, 1822direkt …).
 *   - Weitere Standorte (Merkmal 2) werden zu Suchbegriffen ihrer Bank („sparkasse dorsten“ findet die Sparkasse Vest).
 *     Trägt ein Standort einen eigenen Namen („Deutsche Kreditbank“, „Volksbank Potsdam Zndl d Berliner Volksbank“),
 *     wird er ein eigener Vorschlag mit Bankleitzahl und BIC seiner Hauptstelle.
 *   - Gleiche Namen: Liegt dieselbe Bank an vielen Orten (Commerzbank, Deutsche Bank, Postbank …), gibt es einen
 *     Vorschlag „an … Orten“; die Orte bleiben Suchbegriffe. Genossenschaftsbanken (BIC beginnt mit „GENO“) mit
 *     gleichem Namen sind dagegen meist verschiedene Banken und bleiben einzeln, mit Ort.
 *   - Feldwert ist die Bezeichnung. Nur wo ein allgemeiner Name mehrere verschiedene Banken meint („Volksbank“,
 *     „Raiffeisenbank“, „VR Bank“), kommt der Ort dazu („Raiffeisenbank Lauenburg“) – höchstens 60 Zeichen.
 *
 * Ausgabe: `{ meta, banks }`; jede Bank ist eine Zeile (Liste statt Objekt – das hält die Datei klein):
 *   [id, Bezeichnung, Ort, PLZ, Bankleitzahlen[], BICs[], Kurzbezeichnung, Orte[], Zweigorte[], weitere Namen[],
 *    Anzahl Orte, Löschung angekündigt (0/1), Feldwert („“ = Bezeichnung)]
 * Die Kurzbezeichnung bleibt leer, wenn sie nur Wörter aus Bezeichnung und Orten enthält (bringt der Suche nichts).
 * Ort und PLZ sind leer, wenn eine Bank unter diesem Namen an mehreren Orten sitzt – dann stehen die Orte unter „Orte“.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "src", "server", "banks", "bank-codes-de.json");
const PAGE_URL =
  "https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592";
const ORIGIN = "https://www.bundesbank.de";
const RECORD_LENGTH = 168;
/** Höchstlänge des Feldes „Bank“ (`bankName`, siehe src/lib/bank-suggestions.ts). */
const VALUE_MAX = 60;
const collator = new Intl.Collator("de");
const byText = (a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------------------------------------------------
// Aufruf
// ---------------------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { file: null, page: null, from: null, until: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} braucht einen Wert.`);
      return value;
    };
    if (arg === "--file") args.file = next();
    else if (arg === "--page") args.page = next();
    else if (arg === "--gueltig-ab") args.from = isoDate(next());
    else if (arg === "--gueltig-bis") args.until = isoDate(next());
    else if (arg === "--pruefen") args.check = true;
    else throw new Error(`Unbekannte Angabe: ${arg}`);
  }
  if ((args.from || args.until) && !(args.from && args.until)) {
    throw new Error("--gueltig-ab und --gueltig-bis gehören zusammen.");
  }
  if (!args.file && (args.page || args.from))
    throw new Error("--page und --gueltig-ab brauchen --file.");
  if (args.file && !args.page && !args.from) {
    throw new Error(
      "Zu --file bitte --page <gespeicherte Download-Seite> oder --gueltig-ab/--gueltig-bis angeben.",
    );
  }
  return args;
}

/** „07.09.2026“ oder „2026-09-07“ → „2026-09-07“. */
function isoDate(text) {
  const german = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  const iso = german ? `${german[3]}-${german[2]}-${german[1]}` : text.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) {
    throw new Error(`Kein Datum: ${text}`);
  }
  return iso;
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------------------------------
// Download-Seite: Links auf die Textdatei samt „gültig vom … bis …“
// ---------------------------------------------------------------------------------------------------------------------

/** Alle Bankleitzahl-Textdateien der Download-Seite mit Gültigkeit, z. B. `{ href, from: "2026-09-07", until: … }`. */
function textFileLinks(html) {
  const links = [];
  for (const match of html.matchAll(/<a\s[^>]*href="([^"]+\.txt)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href, inner] = match;
    if (!/blz/i.test(href)) continue;
    const valid =
      /g(?:ü|&uuml;|&#252;|&#xfc;)ltig\s+vom\s+(\d{2}\.\d{2}\.\d{4})\s+bis\s+(\d{2}\.\d{2}\.\d{4})/i.exec(
        inner,
      );
    if (!valid) continue;
    links.push({
      href: new URL(href.replaceAll("&amp;", "&"), ORIGIN).href,
      from: isoDate(valid[1]),
      until: isoDate(valid[2]),
    });
  }
  return links;
}

/** Die Datei, die heute gilt; sonst die zuletzt gültig gewordene; sonst die nächste. */
function chooseLink(links, day) {
  if (links.length === 0) {
    throw new Error(
      "Auf der Download-Seite steht keine Bankleitzahlendatei im Textformat (Seite geändert?).",
    );
  }
  const sorted = [...links].sort((a, b) => b.from.localeCompare(a.from));
  return (
    sorted.find((link) => link.from <= day && day <= link.until) ??
    sorted.find((link) => link.from <= day) ??
    sorted.at(-1)
  );
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------------------------------------------------
// Datensätze lesen (Merkblatt Anhang 1; Positionen 1-basiert)
// ---------------------------------------------------------------------------------------------------------------------

function parseRecords(text) {
  const records = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line === "") continue;
    if (line.length !== RECORD_LENGTH) {
      throw new Error(
        `Zeile ${index + 1} hat ${line.length} statt ${RECORD_LENGTH} Zeichen – falsches Format?`,
      );
    }
    const field = (from, to) => line.slice(from - 1, to).trim();
    const record = {
      blz: field(1, 8),
      feature: field(9, 9), // Merkmal: 1 = Hauptdatensatz der Bankleitzahl, 2 = weiterer Standort
      name: field(10, 67),
      plz: field(68, 72),
      place: field(73, 107),
      short: field(108, 134),
      bic: field(140, 150),
      change: field(159, 159), // Änderungskennzeichen A, M, U oder D
      deletion: field(160, 160) === "1", // Löschung angekündigt (Bankleitzahl gilt noch)
    };
    if (
      !/^\d{8}$/.test(record.blz) ||
      !/^[12]$/.test(record.feature) ||
      !/^[AMUD]$/.test(record.change)
    ) {
      throw new Error(`Zeile ${index + 1} ist kein Datensatz der Bankleitzahlendatei.`);
    }
    if (
      record.feature === "1" &&
      !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(record.bic) &&
      record.bic !== ""
    ) {
      throw new Error(`Zeile ${index + 1}: unerwarteter BIC „${record.bic}“.`);
    }
    records.push(record);
  }
  return records;
}

// ---------------------------------------------------------------------------------------------------------------------
// Technische Bezeichnungen
// ---------------------------------------------------------------------------------------------------------------------

/** Geschäftsfelder („Gf …“) mit echten Kundenkonten – alle anderen sind interne Bankleitzahlen. */
const BUSINESS_LINE =
  /^(?:comdirect|1822direkt|Hamburg Direct Bank|Credit Agricole|Wüstenrot|Chase|PayCenter)\b/;

/** Alte Bankleitzahl nach einer Fusion („Volksbank Haltern -alt-“, abgeschnitten auch „… -alt“). */
const OLD_CODE = /-alt(?:-|$)/;

/** Bezeichnungen von Bankleitzahlen, bei denen niemand ein Vereinskonto hat. */
const TECHNICAL = [
  OLD_CODE,
  /Settlement/i, // „UniCredit Bank - HVB Settlement EAC01“
  /ITGK/, // interne Kontengruppen der Commerzbank
  /\bCC\b/, // „Commerzbank CC“, „Commerzbank, CC SP“
  /Processing/,
  /Clearing/,
  /^Bundesbank\b/, // Konten nur für Banken und öffentliche Stellen
  /^ZVA?\s/, // Zahlungsverkehr der Landesbanken („ZV Landesbank Baden-Württemberg“)
  /\bGAA\b/, // Geldautomaten
  /Service\s*-\s*BZ\b|Service-Center/,
  /Sonder-BLZ|\bGS nur für\b/,
  /\b(?:Zw|ZW|Ztv|Bs)\s+(?:\d|[A-Z]{1,2}(?![\p{L}\p{N}])|Münsterstraße)/u, // „Zw 55“, „Zw A“, „Ztv 22“, „Bs 80“, „Zw CS“
  /\s(?:\d{1,3}|I{1,3})$/, // „Filiale Berlin 2“, „Filiale Berlin III“, „INT 1“, „TF MZ 2“
  /\b(?:ehem\.|eh)\s+Filiale\b/, // ehemalige Filialen („Aareal Bank ehem. Filiale Hamburg“, „Isbank eh Filiale Mannheim“)
  /\bG[fF]\d/, // „ReiseBank Gf2“
];

function isTechnical(name) {
  if (TECHNICAL.some((pattern) => pattern.test(name))) return true;
  // Geschäftsfeld: „Gf P2“, „GF-B48“, „(Gf WP)“ … – außer den Marken oben
  for (const match of name.matchAll(/\bG[fF](?:\b|-)/g)) {
    const rest = name.slice(match.index + 2).replace(/^[\s-]+/, "");
    if (!BUSINESS_LINE.test(rest)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Weitere Standorte (Merkmal 2) mit eigenem Namen
// ---------------------------------------------------------------------------------------------------------------------

/** Wörter, die allein keine bestimmte Bank bezeichnen („Volksbank“, „VR Bank“, „Spar- und Kreditbank“, „PSD Bank“). */
const GENERIC_WORDS = new Set([
  "volksbank",
  "raiffeisenbank",
  "vr",
  "bank",
  "spar",
  "und",
  "kreditbank",
  "psd",
  "vereinigte",
  "genossenschaftsbank",
  "darlehnskasse",
  "sparkasse",
]);
const isGenericName = (name) =>
  name
    .toLowerCase()
    .split(/[\s,/-]+/)
    .filter(Boolean)
    .every((word) => GENERIC_WORDS.has(word));

/** Zweigstellen-Zusätze: „Zw“, „Gs“, „Hzw“, „Fil“, „Zweigstelle“, „Beratungscenter“. */
const BRANCH_LABEL = /(?:^|\s)(?:Zw\.?|ZW|Gs|Hzw|Fil\.?|Zweigstelle|Beratungscenter)(?:\s|$)/;

/** Nur Buchstaben und Ziffern, klein – für den Vergleich von Schreibweisen („Gabler Saliter“ = „Gabler-Saliter“). */
const squash = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Ist der Name eines weiteren Standorts nur eine Zweigstellen-Bezeichnung seiner Hauptstelle? Dann wird er Suchbegriff
 * statt eigener Vorschlag: „Volksbank Bühl Zw Ottersweier“, „Sparkasse Allgäu (Buchloe)“, „Erzgebirgssparkassee“,
 * „Volksbank in Ostwestfalen, Bielefeld“ (Hauptstelle „…, Gütersloh“), „Raiffeisenbank Lauenburg“ (Hauptstelle
 * „Raiffeisenbank“ in Lauenburg/Elbe). Unter einem allgemeinen Namen ist ein längerer Name mit anderem Ort dagegen der
 * genauere: „Raiffeisenbank Moormerland“ (Hauptstelle „Fehntjer VR Bank“) bleibt ein eigener Vorschlag.
 */
function isBranchLabel(name, parent) {
  const parentName = parent.name;
  if (BRANCH_LABEL.test(name)) return true;
  if (editDistance(squash(name), squash(parentName)) <= 2) return true;
  const rest = name.startsWith(parentName) ? name.slice(parentName.length) : null;
  if (rest !== null && /^[\s(,-]/.test(rest)) {
    if (!isGenericName(parentName)) return true;
    const restKey = squash(rest);
    if (restKey && squash(parent.place).startsWith(restKey)) return true; // „Raiffeisenbank“ + Ort der Hauptstelle
  }
  const comma = (text) => text.slice(0, text.lastIndexOf(", "));
  return name.includes(", ") && parentName.includes(", ") && comma(name) === comma(parentName);
}

// ---------------------------------------------------------------------------------------------------------------------
// Aufbereitung
// ---------------------------------------------------------------------------------------------------------------------

const isCooperative = (bic) => bic.startsWith("GENO");
const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort(byText);

function buildBanks(records, report) {
  const active = records.filter((record) => record.change !== "D");
  const mainByCode = new Map(active.filter((r) => r.feature === "1").map((r) => [r.blz, r]));
  const dropped = new Map(); // technischer Name → Anzahl (nur für --pruefen)
  const drop = (name) => dropped.set(name, (dropped.get(name) ?? 0) + 1);

  // 1. Vorschlags-Datensätze: Hauptdatensätze und Standorte mit eigenem Namen. Je Bankleitzahl die Zweigorte.
  const candidates = []; // Datensätze; Standorte mit eigenem Namen mit `ownName: true`
  const branchPlaces = new Map(); // Bankleitzahl → Set(Ort)
  const branchNames = new Map(); // Bankleitzahl → Set(Name)
  const addTo = (map, key, value) => (map.get(key) ?? map.set(key, new Set()).get(key)).add(value);
  for (const record of active) {
    const main = mainByCode.get(record.blz);
    if (!main) throw new Error(`Bankleitzahl ${record.blz} hat keinen Hauptdatensatz.`);
    if (record.feature === "1") {
      if (isTechnical(record.name)) drop(record.name);
      else candidates.push({ ...record });
      continue;
    }
    if (OLD_CODE.test(main.name)) continue; // Standorte einer alten Bankleitzahl
    if (isTechnical(record.name)) {
      drop(record.name);
      continue;
    }
    addTo(branchPlaces, record.blz, record.place);
    if (record.name === main.name) continue;
    if (isBranchLabel(record.name, main)) {
      addTo(branchNames, record.blz, record.name);
      continue;
    }
    candidates.push({ ...record, bic: main.bic, deletion: main.deletion, ownName: true });
  }

  // 2. Gleiche Namen zusammenfassen: dieselbe Bank an vielen Orten → ein Vorschlag; Genossenschaftsbanken je Bankleitzahl.
  const byName = new Map();
  for (const candidate of candidates) {
    (byName.get(candidate.name) ?? byName.set(candidate.name, []).get(candidate.name)).push(
      candidate,
    );
  }
  const groups = [];
  for (const members of byName.values()) {
    if (members.some((member) => isCooperative(member.bic))) {
      const byCode = new Map();
      for (const member of members) {
        (byCode.get(member.blz) ?? byCode.set(member.blz, []).get(member.blz)).push(member);
      }
      // Gleicher Name am gleichen Ort unter mehreren Bankleitzahlen: ein Vorschlag
      const byPlace = new Map();
      for (const group of byCode.values()) {
        const places = uniqueSorted(group.map((member) => member.place));
        const key = places.length === 1 ? places[0] : `\u0000${group[0].blz}`;
        byPlace.set(key, [...(byPlace.get(key) ?? []), ...group]);
      }
      groups.push(...byPlace.values());
    } else {
      groups.push(members);
    }
  }

  // 3. Einträge
  const banks = groups.map((members) => {
    // Hauptdatensätze zuerst, dann nach Bankleitzahl – der erste bestimmt id, PLZ, BIC und Kurzbezeichnung
    const sorted = [...members].sort(
      (a, b) =>
        Number(Boolean(a.ownName)) - Number(Boolean(b.ownName)) || a.blz.localeCompare(b.blz),
    );
    const first = sorted[0];
    const others = [...new Set(sorted.map((member) => member.blz))].filter((c) => c !== first.blz);
    const codes = [first.blz, ...others.sort()];
    const places = uniqueSorted(sorted.map((member) => member.place));
    const single = places.length === 1;
    // Zweigorte und Zweigstellen-Namen gehören zur Hauptstelle – nicht zu einem Standort mit eigenem Namen
    const mainCodes = sorted.filter((member) => !member.ownName).map((member) => member.blz);
    const branches = uniqueSorted(
      mainCodes.flatMap((code) => [...(branchPlaces.get(code) ?? [])]),
    ).filter((place) => !places.includes(place));
    const otherNames = uniqueSorted(
      mainCodes.flatMap((code) => [...(branchNames.get(code) ?? [])]),
    ).filter((name) => name !== first.name);
    const bics = [
      first.bic,
      ...uniqueSorted(sorted.map((member) => member.bic)).filter((b) => b !== first.bic),
    ];
    return {
      first,
      codes,
      name: first.name,
      place: single ? places[0] : "",
      plz: single ? first.plz : "",
      bics: bics.filter(Boolean),
      short: first.short,
      places: single ? [] : places,
      branches,
      otherNames,
      count: places.length + branches.length,
      deletion: sorted.every((member) => member.deletion),
    };
  });

  // 4. id: die erste Bankleitzahl (die eines Hauptdatensatzes, falls vorhanden – die gehört nur zu diesem Eintrag).
  //    Ein Standort mit eigenem Namen teilt sie mit seiner Hauptstelle und bekommt „-2“, „-3“ …
  banks.sort(
    (a, b) =>
      Number(Boolean(a.first.ownName)) - Number(Boolean(b.first.ownName)) ||
      a.codes[0].localeCompare(b.codes[0]) ||
      byText(a.name, b.name) ||
      byText(a.place, b.place),
  );
  const used = new Map();
  for (const bank of banks) {
    const base = bank.codes[0];
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    bank.id = n === 1 ? base : `${base}-${n}`;
  }

  // 5. Feldwert: gibt es den Namen als mehrere verschiedene Banken („Volksbank“), kommt der Ort dazu.
  const entriesPerName = new Map();
  for (const bank of banks) entriesPerName.set(bank.name, (entriesPerName.get(bank.name) ?? 0) + 1);
  for (const bank of banks) {
    const ambiguous = entriesPerName.get(bank.name) > 1 && isGenericName(bank.name) && bank.place;
    const withPlace = `${bank.name} ${bank.place}`;
    bank.value = ambiguous && withPlace.length <= VALUE_MAX ? withPlace : "";
  }

  banks.sort(
    (a, b) => byText(a.name, b.name) || byText(a.place, b.place) || a.id.localeCompare(b.id),
  );

  if (report) {
    console.log("\nVerworfen (technische Bezeichnungen, Anzahl Datensätze):");
    for (const name of [...dropped.keys()].sort(byText))
      console.log(`  ${dropped.get(name)}× ${name}`);
    console.log("\nBehalten mit „Gf“/„GF“ im Namen:");
    for (const bank of banks.filter((b) => /\bG[fF]\b/.test(b.name)))
      console.log(`  ${bank.name} (${bank.place})`);
    console.log("\nEigene Vorschläge aus weiteren Standorten (Merkmal 2):");
    for (const bank of banks.filter((b) => b.first.ownName)) {
      console.log(
        `  ${bank.name} – ${bank.place || `${bank.count} Orte`} (BLZ ${bank.codes.join(", ")})`,
      );
    }
    console.log("\nFeldwert mit Ort (gleichnamige Banken):");
    for (const bank of banks.filter((b) => b.value)) console.log(`  ${bank.value}`);
  }
  return { banks, dropped };
}

const words = (text) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Die Kurzbezeichnung nur, wenn sie für die Suche etwas Neues bringt („Spk Recklinghausen“) – sonst leer. */
function usefulShort(bank) {
  const known = new Set([bank.name, bank.place, ...bank.places, ...bank.branches].flatMap(words));
  return words(bank.short).every((word) => known.has(word)) ? "" : bank.short;
}

/** Eine Zeile der JSON-Datei (Reihenfolge siehe Kopfkommentar). */
const row = (bank) => [
  bank.id,
  bank.name,
  bank.place,
  bank.plz,
  bank.codes,
  bank.bics,
  usefulShort(bank),
  bank.places,
  bank.branches,
  bank.otherNames,
  bank.count,
  bank.deletion ? 1 : 0,
  bank.value,
];

function serialize(meta, banks) {
  const lines = banks.map((bank) => JSON.stringify(row(bank)));
  return `{"meta":${JSON.stringify(meta)},\n"banks":[\n${lines.join(",\n")}\n]}\n`;
}

// ---------------------------------------------------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const day = today();
  let bytes;
  let validity;
  if (args.file) {
    bytes = new Uint8Array(readFileSync(args.file));
    validity = args.from
      ? { from: args.from, until: args.until }
      : chooseLink(textFileLinks(readFileSync(args.page, "utf8")), day);
    console.log(
      `Lese ${args.file} (gültig vom ${germanDate(validity.from)} bis ${germanDate(validity.until)}) …`,
    );
  } else {
    console.log("Lade die Download-Seite der Bundesbank …");
    const page = new TextDecoder("utf-8").decode(await download(PAGE_URL));
    validity = chooseLink(textFileLinks(page), day);
    console.log(
      `Lade ${validity.href} (gültig vom ${germanDate(validity.from)} bis ${germanDate(validity.until)}) …`,
    );
    bytes = await download(validity.href);
  }

  // Die Datei ist ISO-8859-1 (der Server meldet teils einen anderen Zeichensatz) – deshalb ausdrücklich so lesen.
  const records = parseRecords(new TextDecoder("latin1").decode(bytes));
  const { banks, dropped } = buildBanks(records, args.check);
  const meta = {
    quelle: "Deutsche Bundesbank",
    datei: "Bankleitzahlendatei",
    gueltigAb: validity.from,
    gueltigBis: validity.until,
    url: PAGE_URL,
  };
  const json = serialize(meta, banks);
  writeFileSync(target, json);

  const main = records.filter((r) => r.feature === "1" && r.change !== "D").length;
  const grouped = banks.filter((bank) => !bank.place).length;
  const own = banks.filter((bank) => bank.first.ownName).length;
  console.log(
    `✔ ${banks.length} Banken (aus ${records.length} Datensätzen, ${main} gültigen Bankleitzahlen; ` +
      `${[...dropped.values()].reduce((sum, n) => sum + n, 0)} technische Datensätze verworfen; ` +
      `${grouped} an mehreren Orten zusammengefasst; ${own} aus Standorten mit eigenem Namen) → ` +
      `${path.relative(root, target)} (${Math.round(Buffer.byteLength(json) / 1024)} KB)`,
  );
  if (validity.until < day) {
    console.warn(
      `⚠ Diese Datei galt nur bis ${germanDate(validity.until)}. Neue Datei auf der Download-Seite der Bundesbank prüfen: ${PAGE_URL}`,
    );
  }
  // Die Quellenangabe nennt die Gültigkeit – nach einer neuen Datei auch dort anpassen (prüft auch bank-codes.test.ts).
  const stated = `gültig vom ${germanDate(validity.from)} bis ${germanDate(validity.until)}`;
  for (const file of ATTRIBUTION_FILES) {
    if (!readFileSync(path.join(root, file), "utf8").includes(stated)) {
      console.warn(`⚠ Bitte in ${file} die Gültigkeit anpassen: „${stated}“`);
    }
  }
}

/** Dateien mit „Quelle: Deutsche Bundesbank … (gültig vom … bis …)“. */
const ATTRIBUTION_FILES = [
  "README.md",
  "src/app/(legal)/impressum/page.tsx",
  "src/server/banks/bank-codes.ts",
];
const germanDate = (iso) => iso.split("-").reverse().join(".");

main().catch((error) => {
  console.error("✘", error instanceof Error ? error.message : error);
  process.exit(1);
});
