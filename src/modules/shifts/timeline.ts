import { formatTime } from "@/lib/dates";

/**
 * Lage der Schichten im „Tagesablauf“ der Helferplanung (`components/shift-plan.tsx`) – reine Rechnung, einzeln getestet
 * (`tests/unit/shift-timeline.test.ts`). Die Achse läuft von der vollen Stunde vor dem ersten Beginn bis zur vollen Stunde
 * nach dem letzten Ende (Schichten und Veranstaltung); parallele Schichten liegen auf eigenen Bahnen.
 */

export interface TimelineBar {
  /** Stelle der Schicht in der übergebenen Liste. */
  index: number;
  /** Abstand vom linken Rand und Breite, in Prozent der Achse. */
  left: number;
  width: number;
  /** Bahn von oben, ab 0. */
  lane: number;
}

export interface Timeline {
  ticks: { label: string; left: number }[];
  bars: TimelineBar[];
  lanes: number;
  /** Zeitraum der Veranstaltung selbst (nicht bei ganztägigen). */
  band: { left: number; width: number } | null;
}

const HOUR = 3_600_000;
/** Länger als ein Tag passt nicht sinnvoll auf eine Achse – dann zeigt die Seite nur die Liste. */
const MAX_SPAN = 24 * HOUR;

/**
 * `null`, wenn es nichts zu zeigen gibt (keine Schichten) oder die Schichten über mehr als 24 Stunden verteilt sind. Volle
 * Stunden in UTC sind auch in Berlin volle Stunden (der Abstand beträgt immer ganze Stunden), deshalb wird in UTC gerundet.
 */
export function buildTimeline(
  event: { startsAt: Date; endsAt: Date; allDay: boolean },
  shifts: readonly { startsAt: Date; endsAt: Date }[],
): Timeline | null {
  if (shifts.length === 0) return null;
  const times = shifts.flatMap((shift) => [shift.startsAt.getTime(), shift.endsAt.getTime()]);
  if (!event.allDay) times.push(event.startsAt.getTime(), event.endsAt.getTime());
  const from = Math.floor(Math.min(...times) / HOUR) * HOUR;
  const to = Math.max(from + HOUR, Math.ceil(Math.max(...times) / HOUR) * HOUR);
  if (to - from > MAX_SPAN) return null;

  const span = to - from;
  const percent = (time: number) => ((time - from) / span) * 100;
  const hours = span / HOUR;
  // Bei langen Tagen jede zweite Stunde beschriften, sonst stehen die Zahlen zu dicht.
  const step = hours > 14 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(hours / step) + 1 }, (_, i) => {
    const time = from + i * step * HOUR;
    return { label: formatTime(new Date(time)), left: percent(time) };
  });

  // Bahnen: der Reihe nach (nach Beginn) in die erste Bahn, deren letzte Schicht schon zu Ende ist.
  const order = shifts
    .map((shift, index) => ({
      index,
      start: shift.startsAt.getTime(),
      end: shift.endsAt.getTime(),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const bars: TimelineBar[] = [];
  for (const item of order) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    bars.push({
      index: item.index,
      left: percent(item.start),
      width: percent(item.end) - percent(item.start),
      lane,
    });
  }
  bars.sort((a, b) => a.index - b.index);

  const band = event.allDay
    ? null
    : {
        left: percent(event.startsAt.getTime()),
        width: percent(event.endsAt.getTime()) - percent(event.startsAt.getTime()),
      };
  return { ticks, bars, lanes: laneEnds.length, band };
}
