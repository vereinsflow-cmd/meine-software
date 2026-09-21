// Prüft die Website vor der Veröffentlichung – ohne Abhängigkeiten:
//
//   node tools/check-site.mjs            zeigt Fehler und offene Platzhalter
//   node tools/check-site.mjs --strict   beendet sich zusätzlich mit Fehlercode, solange Platzhalter offen sind
//
// Geprüft wird: Verweise und Bilder existieren, Bilder haben Beschreibung und Maße, Symbole und Sprungmarken sind
// vorhanden, es werden keine fremden Server angesprochen, keine Inline-Skripte/-Stile/-Ereignisse (wegen der strengen
// Content-Security-Policy in _headers/.htaccess), und es stehen keine Platzhalter mehr im Text.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const PLACEHOLDER_DOMAIN = "vereinsflow.example";

const errors = [];
const warnings = [];
const placeholders = [];
const usedFiles = new Set();

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".git", "tools"].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
const rel = (file) => path.relative(root, file).replaceAll("\\", "/");
const read = (file) => fs.readFileSync(file, "utf8");

const files = walk(root);
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const textFiles = files.filter((f) => /\.(html|css|js|txt|xml|md|svg|webmanifest)$/.test(f) || /(^|\\)(_headers|\.htaccess)$/.test(f));

/** Ist das ein Verweis auf etwas außerhalb dieser Website? */
const isExternal = (url) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);

function resolveLocal(fromFile, url) {
  const clean = decodeURIComponent(url.split("#")[0].split("?")[0]);
  if (!clean) return null;
  return clean.startsWith("/") ? path.join(root, clean) : path.resolve(path.dirname(fromFile), clean);
}

function checkReference(fromFile, url, what) {
  if (!url || url.startsWith("#")) return;
  if (isExternal(url)) {
    if (!/^(mailto|tel):/i.test(url)) errors.push(`${rel(fromFile)}: ${what} verweist auf einen fremden Server: ${url}`);
    return;
  }
  const target = resolveLocal(fromFile, url);
  if (!target) return;
  usedFiles.add(path.normalize(target));
  if (!fs.existsSync(target)) errors.push(`${rel(fromFile)}: ${what} zeigt auf eine fehlende Datei: ${url}`);
}

for (const file of htmlFiles) {
  const html = read(file);
  const name = rel(file);

  // Verweise: Links dürfen nach außen zeigen (nur Hinweis), geladene Dateien (Stil, Skript, Bild, Symbol) nicht
  for (const match of html.matchAll(/<(a|link|script|img|source|iframe|video|audio)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
    const href = attr("href");
    const src = attr("src");
    if (tag === "a") {
      if (href && isExternal(href) && !/^(mailto|tel):/i.test(href)) warnings.push(`${name}: Link auf eine fremde Seite: ${href}`);
      else if (href) checkReference(file, href, "Link");
    } else if (tag === "link") {
      if (/rel="(canonical|alternate)"/.test(attrs)) continue; // nur Angabe, wird nicht geladen
      if (href) checkReference(file, href, "link");
    } else if (src) {
      checkReference(file, src, `${tag}-src`);
    }
    const srcset = attr("srcset");
    if (srcset) for (const candidate of srcset.split(",")) checkReference(file, candidate.trim().split(/\s+/)[0], "srcset");
  }

  // Sprungmarken und Symbole innerhalb der Seite
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const idList = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) if (idList.filter((x) => x === id).length > 1) errors.push(`${name}: id „${id}“ kommt mehrfach vor`);
  for (const match of html.matchAll(/\shref="#([^"]+)"/g)) {
    if (!ids.has(match[1])) errors.push(`${name}: Sprungmarke #${match[1]} hat kein Ziel`);
  }
  for (const match of html.matchAll(/<use[^>]*href="#([^"]+)"/g)) {
    if (!ids.has(match[1])) errors.push(`${name}: Symbol #${match[1]} fehlt in der Symbolsammlung`);
  }
  const symbols = [...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
  const usedSymbols = new Set([...html.matchAll(/<use[^>]*href="#([^"]+)"/g)].map((m) => m[1]));
  for (const symbol of symbols) if (!usedSymbols.has(symbol)) warnings.push(`${name}: Symbol #${symbol} wird nicht verwendet`);

  // Bilder: Beschreibung (alt) und Maße
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = match[0];
    const src = /\ssrc="([^"]*)"/.exec(tag)?.[1] ?? "?";
    if (!/\salt="/.test(tag)) errors.push(`${name}: Bild ohne alt-Attribut: ${src}`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) errors.push(`${name}: Bild ohne width/height (Layout-Sprung): ${src}`);
  }

  // Nur ein h1
  const h1 = [...html.matchAll(/<h1[\s>]/g)].length;
  if (h1 !== 1) errors.push(`${name}: erwartet genau eine Überschrift <h1>, gefunden: ${h1}`);

  // Content-Security-Policy: keine Inline-Stile, -Ereignisse oder -Skripte
  if (/\sstyle="/.test(html)) errors.push(`${name}: Inline-Stil (style="…") – wird von der Content-Security-Policy blockiert`);
  if (/<style[\s>]/.test(html)) errors.push(`${name}: <style>-Block – wird von der Content-Security-Policy blockiert`);
  if (/\son[a-z]+="/i.test(html)) errors.push(`${name}: Inline-Ereignis (onclick=…) – wird von der Content-Security-Policy blockiert`);
  for (const match of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!/\ssrc=|^\s*src=/.test(attrs) && !/type="application\/ld\+json"/.test(attrs)) errors.push(`${name}: Inline-Skript – wird von der Content-Security-Policy blockiert`);
  }

  if (!/<html lang="de"/.test(html)) errors.push(`${name}: <html lang="de"> fehlt`);
  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${name}: <title> fehlt`);
}

// CSS: url(...) muss lokal sein und existieren
for (const file of files.filter((f) => f.endsWith(".css"))) {
  for (const match of read(file).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) checkReference(file, match[1], "CSS url()");
  if (/@import/.test(read(file))) errors.push(`${rel(file)}: @import lädt womöglich fremde Dateien`);
}

// Platzhalter und Musterdomain
for (const file of textFiles) {
  const text = read(file);
  const name = rel(file);
  if (name === "README.md" || name === "THIRD-PARTY-NOTICES.md") continue;
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    for (const match of line.matchAll(/\[\[[^\]]+\]\]/g)) placeholders.push(`${name}:${i + 1}  ${match[0].slice(0, 70)}`);
    if (line.includes(PLACEHOLDER_DOMAIN)) placeholders.push(`${name}:${i + 1}  Musterdomain ${PLACEHOLDER_DOMAIN} (mit tools/set-domain.mjs ersetzen)`);
  }
}

// Nicht verwendete Bilder
const isAsset = (f) => /assets[\\/]img[\\/]/.test(f) && /\.(webp|png|jpe?g|svg)$/.test(f);
const referencedElsewhere = new Set(["og-image.png"]);
for (const file of files.filter(isAsset)) {
  if (usedFiles.has(path.normalize(file))) continue;
  if (referencedElsewhere.has(path.basename(file))) continue;
  warnings.push(`${rel(file)}: wird von keiner Seite verwendet`);
}

const print = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length})`);
  for (const line of list) console.log(`  - ${line}`);
};
print("FEHLER", errors);
print("Hinweise", warnings);
print("Offene Platzhalter – vor der Veröffentlichung ersetzen", placeholders);

console.log(
  `\n${htmlFiles.length} Seiten geprüft: ${errors.length} Fehler, ${warnings.length} Hinweise, ${placeholders.length} offene Platzhalter.`,
);
if (errors.length || (strict && placeholders.length)) process.exit(1);
