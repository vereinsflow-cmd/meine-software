import { AREA_ICON } from "@/components/shared/area-icons";
import { hoursCompare, memberCompare, nextEventCompare, staffingCompare } from "../compare";
import type { BlockSize } from "../layout-prefs";
import type { DashboardData } from "../service";
import { FreeShiftsCard, StatCard, type StatSize } from "./kpi-cards";

/**
 * Die vier Kennzahlen der Übersicht (laufen im Server und reichen die Daten an die Kurs-Karten weiter, `kpi-cards.tsx`).
 * Jede zeigt ihren Kurs „wie eine Aktie“ (`modules/dashboard/quote.ts`) und den bisherigen kurzen Vergleichssatz.
 */

export function MembersStat({
  members,
  size,
  density,
}: {
  members: NonNullable<DashboardData["members"]>;
  size?: StatSize;
  density?: BlockSize;
}) {
  return (
    <StatCard
      label={members.scope === "CLUB" ? "Mitglieder" : "Mitglieder (deine Abteilung)"}
      accent="blue"
      value={members.total}
      compare={memberCompare(members.trend) ?? undefined}
      href="/mitglieder"
      icon={<AREA_ICON.mitglieder />}
      quote={members.quote}
      size={size}
      density={density}
    />
  );
}

export function NextEventsStat({
  events,
  density,
}: {
  events: NonNullable<DashboardData["events"]>;
  density?: BlockSize;
}) {
  return (
    <StatCard
      label="Termine in 30 Tagen"
      accent="violet"
      value={events.countNext30Days}
      compare={
        nextEventCompare(events.nextInDays) ?? {
          text: "Keine kommenden Termine",
          tone: "neutral",
        }
      }
      href="/veranstaltungen"
      icon={<AREA_ICON.veranstaltungen />}
      quote={events.quote}
      density={density}
    />
  );
}

export function FreeShiftsStat({
  shifts,
  size,
  density,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: StatSize;
  density?: BlockSize;
}) {
  return (
    <FreeShiftsCard
      freeSpots={shifts.freeSpots}
      filled={shifts.staffing.filled}
      required={shifts.staffing.required}
      compare={staffingCompare(shifts.staffing.filled, shifts.staffing.required)}
      quote={shifts.staffingQuote}
      size={size}
      density={density}
      icon={<AREA_ICON.helferplanung />}
    />
  );
}

/** Kompakt für die Kennzahlenkarte: „4,5 Std.“ statt „4 Std. 30 Min.“; die Einheit etwas kleiner neben der Zahl. */
function compactHours(minutes: number) {
  return (
    <>
      {(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })}{" "}
      <span className="text-[0.55em] font-bold tracking-normal">Std.</span>
    </>
  );
}

export function HelperHours({
  hours,
  density,
}: {
  hours: NonNullable<DashboardData["shifts"]>["hours"];
  density?: BlockSize;
}) {
  return (
    <StatCard
      label={
        hours.scope === "ALL" ? `Helferstunden ${hours.year}` : `Meine Helferstunden ${hours.year}`
      }
      accent="amber"
      value={compactHours(hours.minutes)}
      compare={hoursCompare(hours.trend) ?? undefined}
      href="/helferplanung/stunden"
      icon={<AREA_ICON.helferstunden />}
      quote={hours.quote}
      density={density}
    />
  );
}

export { StatCard };
