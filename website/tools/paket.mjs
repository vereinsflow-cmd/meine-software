// Gemeinsame Teile von paket-bauen.mjs (ZIP für den Webspace Explorer) und hochladen.mjs (SFTP): welche Dateien auf den
// Webspace gehören und wie die Stildatei dafür bereinigt wird. Ohne Abhängigkeiten.
//
// Die Stildatei besteht zu fast einem Drittel aus Entwicklerkommentaren. Hochgeladen wird deshalb eine Kopie ohne
// Kommentare, ohne Einrückung und ohne Leerzeilen; der kommentierte Quelltext in assets/css/site.css bleibt unverändert.
// Regeln, Werte, Zeichenketten und url(...) bleiben erhalten, nur Leerraum dazwischen wird gekürzt; bereinigeCss bricht ab,
// wenn sich dabei Klammern, Semikolons oder url(...)-Angaben ändern würden.
import fs from "node:fs";
import path from "node:path";

// Wie bisher beim Upload-Paket: Werkzeuge, Paket, README, Vorschau-Starter und Netlify-Header bleiben lokal
// (nur oben im Ordner); .DS_Store nirgends. Alles andere – auch .htaccess – kommt auf den Webspace.
const OBEN_AUSGELASSEN = new Set(["tools", "upload", "README.md", "Vorschau-starten.cmd", "Vorschau-starten.command", "_headers"]);

/** Ordner und Dateien (relativ, mit „/“, sortiert), die auf den Webspace gehören. */
export function sammlePaket(root) {
  const ordner = [];
  const dateien = [];
  (function sammeln(relativ) {
    const eintraege = fs.readdirSync(path.join(root, relativ), { withFileTypes: true });
    eintraege.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const eintrag of eintraege) {
      if (eintrag.name === ".DS_Store" || (!relativ && OBEN_AUSGELASSEN.has(eintrag.name))) continue;
      const pfad = relativ ? `${relativ}/${eintrag.name}` : eintrag.name;
      if (eintrag.isDirectory()) {
        ordner.push(pfad);
        sammeln(pfad);
      } else if (eintrag.isFile()) {
        dateien.push(pfad);
      }
    }
  })("");
  return { ordner, dateien };
}

/** Wird diese Datei für den Webspace bereinigt? (derzeit nur Stildateien) */
export const wirdBereinigt = (pfad) => pfad.endsWith(".css");

/** Inhalt einer Datei, wie er auf den Webspace kommt: Stildateien bereinigt, alles andere unverändert. */
export function paketInhalt(root, pfad) {
  const roh = fs.readFileSync(path.join(root, pfad));
  return wirdBereinigt(pfad) ? Buffer.from(bereinigeCss(roh.toString("utf8"), pfad), "utf8") : roh;
}

/**
 * Entfernt Kommentare und überflüssigen Leerraum aus CSS. Arbeitet wie der CSS-Tokenizer: Zeichenketten ("…", '…'),
 * url(...) ohne Anführungszeichen und mit „\“ maskierte Zeichen werden unverändert übernommen – ein „/*“ darin ist kein
 * Kommentar. Leerraum außerhalb davon: Folgen mit Zeilenumbruch werden zu einem Umbruch (keine Einrückung, keine
 * Leerzeilen, keine Leerzeichen am Zeilenende), Folgen ohne Umbruch zu einem Leerzeichen. Umbrüche bleiben stehen, wo
 * sie Wörter trennen (z. B. „.a\n.b“ in Selektoren). Wörter werden nie zusammengezogen: Steht ein Kommentar ohne Leerraum
 * zwischen zwei Wortzeichen (etwa „1px/* *\/2px“), bleibt dort ein leerer Kommentar „/**\/“ stehen.
 */
export function bereinigeCss(css, name = "CSS") {
  const n = css.length;
  let aus = "";
  let leer = ""; // gesammelter Leerraum seit dem letzten ausgegebenen Zeichen
  let kommentarDazwischen = false;
  const wortzeichen = /[A-Za-z0-9_%.\-\\\u0080-\uffff]/;
  const zeile = (i) => css.slice(0, i).split("\n").length;

  const ausgeben = (text) => {
    if (leer) {
      // Am Anfang der Datei entfällt Leerraum ganz; sonst Umbruch oder ein Leerzeichen.
      if (aus) aus += leer.includes("\n") ? "\n" : " ";
    } else if (kommentarDazwischen && wortzeichen.test(aus.at(-1) ?? "") && wortzeichen.test(text[0])) {
      aus += "/**/";
    }
    leer = "";
    kommentarDazwischen = false;
    aus += text;
  };

  let i = 0;
  while (i < n) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const ende = css.indexOf("*/", i + 2);
      if (ende < 0) throw new Error(`${name}: Kommentar ab Zeile ${zeile(i)} wird nicht geschlossen`);
      i = ende + 2;
      kommentarDazwischen = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f") {
      leer += c === "\r" || c === "\f" ? "\n" : c;
      i++;
      continue;
    }
    if (c === "\\") {
      // Maskiertes Zeichen (z. B. „\:“ in einem Klassennamen) gehört zum Wort davor
      ausgeben(css.slice(i, i + 2));
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c) {
        if (css[j] === "\n") throw new Error(`${name}: Zeichenkette in Zeile ${zeile(i)} endet nicht in derselben Zeile`);
        j += css[j] === "\\" ? 2 : 1;
      }
      if (j >= n) throw new Error(`${name}: Zeichenkette ab Zeile ${zeile(i)} wird nicht geschlossen`);
      ausgeben(css.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if ((c === "u" || c === "U") && /^url\($/i.test(css.slice(i, i + 4)) && !wortzeichen.test(css[i - 1] ?? "")) {
      let j = i + 4;
      while (j < n && /\s/.test(css[j])) j++;
      if (css[j] !== '"' && css[j] !== "'") {
        // url(...) ohne Anführungszeichen: bis zur schließenden Klammer unverändert übernehmen
        const ende = css.indexOf(")", j);
        if (ende < 0) throw new Error(`${name}: url( ab Zeile ${zeile(i)} wird nicht geschlossen`);
        ausgeben(css.slice(i, ende + 1));
        i = ende + 1;
        continue;
      }
    }
    ausgeben(c);
    i++;
  }
  if (aus) aus += "\n";

  // Gegenprobe: Klammern und url(...)-Angaben müssen unverändert sein, sonst lieber abbrechen als Kaputtes hochladen.
  const zaehle = (text, zeichen) => text.split(zeichen).length - 1;
  for (const zeichen of ["{", "}", "(", ")", ";"]) {
    if (zaehle(ohneKommentare(css), zeichen) !== zaehle(aus, zeichen)) throw new Error(`${name}: Anzahl „${zeichen}“ hat sich beim Bereinigen geändert`);
  }
  const urls = (text) => [...text.matchAll(/url\(\s*([^)]*?)\s*\)/gi)].map((m) => m[1]).join("\n");
  if (urls(ohneKommentare(css)) !== urls(aus)) throw new Error(`${name}: url(...) hat sich beim Bereinigen geändert`);
  if (/\/\*(?!\*\/)/.test(aus.replace(UNVERAENDERT, ""))) throw new Error(`${name}: Nach dem Bereinigen steht noch ein Kommentar in der Datei`);
  return aus;
}

// Nur für die Gegenprobe, unabhängig vom Durchlauf oben: Zeichenketten und url(...) ohne Anführungszeichen bleiben stehen,
// Kommentare werden zu einem Leerzeichen.
const UNVERAENDERT = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\burl\(\s*[^"'\s)][^)]*\)/gi;
function ohneKommentare(css) {
  const muster = new RegExp(`${UNVERAENDERT.source}|\\/\\*[\\s\\S]*?\\*\\/`, "gi");
  return css.replace(muster, (m) => (m.startsWith("/*") ? " " : m));
}
