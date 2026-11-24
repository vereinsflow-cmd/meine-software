// Zu- und Absagen für EIN Training des Demo-Vereins – für das Handy-Bild „termin-detail“ des 60-s-Reels („Wer kommt am
// Donnerstag?“: Fußball-Training D-Jugend am Donnerstag, 3. Juni 2027, mit „x Zusagen“). Nur Datenbank `vf_website`.
//
//   node werkzeuge/termin-zusagen.mjs              anlegen (jeder Lauf ersetzt den vorigen Stand)
//   node werkzeuge/termin-zusagen.mjs --entfernen  wieder entfernen
//
// Voraussetzung: website/tools/demo-vorbereiten.mjs ist gelaufen (es legt die Trainingsreihe und die erfundenen
// Mitglieder an). Zusagen hängen an Termin und Mitglied mit „ON DELETE CASCADE“ – ein neuer Lauf von
// demo-vorbereiten.mjs nimmt sie also einfach mit; danach dieses Skript erneut ausführen.
//
// Antworten wie über „Zusagen“/„Absagen“ in der App (EventParticipant, Status ACCEPTED/DECLINED), von Kindern der
// Jugendabteilung mit Fußball im D-Jugend-Alter (Jahrgänge 2014–2016, wenn nötig weiter gefasst). Der Demo-Administrator
// antwortet NICHT – so zeigt „Deine Teilnahme“ die Knöpfe „Zusagen“ und „Absagen“. Geantwortet wurde seit der
// Veröffentlichung des Termins (gestern), abends und tagsüber, nie in der Zukunft.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATABASE_URL = process.env.VF_DATABASE_URL ?? "postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website";
const ALLOWED_DATABASE = "vf_website";
const DEMO_SLUG = "tsv-musterstadt";
const TRAINING_TITLE = "Fußball-Training D-Jugend";
const TRAINING_DAY = "2027-06-03";
const ACCEPTED = 9;
const DECLINED = 2;
const remove = process.argv.includes("--entfernen");

const require = createRequire(`${APP_DIR}/package.json`);
const { Client } = require("pg");
const databaseName = decodeURIComponent(new URL(DATABASE_URL).pathname.replace(/^\//, ""));
if (databaseName !== ALLOWED_DATABASE) {
  console.error(`Abbruch: Das Skript arbeitet nur mit der Datenbank „${ALLOWED_DATABASE}“, nicht mit „${databaseName || "?"}“.`);
  process.exit(1);
}

/** Feste IDs (UUIDv7-Form wie die App), über die der nächste Lauf alles wiederfindet. */
function demoId(n) {
  const hash = createHash("sha256").update(`vereinsflow-reel60-zusagen:${n}`).digest("hex");
  const ts = (Date.UTC(2026, 9, 6, 16) + n).toString(16).padStart(12, "0").slice(-12);
  const variant = ((Number.parseInt(hash[3], 16) & 0x3) | 0x8).toString(16);
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${hash.slice(0, 3)}-${variant}${hash.slice(4, 7)}-${hash.slice(7, 19)}`;
}
const ALL_IDS = Array.from({ length: 40 }, (_, n) => demoId(n));
/** Wie die App schreibt (siehe demo-vorbereiten.mjs, `stamp`): UTC-Uhrzeit ohne Zeitzone. */
const stamp = (instant) => instant.toISOString().replace("T", " ").replace("Z", "");
/** Zeitpunkt einer Berliner Uhrzeit an einem Kalendertag (wie demo-vorbereiten.mjs). */
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
const berlinDay = (deltaDays) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + deltaDays * 86_400_000));
/** Wann geantwortet wurde (Tage relativ zu heute, Berliner Uhrzeit) – abends nach Schule und Arbeit, nie nachts. */
const RESPONSES = [
  [-1, "17:12"], [-1, "17:48"], [-1, "18:20"], [-1, "18:57"], [-1, "19:34"], [-1, "20:06"], [-1, "20:41"],
  [0, "07:18"], [0, "12:35"], [-1, "21:15"], [0, "16:50"],
];

const db = new Client({ connectionString: DATABASE_URL });
await db.connect();
try {
  const { rows: [{ current }] } = await db.query("select current_database() as current");
  if (current !== ALLOWED_DATABASE) throw new Error(`Verbunden mit „${current}“ statt „${ALLOWED_DATABASE}“ – Abbruch.`);
  const { rows: [club] } = await db.query(`select id from "Club" where slug = $1`, [DEMO_SLUG]);
  if (!club) throw new Error(`Verein „${DEMO_SLUG}“ fehlt.`);
  await db.query("begin");
  const removed = await db.query(`delete from "EventParticipant" where id = any($1)`, [ALL_IDS]);
  if (remove) {
    await db.query("commit");
    console.log(`Entfernt: ${removed.rowCount} Zu-/Absagen.`);
  } else {
    // Termin: an diesem Tag (Berliner Zeit), nicht gelöscht
    const { rows: [event] } = await db.query(
      `select id from "Event"
        where "clubId" = $1 and title = $2 and "deletedAt" is null
          and to_char("startsAt" at time zone 'Europe/Berlin', 'YYYY-MM-DD') = $3`,
      [club.id, TRAINING_TITLE, TRAINING_DAY],
    );
    if (!event) throw new Error(`„${TRAINING_TITLE}“ am ${TRAINING_DAY} fehlt – zuerst website/tools/demo-vorbereiten.mjs ausführen.`);
    // Kinder der Jugendabteilung mit Fußball, D-Jugend-Alter zuerst
    const { rows: kids } = await db.query(
      `select m.id, extract(year from m."birthDate")::int as born from "Member" m
        where m."clubId" = $1 and m."deletedAt" is null and m."archivedAt" is null and m.status = 'ACTIVE' and m."userId" is null
          and m."birthDate" is not null and extract(year from m."birthDate") between 2012 and 2018
          and exists (select 1 from "MemberDepartment" d join "Department" dep on dep.id = d."departmentId"
                       where d."memberId" = m.id and dep.name = 'Jugendarbeit')
          and exists (select 1 from "MemberDepartment" d join "Department" dep on dep.id = d."departmentId"
                       where d."memberId" = m.id and dep.name = 'Fußball')
        order by abs(extract(year from m."birthDate")::int - 2015), m."lastName", m."firstName"`,
      [club.id],
    );
    const chosen = kids.slice(0, ACCEPTED + DECLINED);
    if (chosen.length < ACCEPTED + DECLINED) throw new Error(`Nur ${chosen.length} passende Kinder gefunden.`);
    // Antworten seit gestern Nachmittag (der Termin ist seit gestern Mittag veröffentlicht), spätestens jetzt
    for (const [i, kid] of chosen.entries()) {
      const [days, time] = RESPONSES[i % RESPONSES.length];
      const at = stamp(new Date(Math.min(berlinInstant(berlinDay(days), time).getTime(), Date.now() - 5 * 60_000 - i * 60_000)));
      await db.query(
        `insert into "EventParticipant" (id, "clubId", "eventId", "memberId", status, "respondedAt", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $6, $6)`,
        [demoId(i), club.id, event.id, kid.id, i < ACCEPTED ? "ACCEPTED" : "DECLINED", at],
      );
    }
    await db.query("commit");
    console.log(`${TRAINING_TITLE} am ${TRAINING_DAY}: ${ACCEPTED} Zusagen, ${DECLINED} Absagen (Jahrgänge ${[...new Set(chosen.map((k) => k.born))].sort().join(", ")}).`);
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  console.error(error.message ?? error);
  process.exitCode = 1;
} finally {
  await db.end();
}
