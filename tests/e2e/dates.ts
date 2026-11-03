/**
 * Kalendertage für die Tests – gerechnet wie die Anwendung: in Berliner Zeit und in ganzen Kalendertagen, nicht in
 * 24-Stunden-Schritten. Sonst verrutscht der Tag um die Zeitumstellung: 5 × 24 Stunden ab 22.10. 0:30 Uhr enden am 26.10. um
 * 23:30 Uhr – „fällig in 4 Tagen“ statt in 5.
 *
 * Die Demo-Daten (Seed) liegen relativ zu dem Tag, an dem das globale Setup sie eingespielt hat (`seedDay`). Geht ein Lauf über
 * Mitternacht, ist „heute“ danach einen Tag später: Die Demo-Rechnung, die beim Seed seit 3 Tagen überfällig war, ist es dann
 * seit 4 Tagen. Erwartete Texte wie „fällig in 5 Tagen“ deshalb erst bei der Prüfung aus dem Datum berechnen (`dueText`,
 * `dueBadge`, `inDaysText`), nie als feste Zahl.
 */

/** Heutiger Kalendertag in Berlin als „JJJJ-MM-TT“. */
export function berlinToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Der Kalendertag `days` Tage nach `day` (beide „JJJJ-MM-TT“, negativ = davor). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `days` Kalendertage ab heute (Berlin), negativ = vor heute. */
export function fromToday(days: number): string {
  return addDays(berlinToday(), days);
}

/**
 * `days` Kalendertage ab dem Tag des Seeds – dort liegen die Demo-Daten, z. B. `seedDay(5)` = Vorstandssitzung. Das globale
 * Setup setzt den Tag (E2E_SEED_DAY); erst in einem Test aufrufen, nicht beim Laden der Datei.
 */
export function seedDay(days = 0): string {
  const day = process.env.E2E_SEED_DAY;
  if (!day) throw new Error("E2E_SEED_DAY fehlt – das setzt das globale Setup (global-setup.ts).");
  return addDays(day, days);
}

/** Kalendertage von heute (Berlin) bis `day` – 0 = heute, negativ = vorbei. */
export function daysUntil(day: string): number {
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${berlinToday()}T00:00:00Z`)) / 86_400_000,
  );
}

/** „TT.MM.JJJJ“, z. B. für „Rechnung vom 03.11.2026“. */
export function germanDate(day: string): string {
  return day.split("-").reverse().join(".");
}

/** Fälligkeit wie auf dem Dashboard und unter Finanzen: „fällig in 14 Tagen“, „seit 3 Tagen überfällig“. */
export function dueText(due: string): string {
  const days = daysUntil(due);
  if (days === 0) return "heute fällig";
  if (days === 1) return "morgen fällig";
  if (days > 1) return `fällig in ${days} Tagen`;
  return days === -1 ? "seit gestern überfällig" : `seit ${-days} Tagen überfällig`;
}

/** Schild in der Dokumentenliste – „überfällig …“ vorn: „überfällig seit 3 Tagen“, „fällig in 10 Tagen“. */
export function dueBadge(due: string): string {
  const days = daysUntil(due);
  if (days < 0) return days === -1 ? "überfällig seit gestern" : `überfällig seit ${-days} Tagen`;
  return days === 0 ? "heute fällig" : days === 1 ? "morgen fällig" : `fällig in ${days} Tagen`;
}

/** „heute“, „morgen“, „in 4 Tagen“ – wie bei Terminen und Jubiläen. */
export function inDaysText(day: string): string {
  const days = daysUntil(day);
  return days === 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`;
}
