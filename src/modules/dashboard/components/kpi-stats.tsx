import { AREA_ICON } from "@/components/shared/area-icons";
import { CountUp } from "@/components/shared/count-up";
import { hoursCompare, memberCompare, nextEventCompare, staffingCompare } from "../compare";
import type { BlockSize } from "../layout-prefs";
import type { DashboardData } from "../service";
import { FreeShiftsCard, StatCard } from "./kpi-cards";
import { HoursChartCard, MembersHeroCard, QuotePill } from "./kpi-studio";
import { PillBar, TasksDonutCard } from "./studio-cards";

/**
 * Die Kennzahlen der Übersicht (laufen im Server und reichen die Daten an die Karten weiter). Zwei Fassungen:
 *  - die Farbkarten (`StatCard`, `kpi-cards.tsx`) für das einfache Raster – Rollen ohne Mitgliederzahlen und die Größe „Klein“;
 *  - seit 17.10.2026 der Stil der Vorlage „Analytics“ in VereinsFlow-Farben (große Mitglieder-Kachel, Aufgaben-Ring, schmale
 *    Karten und Stunden-Balken, `kpi-studio.tsx`/`studio-cards.tsx`), angeordnet von `StudioFrame` in der Seite.
 * Jede Kennzahl mit Verlauf zeigt ihren Kurs „wie eine Aktie“ (`modules/dashboard/quote.ts`) und den kurzen Vergleichssatz.
 */

const membersLabel = (members: NonNullable<DashboardData["members"]>) =>
  members.scope === "CLUB" ? "Mitglieder" : "Mitglieder (deine Abteilung)";

const nextEventsCompare = (events: NonNullable<DashboardData["events"]>) =>
  nextEventCompare(events.nextInDays) ?? {
    text: "Keine kommenden Termine",
    tone: "neutral" as const,
  };

const hoursLabel = (hours: NonNullable<DashboardData["shifts"]>["hours"]) =>
  hours.scope === "ALL" ? `Helferstunden ${hours.year}` : `Meine Helferstunden ${hours.year}`;

export function MembersStat({
  members,
  density,
}: {
  members: NonNullable<DashboardData["members"]>;
  density?: BlockSize;
}) {
  return (
    <StatCard
      label={membersLabel(members)}
      accent="blue"
      value={<CountUp value={members.total} />}
      compare={memberCompare(members.trend) ?? undefined}
      href="/mitglieder"
      icon={<AREA_ICON.mitglieder />}
      quote={members.quote}
      density={density}
    />
  );
}

/**
 * Große Mitglieder-Kachel: unten Aktiv, Passiv und alle übrigen Status zusammen („Weitere“: Ehrenmitglieder, Gesperrte,
 * Ausgetretene im Bestand) – die drei Spalten ergeben genau die große Zahl.
 */
export function MembersHero({
  members,
  size,
}: {
  members: NonNullable<DashboardData["members"]>;
  size?: BlockSize;
}) {
  const count = (status: string) =>
    members.byStatus.find((entry) => entry.status === status)?.count ?? 0;
  const active = count("ACTIVE");
  const passive = count("PASSIVE");
  const rest = Math.max(0, members.total - active - passive);
  return (
    <MembersHeroCard
      label={membersLabel(members)}
      value={<CountUp value={members.total} />}
      compare={memberCompare(members.trend) ?? undefined}
      href="/mitglieder"
      icon={<AREA_ICON.mitglieder />}
      quote={members.quote}
      split={[
        { label: "Aktiv", count: active },
        { label: "Passiv", count: passive },
        { label: "Weitere", count: rest },
      ]}
      size={size}
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
      compare={nextEventsCompare(events)}
      href="/veranstaltungen"
      icon={<AREA_ICON.veranstaltungen />}
      quote={events.quote}
      density={density}
    />
  );
}

/** Termine als schmale Karte; der Kurs als kleine Linie mit Zeitraum-Knöpfen (12 W · 6 M · 12 M). */
export function NextEventsPill({
  events,
  size,
}: {
  events: NonNullable<DashboardData["events"]>;
  size?: BlockSize;
}) {
  return (
    <QuotePill
      label="Termine in 30 Tagen"
      value={<CountUp value={events.countNext30Days} />}
      sub={nextEventsCompare(events).text}
      href="/veranstaltungen"
      icon={<AREA_ICON.veranstaltungen />}
      accent="violet"
      quote={events.quote}
      size={size}
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

/**
 * Freie Helferplätze als schmale Karte: der Balken zeigt die besetzten von den benötigten Plätzen, darunter der Kurs der Besetzung
 * mit Zeitraum-Knöpfen (6 W · 12 W) – beides nur, wenn Schichten geplant sind.
 */
export function FreeShiftsPill({
  shifts,
  size,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: BlockSize;
}) {
  const { filled, required } = shifts.staffing;
  return (
    <QuotePill
      label="Freie Helferplätze"
      value={<CountUp value={shifts.freeSpots} />}
      sub={staffingCompare(filled, required).text}
      href="/helferplanung"
      icon={<AREA_ICON.helferplanung />}
      accent="emerald"
      quote={shifts.staffingQuote}
      chart={required > 0}
      extra={<PillBar value={filled} total={required} accent="emerald" />}
      size={size}
    />
  );
}

/** Aufgaben-Ring; „Aufgaben im Verein“ nur für Organisierende, sonst die für die Person sichtbaren offenen Aufgaben. */
export function TasksDonut({
  tasks,
  organizer,
}: {
  tasks: NonNullable<DashboardData["tasks"]>;
  organizer: boolean;
}) {
  return (
    <TasksDonutCard
      label={organizer ? "Aufgaben im Verein" : "Offene Aufgaben"}
      open={tasks.stats.open}
      overdue={tasks.stats.overdue}
      mine={organizer ? tasks.stats.mineOpen : undefined}
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
      label={hoursLabel(hours)}
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

/** Helferstunden als weiße Karte mit Balken je Abschnitt (Stil der Vorlage). */
export function HelperHoursChart({
  hours,
  size,
}: {
  hours: NonNullable<DashboardData["shifts"]>["hours"];
  size?: BlockSize;
}) {
  return (
    <HoursChartCard
      label={hoursLabel(hours)}
      value={compactHours(hours.minutes)}
      compare={hoursCompare(hours.trend) ?? undefined}
      href="/helferplanung/stunden"
      icon={<AREA_ICON.helferstunden />}
      quote={hours.quote}
      size={size}
    />
  );
}

export { StatCard };
