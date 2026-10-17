import type { MemberStatus } from "@/generated/prisma/enums";
import { AREA_ICON } from "@/components/shared/area-icons";
import { CountUp } from "@/components/shared/count-up";
import { MEMBER_STATUS_LABEL } from "@/lib/labels";
import { hoursCompare, memberCompare, nextEventCompare, staffingCompare } from "../compare";
import type { BlockSize } from "../layout-prefs";
import type { DashboardData } from "../service";
import { FreeShiftsCard, StatCard, StatusBreakdown, type StatSize } from "./kpi-cards";

/** Feste Reihenfolge der Status in der Aufteilung (wie die Farben: an den Status gebunden, nicht an die Anzahl). */
const STATUS_ORDER: readonly MemberStatus[] = ["ACTIVE", "PASSIVE", "HONORARY", "BLOCKED", "LEFT"];

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
      value={<CountUp value={members.total} />}
      compare={memberCompare(members.trend) ?? undefined}
      href="/mitglieder"
      icon={<AREA_ICON.mitglieder />}
      quote={members.quote}
      size={size}
      density={density}
      breakdown={
        <StatusBreakdown
          title={
            members.scope === "CLUB"
              ? "So setzt sich der Verein zusammen"
              : "So setzt sich deine Abteilung zusammen"
          }
          items={STATUS_ORDER.flatMap((status) => {
            const count = members.byStatus.find((entry) => entry.status === status)?.count ?? 0;
            return count > 0 ? [{ key: status, label: MEMBER_STATUS_LABEL[status], count }] : [];
          })}
        />
      }
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
      value={<CountUp value={events.countNext30Days} />}
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
  density,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  density?: BlockSize;
}) {
  return (
    <FreeShiftsCard
      freeSpots={shifts.freeSpots}
      required={shifts.staffing.required}
      compare={staffingCompare(shifts.staffing.filled, shifts.staffing.required)}
      quote={shifts.staffingQuote}
      density={density}
      icon={<AREA_ICON.helferplanung />}
    />
  );
}

/** Kompakt für die Kennzahlenkarte: „4,5 Std.“ statt „4 Std. 30 Min.“; die Einheit etwas kleiner neben der Zahl. */
function compactHours(minutes: number) {
  return (
    <>
      <CountUp value={minutes / 60} kind="decimal" />{" "}
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
