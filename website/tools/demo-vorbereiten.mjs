// Bereitet den Demo-Verein „TSV Musterstadt“ für die Bildaufnahmen der Website vor (vor tools/capture-screenshots.mjs).
//
//   node tools/demo-vorbereiten.mjs              Demo auffüllen (beliebig oft – jeder Lauf ergibt denselben Stand)
//   node tools/demo-vorbereiten.mjs --entfernen  alles wieder entfernen, was dieses Skript angelegt hat
//
// Was es tut (nur in der Aufnahme-Datenbank `vf_website`, siehe README „Hinweise zu den Aufnahmen“):
// - Dashboard des Demo-Administrators: Die Karten „Erste Schritte“ (Einrichtungs-Checkliste) und „Offene Zahlungen“
//   (Finanzen gibt es auf der Website noch nicht, siehe FAQ) werden ausgeblendet – wie über „Anpassen“ in der Anwendung
//   (ClubMembership.dashboardLayout). Danach beginnt die Übersicht mit den Kennzahlen.
// - Mitglieder: rund 210 weitere, erfundene Mitglieder mit leichtem Wachstum über die letzten zwölf Monate (einige
//   Eintritte je Monat, wenige Austritte zum Monatsende), verteilt auf die vier Abteilungen des Seeds.
// - Kalender: Trainings (Tischtennis, Jugend, Handball) und einzelne Termine rund um das Sommerfest des Seeds, damit
//   Monats- und Wochenansicht gefüllt sind.
// - Helferstunden: abgeschlossene Einsätze der letzten Wochen mit eingetragenen Stunden (Verlauf der Kennzahl).
//
// Alle Namen sind erfunden (übliche Vor- und Nachnamen, zufällig kombiniert; Anschriften in „Musterstadt“, E-Mail-Adressen
// unter example.org) – das Repository und die Website sind öffentlich. Vermieden werden Namen mit „hel“ und „Koch“: Die
// Bildfolgen suchen nach „Hel“ und filtern nach „Koch“, die Trefferlisten sollen kurz bleiben.
//
// Daten, die von der Zeit abhängen (Eintritte, Helferstunden), rechnet das Skript vom heutigen Tag aus, die Termine vom
// Datum des Sommerfests im Seed. Deshalb kurz vor den Aufnahmen laufen lassen. Jeder Lauf löscht zuerst, was frühere Läufe
// angelegt haben (feste IDs), und legt es neu an; an den Daten des Seeds ändert sich nichts außer der Dashboard-Einstellung.
//
// Umgebungsvariablen (optional):
//   VF_APP_DIR        Ordner mit node_modules (pg)               (Standard: der übergeordnete Ordner = Repository-Hauptordner)
//   VF_DATABASE_URL   Verbindung zur Aufnahme-Datenbank         (postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website)
//   VF_DEMO_EMAIL     Demo-Administrator, dessen Dashboard eingestellt wird  (admin@demo-verein.local)
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(root, "..");
const DATABASE_URL = process.env.VF_DATABASE_URL ?? "postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website";
const EMAIL = process.env.VF_DEMO_EMAIL ?? "admin@demo-verein.local";
/** Einzige Datenbank, die das Skript anfasst: die eigene Aufnahme-Datenbank mit Seed-Daten (nie die Entwicklungsdatenbank). */
const ALLOWED_DATABASE = "vf_website";
const DEMO_SLUG = "tsv-musterstadt";
const remove = process.argv.includes("--entfernen");

const require = createRequire(path.join(APP_DIR, "package.json"));
const { Client } = require("pg");

const databaseName = decodeURIComponent(new URL(DATABASE_URL).pathname.replace(/^\//, ""));
if (databaseName !== ALLOWED_DATABASE) {
  console.error(`Abbruch: Das Skript arbeitet nur mit der Datenbank „${ALLOWED_DATABASE}“, nicht mit „${databaseName || "?"}“.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------------
// Hilfen: Zufall, IDs, Kalendertage, Zeitpunkte
// ---------------------------------------------------------------------------------------------------------------------

/** Kleiner, deterministischer Zufallsgenerator (wie im Seed) – jeder Lauf erzeugt dieselben Personen. */
function rng(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const random = rng(1898);
const pick = (items) => items[Math.floor(random() * items.length)];
const between = (min, max) => Math.floor(random() * (max - min + 1)) + min;

/**
 * Feste ID je Eintrag (Art + laufende Nummer), aufgebaut wie die UUIDv7 der Anwendung (vorn ein Zeitstempel, hier der
 * Anlagezeitpunkt des Vereins plus Nummer, damit die Reihenfolge stabil bleibt). Über dieselben IDs findet der nächste
 * Lauf alles wieder, was dieser angelegt hat.
 */
const LIMITS = { member: 600, event: 200, shift: 100, assignment: 400, series: 10 };
let baseMs = 0;
function demoId(kind, n) {
  const hash = createHash("sha256").update(`vereinsflow-website-demo:${kind}:${n}`).digest("hex");
  const ts = (baseMs + Object.keys(LIMITS).indexOf(kind) * 10_000 + n).toString(16).padStart(12, "0").slice(-12);
  const variant = ((Number.parseInt(hash[3], 16) & 0x3) | 0x8).toString(16);
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${hash.slice(0, 3)}-${variant}${hash.slice(4, 7)}-${hash.slice(7, 19)}`;
}
const allIds = (kind) => Array.from({ length: LIMITS[kind] }, (_, n) => demoId(kind, n));

/** Kalendertage als „JJJJ-MM-TT“ (wie @db.Date), gerechnet in UTC ohne Zeitverschiebung. */
const toDay = (date) => date.toISOString().slice(0, 10);
const parseDay = (day) => new Date(`${day}T00:00:00Z`);
const addDays = (day, n) => toDay(new Date(parseDay(day).getTime() + n * 86_400_000));
/** Wochentag, Montag = 0 */
const weekday = (day) => (parseDay(day).getUTCDay() + 6) % 7;
const monthStart = (day, deltaMonths) => {
  const d = parseDay(day);
  return toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deltaMonths, 1)));
};
const monthEnd = (day, deltaMonths) => addDays(monthStart(day, deltaMonths + 1), -1);
const berlinToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());

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

/**
 * Zeitpunkte so schreiben, wie die Anwendung (Prisma mit dem pg-Adapter) es tut: die UTC-Uhrzeit ohne Zeitzonenangabe,
 * die Datenbank deutet sie in der Zeitzone ihrer Sitzung. Nur so zeigt die Anwendung dieselbe Uhrzeit, die hier steht
 * (Beispiel im Seed: „Arbeitseinsatz 09:00“ steht als 07:00 in der Datenbank).
 */
const stamp = (instant) => instant.toISOString().replace("T", " ").replace("Z", "");
const at = (day, time) => stamp(berlinInstant(day, time));

// ---------------------------------------------------------------------------------------------------------------------
// Erfundene Namen (keine mit „hel“ oder „koch“, siehe oben)
// ---------------------------------------------------------------------------------------------------------------------

const ADULT_MALE = ["Andreas", "Thomas", "Stefan", "Frank", "Jürgen", "Peter", "Martin", "Klaus", "Uwe", "Markus", "Christian", "Ralf", "Dirk", "Jörg", "Sven", "Tobias", "Daniel", "Sebastian", "Florian", "Matthias", "Holger", "Wolfgang", "Dieter", "Rainer", "Carsten", "Oliver", "Alexander", "Patrick", "Marco", "Kai"];
const ADULT_FEMALE = ["Karin", "Petra", "Andrea", "Monika", "Susanne", "Birgit", "Ute", "Heike", "Gabriele", "Martina", "Nicole", "Stefanie", "Julia", "Katrin", "Anja", "Silke", "Kerstin", "Melanie", "Sandra", "Christina", "Tanja", "Simone", "Sarah", "Lisa", "Johanna", "Doris", "Renate", "Ulrike", "Bettina", "Miriam"];
const YOUTH_MALE = ["Finn", "Luca", "Maximilian", "Niklas", "Moritz", "David", "Emil", "Anton", "Julian", "Mats", "Jakob", "Henry", "Theo", "Oskar", "Matteo", "Linus", "Karl", "Fynn", "Leo", "Milan"];
const YOUTH_FEMALE = ["Lea", "Lina", "Emilia", "Ella", "Leonie", "Amelie", "Charlotte", "Paula", "Nele", "Ida", "Frieda", "Greta", "Mila", "Luisa", "Romy", "Ronja", "Pia", "Zoe", "Merle", "Thea"];
const LAST_NAMES = ["Müller", "Schmidt", "Fischer", "Weber", "Meyer", "Schulz", "Bauer", "Richter", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Schmitz", "Krause", "Lehmann", "Schulze", "Maier", "Köhler", "Herrmann", "König", "Walter", "Mayer", "Huber", "Kaiser", "Fuchs", "Peters", "Lang", "Scholz", "Möller", "Weiß", "Jung", "Hahn", "Schubert", "Vogel", "Friedrich", "Keller", "Günther", "Frank", "Berger", "Winkler", "Roth", "Beck", "Lorenz", "Baumann", "Franke", "Albrecht", "Schuster", "Simon", "Ludwig", "Böhm", "Winter", "Kraus", "Schumacher", "Krämer", "Stein", "Jäger", "Otto", "Sommer", "Groß", "Seidel", "Haas", "Schreiber", "Graf", "Dietrich", "Ziegler", "Kuhn", "Pohl", "Engel", "Horn", "Busch", "Bergmann", "Voigt", "Sauer", "Arnold", "Pfeiffer", "Brinkmann", "Ernst", "Kühn", "Lindner", "Thiel", "Kramer", "Martens", "Petersen", "Behrens", "Kemper", "Wiegand", "Hesse", "Wendt"];
const STREETS = ["Beispielweg", "Musterstraße", "Am Sportplatz", "Vereinsweg", "Lindenallee", "Gartenstraße"];
/** Funktionen im Verein (männliche und weibliche Form; Vorsitz und Kasse besetzen die Seed-Konten) */
const FUNCTIONS = [["Schriftführer", "Schriftführerin"], ["Jugendwart", "Jugendwartin"], ["Trainer Herren", "Trainerin Damen"], ["Übungsleiter Handball", "Übungsleiterin Handball"], ["Platzwart", "Platzwartin"], ["Trainer D-Jugend", "Trainerin D-Jugend"], ["Abteilungsleiter Tischtennis", "Abteilungsleiterin Tischtennis"]];
const mailPart = (text) =>
  text.toLowerCase().replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss").replace(/[^a-z]/g, "");

/** Mitglieder seit Beginn dieses Monats (k = 0) bzw. vor k Monaten: Eintritte je Monat und Austritte zum Monatsende. */
const JOINS_BY_MONTHS_AGO = { 12: 2, 11: 1, 10: 0, 9: 4, 8: 2, 7: 3, 6: 2, 5: 3, 4: 1, 3: 1, 2: 3, 1: 4, 0: 2 };
const LEAVES_BY_MONTHS_AGO = { 10: 2, 7: 1, 4: 1, 2: 1 };
/** Mitglieder, die schon vor dem betrachteten Jahr eingetreten sind – zusammen mit den 24 des Seeds rund 210. */
const BASE_MEMBERS = 186;

function buildMembers(today, seedNames) {
  const taken = new Set(seedNames);
  const families = new Map(); // höchstens drei Personen je Nachname, sonst stehen in der Liste lange Reihen gleicher Namen
  const currentYear = Number(today.slice(0, 4));
  const yearAgo = monthStart(today, -12);
  const person = (youth) => {
    for (;;) {
      const female = random() < 0.48;
      const first = pick(youth ? (female ? YOUTH_FEMALE : YOUTH_MALE) : female ? ADULT_FEMALE : ADULT_MALE);
      const last = pick(LAST_NAMES);
      if (taken.has(`${first} ${last}`) || (families.get(last) ?? 0) >= 3) continue;
      taken.add(`${first} ${last}`);
      families.set(last, (families.get(last) ?? 0) + 1);
      return { first, last, female };
    }
  };
  const birth = (youth) => {
    const year = youth ? between(currentYear - 17, currentYear - 7) : between(currentYear - 74, currentYear - 19);
    return `${year}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`;
  };
  const departments = (youth) => {
    if (youth) return ["jugend", random() < 0.6 ? "fussball" : random() < 0.6 ? "handball" : "tischtennis"];
    const r = random();
    return r < 0.4 ? ["fussball"] : r < 0.65 ? ["handball"] : r < 0.85 ? ["tischtennis"] : [];
  };
  const members = [];
  /** `joined`: Eintrittstag – oder eine Funktion, die ihn aus dem Geburtstag bestimmt */
  const make = (joined, youth) => {
    const { first, last, female } = person(youth);
    const birthDate = birth(youth);
    const member = {
      first,
      last,
      female,
      birthDate,
      joinedAt: typeof joined === "function" ? joined(birthDate) : joined,
      youth,
      status: "ACTIVE",
      leftAt: null,
      departments: departments(youth),
      email: !youth || random() < 0.4 ? `${mailPart(first)}.${mailPart(last)}@example.org` : null,
      street: `${pick(STREETS)} ${between(1, 80)}`,
      clubFunction: null,
    };
    members.push(member);
    return member;
  };
  // Bestand vor dem betrachteten Jahr: Eintritte seit 1975 (frühestens mit sechs Jahren), spätere häufiger
  const latest = parseDay(addDays(yearAgo, -1)).getTime();
  const joinedBefore = (birthDate) => {
    const earliest = Math.max(parseDay("1975-01-01").getTime(), parseDay(addDays(birthDate, 365 * 6 + 2)).getTime());
    return earliest >= latest ? toDay(new Date(latest)) : toDay(new Date(earliest + (latest - earliest) * random() ** 0.55));
  };
  for (let i = 0; i < BASE_MEMBERS; i++) {
    const youth = random() < 0.22;
    const member = make(joinedBefore, youth);
    const age = currentYear - Number(member.birthDate.slice(0, 4));
    const r = random();
    if (!youth && age > 60 && member.joinedAt < "1995-01-01" && r < 0.3) member.status = "HONORARY";
    else if (r < 0.13) member.status = "PASSIVE";
  }
  // Funktionen im Verein für einige Erwachsene des Bestands
  const adults = members.filter((member) => !member.youth && member.status === "ACTIVE");
  FUNCTIONS.forEach(([male, female], i) => (adults[i * 7].clubFunction = adults[i * 7].female ? female : male));
  // Austritte zum Monatsende (aus dem Bestand, nie jemand mit Funktion)
  let candidate = adults.length - 1;
  for (const [monthsAgo, count] of Object.entries(LEAVES_BY_MONTHS_AGO)) {
    for (let i = 0; i < count; i++) {
      const member = adults[candidate--];
      member.status = "LEFT";
      member.leftAt = monthEnd(today, -Number(monthsAgo));
    }
  }
  // Eintritte im betrachteten Jahr: viele Kinder und Jugendliche, im laufenden Monat am Ersten
  for (const [monthsAgo, count] of Object.entries(JOINS_BY_MONTHS_AGO)) {
    for (let i = 0; i < count; i++) {
      const k = Number(monthsAgo);
      const day = k === 0 ? monthStart(today, 0) : addDays(monthStart(today, -k), between(0, 27));
      make(day > today ? today : day, random() < 0.5);
    }
  }
  members.sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : 0));
  return members;
}

// ---------------------------------------------------------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Termine rund um das Sommerfest (Samstag `fest`): drei Trainingsreihen, einige einzelne Termine und abgeschlossene
 * Einsätze mit Helferstunden (vom heutigen Tag aus).
 */
function buildEvents(fest, today) {
  const week = addDays(fest, -5); // Montag der Sommerfest-Woche
  const events = [];
  const series = (key, title, dept, weekdayIndex, from, to, location) => {
    for (let w = -1; w <= 4; w++) {
      const day = addDays(week, w * 7 + weekdayIndex);
      events.push({ key, title, type: "TRAINING", dept, day, from, to, location, status: "PUBLISHED" });
    }
  };
  series("tischtennis", "Tischtennis-Training", "tischtennis", 2, "19:00", "21:00", "Turnhalle am Markt");
  series("jugend", "Fußball-Training D-Jugend", "jugend", 3, "17:00", "18:30", "Sportplatz");
  series("handball", "Handball-Training Damen", "handball", 4, "19:00", "20:30", "Sporthalle Nord");
  const single = (title, type, dept, day, from, to, location) =>
    events.push({ title, type, dept, day, from, to, location, status: "PUBLISHED" });
  single("Sitzung der Abteilungsleitungen", "MEETING", null, addDays(week, -4), "19:00", "20:30", "Vereinsheim, Besprechungsraum");
  single("Elternabend der Jugendabteilung", "MEETING", "jugend", addDays(week, 8), "19:30", "21:00", "Vereinsheim");
  single("Heimspiel Handball Herren", "COMPETITION", "handball", addDays(week, 12), "18:00", "19:30", "Sporthalle Nord");
  single("Nachbesprechung Sommerfest", "MEETING", null, addDays(week, 16), "19:30", "21:00", "Vereinsheim");
  single("Tischtennis-Vereinsmeisterschaft", "COMPETITION", "tischtennis", addDays(week, 20), "10:00", "16:00", "Turnhalle am Markt");
  single("Halloween-Party im Jugendtreff", "EVENT", "jugend", addDays(week, 26), "16:00", "19:00", "Vereinsheim, Jugendraum");
  single("Herbstwanderung", "EVENT", null, addDays(week, 34), "10:00", "15:00", "Treffpunkt Vereinsheim");

  // Abgeschlossene Einsätze mit Helferstunden (Kennzahl „Helferstunden“ und ihr Verlauf über zwölf Wochen)
  const monday = addDays(today, -weekday(today));
  const past = (title, type, dept, day, from, to, location, shifts) =>
    events.push({ title, type, dept, day, from, to, location, status: "COMPLETED", shifts });
  past("Sommercamp der Jugend", "EVENT", "jugend", addDays(monday, -65), "10:00", "17:00", "Sportplatz", [
    { title: "Betreuung", from: "10:00", to: "16:00", required: 6, helpers: 6, minutes: 360 },
  ]);
  past("Stadtfest: Infostand des Vereins", "EVENT", null, addDays(monday, -44), "10:00", "18:00", "Marktplatz", [
    { title: "Standdienst Vormittag", from: "10:00", to: "14:00", required: 4, helpers: 4, minutes: 240 },
    { title: "Standdienst Nachmittag", from: "14:00", to: "18:00", required: 4, helpers: 4, minutes: 240 },
  ]);
  past("Arbeitseinsatz Sportplatz", "WORK_ASSIGNMENT", null, addDays(monday, -16), "09:00", "12:00", "Sportplatz", [
    { title: "Platzpflege", from: "09:00", to: "12:00", required: 8, helpers: 6, minutes: 180 },
  ]);
  past("Heimspieltag Handball", "COMPETITION", "handball", addDays(monday, -1), "11:00", "18:00", "Sporthalle Nord", [
    { title: "Kiosk", from: "11:00", to: "16:00", required: 3, helpers: 3, minutes: 300 },
  ]);
  // In der laufenden Woche (nur wenn sie schon begonnen hat – sonst stünden Stunden in der Zukunft)
  if (weekday(today) > 0) {
    past("Herbstputz im Vereinsheim", "WORK_ASSIGNMENT", null, monday, "17:00", "20:00", "Vereinsheim", [
      { title: "Reinigung", from: "17:00", to: "20:00", required: 6, helpers: 6, minutes: 180 },
    ]);
  }
  return events;
}

// ---------------------------------------------------------------------------------------------------------------------
// Datenbank
// ---------------------------------------------------------------------------------------------------------------------

const HIDDEN_CARDS = ["erste-schritte", "zahlungen"];

async function main() {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const { rows: [{ current }] } = await db.query("select current_database() as current");
    if (current !== ALLOWED_DATABASE) throw new Error(`Verbunden mit „${current}“ statt „${ALLOWED_DATABASE}“ – Abbruch.`);

    const { rows: clubs } = await db.query(`select id, "createdAt" from "Club" where slug = $1`, [DEMO_SLUG]);
    if (!clubs.length) throw new Error(`Verein „${DEMO_SLUG}“ fehlt – zuerst den Seed einspielen (siehe README).`);
    const club = clubs[0];
    baseMs = club.createdAt.getTime();
    const { rows: [admin] } = await db.query(
      `select m.id as "membershipId", u.id as "userId", m."dashboardLayout" as layout
         from "ClubMembership" m join "User" u on u.id = m."userId"
        where m."clubId" = $1 and u.email = $2`,
      [club.id, EMAIL],
    );
    if (!admin) throw new Error(`Benutzer ${EMAIL} ist nicht Mitglied im Demo-Verein.`);

    await db.query("begin");
    // Was frühere Läufe angelegt haben, zuerst entfernen (Schichten und Eintragungen hängen an den Terminen bzw.
    // Mitgliedern und gehen mit)
    const removedAssignments = await db.query(`delete from "ShiftAssignment" where id = any($1)`, [allIds("assignment")]);
    const removedEvents = await db.query(`delete from "Event" where id = any($1)`, [allIds("event")]);
    const removedMembers = await db.query(`delete from "Member" where id = any($1)`, [allIds("member")]);

    // Dashboard: Karten wie über „Anpassen“ ausblenden (übrige Einstellungen bleiben)
    const layout = admin.layout?.v === 1 ? structuredClone(admin.layout) : { v: 1, tabs: {} };
    const overview = layout.tabs.uebersicht ?? { order: [], hidden: [] };
    overview.hidden = remove
      ? overview.hidden.filter((id) => !HIDDEN_CARDS.includes(id))
      : [...new Set([...overview.hidden, ...HIDDEN_CARDS])];
    layout.tabs.uebersicht = overview;
    const empty = Object.values(layout.tabs).every((tab) => !tab.order.length && !tab.hidden.length);
    await db.query(`update "ClubMembership" set "dashboardLayout" = $2, "updatedAt" = $3 where id = $1`, [
      admin.membershipId,
      empty ? null : JSON.stringify(layout),
      stamp(new Date()),
    ]);

    if (remove) {
      await db.query("commit");
      console.log(
        `Entfernt: ${removedMembers.rowCount} Mitglieder, ${removedEvents.rowCount} Termine (mit Schichten), ` +
          `${removedAssignments.rowCount} Eintragungen; Dashboard-Karten wieder sichtbar.`,
      );
      return;
    }

    const today = berlinToday();
    const { rows: departmentRows } = await db.query(`select id, name from "Department" where "clubId" = $1`, [club.id]);
    const dept = Object.fromEntries(
      departmentRows.map((row) => [
        { Fußball: "fussball", Handball: "handball", Tischtennis: "tischtennis", Jugendarbeit: "jugend" }[row.name],
        row.id,
      ]),
    );
    for (const key of ["fussball", "handball", "tischtennis", "jugend"]) {
      if (!dept[key]) throw new Error(`Abteilung „${key}“ fehlt im Seed.`);
    }
    const { rows: seedMembers } = await db.query(
      `select "firstName" || ' ' || "lastName" as name from "Member" where "clubId" = $1`,
      [club.id],
    );

    // --- Mitglieder ---
    const members = buildMembers(today, seedMembers.map((row) => row.name));
    if (members.length > LIMITS.member) throw new Error("Zu viele Mitglieder für die festen IDs.");
    const clubCreated = stamp(club.createdAt);
    for (const [n, member] of members.entries()) {
      member.id = demoId("member", n);
      const created = member.joinedAt >= monthStart(today, -12) ? at(member.joinedAt, "18:00") : clubCreated;
      const archived = member.leftAt ? at(addDays(member.leftAt, 14), "10:00") : null;
      await db.query(
        `insert into "Member" (id, "clubId", "memberNumber", "firstName", "lastName", email, street, "postalCode", city,
                               "birthDate", "joinedAt", "leftAt", status, "clubFunction", "archivedAt", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, '12345', 'Musterstadt', $8, $9, $10, $11, $12, $13, $14, $14)`,
        [
          member.id, club.id, `M-${String(101 + n).padStart(4, "0")}`, member.first, member.last, member.email,
          member.street, member.birthDate, member.joinedAt, member.leftAt, member.status, member.clubFunction,
          archived, created,
        ],
      );
      for (const key of member.departments) {
        await db.query(
          `insert into "MemberDepartment" ("clubId", "memberId", "departmentId", since) values ($1, $2, $3, $4)`,
          [club.id, member.id, dept[key], member.joinedAt],
        );
      }
    }

    // --- Termine, Schichten, Helferstunden ---
    const { rows: festRows } = await db.query(
      `select to_char("startsAt", 'YYYY-MM-DD') as day from "Event"
        where "clubId" = $1 and title like 'Sommerfest%' and "deletedAt" is null order by "startsAt" limit 1`,
      [club.id],
    );
    // Ohne Sommerfest im Seed: der übernächste Samstag (so legt ihn der Seed an)
    const fest = festRows[0]?.day ?? addDays(today, ((5 - weekday(today) + 7) % 7 || 7) + 7);
    const events = buildEvents(fest, today);
    if (events.length > LIMITS.event) throw new Error("Zu viele Termine für die festen IDs.");
    const seriesIds = {};
    const helpers = members.filter((member) => !member.youth && member.status === "ACTIVE" && !member.leftAt);
    let nextHelper = 0;
    let shiftNo = 0;
    let assignmentNo = 0;
    for (const [n, event] of events.entries()) {
      const id = demoId("event", n);
      if (event.key) seriesIds[event.key] ??= demoId("series", Object.keys(seriesIds).length);
      const published = at(addDays(event.day, -21), "12:00");
      await db.query(
        `insert into "Event" (id, "clubId", "seriesId", title, type, status, "startsAt", "endsAt", "locationName",
                              "departmentId", "publishedAt", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)`,
        [
          id, club.id, event.key ? seriesIds[event.key] : null, event.title, event.type, event.status,
          at(event.day, event.from), at(event.day, event.to), event.location, event.dept ? dept[event.dept] : null, published,
        ],
      );
      for (const shift of event.shifts ?? []) {
        const shiftId = demoId("shift", shiftNo++);
        await db.query(
          `insert into "EventShift" (id, "clubId", "eventId", title, "startsAt", "endsAt", "requiredCount", status,
                                     "createdAt", "updatedAt")
           values ($1, $2, $3, $4, $5, $6, $7, 'CLOSED', $8, $8)`,
          [shiftId, club.id, id, shift.title, at(event.day, shift.from), at(event.day, shift.to), shift.required, published],
        );
        for (let h = 0; h < shift.helpers; h++) {
          const helper = helpers[nextHelper++ % helpers.length];
          await db.query(
            `insert into "ShiftAssignment" (id, "clubId", "shiftId", "memberId", "assignedAt", "workedMinutes",
                                            "hoursApprovedAt", "hoursApprovedById", "createdAt", "updatedAt")
             values ($1, $2, $3, $4, $5, $6, $7, $8, $5, $7)`,
            [
              demoId("assignment", assignmentNo++), club.id, shiftId, helper.id, at(addDays(event.day, -10), "20:00"),
              shift.minutes, at(addDays(event.day, 1), "10:00"), admin.userId,
            ],
          );
        }
      }
    }
    await db.query("commit");

    // Zusammenfassung: Bestand am Ende der letzten zwölf Monate (wie die Auswertungen der Anwendung)
    const { rows: all } = await db.query(
      `select to_char("joinedAt", 'YYYY-MM-DD') as joined, to_char("leftAt", 'YYYY-MM-DD') as left,
              "archivedAt" is not null as archived
         from "Member" where "clubId" = $1 and "deletedAt" is null`,
      [club.id],
    );
    const trend = [];
    for (let k = 11; k >= 0; k--) {
      const end = k === 0 ? today : monthEnd(today, -k);
      trend.push(all.filter((row) => row.joined && row.joined <= end && (!row.left || row.left > end)).length);
    }
    console.log(`Vorbereitet (Stand ${today}, Sommerfest am ${fest}):`);
    console.log(`  ${members.length} Mitglieder angelegt, ${all.filter((row) => !row.archived).length} im Verein (ohne Archiv)`);
    console.log(`  Bestand der letzten zwölf Monate: ${trend.join(" → ")}`);
    console.log(`  ${events.length} Termine, ${shiftNo} Schichten, ${assignmentNo} Eintragungen mit Helferstunden`);
    console.log(`  Dashboard von ${EMAIL}: ausgeblendet ${HIDDEN_CARDS.join(", ")}`);
    if (weekday(today) === 0) console.log("  Hinweis: Montag – in der laufenden Woche stehen noch keine Helferstunden.");
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
