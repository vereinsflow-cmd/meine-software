// Ersetzt die Musterdomain (https://vereinsflow.example) in allen Seiten, in robots.txt und in sitemap.xml.
//
//   node tools/set-domain.mjs https://www.beispiel-verein.de
//
// Die Adresse braucht kein Schluss-/ und muss mit https:// beginnen.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD = "https://vereinsflow.example";
const input = process.argv[2]?.replace(/\/+$/, "");

if (!input || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(input)) {
  console.error("Aufruf: node tools/set-domain.mjs https://www.ihre-domain.de");
  process.exit(1);
}

let changed = 0;
for (const name of fs.readdirSync(root)) {
  if (!/\.(html|xml|txt)$/.test(name)) continue;
  const file = path.join(root, name);
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(OLD)) continue;
  fs.writeFileSync(file, text.replaceAll(OLD, input), "utf8");
  console.log(`${name}: ${text.split(OLD).length - 1} Ersetzung(en)`);
  changed++;
}
console.log(changed ? `Fertig: ${input}` : `Nichts zu ersetzen (${OLD} kommt nicht mehr vor).`);
