import Link from "next/link";
import {
  ArrowRightIcon,
  BellIcon,
  BellOffIcon,
  CakeIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  CircleCheckBigIcon,
  ClockIcon,
  GiftIcon,
  HandHeartIcon,
  HistoryIcon,
  ListChecksIcon,
  PartyPopperIcon,
  SmileIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCENT, type Accent } from "@/components/shared/accent";
import { Sparkline } from "@/components/charts/sparkline";
import { ExpandableList } from "@/components/shared/expandable-list";
import { TaskPriorityBadge, TaskStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  MONTH_NAMES,
  berlinParts,
  formatCalendarDate,
  formatDateShort,
  formatDateTime,
  formatDuration,
  formatTimeRange,
} from "@/lib/dates";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import { URGENCY_LABEL } from "@/lib/shift-health";
import { cn } from "@/lib/utils";
import { QuickSignUpButton } from "@/modules/shifts/components/quick-actions";
import { FillBar, UrgencyBadge } from "@/modules/shifts/components/shift-status";
import type { DashboardData } from "../service";
import { sortByImportance } from "../task-order";

/**
 * Zeilen in Listenkarten (Termine, Einsätze, Geburtstage, offene Schichten): Beim Überfahren hellt die ganze Zeile sich
 * leicht auf, nicht nur der Link-Text – das macht die Zeile als Ganzes als Bedienelement erkennbar. Der negative Rand zieht
 * die Zeile bis an den Kartenrand; die Karte selbst schneidet das (`overflow-hidden`) wieder passend zur Rundung ab.
 */
const LIST_ROW =
  "-mx-(--card-spacing) rounded-lg px-(--card-spacing) transition-colors motion-reduce:transition-none hover:bg-muted/50";

export function StatCard({
  label,
  value,
  hint,
  href,
  icon,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  icon: React.ReactNode;
  /** Letzte Werte für eine kleine Trendlinie (älteste zuerst, mind. zwei Werte); ohne Angabe entfällt sie. */
  trend?: readonly number[];
}) {
  const body = (
    <Card
      className={cn(
        "h-full gap-0 py-0",
        href &&
          "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <CardContent className="grid gap-1 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="pt-0.5 text-sm font-medium text-muted-foreground">{label}</p>
          <div
            className={cn(
              // Alle Kennzahlenkarten teilen sich denselben, zurückhaltenden Symbolstil (kein Regenbogen aus
              // Blau/Lila/Grün/Gelb) – die Markenfarbe bleibt Aktionen vorbehalten und erscheint hier nur beim
              // Überfahren, als Zugabe zum Anheben der ganzen Karte.
              "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-5",
              href &&
                "transition-[transform,background-color,color] duration-200 group-hover/card:scale-110 group-hover/card:bg-primary/10 group-hover/card:text-primary motion-reduce:transition-none",
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        </div>
        <p className="text-3xl leading-tight font-bold tabular-nums">{value}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {trend && trend.length > 1 && <Sparkline values={trend} className="mt-1.5" />}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function Widget({
  id,
  title,
  icon,
  accent,
  description,
  children,
  more,
  emphasis = false,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  accent: Accent;
  description?: string;
  children: React.ReactNode;
  more?: { href: string; label: string };
  /** Hebt die Karte als „hier ist etwas zu tun“ hervor (kräftiger Rahmen, gefüllte Symbolfläche). */
  emphasis?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="h-full">
      <Card className={cn("h-full", emphasis && "ring-2 ring-primary/50 dark:ring-primary/60")}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
                emphasis ? "bg-primary text-primary-foreground" : ACCENT[accent].tile,
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
            <div className="min-w-0">
              {/* Ebene 3: Die Gruppen des Dashboards („Für dich“, „Anstehend“ …) tragen die Ebene-2-Überschriften. */}
              <CardTitle id={id} role="heading" aria-level={3}>
                {title}
              </CardTitle>
              {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {children}
          {more && (
            <Link
              href={more.href}
              className="group mt-auto inline-flex w-fit items-center gap-1.5 rounded-md pt-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {more.label}{" "}
              <ArrowRightIcon
                className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * Leerer Bereich: freundlich statt wie ein Fehler – Symbol im Farbton des Bereichs, kurze Überschrift, ein Satz dazu.
 * (Kein gestrichelter Rahmen; „nichts zu tun“ ist meist eine gute Nachricht.)
 */
function Empty({
  icon,
  accent,
  title,
  children,
}: {
  icon: React.ReactNode;
  accent: Accent;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-muted/50 px-4 py-4">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
          ACCENT[accent].tile,
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

/** Datumsfläche (Monat über Tag) zum schnellen Überfliegen von Terminlisten; der Text daneben nennt das Datum ausgeschrieben. */
function DateTile({ value, accent }: { value: Date | string; accent: Accent }) {
  const { day, month } = berlinParts(value);
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 flex-col items-center justify-center rounded-lg leading-none",
        ACCENT[accent].tile,
      )}
      aria-hidden="true"
    >
      <span className="text-xs font-semibold tracking-wider uppercase">
        {MONTH_NAMES[month - 1].slice(0, 3)}
      </span>
      <span className="mt-0.5 text-lg font-bold">{day}</span>
    </div>
  );
}

export function StaffingWarnings({
  warnings,
}: {
  warnings: NonNullable<DashboardData["shifts"]>["warnings"];
}) {
  if (warnings.length === 0) return null;
  return (
    <Alert variant="warning" className="mb-5">
      <TriangleAlertIcon />
      <AlertTitle className="text-base font-semibold">
        Helferschichten sind noch nicht besetzt
      </AlertTitle>
      <AlertDescription>
        <div className="mt-1">
          <ExpandableList className="grid gap-1" initial={2} itemNoun="weitere Termine">
            {warnings.map((event) => (
              <li key={event.eventId}>
                <Link
                  href={`/helferplanung/${event.eventId}`}
                  className="font-semibold underline underline-offset-4"
                >
                  {event.title}
                </Link>{" "}
                ({formatDateShort(event.startsAt)}): {event.openShifts}{" "}
                {event.openShifts === 1 ? "Schicht" : "Schichten"} nicht voll besetzt –{" "}
                {URGENCY_LABEL[event.worstUrgency].toLowerCase()}
              </li>
            ))}
          </ExpandableList>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function UpcomingEvents({ events }: { events: NonNullable<DashboardData["events"]> }) {
  return (
    <Widget
      id="w-termine"
      title="Kommende Veranstaltungen"
      icon={<CalendarDaysIcon />}
      accent="violet"
      more={{ href: "/kalender", label: "Zum Kalender" }}
    >
      {events.upcoming.length === 0 ? (
        <Empty icon={<CalendarCheckIcon />} accent="violet" title="Keine Termine in Sicht">
          Keine kommenden Veranstaltungen – neue erscheinen hier, sobald sie geplant sind.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={3} itemNoun="weitere Termine">
          {events.upcoming.map((event) => (
            <li
              key={event.id}
              className={cn("flex items-start gap-3 py-3 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={event.startsAt} accent="violet" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/veranstaltungen/${event.id}`}
                  className="grid gap-0.5 underline-offset-4 hover:underline"
                >
                  <span className="text-base font-semibold">{event.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatDateShort(event.startsAt)},{" "}
                    {event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt)} ·{" "}
                    {EVENT_TYPE_LABEL[event.type]}
                  </span>
                </Link>
                {event.shiftSummary.shifts > 0 &&
                  event.shiftSummary.filled < event.shiftSummary.required && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Helfer: {event.shiftSummary.filled} von {event.shiftSummary.required} besetzt
                    </p>
                  )}
              </div>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

export function MyShifts({ shifts }: { shifts: NonNullable<DashboardData["shifts"]> }) {
  return (
    <Widget
      id="w-meine-schichten"
      title="Meine Einsätze"
      icon={<HandHeartIcon />}
      accent="emerald"
      more={{ href: "/helferplanung", label: "Zur Helferplanung" }}
    >
      {shifts.mine.length === 0 ? (
        <Empty icon={<SmileIcon />} accent="emerald" title="Noch keine Einsätze">
          Du bist aktuell für keine Schicht eingetragen.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={3} itemNoun="weitere Einsätze">
          {shifts.mine.map((assignment) => (
            <li
              key={assignment.assignmentId}
              className={cn("flex items-start gap-3 py-3 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={assignment.startsAt} accent="emerald" />
              <Link
                href={`/helferplanung/${assignment.event.id}`}
                className="grid min-w-0 flex-1 gap-0.5 underline-offset-4 hover:underline"
              >
                <span className="text-base font-semibold">{assignment.title}</span>
                <span className="text-sm text-muted-foreground">
                  {assignment.event.title} · {formatDateShort(assignment.startsAt)},{" "}
                  {formatTimeRange(assignment.startsAt, assignment.endsAt)}
                </span>
              </Link>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

export function OpenShifts({ shifts }: { shifts: NonNullable<DashboardData["shifts"]> }) {
  return (
    <Widget
      id="w-offene-schichten"
      title="Hier werden Helfer gesucht"
      icon={<HandHeartIcon />}
      accent="amber"
      more={{ href: "/helferplanung", label: "Alle offenen Schichten" }}
    >
      {shifts.open.length === 0 ? (
        <Empty icon={<PartyPopperIcon />} accent="emerald" title="Alle Schichten besetzt">
          Im Moment sind alle Schichten besetzt. Danke!
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={3} itemNoun="weitere Schichten">
          {shifts.open.map((shift) => (
            <li
              key={shift.shiftId}
              className={cn("grid gap-2 py-3 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/helferplanung/${shift.event.id}`}
                    className="text-base font-semibold underline-offset-4 hover:underline"
                  >
                    {shift.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {shift.event.title} · {formatDateShort(shift.startsAt)},{" "}
                    {formatTimeRange(shift.startsAt, shift.endsAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <UrgencyBadge health={shift.health} />
                  {shift.signup.allowed && (
                    <QuickSignUpButton shiftId={shift.shiftId} eventId={shift.event.id} />
                  )}
                </div>
              </div>
              <FillBar filled={shift.filled} required={shift.requiredCount} health={shift.health} />
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

type MyTask = NonNullable<DashboardData["tasks"]>["mine"][number];

/** Zeilenfarbe: Überfällig = rötlich, hohe Priorität = bernsteinfarben. Der Grund steht immer auch als Text in der Zeile. */
function taskRowTone(task: MyTask): string {
  if (task.overdue) return "border-red-300 bg-red-50 dark:border-red-400/30 dark:bg-red-400/10";
  if (task.priority === "URGENT" || task.priority === "HIGH") {
    return "border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10";
  }
  return "bg-muted/40";
}

export function MyTasks({
  tasks,
  organizer,
}: {
  tasks: NonNullable<DashboardData["tasks"]>;
  organizer: boolean;
}) {
  const sorted = sortByImportance(tasks.mine);
  return (
    <Widget
      id="w-aufgaben"
      title="Meine Aufgaben"
      icon={<ListChecksIcon />}
      accent="blue"
      emphasis={sorted.length > 0}
      description={
        organizer
          ? `Im Verein: ${tasks.stats.open} offen, ${tasks.stats.overdue} überfällig`
          : undefined
      }
      more={{ href: "/aufgaben", label: "Alle Aufgaben" }}
    >
      {sorted.length === 0 ? (
        <Empty icon={<CircleCheckBigIcon />} accent="blue" title="Alles erledigt">
          Dir sind keine offenen Aufgaben zugewiesen.
        </Empty>
      ) : (
        <ExpandableList className="grid gap-2.5" initial={3} itemNoun="weitere Aufgaben">
          {sorted.map((task) => (
            <li
              key={task.id}
              className={cn(
                "flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 transition-shadow hover:shadow-sm motion-reduce:transition-none",
                taskRowTone(task),
              )}
            >
              <div className="min-w-0">
                <Link
                  href="/aufgaben"
                  className="text-base font-semibold underline-offset-4 hover:underline"
                >
                  {task.title}
                </Link>
                {task.dueDate && (
                  <p
                    className={cn(
                      "text-sm",
                      task.overdue
                        ? "font-semibold text-red-700 dark:text-red-300"
                        : "text-muted-foreground",
                    )}
                  >
                    Fällig: {formatCalendarDate(task.dueDate)}
                    {task.overdue ? " – überfällig" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <TaskPriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
              </div>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

export function LatestNotifications({
  notifications,
}: {
  notifications: DashboardData["notifications"];
}) {
  return (
    <Widget
      id="w-benachrichtigungen"
      title="Benachrichtigungen"
      icon={<BellIcon />}
      accent="amber"
      more={{ href: "/benachrichtigungen", label: "Alle Benachrichtigungen" }}
    >
      {notifications.latest.length === 0 ? (
        <Empty icon={<BellOffIcon />} accent="amber" title="Nichts Neues">
          Neue Benachrichtigungen erscheinen hier.
        </Empty>
      ) : (
        <ExpandableList className="grid gap-2" initial={3} itemNoun="weitere">
          {notifications.latest.map((n) => (
            <li key={n.id}>
              <Link
                href={n.linkUrl ?? "/benachrichtigungen"}
                className={cn(
                  "grid gap-0.5 rounded-lg px-3 py-2.5 underline-offset-4 hover:underline",
                  n.readAt ? "hover:bg-muted" : "bg-primary/10 hover:bg-primary/15",
                )}
              >
                <span className={cn("text-base", !n.readAt && "font-semibold")}>
                  {!n.readAt && (
                    <span
                      className="mr-2 inline-block size-2.5 rounded-full bg-primary align-middle"
                      aria-hidden="true"
                    />
                  )}
                  {!n.readAt && <span className="sr-only">Ungelesen: </span>}
                  {n.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(n.createdAt)} Uhr
                </span>
              </Link>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

const inDaysLabel = (days: number) =>
  days === 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`;

export function Birthdays({ birthdays }: { birthdays: NonNullable<DashboardData["birthdays"]> }) {
  return (
    <Widget
      id="w-geburtstage"
      title="Geburtstage"
      icon={<CakeIcon />}
      accent="rose"
      description="In den nächsten 14 Tagen"
    >
      {birthdays.length === 0 ? (
        <Empty icon={<GiftIcon />} accent="rose" title="Keine Geburtstage">
          Niemand feiert in diesem Zeitraum.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={3} itemNoun="weitere">
          {birthdays.map((b) => (
            <li
              key={b.memberId}
              className={cn(
                "flex flex-wrap items-baseline justify-between gap-x-3 py-2.5 first:pt-0 last:pb-0",
                LIST_ROW,
              )}
            >
              <Link
                href={`/mitglieder/${b.memberId}`}
                className="text-base font-semibold underline-offset-4 hover:underline"
              >
                {b.name}
              </Link>
              <span className="text-sm text-muted-foreground">
                wird {b.turns} · {formatDateShort(b.date)} ({inDaysLabel(b.inDays)})
              </span>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

const actorName = (actor: NonNullable<DashboardData["activity"]>[number]["actor"]) =>
  actor.kind === "USER" ? actor.name : actor.kind === "SYSTEM" ? "System" : "Unbekannt";

/** Die letzten Ereignisse im Verein – nur für Rollen mit Zugriff auf das Änderungsprotokoll (Anmeldungen zählen nicht). */
export function RecentActivity({ entries }: { entries: NonNullable<DashboardData["activity"]> }) {
  return (
    <Widget
      id="w-aktivitaeten"
      title="Letzte Aktivitäten"
      icon={<HistoryIcon />}
      accent="slate"
      more={{ href: "/protokoll", label: "Zum Änderungsprotokoll" }}
    >
      {entries.length === 0 ? (
        <Empty icon={<HistoryIcon />} accent="slate" title="Noch nichts passiert">
          Änderungen im Verein erscheinen hier.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={4} itemNoun="weitere">
          {entries.map((entry) => {
            const label = auditActionLabel(entry.action);
            // Der Text dahinter nennt Näheres (z. B. den Namen); wiederholt er nur die Überschrift, entfällt er.
            const detail = entry.summary?.trim();
            return (
              <li key={entry.id} className="grid gap-0.5 py-3 first:pt-0 last:pb-0">
                <span className="text-base font-semibold">{label}</span>
                {detail && detail !== label && (
                  <span className="line-clamp-2 text-sm text-muted-foreground">{detail}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  {actorName(entry.actor)} · {formatDateTime(entry.createdAt)} Uhr
                </span>
              </li>
            );
          })}
        </ExpandableList>
      )}
    </Widget>
  );
}

/** Kompakt für die Kennzahlenkarte: "4,5 Std." statt "4 Std. 30 Min." (die genaue Dauer steht im Hinweis). */
const compactHours = (minutes: number) =>
  `${(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`;

export function HelperHours({ hours }: { hours: NonNullable<DashboardData["shifts"]>["hours"] }) {
  return (
    <StatCard
      label={
        hours.scope === "ALL" ? `Helferstunden ${hours.year}` : `Meine Helferstunden ${hours.year}`
      }
      value={compactHours(hours.minutes)}
      hint={`${formatDuration(hours.minutes)} · ${hours.scope === "ALL" ? "vereinsweit dokumentiert" : "dokumentierte Einsätze"}`}
      href="/helferplanung/stunden"
      icon={<ClockIcon />}
      trend={hours.trend}
    />
  );
}

export { ToneBadge };
