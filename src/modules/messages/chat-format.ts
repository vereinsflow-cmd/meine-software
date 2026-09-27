import {
  WEEKDAY_LONG,
  berlinWeekday,
  daysUntil,
  formatDate,
  formatDateLong,
  formatTime,
} from "@/lib/dates";
import type { Audience } from "./schemas";

/**
 * Nachrichten als Chats – aufgebaut wie WhatsApp: Jede Zielgruppe (alle Mitglieder, eine Abteilung, Helfer oder
 * Teilnehmer einer Veranstaltung) ist ein Chat, die Nachrichten darin sind Sprechblasen. Reine Funktionen für Schlüssel,
 * Beschriftungen und Zeitangaben – im Browser und auf dem Server nutzbar, einzeln getestet.
 */
export interface ChatTarget {
  audience: Audience;
  departmentId: string | null;
  eventId: string | null;
}

const PREFIX = {
  DEPARTMENT: "abteilung-",
  EVENT_HELPERS: "helfer-",
  EVENT_PARTICIPANTS: "teilnehmer-",
} as const satisfies Record<Exclude<Audience, "ALL_MEMBERS">, string>;

const ID = /^[0-9A-Za-z-]{1,64}$/;

/** Schlüssel eines Chats für die Adresse (`?chat=…`): „alle“, „abteilung-<id>“, „helfer-<id>“, „teilnehmer-<id>“. */
export function chatKeyOf(target: ChatTarget): string {
  if (target.audience === "ALL_MEMBERS") return "alle";
  const id = target.audience === "DEPARTMENT" ? target.departmentId : target.eventId;
  return `${PREFIX[target.audience]}${id ?? ""}`;
}

/** Gegenstück zu `chatKeyOf`; `null` bei allem, was kein gültiger Schlüssel ist. */
export function parseChatKey(key: string | undefined): ChatTarget | null {
  if (key === "alle") return { audience: "ALL_MEMBERS", departmentId: null, eventId: null };
  for (const [audience, prefix] of Object.entries(PREFIX) as [keyof typeof PREFIX, string][]) {
    if (!key?.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (!ID.test(id)) return null;
    return audience === "DEPARTMENT"
      ? { audience, departmentId: id, eventId: null }
      : { audience, departmentId: null, eventId: id };
  }
  return null;
}

/** Name des Chats, z. B. „Abteilung Fußball“ oder „Helfer · Sommerfest 2026“. */
export function chatTitle(
  audience: Audience,
  names: { department?: string | null; event?: string | null },
): string {
  if (audience === "ALL_MEMBERS") return "Alle Mitglieder";
  if (audience === "DEPARTMENT") return `Abteilung ${names.department ?? "(nicht mehr vorhanden)"}`;
  const event = names.event ?? "(Veranstaltung nicht mehr vorhanden)";
  return audience === "EVENT_HELPERS" ? `Helfer · ${event}` : `Teilnehmer · ${event}`;
}

/**
 * Betreff für Nachrichten aus dem Chat (dort gibt es kein eigenes Feld): die erste Zeile, höchstens 80 Zeichen – an
 * einer Wortgrenze gekürzt. Zu kurze Anfänge (ein einzelnes Zeichen) ergeben „Nachricht“.
 */
export function subjectFromBody(body: string): string {
  const line = (body.split(/\r?\n/).find((entry) => entry.trim()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (line.length < 2) return "Nachricht";
  if (line.length <= 80) return line;
  const cut = line.slice(0, 79);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const normalized = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("de-DE");

/** Den Betreff eigens zeigen? Nicht, wenn er nur der Anfang des Textes ist – so entsteht er im Chat. */
export function showSubject(subject: string, body: string): boolean {
  const head = normalized(subject).replace(/…$/, "");
  return !(head.length > 0 && normalized(body).startsWith(head));
}

/** Vorschau in der Chatliste: der Betreff, wenn er etwas eigenes sagt, sonst der Anfang des Textes. */
export function chatPreview(subject: string, body: string, max = 120): string {
  const text = (showSubject(subject, body) ? subject : body).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Zeit in der Chatliste: heute „14:32“, dann „Gestern“, in der Woche davor der Wochentag, sonst das Datum. */
export function chatListTime(date: Date, now: Date = new Date()): string {
  const days = daysUntil(date, now);
  if (days === 0) return formatTime(date);
  if (days === -1) return "Gestern";
  if (days < 0 && days > -7) return WEEKDAY_LONG[berlinWeekday(date)]!;
  return formatDate(date);
}

/** Trenner im Verlauf: „Heute“, „Gestern“, in der Woche davor der Wochentag, sonst „Montag, 21. September 2026“. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const days = daysUntil(date, now);
  if (days === 0) return "Heute";
  if (days === -1) return "Gestern";
  if (days < 0 && days > -7) return WEEKDAY_LONG[berlinWeekday(date)]!;
  return formatDateLong(date);
}

/**
 * Für den Verlauf: Beginnt mit der Nachricht ein neuer Tag (Trenner) und ein neuer Block derselben Person? Wie bei
 * WhatsApp steht der Name nur über der ersten Blase eines Blocks, und nur sie hat die kleine Spitze.
 */
export function withRuns<T extends { sentAt: Date; authorKey: string }>(
  messages: readonly T[],
): (T & { newDay: boolean; firstOfRun: boolean })[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const newDay = !previous || daysUntil(message.sentAt, previous.sentAt) !== 0;
    return { ...message, newDay, firstOfRun: newDay || previous!.authorKey !== message.authorKey };
  });
}

/** Farben für Namen in Gruppen (wie bei WhatsApp) – auf hellen und dunklen Blasen gut lesbar. */
const NAME_TONES = [
  "text-sky-800 dark:text-sky-300",
  "text-violet-800 dark:text-violet-300",
  "text-emerald-800 dark:text-emerald-300",
  "text-amber-800 dark:text-amber-300",
  "text-rose-800 dark:text-rose-300",
  "text-teal-800 dark:text-teal-300",
] as const;

/** Gleiche Person, gleiche Farbe. */
export function nameTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return NAME_TONES[hash % NAME_TONES.length]!;
}
