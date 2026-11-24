// Füllt die Finanzen des Demo-Vereins „TSV Musterstadt“ für die Handy-Aufnahmen des 60-s-Reels (Übersicht, Beiträge,
// Kassenbuch, Rechnungen) – nur in der Aufnahme-Datenbank `vf_website`, nie in der Entwicklungsdatenbank.
//
//   node werkzeuge/finanzen-demo.mjs              Finanzen anlegen (beliebig oft – jeder Lauf ersetzt den vorigen Stand)
//   node werkzeuge/finanzen-demo.mjs --entfernen  alles wieder entfernen, was dieses Skript angelegt hat
//   node werkzeuge/finanzen-demo.mjs --ohne-lauf  ohne Beitragslauf (dafür muss die Demo-App nicht laufen)
//
// Reihenfolge: Demo-App mit `vf_website` starten (website/README.md, „Hinweise zu den Aufnahmen“), dann
// `node tools/demo-vorbereiten.mjs` im Ordner website/ des Repositorys, dann dieses Skript. Der Beitragslauf rechnet mit den
// Mitgliedern aus demo-vorbereiten.mjs – vor einem erneuten Lauf von demo-vorbereiten.mjs deshalb zuerst
// `--entfernen` (sonst hängen Beiträge an Mitgliedern, die demo-vorbereiten.mjs löschen will).
//
// Was entsteht – so, wie die Anwendung es selbst anlegen würde (Struktur aus prisma/schema.prisma, src/modules/finance,
// src/modules/fees; die Prüfregeln der Datenbank laufen beim Anlegen mit: Summen, Barkasse nie im Minus, keine Buchung in
// der Zukunft, Nummernkreise, Aufbewahrungsfrist der Belege, Prüfsummen der Monatsabschlüsse):
// - Beiträge: die Beitragsordnung wie im aktuellen Seed (prisma/seed.ts: Jugend bis 17 Jahre 6 €, Passiv 4 €,
//   Erwachsene 12 €, Familienbeitrag 15 € je Monat, Familie Krüger, Ermäßigung 50 % für die Übungsleiterin) und – über die
//   Oberfläche der laufenden App, also mit ihrer eigenen Beitragsberechnung – ein erstellter Beitragslauf
//   für das laufende Quartal (FEE_RUN_PERIOD). Zahlungen zu Beiträgen gibt es in der App noch nicht; die Beiträge sind offen.
// - Kassenbuch ab LEDGER_START: Girokonto und Barkasse mit Anfangsbestand, die Standard-Kategorien der App (gelesen aus
//   src/modules/finance/default-categories.ts), gut 20 Einnahmen und Ausgaben bis Anfang Oktober (Kontostand steigt leicht) (fast alle mit Beleg:
//   erzeugte PDF-Belege und fotografierte Kassenbons als Bild, dazu Eigenbelege als Text), eine Umbuchung zur Barkasse,
//   je Monat ein Kassensturz, Juli und August abgeschlossen (September ist erst ab dem 10. Oktober fällig).
// - Rechnungen: drei weitere bezahlte Rechnungen, die wie über „Ins Kassenbuch“ gebucht sind (Beleg der Buchung), und die
//   bezahlte Rechnung des Seeds ebenso. Die beiden offenen Rechnungen des Seeds (eine überfällig) bleiben, wie sie sind –
//   Karte „Offene Rechnungen“: 1.549,50 €, 2 Rechnungen, davon 1 überfällig.
// - Belegdateien liegen wie Uploads im Speicher der App (STORAGE_DIR/<Verein>/<Schlüssel>, Standard: storage/ im
//   Repository, wie in dessen .env) – mit festen Schlüsseln; `--entfernen` legt sie in den Papierkorb (~/.Trash).
//
// Alle Namen sind erfunden („Musterstadt“, keine echten Firmen oder Personen). Kein SEPA/Lastschrift (der Seed stellt
// zwei Mitglieder auf Lastschrift – das bleibt hier weg, damit im Bild nichts davon steht).
//
// Feste Daten: Das Kassenbuch erzählt das Geschäftsjahr 2026 (Juli bis Anfang Oktober). Das Skript läuft deshalb nur
// zwischen LATEST_ENTRY und Jahresende 2026 – danach die Daten unten verschieben. Die offenen Rechnungen des Seeds rechnen
// vom Tag des Seeds aus: Ab dem 14.10.2026 sind beide überfällig (Hinweis in der Ausgabe).
//
// Entfernen und Ersetzen: Kassenbuch, Abschlüsse, Kassenstürze, Nummernkreise und Beitragsläufe sind in der App
// unveränderlich (Trigger). Das Skript räumt sie deshalb in einer eigenen Transaktion mit
// `session_replication_role = replica` ab (Trigger aus, nur in vf_website, nur für den Demo-Verein) – das Kassenbuch und
// die Beitragsläufe des Demo-Vereins gehören ganz diesem Skript (der Seed legt keine an). Danach wird mit allen Prüfregeln
// neu angelegt. Ebenso werden nur kosmetisch die Erfassungszeitpunkte (recordedAt, closedAt, countedAt, attachedAt) auf
// den jeweiligen Tag zurückgesetzt – sie gehen in keine Prüfsumme ein.
//
// Umgebungsvariablen (optional):
//   VF_APP_DIR        Repository der App (node_modules: pg, playwright, sharp)  (Standard: dieses Repository, drei Ordner über werkzeuge/)
//   VF_DATABASE_URL   Aufnahme-Datenbank        (postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website)
//   VF_STORAGE_DIR    Dateiablage der App       (<VF_APP_DIR>/storage, wie STORAGE_DIR=./storage in dessen .env)
//   VF_APP_URL        laufende Demo-App         (http://localhost:3000) – nur für den Beitragslauf
//   VF_DEMO_EMAIL / VF_DEMO_PASSWORD  Demo-Administrator; sonst zur Laufzeit aus website/tools/capture-screenshots.mjs
//                     gelesen (nie ausgegeben, nie gespeichert)
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATABASE_URL = process.env.VF_DATABASE_URL ?? "postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website";
const STORAGE_DIR = path.resolve(process.env.VF_STORAGE_DIR ?? path.join(APP_DIR, "storage"));
const BASE_URL = (process.env.VF_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Einzige Datenbank, die das Skript anfasst (wie website/tools/demo-vorbereiten.mjs). */
const ALLOWED_DATABASE = "vf_website";
const DEMO_SLUG = "tsv-musterstadt";
const remove = process.argv.includes("--entfernen");
const withRun = !remove && !process.argv.includes("--ohne-lauf");

/** Beginn des Kassenbuchs (der Verein führt es seit dem 1. Juli in VereinsFlow) und die festen Daten der Geschichte. */
const LEDGER_START = "2026-07-01";
const LATEST_ENTRY = "2026-10-05";
const LAST_DAY = "2026-12-31";
/** Monate, die abgeschlossen sind (der Reihe nach, wie in der App); September wäre erst ab dem 10.10. „fällig“. */
const CLOSES = [
  { through: "2026-07-31", at: ["2026-08-06", "19:12"] },
  { through: "2026-08-31", at: ["2026-09-08", "20:03"] },
];
/** Kassenstürze (gezählt = Stand laut Kassenbuch, keine Differenz). */
const CASH_COUNTS = [
  { day: "2026-07-31", time: "21:05", notes: { 20000: 1, 10000: 1, 5000: 2, 2000: 1, 1000: 1, 200: 1, 20: 1, 10: 1 } },
  { day: "2026-08-31", time: "20:40" },
  { day: "2026-09-30", time: "20:15" },
];
/** Beitragslauf über die Oberfläche: Zeitraum (Quartal, Einstellung „vierteljährlich“ der App) */
const FEE_RUN_PERIOD = "2026-10-01";
/** Beitragsordnung ab (wie im Seed: 1. Januar des laufenden Jahres) */
const FEE_START = "2026-01-01";

const require = createRequire(path.join(APP_DIR, "package.json"));
const { Client } = require("pg");

const databaseName = decodeURIComponent(new URL(DATABASE_URL).pathname.replace(/^\//, ""));
if (databaseName !== ALLOWED_DATABASE) {
  console.error(`Abbruch: Das Skript arbeitet nur mit der Datenbank „${ALLOWED_DATABASE}“, nicht mit „${databaseName || "?"}“.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------------
// Hilfen: IDs, Tage, Zeitpunkte (wie in website/tools/demo-vorbereiten.mjs)
// ---------------------------------------------------------------------------------------------------------------------

const NAMESPACE = "vereinsflow-reel60-finanzen";
/**
 * Feste ID je Eintrag, aufgebaut wie die UUIDv7 der App: vorn der Zeitpunkt (hier der Tag, an dem der Eintrag „entstand“,
 * plus laufende Nummer – so sortieren die IDs wie echte), hinten ein Hash aus Art und Nummer. Über dieselben IDs findet
 * der nächste Lauf alles wieder.
 */
function demoId(kind, n, day = LEDGER_START) {
  const hash = createHash("sha256").update(`${NAMESPACE}:${kind}:${n}`).digest("hex");
  const offset = typeof n === "number" ? n : Number.parseInt(hash.slice(20, 23), 16);
  const ms = new Date(`${day}T08:00:00Z`).getTime() + offset;
  const ts = ms.toString(16).padStart(12, "0").slice(-12);
  const variant = ((Number.parseInt(hash[3], 16) & 0x3) | 0x8).toString(16);
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${hash.slice(0, 3)}-${variant}${hash.slice(4, 7)}-${hash.slice(7, 19)}`;
}
/** Speicherschlüssel wie die App (32 Hex-Zeichen), aber fest – ein neuer Lauf überschreibt dieselbe Datei. */
const storageKey = (key) => createHash("sha256").update(`${NAMESPACE}:datei:${key}`).digest("hex").slice(0, 32);

const parseDay = (day) => new Date(`${day}T00:00:00Z`);
const addDays = (day, n) => new Date(parseDay(day).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const berlinToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const deDay = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
const euro = (cents) =>
  `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Zeitpunkt einer Berliner Uhrzeit an einem Kalendertag (Sommer- und Winterzeit berücksichtigt). */
function berlinInstant(day, time) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const offset = (ms) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
      .formatToParts(new Date(ms))
      .find((part) => part.type === "timeZoneName")?.value;
    const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? "");
    return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
  };
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - offset(guess - offset(guess) * 60_000) * 60_000);
}
/** Zeitpunkte so schreiben, wie die App (Prisma mit dem pg-Adapter) es tut – siehe demo-vorbereiten.mjs. */
const stamp = (instant) => instant.toISOString().replace("T", " ").replace("Z", "");
const at = (day, time) => stamp(berlinInstant(day, time));

// ---------------------------------------------------------------------------------------------------------------------
// Belegdateien: kleine PDF-Dokumente und „fotografierte“ Kassenbons (JPEG über sharp aus SVG)
// ---------------------------------------------------------------------------------------------------------------------

/** Text in WinAnsi (Latin-1 plus €, Gedankenstrich, deutsche Anführungszeichen) für die Standardschriften der PDF. */
function winAnsi(text) {
  const map = { "€": 0x80, "„": 0x84, "…": 0x85, "–": 0x96, "—": 0x97, "“": 0x93, "”": 0x94, "‚": 0x82, "‘": 0x91, "’": 0x92 };
  const bytes = [];
  for (const char of text) {
    const code = map[char] ?? char.codePointAt(0);
    if (code > 0xff) throw new Error(`Zeichen „${char}“ fehlt in WinAnsi`);
    if (char === "(" || char === ")" || char === "\\") bytes.push(0x5c);
    bytes.push(code);
  }
  return Buffer.from(bytes);
}

/**
 * Einseitige PDF (A4) aus Zeilen: { text, size, bold, gap, right } – `right` steht als Betrag rechts. Gültige PDF 1.4 mit
 * Helvetica (keine eingebetteten Schriften, wenige KB).
 */
function makePdf(title, lines) {
  const parts = [Buffer.from("BT\n")];
  let y = 790;
  for (const line of lines) {
    const size = line.size ?? 11;
    y -= (line.gap ?? 0) + size * 1.55;
    const font = line.bold ? "/F2" : "/F1";
    parts.push(Buffer.from(`${font} ${size} Tf 1 0 0 1 56 ${y.toFixed(1)} Tm (`), winAnsi(line.text ?? ""), Buffer.from(") Tj\n"));
    if (line.right) {
      // rechtsbündig ungefähr (Helvetica: Ziffern 0,556 em)
      const width = [...line.right].length * size * 0.556;
      parts.push(
        Buffer.from(`${font} ${size} Tf 1 0 0 1 ${(539 - width).toFixed(1)} ${y.toFixed(1)} Tm (`),
        winAnsi(line.right),
        Buffer.from(") Tj\n"),
      );
    }
  }
  parts.push(Buffer.from("ET\n0.6 w 56 70 m 539 70 l S\nBT /F1 8 Tf 1 0 0 1 56 56 Tm ("), winAnsi(`${title} – Beleg für die Vereinsbuchhaltung`), Buffer.from(") Tj ET\n"));
  const content = Buffer.concat(parts);
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("endstream")]),
    Buffer.concat([Buffer.from("<< /Title ("), winAnsi(title), Buffer.from(") /Producer (TSV Musterstadt Demo) >>")]),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>`,
    "startxref",
    String(length),
    "%%EOF",
    "",
  ].join("\n");
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

const xml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Kassenbon als Foto: schmaler Bon, leicht gedreht auf grauem Grund, als JPEG. */
async function makeReceiptPhoto(sharp, { shop, address, items, total, paid, day, time, footer }) {
  const width = 360;
  const rows = [];
  let y = 64;
  const line = (text, { size = 15, weight = 400, anchor = "start", x = 24 } = {}) => {
    rows.push(
      `<text x="${anchor === "middle" ? width / 2 : anchor === "end" ? width - 24 : x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${xml(text)}</text>`,
    );
  };
  line(shop, { size: 20, weight: 700, anchor: "middle" });
  y += 24;
  line(address, { size: 13, anchor: "middle" });
  y += 30;
  line(`${deDay(day)}  ${time}`, { size: 13 });
  y += 14;
  rows.push(`<line x1="24" x2="${width - 24}" y1="${y}" y2="${y}" stroke="#555" stroke-dasharray="4 3"/>`);
  y += 26;
  for (const [name, price] of items) {
    line(name);
    line(price, { anchor: "end" });
    y += 24;
  }
  rows.push(`<line x1="24" x2="${width - 24}" y1="${y - 8}" y2="${y - 8}" stroke="#555" stroke-dasharray="4 3"/>`);
  y += 16;
  line("SUMME EUR", { size: 18, weight: 700 });
  line(total, { size: 18, weight: 700, anchor: "end" });
  y += 26;
  line(paid, { size: 13 });
  y += 34;
  line(footer ?? "Vielen Dank für Ihren Einkauf!", { size: 13, anchor: "middle" });
  y += 24;
  const height = y + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${height + 140}">
  <rect width="100%" height="100%" fill="#8d8a84"/>
  <g transform="translate(100 70) rotate(-1.6 ${width / 2} ${height / 2})">
    <rect x="4" y="6" width="${width}" height="${height}" fill="#000" opacity="0.25"/>
    <rect width="${width}" height="${height}" fill="#fbfaf6"/>
    <g font-family="Menlo, Courier New, monospace" fill="#222">${rows.join("\n")}</g>
  </g>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
}

// ---------------------------------------------------------------------------------------------------------------------
// Die Geschichte: Belege, Rechnungen, Buchungen
// ---------------------------------------------------------------------------------------------------------------------

const CLUB_LINE = "TSV Musterstadt 1898 e.V. · Am Sportplatz 1 · 12345 Musterstadt";

/** PDF-Belege (Rechnungen Dritter, Abrechnungen des Vereins). `key`: fester Name für ID und Speicherschlüssel. */
function pdfReceipt(key, { name, title, from, lines, total }) {
  return {
    key,
    name,
    mime: "application/pdf",
    build: () =>
      makePdf(title, [
        { text: from[0], size: 15, bold: true },
        ...from.slice(1).map((text) => ({ text, size: 9 })),
        { text: CLUB_LINE, size: 9, gap: 26 },
        { text: title, size: 16, bold: true, gap: 26 },
        ...lines.map(([text, right], i) => ({ text, right, size: 11, gap: i === 0 ? 14 : 2 })),
        { text: "Gesamtbetrag", right: total, size: 12, bold: true, gap: 14 },
      ]),
  };
}
function photoReceipt(key, name, spec) {
  return { key, name, mime: "image/jpeg", photo: spec };
}

/** Bezahlte Rechnungen, die gebucht sind (Name wie in der App: „Rechnung vom <Tag des Hochladens>“). */
const PAID_INVOICES = [
  {
    key: "rechnung-halle-juli",
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-15",
    paid: ["2026-07-03", "09:40"],
    cents: 24_000,
    file: pdfReceipt("rechnung-halle-juli", {
      name: null,
      title: "Rechnung Nr. 2026-0712",
      from: ["Stadt Musterstadt", "Sportstättenverwaltung · Rathausplatz 1 · 12345 Musterstadt"],
      lines: [
        ["Rechnungsdatum: 01.07.2026 · zahlbar bis 15.07.2026", ""],
        ["Hallenzeiten Turnhalle am Markt, Juli 2026", ""],
        ["16 Std. Tischtennis (Mi 19–21 Uhr, Sa nach Absprache) à 15,00 €", "240,00 €"],
      ],
      total: "240,00 €",
    }),
  },
  {
    key: "rechnung-halle-august",
    invoiceDate: "2026-08-03",
    dueDate: "2026-08-17",
    paid: ["2026-08-05", "18:20"],
    cents: 24_000,
    file: pdfReceipt("rechnung-halle-august", {
      name: null,
      title: "Rechnung Nr. 2026-0804",
      from: ["Stadt Musterstadt", "Sportstättenverwaltung · Rathausplatz 1 · 12345 Musterstadt"],
      lines: [
        ["Rechnungsdatum: 03.08.2026 · zahlbar bis 17.08.2026", ""],
        ["Hallenzeiten Turnhalle am Markt, August 2026", ""],
        ["16 Std. Tischtennis à 15,00 €", "240,00 €"],
      ],
      total: "240,00 €",
    }),
  },
  {
    key: "rechnung-verband",
    invoiceDate: "2026-09-02",
    dueDate: "2026-09-30",
    paid: ["2026-09-12", "10:05"],
    cents: 74_200,
    file: pdfReceipt("rechnung-verband", {
      name: null,
      title: "Beitragsrechnung 2. Halbjahr 2026",
      from: ["Sportbund Musterkreis e.V.", "Geschäftsstelle · Am Stadion 4 · 12340 Musterkreis"],
      lines: [
        ["Rechnungsdatum: 02.09.2026 · zahlbar bis 30.09.2026", ""],
        ["Verbandsbeitrag nach Mitgliederzahl (Stichtag 01.01.2026)", "612,00 €"],
        ["Abteilungsumlage Fußball, Handball, Tischtennis", "130,00 €"],
      ],
      total: "742,00 €",
    }),
  },
];

/** Belege, die keine Rechnungen sind (Dokumente „Nur Finanzen“, Kategorie „Belege“ – wie über „Beleg anhängen“). */
const RECEIPTS = {
  beitraege3: pdfReceipt("beitraege-q3", {
    name: "Beitragseingänge Juli 2026.pdf",
    title: "Beitragseingänge Juli 2026",
    from: ["TSV Musterstadt 1898 e.V.", "Kassenwart · Aufstellung aus den Kontoauszügen"],
    lines: [["Mitgliedsbeiträge 3. Quartal 2026, Überweisungen bis 31.07.", "siehe Buchung"]],
    total: "siehe Buchung",
  }),
  beitraegeNach: pdfReceipt("beitraege-q3-nach", {
    name: "Beitragseingänge August 2026.pdf",
    title: "Beitragseingänge August 2026",
    from: ["TSV Musterstadt 1898 e.V.", "Kassenwart · Aufstellung aus den Kontoauszügen"],
    lines: [["Mitgliedsbeiträge 3. Quartal 2026, Überweisungen im August", "siehe Buchung"]],
    total: "siehe Buchung",
  }),
  bande: pdfReceipt("bande", {
    name: "Rechnung Bandenwerbung Saison 2026-27.pdf",
    title: "Rechnung Nr. V-2026-07 · Bandenwerbung",
    from: ["TSV Musterstadt 1898 e.V.", "Vorstand · Am Sportplatz 1 · 12345 Musterstadt"],
    lines: [
      ["An: Autohaus am Ring, Ringstraße 20, 12345 Musterstadt", ""],
      ["Werbebande am Sportplatz (3 m), Saison 2026/27", "800,00 €"],
    ],
    total: "800,00 €",
  }),
  ulZuschuss: pdfReceipt("ul-zuschuss", {
    name: "Bewilligung Übungsleiterzuschuss 2026.pdf",
    title: "Bewilligung: Übungsleiterzuschuss 2026",
    from: ["Sportbund Musterkreis e.V.", "Geschäftsstelle · Am Stadion 4 · 12340 Musterkreis"],
    lines: [["Zuschuss für 3 lizenzierte Übungsleitungen, 2. Halbjahr 2026", "540,00 €"]],
    total: "540,00 €",
  }),
  ulJuni: pdfReceipt("ul-juni", {
    name: "Abrechnung Übungsleiter Juni 2026.pdf",
    title: "Abrechnung Übungsleiterpauschalen Juni 2026",
    from: ["TSV Musterstadt 1898 e.V.", "Vorstand · Abrechnung nach Stundenzetteln"],
    lines: [
      ["Übungsleitung Fußball D-Jugend (Pauschale)", "150,00 €"],
      ["Übungsleitung Handball Damen (Pauschale)", "150,00 €"],
      ["Übungsleitung Tischtennis (Pauschale)", "150,00 €"],
    ],
    total: "450,00 €",
  }),
  ulJuli: pdfReceipt("ul-juli", {
    name: "Abrechnung Übungsleiter Juli 2026.pdf",
    title: "Abrechnung Übungsleiterpauschalen Juli 2026",
    from: ["TSV Musterstadt 1898 e.V.", "Vorstand · Abrechnung nach Stundenzetteln"],
    lines: [
      ["Übungsleitung Fußball D-Jugend (Pauschale)", "150,00 €"],
      ["Übungsleitung Handball Damen (Pauschale)", "150,00 €"],
      ["Übungsleitung Tischtennis (Pauschale)", "150,00 €"],
    ],
    total: "450,00 €",
  }),
  ulAugust: pdfReceipt("ul-august", {
    name: "Abrechnung Übungsleiter August 2026.pdf",
    title: "Abrechnung Übungsleiterpauschalen August 2026",
    from: ["TSV Musterstadt 1898 e.V.", "Vorstand · Abrechnung nach Stundenzetteln"],
    lines: [
      ["Übungsleitung Fußball D-Jugend (Pauschale)", "150,00 €"],
      ["Übungsleitung Handball Damen (Pauschale)", "150,00 €"],
      ["Übungsleitung Tischtennis (Pauschale)", "150,00 €"],
    ],
    total: "450,00 €",
  }),
  ulSeptember: pdfReceipt("ul-september", {
    name: "Abrechnung Übungsleiter September 2026.pdf",
    title: "Abrechnung Übungsleiterpauschalen September 2026",
    from: ["TSV Musterstadt 1898 e.V.", "Vorstand · Abrechnung nach Stundenzetteln"],
    lines: [
      ["Übungsleitung Fußball D-Jugend (Pauschale)", "150,00 €"],
      ["Übungsleitung Handball Damen (Pauschale)", "150,00 €"],
      ["Übungsleitung Tischtennis (Pauschale)", "150,00 €"],
    ],
    total: "450,00 €",
  }),
  versicherung: pdfReceipt("versicherung", {
    name: "Sportversicherung 2. Halbjahr 2026.pdf",
    title: "Beitragsrechnung Sportversicherung 2. Halbjahr 2026",
    from: ["Sportbund Musterkreis e.V.", "Versicherungsbüro · Am Stadion 4 · 12340 Musterkreis"],
    lines: [
      ["Gruppenunfall- und Haftpflichtversicherung, Juli bis Dezember 2026", "386,00 €"],
    ],
    total: "386,00 €",
  }),
  zuschuss: pdfReceipt("zuschuss", {
    name: "Bewilligung Zuschuss Jugendarbeit 2026.pdf",
    title: "Bewilligung: Zuschuss zur Jugendarbeit 2026",
    from: ["Stadt Musterstadt", "Jugendamt · Rathausplatz 1 · 12345 Musterstadt"],
    lines: [
      ["Zuschuss für Ferienfreizeit und Übungsbetrieb der Jugendabteilung", "600,00 €"],
      ["Auszahlung auf das Vereinskonto, Verwendungsnachweis bis 31.03.2027", ""],
    ],
    total: "600,00 €",
  }),
  trikots: photoReceipt("trikots", "Kassenbon Sporthaus.jpg", {
    shop: "SPORTHAUS MUSTERSTADT",
    address: "Marktstraße 12 · 12345 Musterstadt",
    day: "2026-07-24",
    time: "16:42",
    items: [
      ["Trikot Junior x 15", "254,85"],
      ["Hose Junior x 15", "112,50"],
      ["Rückennummern Satz", "22,55"],
    ],
    total: "389,90",
    paid: "Girocard            389,90",
  }),
  camp: photoReceipt("camp", "Kassenbon Verpflegung Sommercamp.jpg", {
    shop: "FRISCHEMARKT AM RING",
    address: "Ringstraße 3 · 12345 Musterstadt",
    day: "2026-08-20",
    time: "08:14",
    items: [
      ["Brötchen x 60", "24,00"],
      ["Obst & Gemüse", "31,60"],
      ["Getränke (Wasser, Saft)", "38,90"],
      ["Aufschnitt & Käse", "17,90"],
    ],
    total: "112,40",
    paid: "Bar                 112,40",
  }),
  buero: photoReceipt("buero", "Kassenbon Bürobedarf.jpg", {
    shop: "SCHREIBWAREN LANGE",
    address: "Bahnhofstraße 8 · 12345 Musterstadt",
    day: "2026-09-28",
    time: "11:03",
    items: [
      ["Kopierpapier A4 x 2", "11,80"],
      ["Briefmarken 0,95 x 20", "19,00"],
      ["Briefumschläge DIN lang", "6,50"],
      ["Ordner breit x 3", "9,50"],
    ],
    total: "46,80",
    paid: "Bar                  46,80",
  }),
  fahrt: photoReceipt("fahrt", "Quittung Fahrtkosten Auswärtsspiel.jpg", {
    shop: "TSV MUSTERSTADT 1898",
    address: "Abteilung Handball · Fahrtkostenabrechnung",
    day: "2026-10-04",
    time: "19:30",
    items: [
      ["Fahrt Auswärtsspiel", ""],
      ["2 Pkw x 107 km", ""],
      ["à 0,30 €/km", "64,20"],
    ],
    total: "64,20",
    paid: "bar ausgezahlt       64,20",
    footer: "Erhalten – Unterschrift liegt vor",
  }),
};

/**
 * Buchungen in der Reihenfolge der Erfassung (danach vergibt die Datenbank die Nummern 2026-0001 …). Beträge in Cent mit
 * Vorzeichen (+ Einnahme, − Ausgabe), eine Zeile je Kategorie/Abteilung (Übungsleiter und Verbandsbeitrag sind auf die
 * Abteilungen aufgeteilt). `cat`: Name der Kategorie, `dept`: Abteilung (Name wie im Seed). `receipt`: Beleg
 * aus RECEIPTS, `invoice`: Schlüssel aus PAID_INVOICES bzw. "seed-paid" (die bezahlte Rechnung des Seeds), `note`:
 * Eigenbeleg. Mitgliedsbeiträge des 3. Quartals rechnet das Skript aus dem Bestand (feesQ3, siehe unten).
 */
const ENTRIES = [
  { day: "2026-07-01", time: "18:10", account: "bank", kind: "OPENING", text: "Anfangsbestand Girokonto", lines: [["Anfangsbestand", 841_237]] },
  { day: "2026-07-01", time: "18:12", account: "cash", kind: "OPENING", text: "Anfangsbestand Barkasse", lines: [["Anfangsbestand", 24_580]] },
  { day: "2026-07-03", time: "19:30", account: "bank", text: "Hallenmiete Turnhalle am Markt, Juli", who: "Stadt Musterstadt", lines: [["Hallen- und Platzmiete", -24_000, "Tischtennis"]], invoice: "rechnung-halle-juli" },
  { day: "2026-07-10", time: "19:45", account: "bank", text: "Übungsleiterpauschalen Juni", lines: [["Übungsleiter", -15_000, "Jugendarbeit"], ["Übungsleiter", -15_000, "Handball"], ["Übungsleiter", -15_000, "Tischtennis"]], receipt: "ulJuni" },
  { day: "2026-07-18", time: "22:10", account: "cash", text: "Getränkeverkauf Heimspiel Handball", lines: [["Verkauf Speisen und Getränke", 18_650, "Handball"]], note: "Strichliste Kiosk, Kasse nach dem Spiel zu zweit gezählt" },
  { day: "2026-07-24", time: "17:20", account: "bank", text: "Trikotsatz D-Jugend", who: "Sporthaus Musterstadt", lines: [["Sportmaterial", -38_990, "Jugendarbeit"]], receipt: "trikots" },
  { day: "2026-07-31", time: "20:05", account: "bank", text: "Mitgliedsbeiträge 3. Quartal 2026 (Eingänge Juli)", who: "Überweisungen laut Kontoauszug", lines: [["Mitgliedsbeiträge", "feesQ3"]], receipt: "beitraege3" },
  { day: "2026-08-05", time: "18:25", account: "bank", text: "Hallenmiete Turnhalle am Markt, August", who: "Stadt Musterstadt", lines: [["Hallen- und Platzmiete", -24_000, "Tischtennis"]], invoice: "rechnung-halle-august" },
  { day: "2026-08-07", time: "19:15", account: "bank", text: "Übungsleiterpauschalen Juli", lines: [["Übungsleiter", -15_000, "Jugendarbeit"], ["Übungsleiter", -15_000, "Handball"], ["Übungsleiter", -15_000, "Tischtennis"]], receipt: "ulJuli" },
  { day: "2026-08-12", time: "20:30", account: "bank", text: "Mitgliedsbeiträge 3. Quartal 2026 (Eingänge August)", who: "Überweisungen laut Kontoauszug", lines: [["Mitgliedsbeiträge", "feesQ3late"]], receipt: "beitraegeNach" },
  { day: "2026-08-14", time: "18:40", account: "bank", text: "Spende für das Sommercamp", who: "Bäckerei Krause", lines: [["Spenden", 25_000, "Jugendarbeit"]], note: "Überweisung mit Verwendungszweck „Spende Sommercamp“" },
  { day: "2026-08-17", time: "19:20", account: "bank", text: "Vermietung Vereinsheim (Familienfeier)", lines: [["Vermietung", 15_000]], note: "Mietvertrag Vereinsheim für Samstag, 15.08., Miete per Überweisung" },
  { day: "2026-08-20", time: "21:00", account: "cash", text: "Verpflegung Sommercamp", lines: [["Sonstige Ausgaben", -11_240, "Jugendarbeit"]], receipt: "camp" },
  { day: "2026-08-21", time: "19:05", account: "bank", text: "Pokale Jugendturnier", lines: [["Sportmaterial", -8_990, "Jugendarbeit"]], invoice: "seed-paid" },
  { day: "2026-08-27", time: "19:50", account: "bank", text: "Sportversicherung 2. Halbjahr", who: "Sportbund Musterkreis", lines: [["Versicherungen", -38_600]], receipt: "versicherung" },
  { day: "2026-09-04", time: "18:05", transfer: { from: "bank", to: "cash", cents: 15_000 }, text: "Bargeld für die Barkasse" },
  { day: "2026-09-08", time: "19:10", account: "bank", text: "Übungsleiterpauschalen August", lines: [["Übungsleiter", -15_000, "Jugendarbeit"], ["Übungsleiter", -15_000, "Handball"], ["Übungsleiter", -15_000, "Tischtennis"]], receipt: "ulAugust" },
  { day: "2026-09-12", time: "10:15", account: "bank", text: "Verbandsbeitrag 2. Halbjahr", who: "Sportbund Musterkreis", lines: [["Verbandsbeiträge", -61_200], ["Verbandsbeiträge", -5_000, "Fußball"], ["Verbandsbeiträge", -4_000, "Handball"], ["Verbandsbeiträge", -4_000, "Tischtennis"]], invoice: "rechnung-verband" },
  { day: "2026-09-15", time: "18:40", account: "bank", text: "Bandenwerbung Sportplatz, Saison 2026/27", who: "Autohaus am Ring", lines: [["Sponsoring und Werbung", 80_000, "Fußball"]], receipt: "bande" },
  { day: "2026-09-19", time: "17:55", account: "cash", text: "Startgelder Tischtennis-Turnier", lines: [["Startgelder und Kursgebühren", 9_600, "Tischtennis"]], note: "Teilnehmerliste: 12 Starter à 8,00 €" },
  { day: "2026-09-25", time: "18:30", account: "bank", text: "Zuschuss Jugendarbeit 2026", who: "Stadt Musterstadt", lines: [["Zuschüsse", 60_000, "Jugendarbeit"]], receipt: "zuschuss" },
  { day: "2026-09-26", time: "21:40", account: "cash", text: "Getränkeverkauf Heimspieltag Handball", lines: [["Verkauf Speisen und Getränke", 21_400, "Handball"]], note: "Strichliste Kiosk, Kasse nach dem Spieltag zu zweit gezählt" },
  { day: "2026-09-28", time: "12:10", account: "cash", text: "Druckerpapier, Briefmarken, Ordner", who: "Schreibwaren Lange", lines: [["Büro und Porto", -4_680]], receipt: "buero" },
  { day: "2026-10-01", time: "18:50", account: "bank", text: "Übungsleiterzuschuss 2. Halbjahr", who: "Sportbund Musterkreis", lines: [["Zuschüsse", 54_000]], receipt: "ulZuschuss" },
  { day: "2026-10-02", time: "19:35", account: "bank", text: "Übungsleiterpauschalen September", lines: [["Übungsleiter", -15_000, "Jugendarbeit"], ["Übungsleiter", -15_000, "Handball"], ["Übungsleiter", -15_000, "Tischtennis"]], receipt: "ulSeptember" },
  { day: "2026-10-05", time: "18:45", account: "cash", text: "Fahrtkosten Auswärtsspiel Handball Damen", lines: [["Fahrtkosten", -6_420, "Handball"]], receipt: "fahrt" },
];

/**
 * Beitragsordnung wie im aktuellen Seed (prisma/seed.ts, Abschnitt „Beiträge“) – ohne die beiden Lastschriften.
 * Ehrenmitglieder ohne eigene Beitragsart sind beitragsfrei.
 */
const FEE_TYPES = [
  { name: "Jugend bis 17 Jahre", priority: 10, maxAge: 17, statuses: [], cents: 600 },
  { name: "Passiv", priority: 20, maxAge: null, statuses: ["PASSIVE"], cents: 400 },
  { name: "Erwachsene", priority: 30, maxAge: null, statuses: [], cents: 1_200 },
];
const FAMILY_TYPE = { name: "Familienbeitrag", cents: 1_500, familyMinMembers: 2 };

// ---------------------------------------------------------------------------------------------------------------------
// Datenbank
// ---------------------------------------------------------------------------------------------------------------------

/** Standard-Kategorien der App, gelesen aus dem Quelltext (bleibt so mit der App im Gleichschritt). */
async function defaultCategories() {
  const source = await fs.readFile(path.join(APP_DIR, "src/modules/finance/default-categories.ts"), "utf8");
  const start = source.indexOf("export const DEFAULT_CATEGORIES");
  const open = source.indexOf("[", source.indexOf("=", start));
  const close = source.indexOf("\n];", open);
  if (start < 0 || open < 0 || close < 0) throw new Error("DEFAULT_CATEGORIES in default-categories.ts nicht gefunden.");
  return new Function(`return ${source.slice(open, close + 2)};`)();
}

/** Alles, was dieses Skript angelegt hat (bzw. was der Seed nicht anlegt: Kassenbuch und Beitragsläufe), entfernen. */
async function removeAll(db, clubId) {
  await db.query("begin");
  try {
    // Trigger aus (Unveränderlichkeit der Finanzdaten) – nur in dieser Transaktion. Fremdschlüssel prüft die Datenbank
    // damit ebenfalls nicht: deshalb streng in der Reihenfolge der Abhängigkeiten.
    await db.query("set local session_replication_role = replica");
    const count = {};
    const del = async (label, sql, params = [clubId]) => {
      const result = await db.query(sql, params);
      count[label] = (count[label] ?? 0) + result.rowCount;
    };
    // Beitragsläufe (über die Oberfläche erstellt) und ihre Beiträge
    await del("Beitragszeilen", `delete from "ChargeCoverage" where "clubId" = $1`);
    await del("Beitragszeilen", `delete from "ChargeLine" where "clubId" = $1`);
    await del("Beiträge", `delete from "Charge" where "clubId" = $1`);
    await del("Beitragsläufe", `delete from "FeeRun" where "clubId" = $1`);
    // Kassenbuch
    await del("Belege", `delete from "LedgerAttachment" where "clubId" = $1`);
    await del("Kassenstürze", `delete from "CashCount" where "clubId" = $1`);
    await del("Buchungszeilen", `delete from "LedgerLine" where "clubId" = $1`);
    await del("Buchungen", `delete from "LedgerEntry" where "clubId" = $1`);
    await del("Abschlüsse", `delete from "FinancePeriodClose" where "clubId" = $1`);
    await del("Nummernkreise", `delete from "FinanceCounter" where "clubId" = $1`);
    await del("Konten", `delete from "FinanceAccount" where "clubId" = $1`);
    await del("Kategorien", `delete from "FinanceCategory" where "clubId" = $1`);
    await del("Einstellungen", `delete from "FinanceSettings" where "clubId" = $1`);
    // Rechnungen und Belege dieses Skripts; Dokumente des Seeds verlieren nur ihre Aufbewahrungsfrist wieder
    const docIds = [...PAID_INVOICES.map((invoice) => demoId("document", invoice.key)), ...Object.values(RECEIPTS).map((r) => demoId("document", r.key))];
    await del("Rechnungen", `delete from "Invoice" where "clubId" = $1 and "documentId" = any($2)`, [clubId, docIds]);
    await del("Dokumente", `delete from "Document" where "clubId" = $1 and id = any($2)`, [clubId, docIds]);
    await db.query(
      `update "Document" set "retainUntil" = null where "clubId" = $1 and "retainUntil" is not null
         and not exists (select 1 from "LedgerAttachment" a where a."clubId" = "Document"."clubId" and a."documentId" = "Document".id)`,
      [clubId],
    );
    // Beitragsordnung (feste IDs)
    const ids = (kind, n) => Array.from({ length: n }, (_, i) => demoId(kind, i));
    await del("Beitragsregeln", `delete from "MemberFeeAssignment" where "clubId" = $1 and id = any($2)`, [clubId, ids("assignment", 5)]);
    await del("Familien", `delete from "FeeFamilyMember" where "clubId" = $1 and id = any($2)`, [clubId, ids("family-member", 5)]);
    await del("Familien", `delete from "FeeFamily" where "clubId" = $1 and id = any($2)`, [clubId, ids("family", 2)]);
    await del("Beitragssätze", `delete from "FeeRate" where "clubId" = $1 and id = any($2)`, [clubId, ids("fee-rate", 5)]);
    await del("Beitragsarten", `delete from "FeeType" where "clubId" = $1 and id = any($2)`, [clubId, ids("fee-type", 5)]);
    await db.query("commit");
    return count;
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  }
}

/** Belegdateien wie ein Upload in den Speicher der App schreiben (Unterordner je Verein, Rechte wie die App: 0640). */
async function storeFile(clubId, key, bytes) {
  const dir = path.join(STORAGE_DIR, clubId);
  const file = path.join(dir, storageKey(key));
  if (!file.startsWith(STORAGE_DIR + path.sep)) throw new Error("Pfad außerhalb des Speichers");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, bytes, { mode: 0o640 });
  return { storageKey: storageKey(key), sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

/** `--entfernen`: Belegdateien dieses Skripts in den Papierkorb legen (nicht endgültig löschen). */
async function trashFiles(clubId) {
  const trash = path.join(os.homedir(), ".Trash");
  let moved = 0;
  const keys = [...PAID_INVOICES.map((invoice) => invoice.key), ...Object.values(RECEIPTS).map((r) => r.key)];
  for (const key of keys) {
    const file = path.join(STORAGE_DIR, clubId, storageKey(key));
    try {
      await fs.access(file);
    } catch {
      continue;
    }
    await fs.mkdir(trash, { recursive: true });
    await fs.rename(file, path.join(trash, `vereinsflow-beleg-${key}-${Date.now()}`));
    moved++;
  }
  return moved;
}

/**
 * Mitgliedsbeiträge des 3. Quartals als Sammelbuchung (bevor der Verein Beitragsläufe in VereinsFlow machte): grob so,
 * wie die Beitragsordnung sie ergibt – wer am 1. Juli Mitglied war, je Monat 12 € (Erwachsene), 6 € (bis 17 Jahre),
 * 4 € (passiv), Ehrenmitglieder frei, Familie Krüger 15 €, die Übungsleiterin die Hälfte. Gut drei Viertel gehen bis Ende
 * Juli ein, der Rest im August – so steigt der Kontostand über das Quartal, statt nach einem Beitragsmonat zu fallen.
 */
async function feesQ3(db, clubId) {
  const { rows } = await db.query(
    `select "firstName" as first, "lastName" as last, status, to_char("birthDate", 'YYYY-MM-DD') as birth,
            to_char("joinedAt", 'YYYY-MM-DD') as joined, to_char("leftAt", 'YYYY-MM-DD') as "left"
       from "Member" where "clubId" = $1 and "deletedAt" is null`,
    [clubId],
  );
  let monthly = 0;
  let krueger = 0;
  for (const m of rows) {
    if (!m.joined || m.joined > "2026-07-01" || (m.left && m.left < "2026-09-30")) continue;
    if (m.status === "HONORARY" || m.status === "LEFT") continue;
    const age = m.birth ? 2026 - Number(m.birth.slice(0, 4)) - (m.birth.slice(5) > "07-01" ? 1 : 0) : 30;
    let cents = age <= 17 ? 600 : m.status === "PASSIVE" ? 400 : 1_200;
    if (m.first === "Claudia" && m.last === "Abteilungsleiterin") cents /= 2;
    if (m.last === "Krüger" && (m.first === "Sophie" || m.first === "Lena")) {
      krueger += cents;
      continue;
    }
    monthly += cents;
  }
  if (krueger) monthly += 1_500;
  const total = monthly * 3;
  // Etwa ein Viertel überweist erst im August (volle Euro)
  const late = Math.round((total * 0.25) / 100) * 100;
  return { feesQ3: total - late, feesQ3late: late };
}

async function login(page, email, password) {
  await page.goto("/anmelden", { waitUntil: "networkidle" });
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
  await page.waitForLoadState("networkidle");
}

/** Demo-Zugangsdaten zur Laufzeit – wie werkzeuge/finanzen-aufnehmen.mjs im 35-s-Reel (nie ausgeben, nie speichern). */
async function demoCredentials() {
  const src = await fs.readFile(path.join(APP_DIR, "website/tools/capture-screenshots.mjs"), "utf8");
  const pick = (name) => src.match(new RegExp(`const ${name} = process\\.env\\.VF_DEMO_${name} \\?\\? "([^"]*)"`))?.[1];
  const email = process.env.VF_DEMO_EMAIL ?? pick("EMAIL");
  const password = process.env.VF_DEMO_PASSWORD ?? pick("PASSWORD");
  if (!email || !password) throw new Error("Demo-Zugangsdaten nicht gefunden");
  return { email, password };
}

/**
 * Beitragslauf über die Oberfläche der laufenden App (Finanzen › Beiträge › Beitragslauf, Schritt 2 „Vorschau“, dann
 * „N Beiträge erstellen“ mit Rückfrage) – so rechnet die App selbst, mit ihrem Prüfwert der Vorschau.
 */
async function runFeeRunInApp() {
  const { chromium } = require("playwright");
  const { email, password } = await demoCredentials();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: BASE_URL, locale: "de-DE", timezoneId: "Europe/Berlin", viewport: { width: 1280, height: 900 } });
    context.setDefaultTimeout(90_000);
    const page = await context.newPage();
    await login(page, email, password);
    await page.goto(`/finanzen/beitraege/lauf?zeitraum=${FEE_RUN_PERIOD}&schritt=2`, { waitUntil: "networkidle" });
    const create = page.getByRole("button", { name: /^\d+ (Beitrag|Beiträge) erstellen$/ }).first();
    await create.waitFor();
    const label = (await create.textContent())?.trim();
    await create.click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: label }).click();
    await page.waitForURL((u) => /\/finanzen\/beitraege\/laeufe\//.test(u.pathname), { timeout: 90_000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    return label;
  } finally {
    await browser.close();
  }
}

async function main() {
  const today = berlinToday();
  if (!remove && (today < LATEST_ENTRY || today > LAST_DAY)) {
    throw new Error(
      `Heute (${today}) passt nicht zur Geschichte des Kassenbuchs (${LEDGER_START} bis ${LATEST_ENTRY}, Geschäftsjahr 2026) – ` +
        "die Daten oben im Skript verschieben.",
    );
  }
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const { rows: [{ current }] } = await db.query("select current_database() as current");
    if (current !== ALLOWED_DATABASE) throw new Error(`Verbunden mit „${current}“ statt „${ALLOWED_DATABASE}“ – Abbruch.`);
    const { rows: clubs } = await db.query(`select id from "Club" where slug = $1`, [DEMO_SLUG]);
    if (!clubs.length) throw new Error(`Verein „${DEMO_SLUG}“ fehlt – zuerst den Seed einspielen (siehe website/README.md).`);
    const clubId = clubs[0].id;

    const removed = await removeAll(db, clubId);
    if (remove) {
      const moved = await trashFiles(clubId);
      console.log(
        `Entfernt: ${Object.entries(removed).filter(([, n]) => n).map(([label, n]) => `${n} ${label}`).join(", ") || "nichts"}; ` +
          `${moved} Belegdateien in den Papierkorb.`,
      );
      return;
    }

    // --- Bezugsdaten: Seed-Konten, Abteilungen, Mitglieder des Seeds, Rechnungen des Seeds ---
    const { rows: accounts } = await db.query(
      `select u.id, split_part(u.email, '@', 1) as key from "User" u
         join "ClubMembership" cm on cm."userId" = u.id and cm."clubId" = $1
        where u.email like '%@demo-verein.local'`,
      [clubId],
    );
    const user = Object.fromEntries(accounts.map((row) => [row.key, row.id]));
    if (!user.vorstand || !user.admin) throw new Error("Seed-Konten „vorstand“/„admin“ fehlen.");
    const treasurer = user.vorstand; // Kassenwart des Seeds (erfasst Rechnungen, bucht, schließt ab)
    const { rows: departments } = await db.query(`select id, name from "Department" where "clubId" = $1`, [clubId]);
    const dept = Object.fromEntries(departments.map((row) => [row.name, row.id]));
    for (const name of ["Fußball", "Handball", "Tischtennis", "Jugendarbeit"]) if (!dept[name]) throw new Error(`Abteilung „${name}“ fehlt.`);
    const member = async (first, last) =>
      (await db.query(`select id from "Member" where "clubId" = $1 and "firstName" = $2 and "lastName" = $3 and "deletedAt" is null`, [clubId, first, last])).rows[0]?.id;
    const sophie = await member("Sophie", "Krüger");
    const lena = await member("Lena", "Krüger");
    const claudia = await member("Claudia", "Abteilungsleiterin");
    const { rows: seedPaid } = await db.query(
      `select i.id, i."documentId", i."amountCents" from "Invoice" i join "Document" d on d.id = i."documentId"
        where i."clubId" = $1 and i.status = 'PAID' and d."deletedAt" is null and not (d.id = any($2))
        order by i."invoiceDate" limit 1`,
      [clubId, PAID_INVOICES.map((invoice) => demoId("document", invoice.key))],
    );
    if (!seedPaid[0]) throw new Error("Die bezahlte Rechnung des Seeds fehlt.");
    const amounts = await feesQ3(db, clubId);
    const sharp = require("sharp");
    const categories = await defaultCategories();

    await db.query("begin");
    // --- Beitragsordnung (wie im Seed) ---
    let feeNo = 0;
    const feeTypeIds = {};
    for (const spec of FEE_TYPES) {
      const id = demoId("fee-type", feeNo);
      await db.query(
        `insert into "FeeType" (id, "clubId", name, kind, priority, "maxAge", statuses, "createdAt", "updatedAt")
         values ($1, $2, $3, 'BASE', $4, $5, $6::"MemberStatus"[], $7, $7)`,
        [id, clubId, spec.name, spec.priority, spec.maxAge, spec.statuses, at("2026-06-20", "19:00")],
      );
      await db.query(
        `insert into "FeeRate" (id, "clubId", "feeTypeId", "validFrom", "amountCents", interval, "createdAt", "createdById")
         values ($1, $2, $3, $4, $5, 'MONTHLY', $6, $7)`,
        [demoId("fee-rate", feeNo), clubId, id, FEE_START, spec.cents, at("2026-06-20", "19:00"), treasurer],
      );
      feeTypeIds[spec.name] = id;
      feeNo++;
    }
    const familyTypeId = demoId("fee-type", feeNo);
    await db.query(
      `insert into "FeeType" (id, "clubId", name, kind, "familyMinMembers", "createdAt", "updatedAt")
       values ($1, $2, $3, 'FAMILY', $4, $5, $5)`,
      [familyTypeId, clubId, FAMILY_TYPE.name, FAMILY_TYPE.familyMinMembers, at("2026-06-20", "19:05")],
    );
    await db.query(
      `insert into "FeeRate" (id, "clubId", "feeTypeId", "validFrom", "amountCents", interval, "createdAt", "createdById")
       values ($1, $2, $3, $4, $5, 'MONTHLY', $6, $7)`,
      [demoId("fee-rate", feeNo), clubId, familyTypeId, FEE_START, FAMILY_TYPE.cents, at("2026-06-20", "19:05"), treasurer],
    );
    if (claudia) {
      await db.query(
        `insert into "MemberFeeAssignment" (id, "clubId", "memberId", kind, "percentBp", "validFrom", reason, "createdAt", "createdById")
         values ($1, $2, $3, 'DISCOUNT_PERCENT', 5000, $4, 'Übungsleiterin', $5, $6)`,
        [demoId("assignment", 0), clubId, claudia, FEE_START, at("2026-06-20", "19:10"), treasurer],
      );
    }
    if (sophie && lena) {
      const familyId = demoId("family", 0);
      await db.query(
        `insert into "FeeFamily" (id, "clubId", name, "feeTypeId", "payerMemberId", "createdAt", "updatedAt", "createdById")
         values ($1, $2, 'Familie Krüger', $3, $4, $5, $5, $6)`,
        [familyId, clubId, familyTypeId, sophie, at("2026-06-20", "19:12"), treasurer],
      );
      for (const [i, memberId] of [sophie, lena].entries()) {
        await db.query(
          `insert into "FeeFamilyMember" (id, "clubId", "familyId", "memberId", "validFrom", "createdAt", "createdById")
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [demoId("family-member", i), clubId, familyId, memberId, FEE_START, at("2026-06-20", "19:12"), treasurer],
        );
      }
    }

    // --- Kassenbuch einrichten (wie „Kassenbuch einrichten“: Einstellungen, Kategorien, Girokonto, Barkasse) ---
    const setupAt = at("2026-07-01", "18:05");
    await db.query(
      `insert into "FinanceSettings" (id, "clubId", "ledgerStartDate", "updatedById", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $5)`,
      [demoId("settings", 0), clubId, LEDGER_START, treasurer, setupAt],
    );
    const categoryId = {};
    for (const [i, c] of categories.entries()) {
      const id = demoId("category", i);
      categoryId[c.name] = id;
      await db.query(
        `insert into "FinanceCategory" (id, "clubId", name, direction, sphere, "systemKey", hint, "sortOrder", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [id, clubId, c.name, c.direction, c.sphere, c.systemKey ?? null, c.hint ?? null, i, setupAt],
      );
    }
    const accountId = { bank: demoId("account", 0), cash: demoId("account", 1) };
    await db.query(
      `insert into "FinanceAccount" (id, "clubId", kind, name, "bankName", "isDefault", "sortOrder", "createdById", "createdAt", "updatedAt")
       values ($1, $2, 'BANK', 'Girokonto', 'Sparkasse Musterstadt', true, 0, $3, $4, $4),
              ($5, $2, 'CASH', 'Barkasse', null, false, 1, $3, $4, $4)`,
      [accountId.bank, clubId, treasurer, setupAt, accountId.cash],
    );

    // --- Rechnungen (bezahlt) und Belegdateien ---
    const documentOf = {};
    for (const invoice of PAID_INVOICES) {
      const bytes = invoice.file.build();
      const stored = await storeFile(clubId, invoice.key, bytes);
      documentOf[invoice.key] = demoId("document", invoice.key);
      // Name wie in der App: Tag des Hochladens (= Rechnungsdatum)
      await db.query(
        `insert into "Document" (id, "clubId", name, "storageKey", "mimeType", "sizeBytes", sha256, category, access, "uploadedById", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, 'application/pdf', $5, $6, 'Rechnungen', 'BOARD', $7, $8, $8)`,
        [documentOf[invoice.key], clubId, `Rechnung vom ${deDay(invoice.invoiceDate)}.pdf`, stored.storageKey, stored.size, stored.sha256, treasurer, at(invoice.invoiceDate, "10:00")],
      );
      await db.query(
        `insert into "Invoice" (id, "clubId", "documentId", "invoiceDate", "amountCents", "dueDate", status, "paidAt", "paidById", "createdById", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, 'PAID', $7, $8, $8, $9, $7)`,
        [demoId("invoice", invoice.key), clubId, documentOf[invoice.key], invoice.invoiceDate, invoice.cents, invoice.dueDate, at(...invoice.paid), treasurer, at(invoice.invoiceDate, "10:00")],
      );
    }
    const invoiceOf = Object.fromEntries(PAID_INVOICES.map((invoice) => [invoice.key, { id: demoId("invoice", invoice.key), documentId: documentOf[invoice.key] }]));
    invoiceOf["seed-paid"] = { id: seedPaid[0].id, documentId: seedPaid[0].documentId };

    const receiptDocs = {};
    for (const [name, receipt] of Object.entries(RECEIPTS)) {
      const bytes = receipt.photo ? await makeReceiptPhoto(sharp, receipt.photo) : receipt.build();
      const stored = await storeFile(clubId, receipt.key, bytes);
      const entry = ENTRIES.find((e) => e.receipt === name);
      receiptDocs[name] = demoId("document", receipt.key);
      await db.query(
        `insert into "Document" (id, "clubId", name, "storageKey", "mimeType", "sizeBytes", sha256, category, access, "uploadedById", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, 'Belege', 'FINANCE', $8, $9, $9)`,
        [receiptDocs[name], clubId, receipt.name, stored.storageKey, receipt.mime, stored.size, stored.sha256, treasurer, at(entry.day, entry.time)],
      );
    }

    // --- Buchungen (Nummern wie nextNumbers der App, Zeilen mit Momentaufnahmen durch die Datenbank) ---
    const nextNumber = async () => {
      const { rows: [counter] } = await db.query(
        `insert into "FinanceCounter" ("clubId", kind, year, "lastValue") values ($1, 'LEDGER', 2026, 1)
         on conflict ("clubId", kind, year) do update set "lastValue" = "FinanceCounter"."lastValue" + 1
         returning "lastValue"`,
        [clubId],
      );
      return counter.lastValue;
    };
    const created = [];
    let attachmentNo = 0;
    const insertEntry = async ({ day, time, account, kind = "STANDARD", text, who = null, lines, transferGroupId = null }) => {
      const n = await nextNumber();
      const id = demoId("entry", n, day);
      const amount = lines.reduce((sum, line) => sum + line.cents, 0);
      await db.query(
        `insert into "LedgerEntry" (id, "clubId", year, number, "accountId", "bookingDate", kind, "amountCents", description,
                                    "counterpartyName", "transferGroupId", "createdById")
         values ($1, $2, 2026, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, clubId, n, accountId[account], day, kind, amount, text, who, transferGroupId, treasurer],
      );
      for (const [i, line] of lines.entries()) {
        await db.query(
          `insert into "LedgerLine" (id, "clubId", "entryId", position, "amountCents", "categoryId", sphere, "categoryName",
                                     "departmentId", "bookingDate", "accountId", "invoiceId")
           values ($1, $2, $3, $4, $5, $6, 'NEUTRAL', '', $7, $8, $9, $10)`,
          [demoId("line", n * 10 + i, day), clubId, id, i + 1, line.cents, categoryId[line.cat], line.dept ? dept[line.dept] : null, day, accountId[account], line.invoiceId ?? null],
        );
      }
      created.push({ id, n, day, time, account, amount });
      return id;
    };
    const attach = async (entryId, day, time, { documentId = null, note = null }) => {
      await db.query(
        `insert into "LedgerAttachment" (id, "clubId", "entryId", "documentId", note, "attachedAt", "attachedById")
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [demoId("attachment", attachmentNo++, day), clubId, entryId, documentId, note, at(day, time), treasurer],
      );
    };
    for (const spec of ENTRIES) {
      if (spec.transfer) {
        const group = demoId("transfer", 0, spec.day);
        const { from, to, cents } = spec.transfer;
        await insertEntry({ ...spec, account: from, kind: "TRANSFER", lines: [{ cat: "Umbuchung", cents: -cents }], transferGroupId: group });
        await insertEntry({ ...spec, account: to, kind: "TRANSFER", lines: [{ cat: "Umbuchung", cents }], transferGroupId: group });
        continue;
      }
      const invoice = spec.invoice ? invoiceOf[spec.invoice] : null;
      const lines = spec.lines.map(([cat, cents, deptName]) => ({
        cat,
        cents: typeof cents === "string" ? amounts[cents] : cents,
        dept: deptName,
        invoiceId: invoice?.id,
      }));
      for (const line of lines) if (!categoryId[line.cat]) throw new Error(`Kategorie „${line.cat}“ fehlt in den Standard-Kategorien der App.`);
      const entryId = await insertEntry({ ...spec, lines });
      if (invoice) await attach(entryId, spec.day, spec.time, { documentId: invoice.documentId });
      if (spec.receipt) await attach(entryId, spec.day, spec.time, { documentId: receiptDocs[spec.receipt] });
      if (spec.note) await attach(entryId, spec.day, spec.time, { note: spec.note });
    }

    // --- Kassenstürze (gezählt = Stand laut Kassenbuch) ---
    for (const [i, count] of CASH_COUNTS.entries()) {
      const { rows: [{ book }] } = await db.query(
        `select coalesce(sum("amountCents"), 0)::int as book from "LedgerEntry" where "clubId" = $1 and "accountId" = $2 and "bookingDate" <= $3`,
        [clubId, accountId.cash, count.day],
      );
      await db.query(
        `insert into "CashCount" (id, "clubId", "accountId", "countedOn", "countedCents", "bookCents", "differenceCents", denominations, "countedById")
         values ($1, $2, $3, $4, $5, $5, 0, $6, $7)`,
        [demoId("cash-count", i, count.day), clubId, accountId.cash, count.day, book, count.notes ? JSON.stringify(count.notes) : null, treasurer],
      );
      count.book = book;
    }
    await db.query("commit"); // hier prüft die Datenbank Summen, Umbuchung und Barkasse (zurückgestellte Trigger)

    // --- Monatsabschlüsse (die Datenbank rechnet Kontostände und Prüfsumme, setzt „abgeschlossen bis“) ---
    await db.query("begin");
    for (const [i, close] of CLOSES.entries()) {
      await db.query(
        `insert into "FinancePeriodClose" (id, "clubId", "closedThrough", kind, balances, "entryCount", "contentHash", "closedById")
         values ($1, $2, $3, 'MONTH', '{}', 0, '', $4)`,
        [demoId("close", i, close.at[0]), clubId, close.through, treasurer],
      );
    }
    await db.query("commit");

    // --- Erfassungszeitpunkte auf den jeweiligen Tag (kosmetisch, nicht Teil der Prüfsummen) ---
    await db.query("begin");
    await db.query("set local session_replication_role = replica");
    for (const entry of created) {
      await db.query(`update "LedgerEntry" set "recordedAt" = $2 where id = $1`, [entry.id, at(entry.day, entry.time)]);
    }
    for (const [i, close] of CLOSES.entries()) {
      await db.query(`update "FinancePeriodClose" set "closedAt" = $2 where id = $1`, [demoId("close", i, close.at[0]), at(...close.at)]);
    }
    for (const [i, count] of CASH_COUNTS.entries()) {
      await db.query(`update "CashCount" set "countedAt" = $2 where id = $1`, [demoId("cash-count", i, count.day), at(count.day, count.time)]);
    }
    await db.query(`update "FinanceSettings" set "updatedAt" = $2 where "clubId" = $1`, [clubId, at(...CLOSES.at(-1).at)]);
    await db.query("commit");

    // --- Beitragslauf über die App ---
    let runLabel = null;
    if (withRun) runLabel = await runFeeRunInApp();

    // --- Zusammenfassung ---
    const { rows: balances } = await db.query(
      `select a.name, coalesce(sum(e."amountCents"), 0)::int as cents from "FinanceAccount" a
         left join "LedgerEntry" e on e."accountId" = a.id where a."clubId" = $1 group by a.name, a."sortOrder" order by a."sortOrder"`,
      [clubId],
    );
    const { rows: [year] } = await db.query(
      `select coalesce(sum(case when l."amountCents" > 0 then l."amountCents" end), 0)::int as income,
              coalesce(-sum(case when l."amountCents" < 0 then l."amountCents" end), 0)::int as expense
         from "LedgerLine" l where l."clubId" = $1 and l.sphere <> 'NEUTRAL'`,
      [clubId],
    );
    const { rows: [open] } = await db.query(
      `select count(*)::int as n, coalesce(sum(i."amountCents"), 0)::int as cents,
              count(*) filter (where i."dueDate" < $2)::int as overdue
         from "Invoice" i join "Document" d on d.id = i."documentId"
        where i."clubId" = $1 and i.status = 'OPEN' and d."deletedAt" is null and d."archivedAt" is null`,
      [clubId, today],
    );
    const { rows: [run] } = await db.query(
      `select count(*)::int as runs, coalesce(sum("chargeCount"), 0)::int as charges, coalesce(sum("totalCents"), 0)::int as cents,
              max(label) as label, to_char(max("dueDate"), 'YYYY-MM-DD') as due
         from "FeeRun" where "clubId" = $1 and status = 'CREATED'`,
      [clubId],
    );
    const withReceipt = ENTRIES.filter((e) => e.receipt || e.invoice).length;
    const withNote = ENTRIES.filter((e) => e.note).length;
    console.log(`Finanzen vorbereitet (Stand ${today}, Kassenbuch ab ${deDay(LEDGER_START)}):`);
    console.log(`  ${created.length} Buchungen (2026-0001 bis 2026-${String(created.at(-1).n).padStart(4, "0")}), davon ${withReceipt} mit Beleg-Datei, ${withNote} mit Eigenbeleg`);
    console.log(`  Kontostände: ${balances.map((b) => `${b.name} ${euro(b.cents)}`).join(", ")}`);
    console.log(`  2026 bisher: Einnahmen ${euro(year.income)}, Ausgaben ${euro(year.expense)}, Überschuss ${euro(year.income - year.expense)}`);
    console.log(`  Abgeschlossen bis ${deDay(CLOSES.at(-1).through)}; Kassenstürze: ${CASH_COUNTS.map((c) => `${deDay(c.day)} ${euro(c.book)}`).join(", ")}`);
    console.log(`  Offene Rechnungen: ${open.n} über ${euro(open.cents)}, davon ${open.overdue} überfällig; bezahlte Rechnungen gebucht: ${PAID_INVOICES.length + 1}`);
    console.log(`  Beitragsordnung: ${FEE_TYPES.map((t) => `${t.name} ${euro(t.cents)}`).join(", ")}, ${FAMILY_TYPE.name} ${euro(FAMILY_TYPE.cents)} (je Monat)`);
    console.log(
      withRun
        ? `  Beitragslauf ${run.label ?? "?"}: ${run.charges} Beiträge über ${euro(run.cents)}, fällig am ${run.due ? deDay(run.due) : "?"} (${runLabel})`
        : "  Beitragslauf: übersprungen (--ohne-lauf)",
    );
    if (today >= "2026-10-14") console.log("  Hinweis: Ab dem 14.10.2026 sind beide offenen Rechnungen des Seeds überfällig.");
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
