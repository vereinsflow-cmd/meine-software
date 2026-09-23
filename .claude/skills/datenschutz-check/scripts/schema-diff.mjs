#!/usr/bin/env node
/**
 * Vorfilter für den Datenschutz-Check (VereinsFlow).
 *
 * Findet neue/geänderte Felder und Modelle in prisma/schema.prisma gegenüber einer Git-Basis und prüft grob,
 * ob ihre Namen in den Datenschutz-Dateien vorkommen. Ergebnis ist eine KANDIDATENLISTE – bewertet wird von Hand.
 *
 * Aufruf im Projekt-Root:  node <skill-ordner>/scripts/schema-diff.mjs [basis]
 *   basis: Git-Referenz, Standard "HEAD" (= ungestagte + gestagte Änderungen). Z. B. "main" für den ganzen Branch.
 *
 * Läuft unter Windows, macOS und Linux; braucht nur Node und git.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = "prisma/schema.prisma";
const base = process.argv[2] ?? "HEAD";

if (!existsSync(SCHEMA)) {
  console.error(`Nicht gefunden: ${SCHEMA} – bitte im Projekt-Root ausführen.`);
  process.exit(2);
}

// ---------- Schema lesen: Zeile -> Modell, Modellnamen ----------
const schemaLines = readFileSync(SCHEMA, "utf8").split(/\r?\n/);
const lineModel = new Map(); // 1-basierte Zeilennummer -> { kind, name }
const blockNames = new Set();
let current = null;
schemaLines.forEach((line, i) => {
  const open = line.match(/^\s*(model|enum|type)\s+(\w+)\s*\{/);
  if (open) {
    current = { kind: open[1], name: open[2], start: i + 1 };
    blockNames.add(open[2]);
  } else if (current && /^\s*\}/.test(line)) {
    lineModel.set(i + 1, current);
    current = null;
    return;
  }
  if (current) lineModel.set(i + 1, current);
});

// ---------- Diff lesen: hinzugefügte Zeilen im neuen Stand ----------
let diff = "";
try {
  const args = base === "HEAD" ? ["diff", "-U0", "HEAD", "--", SCHEMA] : ["diff", "-U0", `${base}...HEAD`, "--", SCHEMA];
  diff = execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (base !== "HEAD") {
    // Zusätzlich noch nicht committete Änderungen berücksichtigen.
    diff += execFileSync("git", ["diff", "-U0", "HEAD", "--", SCHEMA], { encoding: "utf8" });
  }
} catch (error) {
  console.error(`git diff fehlgeschlagen (Basis "${base}"): ${error.message.split("\n")[0]}`);
  process.exit(2);
}

const added = new Set();
let newLine = 0;
for (const line of diff.split(/\r?\n/)) {
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (hunk) {
    newLine = Number(hunk[1]);
    continue;
  }
  if (line.startsWith("+++") || line.startsWith("---")) continue;
  if (line.startsWith("+")) {
    added.add(newLine);
    newLine += 1;
  } else if (!line.startsWith("-") && !line.startsWith("\\")) {
    newLine += 1;
  }
}

if (added.size === 0) {
  console.log(`Keine Änderungen an ${SCHEMA} gegenüber "${base}".`);
  console.log("Hinweis: Personendaten können auch ohne Schema-Änderung entstehen (Freitext in bestehenden JSON-Feldern,");
  console.log("neue Log-/Mail-/Audit-Texte). Diese Stellen im Diff trotzdem von Hand prüfen.");
  process.exit(0);
}

// ---------- Neue Modelle und Felder bestimmen ----------
const newBlocks = new Set();
const fields = []; // { model, field, type, line, isNewModel }
for (const lineNo of [...added].sort((a, b) => a - b)) {
  const text = schemaLines[lineNo - 1] ?? "";
  const block = lineModel.get(lineNo);
  const open = text.match(/^\s*model\s+(\w+)\s*\{/);
  if (open) {
    newBlocks.add(open[1]);
    continue;
  }
  if (!block || block.kind !== "model") continue;
  const m = text.match(/^\s*(\w+)\s+([\w.]+)(\[\])?(\?)?/);
  if (!m || text.trim().startsWith("//") || text.trim().startsWith("@@")) continue;
  const [, field, type] = m;
  if (blockNames.has(type) && !isEnum(type)) continue; // Relationsfeld, keine eigenen Daten
  fields.push({ model: block.name, field, type, line: lineNo });
}
// Alle Felder neuer Modelle mitnehmen (auch wenn der Diff sie schon enthält, nur einmal).
for (const name of newBlocks) {
  schemaLines.forEach((text, i) => {
    const block = lineModel.get(i + 1);
    if (!block || block.name !== name || block.kind !== "model") return;
    const m = text.match(/^\s*(\w+)\s+([\w.]+)/);
    if (!m || /^\s*(model|\/\/|@@|\})/.test(text)) return;
    if (blockNames.has(m[2]) && !isEnum(m[2])) return;
    if (!fields.some((f) => f.model === name && f.field === m[1]))
      fields.push({ model: name, field: m[1], type: m[2], line: i + 1 });
  });
}

function isEnum(name) {
  return schemaLines.some((l) => new RegExp(`^\\s*enum\\s+${name}\\s*\\{`).test(l));
}

// ---------- Heuristik ----------
const SECRET = /(password|passwort|token|secret|hash|iban|bic|pin|apikey|privatekey|Enc$)/i;
const SENSITIVE = /(birth|geburt|note|notiz|comment|kommentar|health|gesundheit|allerg|gender|geschlecht|religion|nation|disab|behinder|consent|einwillig)/i;
const CONTACT = /(email|mail|phone|telefon|mobile|handy|street|strasse|address|adresse|postal|plz|zip|city|ort|country|land)/i;
const PERSONAL = /(name|description|beschreibung|text|body|message|nachricht|reason|begruend|response|antwort|subject|betreff|ip|useragent|device|geraet|photo|foto|image|bild|avatar|file|datei|document|signature|unterschrift|memberId|userId|createdById)/i;

function classify({ field }) {
  if (SECRET.test(field)) return "Geheimnis?";
  if (SENSITIVE.test(field)) return "Sensibel?";
  if (CONTACT.test(field)) return "Kontakt?";
  if (PERSONAL.test(field)) return "Personenbezug?";
  return "";
}

// ---------- Abdeckung prüfen ----------
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const files = {
  Export: read("src/server/privacy/export.ts"),
  Anonym: read("src/server/privacy/anonymize.ts"),
  Loeschung: read("src/server/privacy/deletion.ts"),
  Aufbew: read("src/server/jobs/retention.ts") + read("src/server/jobs/cleanup.ts"),
};
const maskedLists = collectMaskedLists("src/modules");
const tenantScope = read("src/server/db/tenant.ts");

function collectMaskedLists(dir) {
  let out = "";
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out += collectMaskedLists(p);
    else if (entry.name.endsWith(".ts")) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/MASKED[\w]*\s*=\s*\[([\s\S]*?)\]/g)) out += m[1];
    }
  }
  return out;
}

const has = (src, word) => new RegExp(`\\b${word}\\b`).test(src);
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

const mark = (ok) => (ok ? "ja  " : "--  ");
const rows = fields
  .map((f) => ({ ...f, klasse: classify(f) }))
  .filter((f) => f.klasse !== "");

console.log(`Datenschutz-Vorfilter · Basis: ${base} · ${SCHEMA}`);
console.log("");
if (newBlocks.size > 0) {
  console.log("Neue Modelle:");
  for (const name of newBlocks) {
    const key = lowerFirst(name);
    console.log(
      `  ${name.padEnd(24)} MODEL_SCOPE:${mark(has(tenantScope, name))} Export:${mark(has(files.Export, key))}` +
        `Anonym:${mark(has(files.Anonym, key))} Loeschung:${mark(has(files.Loeschung, key))} Aufbew:${mark(has(files.Aufbew, key))}`,
    );
  }
  console.log("");
}

if (rows.length === 0) {
  console.log("Keine Felder mit auffälligem Namen. Trotzdem prüfen: Freitexte, JSON-Felder, Verweise auf Member/User.");
  process.exit(0);
}

console.log("Kandidaten (Name deutet auf Personenbezug hin; 'ja' = Feldname kommt in der Datei vor, NICHT = korrekt behandelt):");
console.log(
  "  " + "Modell.Feld".padEnd(36) + "Klasse".padEnd(16) + "Export Anonym Loesch Aufbew Maskiert  Zeile",
);
for (const r of rows) {
  const id = `${r.model}.${r.field}`;
  console.log(
    "  " +
      id.padEnd(36) +
      r.klasse.padEnd(16) +
      mark(has(files.Export, r.field)) + "   " +
      mark(has(files.Anonym, r.field)) + "   " +
      mark(has(files.Loeschung, r.field)) + "   " +
      mark(has(files.Aufbew, r.field)) + "   " +
      mark(has(maskedLists, r.field)) + "      " +
      r.line,
  );
}
console.log("");
console.log("Nächster Schritt: jeden Kandidaten mit references/beruehrungspunkte.md (A–N) bewerten.");
console.log("'--' heißt nur: Name nicht gefunden. Abdeckung über include/Cascade ist möglich – im Code nachsehen.");
