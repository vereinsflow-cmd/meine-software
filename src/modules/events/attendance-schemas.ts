import { z } from "zod";
import { EventType, type AttendanceStatus, type EventStatus } from "@/generated/prisma/enums";
import { berlinParts, startOfBerlinDate, startOfNextBerlinDay } from "@/lib/dates";
import { idString } from "@/lib/id-schema";
import { enumParam, param, type RawSearchParams } from "@/lib/search-params";

/**
 * Anwesenheit bei Terminen (Training, Probe, Versammlung) – Eingaben, Bezeichnungen und reine Rechenregeln. Ohne
 * Server-Abhängigkeit: Die Erfassungsliste im Browser und der Dienst (`attendance.ts`) nutzen dieselben Regeln.
 *
 * Anwesenheit ist bewusst getrennt von der Zu- und Absage (`EventParticipant`): Wer abgesagt hat, kann trotzdem kommen,
 * und das Erfassen ändert weder Warteliste noch Teilnehmerlimit.
 */
export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "EXCUSED",
  "ABSENT",
] as const satisfies readonly AttendanceStatus[];

/** Beschriftung der drei Auswahlknöpfe je Person. */
export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Anwesend",
  EXCUSED: "Entschuldigt",
  ABSENT: "Fehlt",
};

/** Rückblickend (Mitgliedsseite, Auswertung, CSV): „Gefehlt“ statt „Fehlt“. */
export const ATTENDANCE_RESULT_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Anwesend",
  EXCUSED: "Entschuldigt",
  ABSENT: "Gefehlt",
};

/** Erfassen geht ab so vielen Minuten vor Beginn (Trainer haken oft schon beim Aufwärmen ab). */
export const ATTENDANCE_LEAD_MINUTES = 60;

/**
 * Aufbewahrung: Anwesenheiten werden 24 Monate nach dem Termin gelöscht (Aufbewahrungsjob, `server/jobs/retention.ts`).
 * Zwei Jahre reichen für Auswertungen über eine Saison hinaus und für übliche Nachweise (Übungsleiter, Zuschüsse).
 */
export const ATTENDANCE_RETENTION_MONTHS = 24;

/** Höchstens so viele Personen je Termin auf einmal (Schutz vor übergroßen Anfragen). */
export const MAX_ATTENDANCE_ENTRIES = 500;

export const saveAttendanceSchema = z
  .object({
    eventId: idString,
    /** Nur geänderte Personen: ein Status speichert bzw. ändert, `null` entfernt den Eintrag. */
    entries: z
      .array(z.object({ memberId: idString, status: z.enum(ATTENDANCE_STATUSES).nullable() }))
      .max(MAX_ATTENDANCE_ENTRIES, `Höchstens ${MAX_ATTENDANCE_ENTRIES} Personen auf einmal.`),
  })
  .refine(
    (data) => new Set(data.entries.map((entry) => entry.memberId)).size === data.entries.length,
    { message: "Jede Person darf nur einmal vorkommen.", path: ["entries"] },
  );

export type SaveAttendanceInput = z.output<typeof saveAttendanceSchema>;

// ---------------------------------------------------------------------------------------------
// Zeitfenster für das Erfassen
// ---------------------------------------------------------------------------------------------

export interface AttendanceWindow {
  open: boolean;
  /** Ab wann erfasst werden kann (60 Minuten vor Beginn). */
  opensAt: Date;
  /** Warum es (noch) nicht geht – `null`, wenn es geht. */
  reason: string | null;
}

/**
 * Darf JETZT erfasst werden? Nur bei veröffentlichten oder abgeschlossenen Terminen und frühestens 60 Minuten vor
 * Beginn. Nach oben gibt es keine Grenze: Nachtragen und Korrigieren bleibt möglich.
 */
export function attendanceWindow(
  event: { status: EventStatus; startsAt: Date },
  now: Date = new Date(),
): AttendanceWindow {
  const opensAt = new Date(event.startsAt.getTime() - ATTENDANCE_LEAD_MINUTES * 60_000);
  if (event.status !== "PUBLISHED" && event.status !== "COMPLETED") {
    return {
      open: false,
      opensAt,
      reason:
        event.status === "CANCELLED"
          ? "Die Veranstaltung wurde abgesagt."
          : event.status === "DRAFT"
            ? "Die Veranstaltung ist noch ein Entwurf."
            : "Die Veranstaltung ist archiviert.",
    };
  }
  if (now.getTime() < opensAt.getTime())
    return {
      open: false,
      opensAt,
      reason: `Die Anwesenheit lässt sich erst ab ${ATTENDANCE_LEAD_MINUTES} Minuten vor Beginn erfassen.`,
    };
  return { open: true, opensAt, reason: null };
}

// ---------------------------------------------------------------------------------------------
// Zählen und Quoten
// ---------------------------------------------------------------------------------------------

export interface AttendanceCounts {
  present: number;
  excused: number;
  absent: number;
}

export const emptyCounts = (): AttendanceCounts => ({ present: 0, excused: 0, absent: 0 });

export function countStatuses(statuses: Iterable<AttendanceStatus | null>): AttendanceCounts {
  const counts = emptyCounts();
  for (const status of statuses) {
    if (status === "PRESENT") counts.present += 1;
    else if (status === "EXCUSED") counts.excused += 1;
    else if (status === "ABSENT") counts.absent += 1;
  }
  return counts;
}

export const totalOf = (counts: AttendanceCounts): number =>
  counts.present + counts.excused + counts.absent;

/**
 * Anwesenheitsquote einer Person: anwesend geteilt durch alle Termine, bei denen sie erfasst wurde (entschuldigt zählt wie
 * gefehlt – die Quote sagt, wie oft jemand da war). Ohne einen einzigen erfassten Termin gibt es keine Quote (`null`), statt
 * durch null zu teilen.
 */
export function attendanceRate(counts: AttendanceCounts): number | null {
  const total = totalOf(counts);
  return total === 0 ? null : counts.present / total;
}

/** Durchschnittlich anwesend je erfasstem Termin – `null` ohne erfassten Termin. */
export function averageAttendance(present: number, recordedEvents: number): number | null {
  return recordedEvents === 0 ? null : present / recordedEvents;
}

/** Kurzfassung für Protokoll und Übersichten: „14 anwesend, 2 entschuldigt, 1 gefehlt“ (nur Zahlen, keine Namen). */
export function countsText(counts: AttendanceCounts): string {
  return `${counts.present} anwesend, ${counts.excused} entschuldigt, ${counts.absent} gefehlt`;
}

// ---------------------------------------------------------------------------------------------
// Erfassungsliste: was „Speichern“ mitnimmt
// ---------------------------------------------------------------------------------------------

export interface PendingAttendance {
  /** So viele Personen nimmt „Speichern (n)“ mit: Auswahl weicht vom Gespeicherten ab. */
  toSave: number;
  /** Davon noch so vorausgefüllt, wie die Liste geladen wurde (bei einer Absage „entschuldigt“). */
  prefilled: number;
  /** Davon selbst geändert – nur diese fragen beim Verlassen der Seite nach. */
  edited: number;
}

/**
 * Was beim Speichern der Liste ansteht. Je Zeile: `status` = aktuelle Auswahl, `saved` = gespeichert, `proposed` = Vorschlag
 * beim Laden bzw. nach dem letzten Speichern. Vorausgefüllte Zeilen (Vorschlag ≠ gespeichert, unverändert) werden mit
 * gespeichert, gelten aber nicht als eigene Änderung: Wer die Seite nur öffnet, wird beim Verlassen nicht gefragt.
 */
export function pendingAttendance(
  rows: Iterable<{
    status: AttendanceStatus | null;
    saved: AttendanceStatus | null;
    proposed: AttendanceStatus | null;
  }>,
): PendingAttendance {
  let toSave = 0;
  let prefilled = 0;
  for (const row of rows) {
    if (row.status === row.saved) continue;
    toSave += 1;
    if (row.status === row.proposed) prefilled += 1;
  }
  return { toSave, prefilled, edited: toSave - prefilled };
}

const changesWord = (n: number) => `${n} ${n === 1 ? "Änderung" : "Änderungen"}`;
const declinesWord = (n: number) => `${n} ${n === 1 ? "Absage" : "Absagen"}`;

/**
 * Hinweis neben „Speichern (n)“: „3 Änderungen noch nicht gespeichert“. Sind vorausgefüllte Absagen dabei, sagt er das,
 * damit die Zahl auf dem Knopf stimmt, auch wenn man selbst nichts angetippt hat.
 */
export function pendingAttendanceText({ edited, prefilled }: PendingAttendance): string {
  if (prefilled === 0) return `${changesWord(edited)} noch nicht gespeichert`;
  const declines = `${declinesWord(prefilled)} als „Entschuldigt“`;
  return edited === 0
    ? `${declines} vorausgefüllt – noch nicht gespeichert`
    : `${changesWord(edited)} und ${declines} noch nicht gespeichert`;
}

// ---------------------------------------------------------------------------------------------
// Zeiträume der Auswertung
// ---------------------------------------------------------------------------------------------

export const ATTENDANCE_PERIODS = {
  "4w": "Letzte 4 Wochen",
  "3m": "Letzte 3 Monate",
  "12m": "Letzte 12 Monate",
  jahr: "Dieses Jahr",
  vorjahr: "Letztes Jahr",
} as const;

export type AttendancePeriod = keyof typeof ATTENDANCE_PERIODS;
export const ATTENDANCE_PERIOD_KEYS = Object.keys(ATTENDANCE_PERIODS) as AttendancePeriod[];
export const DEFAULT_ATTENDANCE_PERIOD: AttendancePeriod = "3m";

/**
 * Zeitraum als halboffenes Intervall [von, bis) in Berliner Zeit. „Letzte …“ endet mit dem heutigen Tag (das Training von
 * heute Abend zählt mit), „Letztes Jahr“ ist das ganze Vorjahr.
 */
export function periodRange(
  period: AttendancePeriod,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const { year, month, day } = berlinParts(now);
  const to = startOfNextBerlinDay(now);
  switch (period) {
    case "4w":
      return { from: startOfBerlinDate(year, month, day - 27), to };
    case "3m":
      return { from: startOfBerlinDate(year, month - 3, day + 1), to };
    case "12m":
      return { from: startOfBerlinDate(year, month - 12, day + 1), to };
    case "jahr":
      return { from: startOfBerlinDate(year, 1, 1), to };
    case "vorjahr":
      return { from: startOfBerlinDate(year - 1, 1, 1), to: startOfBerlinDate(year, 1, 1) };
  }
}

// ---------------------------------------------------------------------------------------------
// Filter der Auswertung (Adresse ↔ Dienst)
// ---------------------------------------------------------------------------------------------

export interface AttendanceFilters {
  departmentId?: string;
  groupId?: string;
  seriesId?: string;
  period: AttendancePeriod;
  /** Art der Termine; `null` = alle Arten. Ohne Angabe: Training. */
  type: EventType | null;
}

/**
 * Liest die Filter aus der Adresse (`abteilung`, `gruppe`, `serie`, `zeitraum`, `art` – „alle“ für alle Arten). Gleich für
 * Seite und CSV-Export; ob Abteilung, Gruppe und Serie zur Reichweite gehören, prüft der Dienst.
 */
export function attendanceFiltersFromParams(params: RawSearchParams): AttendanceFilters {
  return {
    departmentId: param(params, "abteilung"),
    groupId: param(params, "gruppe"),
    seriesId: param(params, "serie"),
    period: enumParam(params, "zeitraum", ATTENDANCE_PERIOD_KEYS) ?? DEFAULT_ATTENDANCE_PERIOD,
    type:
      param(params, "art") === "alle"
        ? null
        : (enumParam(params, "art", Object.values(EventType)) ?? "TRAINING"),
  };
}

/** Umkehrung für Links (Export, „Zurücksetzen“): Standardwerte fallen weg. */
export function attendanceFilterQuery(
  filters: AttendanceFilters,
): Record<string, string | undefined> {
  return {
    abteilung: filters.departmentId,
    gruppe: filters.groupId,
    serie: filters.seriesId,
    zeitraum: filters.period === DEFAULT_ATTENDANCE_PERIOD ? undefined : filters.period,
    art: filters.type === null ? "alle" : filters.type === "TRAINING" ? undefined : filters.type,
  };
}
