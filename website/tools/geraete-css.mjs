// Setzt die Geräte (Laptop und Telefon, die sich von selbst ins Bild drehen) WÖRTLICH aus dem Stand c112a20 in
// assets/css/site.css ein – damit ihre Bewegung unverändert bleibt. Gelesen wird site.css aus git (c112a20), geschrieben
// wird nur zwischen den Markern in der heutigen site.css:
//   /* @@geraete-anfang … */  … Bereiche 1–6 …  /* @@geraete-ende */
//   /* @@geraete-keyframes … */  … Bereich 7 (Keyframes der Vorführungen, bis zum Dateiende) …
// Bereiche (Zeilen in c112a20): 1566–1761 Telefon-Rahmen (.phone), 1766–4197 Vorführungen, 4199–4299 Text um die Bühne,
// 7018–7312 Bewegung (in @media (prefers-reduced-motion: no-preference)), 7862–7870 Bild-Laden (ebenso), 7954–7964 Druck
// (in @media print), 9674–12813 Keyframes. Die Grenzzeilen werden geprüft; passt eine nicht, bricht das Werkzeug ab.
// tools/make-showcase-keyframes.mjs funktioniert danach unverändert (es ersetzt alles nach „Keyframes der Vorführungen“).
//   node tools/geraete-css.mjs            einsetzen
//   node tools/geraete-css.mjs --pruefen  nur prüfen, ob site.css die Bereiche wörtlich enthält
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssFile = path.join(root, "assets", "css", "site.css");
export const REFERENZ = "c112a20";

/** [von, bis, Hülle, Titel, erste Zeile beginnt mit, letzte Zeile beginnt mit] */
export const BEREICHE = [
  [1566, 1761, null, "Telefon-Rahmen (.phone)", ".phone {", "}"],
  [1766, 4197, null, "Vorführungen: Laptop, Telefon, Breiten", "/* ---------- Vorführungen: Laptop und Telefon", "}"],
  [4199, 4299, null, "Vorführungen: Text um die Bühne", "/* ---------- Vorführungen: Text um die Bühne", "}"],
  [7018, 7312, "@media (prefers-reduced-motion: no-preference)", "Bewegung der Vorführungen", "  /* --- Vorführungen: Die Geräte bewegen sich", "  }"],
  [7862, 7870, "@media (prefers-reduced-motion: no-preference)", "Bild-Laden: nur Einblenden", "  .js .browser img,", "  }"],
  [7954, 7964, "@media print", "Druck: Endlage der Vorführungen", "  /* Vorführungen: Endlage ohne Bewegung", "  }"],
  [9674, 12813, null, "Keyframes der Vorführungen", "/* ======", "}"],
];

export function referenzCss() {
  return execFileSync("git", ["show", `${REFERENZ}:website/assets/css/site.css`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
}

/** Die Bereiche als fertiger Text: [Teil vor den Keyframes, Keyframes] */
export function geraeteTexte(ref = referenzCss()) {
  const zeilen = ref.split("\n");
  if (zeilen.length < 12813) throw new Error(`site.css aus ${REFERENZ} hat nur ${zeilen.length} Zeilen`);
  const teile = BEREICHE.map(([von, bis, huelle, titel, anfang, ende]) => {
    const stueck = zeilen.slice(von - 1, bis);
    if (!stueck[0].startsWith(anfang) || !stueck.at(-1).startsWith(ende)) {
      throw new Error(`Bereich ${von}–${bis} (${titel}) passt nicht: „${stueck[0].slice(0, 60)}“ … „${stueck.at(-1).slice(0, 60)}“`);
    }
    const text = stueck.join("\n");
    const kopf = `/* ---- wörtlich aus site.css ${REFERENZ}, Zeilen ${von}–${bis}: ${titel} ---- */`;
    return huelle ? `${kopf}\n${huelle} {\n${text}\n}` : `${kopf}\n${text}`;
  });
  return [teile.slice(0, 6).join("\n\n"), teile[6]];
}

const ANFANG = "/* @@geraete-anfang";
const ENDE = "/* @@geraete-ende */";
const KEYFRAMES = "/* @@geraete-keyframes";

function einsetzen(css, [vorne, keyframes]) {
  const a = css.indexOf(ANFANG);
  const e = css.indexOf(ENDE);
  const k = css.indexOf(KEYFRAMES);
  if (a < 0 || e < a || k < e) throw new Error("Marker @@geraete-anfang / @@geraete-ende / @@geraete-keyframes fehlen oder stehen falsch");
  const nachAnfang = css.indexOf("*/", a) + 2;
  const nachKeyframes = css.indexOf("*/", k) + 2;
  return `${css.slice(0, nachAnfang)}\n${vorne}\n${css.slice(e, nachKeyframes)}\n\n${keyframes}\n`;
}

/** Prüft, ob css die Bereiche genau so enthält, wie das Werkzeug sie einsetzen würde. */
export function istWoertlich(css, texte = geraeteTexte()) {
  return einsetzen(css, texte) === css;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = fs.readFileSync(cssFile, "utf8");
  const neu = einsetzen(css, geraeteTexte());
  if (process.argv.includes("--pruefen")) {
    const ok = neu === css;
    console.log(ok ? "site.css enthält die Geräte wörtlich (c112a20)." : "site.css weicht von den Gerätebereichen aus c112a20 ab – node tools/geraete-css.mjs ausführen.");
    process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync(cssFile, neu);
  console.log(`Geräte eingesetzt: ${BEREICHE.length} Bereiche aus ${REFERENZ} → ${path.relative(root, cssFile)} (${(neu.length / 1024).toFixed(1)} KB)`);
}
