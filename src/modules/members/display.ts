import { ageOn, MONTH_NAMES, todayCalendarDate } from "@/lib/dates";

/**
 * Anzeige-Hilfen der Mitgliederliste (Liste mit Detailbereich, seit 20.10.2026): reine Rechnungen ohne Datenbank, im Browser
 * wie auf dem Server nutzbar. Abteilungsfarben sind Datenfarben (wie in einer Legende, vgl. calendar-views.tsx) – sie färben
 * nur Flächen, nie Text: Die Schrift bleibt in Vordergrundfarbe, der Kontrast hängt so nicht von der gewählten Farbe ab.
 */

/** Gültige Abteilungsfarbe (#rrggbb) oder `null` – alles andere (leer, Tippfehler, CSS-Ausdrücke) fällt weg. */
export function safeColor(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

/** Fläche in der Abteilungsfarbe, auf die Kartenfarbe gemischt (hell wie dunkel mit Vordergrundschrift lesbar). */
export function tint(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${percent}%, var(--card))`;
}

/** Erstes Schriftzeichen (ganz, auch aus mehreren Codepunkten wie „𠮷“ oder „é“ als e + Akzent). */
function firstCharacter(text: string): string {
  const [first] = new Intl.Segmenter("de", { granularity: "grapheme" }).segment(text.trim());
  return first?.segment ?? "";
}

/** „EB“ für Elias Becker; ohne Namen „?“. */
export function initials(firstName: string, lastName: string): string {
  return `${firstCharacter(firstName)}${firstCharacter(lastName)}`.toUpperCase() || "?";
}

/**
 * Teilt das letzte Schriftzeichen ab („Becker“ → „Becke“ + „r“), etwa um ein Symbol untrennbar dahinter zu setzen: Vor einem
 * Symbol darf der Browser sonst immer umbrechen – es stünde dann allein in der nächsten Zeile. Umlaute und Zeichen aus
 * mehreren Codepunkten bleiben ganz.
 */
export function splitLastCharacter(text: string): { head: string; tail: string } {
  const characters = [...new Intl.Segmenter("de", { granularity: "grapheme" }).segment(text)];
  const tail = characters.at(-1)?.segment ?? "";
  return { head: text.slice(0, text.length - tail.length), tail };
}

/** Buchstaben ohne Zerlegung in Grundbuchstabe + Akzent (NFD lässt sie ganz): so, wie die Datenbank sie einsortiert. */
const BASE_LETTER: Record<string, string> = {
  Ł: "L",
  Ø: "O",
  Đ: "D",
  Æ: "A",
  Œ: "O",
  Þ: "T",
  ẞ: "S",
};

/** Anfangsbuchstabe für die Trenner der alphabetischen Liste (Ä → A, Ł → L, Ziffern und Sonstiges → #). */
export function letterOf(lastName: string): string {
  const first = lastName.trim().normalize("NFD").replace(/\p{M}/gu, "").charAt(0).toUpperCase();
  const letter = BASE_LETTER[first] ?? first;
  return /^[A-Z]$/.test(letter) ? letter : "#";
}

/** Teilt eine nach Nachnamen sortierte Liste in Abschnitte je Anfangsbuchstabe (Reihenfolge bleibt, auch absteigend). */
export function groupByLetter<T extends { lastName: string }>(
  items: readonly T[],
): { letter: string; items: T[] }[] {
  const groups: { letter: string; items: T[] }[] = [];
  for (const item of items) {
    const letter = letterOf(item.lastName);
    const last = groups.at(-1);
    if (last?.letter === letter) last.items.push(item);
    else groups.push({ letter, items: [item] });
  }
  return groups;
}

/** Volle Monate zwischen zwei Kalendertagen (`to` nicht vor `from`). */
function fullMonths(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

/**
 * Dauer der Mitgliedschaft in Kalendertagen. Laufend: „seit 14 Jahren“ / „seit 5 Monaten“. Nach dem Austritt (`leftAt` heute
 * oder früher) bis zum Austrittstag: „3 Jahre Mitglied“ – ein „seit …“ stünde sonst direkt über dem Austrittsdatum.
 * `ended` (ausgetreten oder archiviert) ohne vergangenes Austrittsdatum: Das Ende ist unbekannt – dann keine Angabe statt
 * einer, die bis heute weiterzählt. Ein Austritt vor dem Eintritt (Tippfehler) ergibt ebenfalls keine Angabe.
 */
export function membershipDuration(
  joinedAt: Date | null,
  {
    leftAt = null,
    ended = false,
    today = todayCalendarDate(),
  }: { leftAt?: Date | null; ended?: boolean; today?: Date } = {},
): string | null {
  if (!joinedAt) return null;
  if (leftAt && leftAt.getTime() <= today.getTime()) {
    if (leftAt.getTime() < joinedAt.getTime()) return null;
    const years = ageOn(joinedAt, leftAt);
    if (years >= 1) return `${years} ${years === 1 ? "Jahr" : "Jahre"} Mitglied`;
    const months = fullMonths(joinedAt, leftAt);
    if (months >= 1) return `${months} ${months === 1 ? "Monat" : "Monate"} Mitglied`;
    return "weniger als einen Monat Mitglied";
  }
  if (ended) return null;
  if (joinedAt.getTime() > today.getTime()) return "Eintritt steht noch bevor";
  const years = ageOn(joinedAt, today);
  if (years >= 1) return `seit ${years} ${years === 1 ? "Jahr" : "Jahren"}`;
  const months = fullMonths(joinedAt, today);
  if (months <= 0) return "seit diesem Monat";
  return `seit ${months} ${months === 1 ? "Monat" : "Monaten"}`;
}

/** „12. März 1985 · 41 Jahre“ (Geburtstag mit Alter – nur zeigen, wer die sensiblen Angaben sehen darf). */
export function birthdayText(birthDate: Date, today: Date = todayCalendarDate()): string {
  const age = ageOn(birthDate, today);
  return `${birthDate.getUTCDate()}. ${MONTH_NAMES[birthDate.getUTCMonth()]} ${birthDate.getUTCFullYear()} · ${age} ${age === 1 ? "Jahr" : "Jahre"}`;
}
