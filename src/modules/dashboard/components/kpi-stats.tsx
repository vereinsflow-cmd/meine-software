import { AREA_ICON } from "@/components/shared/area-icons";
import { formatNumber } from "@/lib/charts/geometry";
import { CountUp } from "@/components/shared/count-up";
import { hoursCompare, memberCompare, nextEventCompare, staffingCompare } from "../compare";
import type { BlockSize } from "../layout-prefs";
import type { DashboardData } from "../service";
import { FreeShiftsCard, StatCard } from "./kpi-cards";
import { Chip, HoursChartCard, MembersHeroCard, QuoteTile, StudioTile } from "./kpi-studio";

/**
 * Die Kennzahlen der Übersicht (laufen im Server und reichen die Daten an die Karten weiter). Zwei Fassungen:
 *  - die Farbkarten (`StatCard`, `kpi-cards.tsx`) für das einfache Raster – Rollen ohne Mitgliederzahlen und die Größe „Klein“;
 *  - seit 18.10.2026 der Stil der Vorlage „Vertix“ in VereinsFlow-Blau (Mitglieder-Karte, Viererblock aus Kacheln und
 *    Stunden-Balken, `kpi-studio.tsx`), angeordnet in der Seite (`studioTop`).
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
 * Mitglieder-Karte: unten Aktiv, Passiv und alle übrigen Status zusammen („Weitere“: Ehrenmitglieder, Gesperrte, Ausgetretene im
 * Bestand) – die drei Kärtchen ergeben genau die große Zahl. `actions`: die beiden runden Knöpfe (von der Seite nach Rechten).
 */
export function MembersHero({
  members,
  size,
  actions,
}: {
  members: NonNullable<DashboardData["members"]>;
  size?: BlockSize;
  actions: React.ComponentProps<typeof MembersHeroCard>["actions"];
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
      quote={members.quote}
      split={[
        { label: "Aktiv", count: active, dot: "bg-emerald-500" },
        { label: "Passiv", count: passive, dot: "bg-blue-600 dark:bg-blue-400" },
        { label: "Weitere", count: rest, dot: "bg-slate-400" },
      ]}
      actions={actions}
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

/** Termine als Kachel: Veränderung im Standard-Zeitraum, darunter wann der nächste Termin ist. */
export function NextEventsTile({
  events,
  size,
  hot,
}: {
  events: NonNullable<DashboardData["events"]>;
  size?: BlockSize;
  hot?: boolean;
}) {
  return (
    <QuoteTile
      label="Termine in 30 Tagen"
      value={<CountUp value={events.countNext30Days} />}
      caption={nextEventsCompare(events).text}
      href="/veranstaltungen"
      icon={<AREA_ICON.veranstaltungen />}
      quote={events.quote}
      hot={hot}
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

/** Freie Helferplätze als Kachel: Veränderung der Besetzung (nur, wenn Schichten geplant sind) und wie viele besetzt sind. */
export function FreeShiftsTile({
  shifts,
  size,
  hot,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: BlockSize;
  hot?: boolean;
}) {
  const { filled, required } = shifts.staffing;
  return (
    <QuoteTile
      label="Freie Helferplätze"
      value={<CountUp value={shifts.freeSpots} />}
      caption={staffingCompare(filled, required).text}
      href="/helferplanung"
      icon={<AREA_ICON.helferplanung />}
      quote={required > 0 ? shifts.staffingQuote : undefined}
      hot={hot}
      size={size}
    />
  );
}

/** Offene Aufgaben als Kachel; „Aufgaben im Verein“ nur für Organisierende, sonst die für die Person sichtbaren offenen Aufgaben. */
export function TasksTile({
  tasks,
  organizer,
  size,
  hot,
}: {
  tasks: NonNullable<DashboardData["tasks"]>;
  organizer: boolean;
  size?: BlockSize;
  hot?: boolean;
}) {
  const { open, overdue, mineOpen } = tasks.stats;
  const on = hot ? "hot" : "muted";
  return (
    <StudioTile
      label={organizer ? "Aufgaben im Verein" : "Offene Aufgaben"}
      value={
        <>
          <CountUp value={open} />{" "}
          <span className="text-[0.5em] font-semibold tracking-normal">offen</span>
        </>
      }
      chip={
        overdue > 0 ? (
          <Chip tone="down" on={on}>
            {formatNumber(overdue, 0)} überfällig
          </Chip>
        ) : (
          <Chip tone="up" on={on}>
            {open === 0 ? "Alles erledigt" : "Im Zeitplan"}
          </Chip>
        )
      }
      caption={
        organizer && mineOpen !== open ? `davon ${formatNumber(mineOpen, 0)} für dich` : undefined
      }
      href="/aufgaben"
      icon={<AREA_ICON.aufgaben />}
      hot={hot}
      size={size}
    />
  );
}

/** Offene Zahlungen als Kachel: Summe, Überfälliges als Schild, Anzahl der Rechnungen. */
export function PaymentsTile({
  payments,
  size,
  hot,
}: {
  payments: NonNullable<DashboardData["payments"]>;
  size?: BlockSize;
  hot?: boolean;
}) {
  const on = hot ? "hot" : "muted";
  return (
    <StudioTile
      label="Offene Zahlungen"
      value={<CountUp value={payments.totalCents} kind="euro" />}
      chip={
        payments.overdueCount > 0 ? (
          <Chip tone="down" on={on}>
            {formatNumber(payments.overdueCount, 0)} überfällig
          </Chip>
        ) : (
          <Chip tone="up" on={on}>
            Nichts überfällig
          </Chip>
        )
      }
      caption={`in ${formatNumber(payments.count, 0)} ${payments.count === 1 ? "Rechnung" : "Rechnungen"}`}
      href="/finanzen/rechnungen?stand=offen"
      icon={<AREA_ICON.finanzen />}
      hot={hot}
      size={size}
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

/** Helferstunden als weiße Karte mit Balken je Abschnitt (Stil der Vorlage „Vertix“). */
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
      quote={hours.quote}
      size={size}
    />
  );
}

export { StatCard };
