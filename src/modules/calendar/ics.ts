import ical, { ICalEventStatus } from "ical-generator";
import { addBerlinDays, berlinParts } from "@/lib/dates";

/**
 * iCalendar-Ausgabe (RFC 5545) für Kalender-Abos und den Export einzelner Termine.
 *
 * - Zeitpunkte werden als UTC ausgegeben (`…Z`): Jeder Kalender rechnet sie korrekt in die Ortszeit des Geräts um,
 *   Sommer-/Winterzeit eingeschlossen. Dadurch ist kein VTIMEZONE-Block nötig.
 * - Ganztägige Termine sind reine Kalendertage (`VALUE=DATE`); das Ende ist – wie im Standard – EXKLUSIV.
 * - Die Datei enthält nur, was die Person in der Anwendung ohnehin sehen darf. Interne Hinweise gehören nie hinein.
 */
export interface IcsEntry {
  /** Stabile ID (bleibt bei Änderungen gleich, damit Kalender den Termin aktualisieren statt zu duplizieren). */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  status: "PUBLISHED" | "COMPLETED" | "CANCELLED" | "DRAFT";
  url?: string | null;
  updatedAt: Date;
}

const STATUS: Record<IcsEntry["status"], ICalEventStatus> = {
  PUBLISHED: ICalEventStatus.CONFIRMED,
  COMPLETED: ICalEventStatus.CONFIRMED,
  CANCELLED: ICalEventStatus.CANCELLED,
  DRAFT: ICalEventStatus.TENTATIVE,
};

/** Kalendertag in Berlin als UTC-Mitternacht – so gibt ical-generator genau dieses Datum aus. */
function asDateOnly(value: Date): Date {
  const { year, month, day } = berlinParts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function buildIcs(options: {
  name: string;
  entries: readonly IcsEntry[];
  uidDomain: string;
  now?: Date;
}): string {
  const now = options.now ?? new Date();
  const calendar = ical({
    name: options.name,
    prodId: { company: "VereinsFlow", product: "Kalender", language: "DE" },
    ttl: 60 * 60,
  });

  for (const entry of options.entries) {
    let start = entry.startsAt;
    let end = entry.endsAt;
    if (entry.allDay) {
      start = asDateOnly(entry.startsAt);
      // Ganztägige Termine enden in der Anwendung um 23:59 des letzten Tages; iCal erwartet den Folgetag (exklusiv).
      end = asDateOnly(addBerlinDays(entry.endsAt, 1));
      if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 86_400_000);
    } else if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 60 * 60_000);
    }

    calendar.createEvent({
      id: `${entry.uid}@${options.uidDomain}`,
      start,
      end,
      allDay: entry.allDay,
      summary: entry.title,
      description: entry.description ?? undefined,
      location: entry.location ?? undefined,
      url: entry.url ?? undefined,
      status: STATUS[entry.status],
      stamp: now,
      lastModified: entry.updatedAt,
      // Ändert sich ein Termin, steigt SEQUENCE – Kalender-Apps übernehmen die neue Fassung zuverlässig.
      sequence: Math.min(2_000_000_000, Math.floor(entry.updatedAt.getTime() / 1000)),
    });
  }
  return calendar.toString();
}
