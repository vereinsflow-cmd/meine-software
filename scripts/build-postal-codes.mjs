#!/usr/bin/env node
/**
 * Erzeugt `src/server/geo/postal-codes-de.json`: deutsche Postleitzahlen → Orte, für „Ort automatisch ergänzen“.
 *
 *   node scripts/build-postal-codes.mjs      (braucht Internet und das Programm `unzip`, auf macOS/Linux vorhanden)
 *
 * Quelle: GeoNames (https://www.geonames.org), Lizenz Creative Commons Namensnennung 4.0 (CC BY 4.0) – die Namensnennung
 * steht im Impressum und in der README. Verwendet werden
 *   - die Postleitzahlen-Datei (export/zip/DE.zip): Postleitzahl, Ortsname, Genauigkeit der Verortung, und
 *   - das Ortsverzeichnis (export/dump/DE.zip): bewohnte Orte und Gemeinden.
 *
 * Bereinigung – jeder Name wird nur innerhalb seines eigenen Kreises geprüft (Kreisschlüssel in beiden Dateien):
 *   - Kreisfreie Städte (Berlin, Leipzig, München …): immer die Stadt selbst, nie der Stadtteil oder ein Großkunde.
 *   - Sonst gilt ein Name nur, wenn er im selben Kreis eine Gemeinde oder ein bewohnter Ort ist (auch in anderer
 *     Schreibweise: „Gronau (Westfalen)“ ↔ „Gronau (Westf.)“, „Sand am Main“ ↔ „Sand a.Main“), oder wenn GeoNames ihn
 *     verortet hat. Firmen und Ämter („… GmbH“, „Stadtverwaltung“) fallen damit heraus.
 *   - Ortsteile werden auf ihre Gemeinde gekürzt („Rinteln Todenmann“ → „Rinteln“, „Oderaue Neureetz“ → „Oderaue“),
 *     aber nur auf eine Gemeinde desselben Kreises („Insel Poel“ bleibt „Insel Poel“).
 *   - Veraltete Namen werden ersetzt, wenn die Gemeinde heute „Bad …“ heißt („Kötzting“ → „Bad Kötzting“).
 *   - Reihenfolge: zuerst die Gemeinden nach Einwohnerzahl (der Hauptort steht vorn), dann die übrigen Orte.
 * Postleitzahlen ohne erkennbaren Ort (reine Großkunden außerhalb kreisfreier Städte) fehlen – dort ergänzt die App
 * eben nichts.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "src", "server", "geo", "postal-codes-de.json");
const SOURCES = {
  postal: "https://download.geonames.org/export/zip/DE.zip",
  places: "https://download.geonames.org/export/dump/DE.zip",
};

// Firmen und Einrichtungen: Rechtsform-Kürzel nur als eigenes Wort und in genau dieser Schreibweise (sonst fiele z. B.
// „Seßlach“ wegen „Se“ heraus), typische Branchenwörter unabhängig von der Schreibweise.
const LEGAL_FORM =
  /(?<![\p{L}\p{N}])(GmbH|gGmbH|mbH|AG|KG|KGaA|SE|OHG|GbR|Ltd|Inc|eG|e\.\s?V\.)(?![\p{L}\p{N}])/u;
const BUSINESS_WORD =
  /(?<!\p{L})(Bank|Sparkasse|Versicherung\p{L}*|Stiftung|Verlag|Holding|Group|Services?)(?!\p{L})/iu;
const isOrganisation = (name) => LEGAL_FORM.test(name) || BUSINESS_WORD.test(name);

/** Vergleichsschlüssel: klein, ohne Umlaute und Satzzeichen, ohne kurze Bindewörter („a.Main“ = „am Main“). */
const FILLER = new Set([
  "a",
  "am",
  "an",
  "d",
  "der",
  "den",
  "dem",
  "i",
  "im",
  "in",
  "b",
  "bei",
  "ob",
  "o",
  "u",
  "und",
]);
function key(text) {
  return text
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word && !FILLER.has(word))
    .join(" ");
}

/** „Gronau (Westfalen)“ → Stamm „gronau“ und Zusatz „(Westfalen)“; ohne Zusatz ist der Zusatz leer. */
function splitQualifier(name) {
  const match = /^(.*?)\s*([(/].*)$/.exec(name);
  return match ? { stem: key(match[1]), qualifier: match[2] } : { stem: key(name), qualifier: "" };
}

/** Amtliche Gemeindenamen ohne Titel: „München, Landeshauptstadt“ → „München“, „Wittenberg, Lutherstadt“ → „Lutherstadt Wittenberg“. */
function plainName(official) {
  const [head, ...rest] = official.split(",");
  const title = rest.join(",").trim();
  return title === "Lutherstadt" ? `${title} ${head.trim()}` : head.trim();
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

const unzipText = (zip) =>
  execFileSync("unzip", ["-p", zip, "DE.txt"], { maxBuffer: 512 * 1024 * 1024 }).toString("utf8");

const rows = (text) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));

async function main() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "plz-"));
  try {
    console.log("Lade GeoNames-Daten …");
    await download(SOURCES.postal, path.join(dir, "postal.zip"));
    await download(SOURCES.places, path.join(dir, "places.zip"));
    const postal = rows(unzipText(path.join(dir, "postal.zip"))).filter((r) =>
      /^\d{5}$/.test(r[1] ?? ""),
    );
    const gazetteer = rows(unzipText(path.join(dir, "places.zip")));

    // Gemeinden (ADM4) und bewohnte Orte (P) je Kreis; kreisfreie Stadt: Gemeindeschlüssel = Kreisschlüssel + „000“
    const municipalities = new Map(); // Kreis → [{ name, population, keys }]
    const populated = new Map(); // Kreis → Set(Schlüssel)
    const cityOfDistrict = new Map(); // Kreis → Stadt
    for (const r of gazetteer) {
      const [featureClass, featureCode, district, municipalityCode] = [r[6], r[7], r[12], r[13]];
      if (!district) continue;
      if (featureClass === "A" && featureCode === "ADM4") {
        const names = [r[1], r[2], ...(r[3] ?? "").split(",")].filter(
          (alias) => alias && /\p{L}/u.test(alias) && /^[\p{Script=Latin}\s\p{P}\d]+$/u.test(alias),
        );
        const list = municipalities.get(district) ?? [];
        list.push({
          name: plainName(r[1]),
          population: Number(r[14]) || 0,
          keys: new Set(names.map(key)),
        });
        municipalities.set(district, list);
        if (municipalityCode === `${district}000`) cityOfDistrict.set(district, plainName(r[1]));
      } else if (featureClass === "P") {
        const set = populated.get(district) ?? new Set();
        set.add(key(r[1]));
        populated.set(district, set);
      }
    }

    /** Gemeinde desselben Kreises zu einem Namen – in amtlicher oder anderer Schreibweise. */
    function findMunicipality(name, district) {
      const list = municipalities.get(district) ?? [];
      const k = key(name);
      return list.find((m) => key(m.name) === k) ?? list.find((m) => m.keys.has(k)) ?? null;
    }

    /** Name → [Ort, Einwohnerzahl der Gemeinde (0 = kein Gemeindename)] oder null, wenn kein echter Ort. */
    function resolve(name, district, located) {
      const city = cityOfDistrict.get(district);
      if (city) return [city, Number.MAX_SAFE_INTEGER];
      if (isOrganisation(name)) return null;
      const list = municipalities.get(district) ?? [];
      const exact = list.find((m) => key(m.name) === key(name));
      if (exact) return [name, exact.population];
      const renamed = list.find((m) => m.name === `Bad ${name}`);
      if (renamed) return [renamed.name, renamed.population];
      if (findMunicipality(name, district)) return [name, 0];
      const { stem, qualifier } = splitQualifier(name);
      // Höchstens ein Zusatz wie „(Westfalen)“ oder „/Sachsen“ – nicht „(Weser) Erichshagen“ oder „/Dosse Zempow“ (Ortsteil)
      const onlyQualifier =
        qualifier === "" || /^\([^)]*\)$/.test(qualifier) || /^\/\S+$/.test(qualifier);
      // Gleicher Stamm, nur der Zusatz anders geschrieben: „Gronau (Westfalen)“ ↔ „Gronau (Westf.)“
      if (onlyQualifier) {
        const same = list.filter((m) => splitQualifier(m.name).stem === stem);
        if (same.length === 1) return [name, same[0].population];
      }
      const villages = populated.get(district);
      if (villages?.has(key(name)) || (onlyQualifier && villages?.has(stem))) return [name, 0];
      // Ortsteil: „<Gemeinde> <Ortsteil>“ → Gemeinde (längster passender Anfang, danach ein großgeschriebenes Wort)
      const parts = name.split(" ");
      for (let k = parts.length - 1; k > 0; k--) {
        const head = parts.slice(0, k).join(" ");
        if (!/^\p{Lu}/u.test(parts[k])) continue;
        const municipality = findMunicipality(head, district);
        if (municipality) return [head, municipality.population];
      }
      return located ? [name, 0] : null;
    }

    const byCode = new Map(); // PLZ → Map(Ort → Einwohnerzahl)
    for (const r of postal) {
      const resolved = resolve(r[2].trim(), r[8], (r[11] ?? "") !== "");
      if (!resolved) continue;
      const [place, population] = resolved;
      const places = byCode.get(r[1]) ?? new Map();
      places.set(place, Math.max(places.get(place) ?? 0, population));
      byCode.set(r[1], places);
    }

    const collator = new Intl.Collator("de");
    const table = Object.fromEntries(
      [...byCode.keys()]
        .sort()
        .map((code) => [
          code,
          [...byCode.get(code)]
            .sort(([a, pa], [b, pb]) => pb - pa || collator.compare(a, b))
            .map(([place]) => place),
        ]),
    );
    writeFileSync(target, JSON.stringify(table) + "\n");
    const multiple = Object.values(table).filter((places) => places.length > 1).length;
    console.log(
      `✔ ${Object.keys(table).length} Postleitzahlen (davon ${multiple} mit mehreren Orten) → ${path.relative(root, target)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("✘", error instanceof Error ? error.message : error);
  process.exit(1);
});
