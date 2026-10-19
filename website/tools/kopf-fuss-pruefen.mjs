// Prüft, dass Kopf- und Fußzeile auf allen Seiten gleich sind: index.html, impressum.html, datenschutz.html, 404.html und
// die Seiten von newsletter.php (vf_seite). Verglichen wird nach dem Angleichen dessen, was je Seite anders sein muss:
//   - Pfade: Die Startseite verlinkt ihre Abschnitte direkt („#faq“, „assets/…“), die Unterseiten mit „index.html#faq“
//     bzw. „/#faq“ und „/assets/…“, die Marke führt dort zur Startseite statt zum Seitenanfang
//   - nur auf der Startseite: der Kapitel-Faden (Rastpunkte der zehn Kapitel), die Kennungen data-navi/data-kapitel und der
//     Schalter „Bewegung anhalten“ (nur dort bewegt sich etwas)
// Dazu: Jede Seite hat die Symbole, die Kopf und Fuß verwenden, und in newsletter.php steht im Markup von Kopf und Fuß kein
// Hochkomma (die Seite ist dort ein PHP-String in einfachen Hochkommas).
//   node tools/kopf-fuss-pruefen.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEITEN = ["index.html", "impressum.html", "datenschutz.html", "404.html", "newsletter.php"];
let fehler = 0;
const melde = (ok, text) => {
  console.log(`${ok ? "ok  " : "FEHL"} ${text}`);
  if (!ok) fehler++;
};

// Ein Element samt Inhalt (zählt öffnende und schließende Tags desselben Namens)
function element(text, start) {
  const i = text.indexOf(start);
  if (i < 0) return null;
  const name = start.match(/^<(\w+)/)[1];
  const re = new RegExp(`<\\/?${name}\\b`, "g");
  re.lastIndex = i;
  let tiefe = 0;
  let m;
  while ((m = re.exec(text))) {
    tiefe += m[0].startsWith("</") ? -1 : 1;
    if (tiefe === 0) return text.slice(i, text.indexOf(">", m.index) + 1);
  }
  return null;
}

function angleichen(teil) {
  let t = teil.replace(/<!--[\s\S]*?-->/g, "");
  const faden = element(t, '<div class="faden"');
  if (faden) t = t.replace(faden, "");
  const ruhe = t.match(/<button class="ruhe-knopf[\s\S]*?<\/button>/);
  if (ruhe) t = t.replace(ruhe[0], "");
  return t
    .replace(/\sdata-(navi|kapitel)="[^"]*"/g, "")
    .replace(/(href|src)="\/(?!\/)/g, '$1="')
    .replace(/href="index\.html/g, 'href="')
    .replace(/href="#top"/g, 'href=""')
    .replace("VereinsFlow – zum Seitenanfang", "VereinsFlow – zur Startseite")
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .trim();
}

const teile = {};
for (const seite of SEITEN) {
  const text = fs.readFileSync(path.join(root, seite), "utf8");
  const kopf = element(text, '<header class="kopf"');
  const fuss = element(text, '<footer class="fuss');
  melde(Boolean(kopf && fuss), `${seite}: Kopf- und Fußzeile gefunden`);
  if (!kopf || !fuss) continue;
  teile[seite] = { kopf: angleichen(kopf), fuss: angleichen(fuss) };
  // Symbole, die Kopf und Fuß verwenden, stehen im Sprite der Seite
  const benutzt = new Set([...`${kopf}${fuss}`.matchAll(/href="#(i-[\w-]+)"/g)].map((m) => m[1]));
  const fehlend = [...benutzt].filter((id) => !text.includes(`<symbol id="${id}"`));
  melde(!fehlend.length, `${seite}: Symbole von Kopf und Fuß vorhanden${fehlend.length ? ` (fehlen: ${fehlend.join(", ")})` : ""}`);
  if (seite.endsWith(".php")) melde(!/'/.test(kopf + fuss), `${seite}: kein Hochkomma im Markup von Kopf und Fuß`);
}

const [erste, ...andere] = Object.keys(teile);
for (const seite of andere) {
  for (const art of ["kopf", "fuss"]) {
    const a = teile[erste][art];
    const b = teile[seite][art];
    if (a === b) {
      melde(true, `${seite}: ${art === "kopf" ? "Kopfzeile" : "Fußzeile"} wie ${erste}`);
      continue;
    }
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    melde(false, `${seite}: ${art === "kopf" ? "Kopfzeile" : "Fußzeile"} weicht ab bei …${a.slice(Math.max(0, i - 40), i + 60)}… / …${b.slice(Math.max(0, i - 40), i + 60)}…`);
  }
}

console.log(fehler ? `\n${fehler} Fehler.` : "\nKopf und Fuß sind auf allen Seiten gleich.");
process.exit(fehler ? 1 : 0);
