import Link from "next/link";
import {
  ArrowRightIcon,
  AwardIcon,
  BellOffIcon,
  CakeIcon,
  CircleCheckBigIcon,
  FaceSlightlySmilingIcon,
  GiftIcon,
  PartyPopperIcon,
  TelescopeIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCENT, type Accent } from "@/components/shared/accent";
import { AREA_ICON } from "@/components/shared/area-icons";
import { CountUp } from "@/components/shared/count-up";
import { ExpandableList } from "@/components/shared/expandable-list";
import { TaskPriorityBadge, TaskStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { yearsLabel } from "@/lib/anniversaries";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  MONTH_NAMES,
  berlinParts,
  formatCalendarDate,
  formatDateShort,
  formatDateTime,
  formatEuroFromCents,
  formatTimeRange,
  inDaysLabel,
} from "@/lib/dates";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import { URGENCY_LABEL } from "@/lib/shift-health";
import { cn } from "@/lib/utils";
import { MarkPaidButton } from "@/modules/finance/components/mark-paid-button";
import { dueText } from "@/modules/finance/invoice-format";
import { QuickSignUpButton } from "@/modules/shifts/components/quick-actions";
import { FillBar, UrgencyBadge } from "@/modules/shifts/components/shift-status";
import { DEFAULT_BLOCK_SIZE, initialRows, type BlockSize } from "../layout-prefs";
import type { DashboardData } from "../service";
import { sortByImportance, taskRank } from "../task-order";

/**
 * Zeilen in Listenkarten (Termine, Einsätze, Geburtstage, offene Schichten): Beim Überfahren hellt die ganze Zeile sich
 * leicht auf, nicht nur der Link-Text – das macht die Zeile als Ganzes als Bedienelement erkennbar. Der negative Rand zieht
 * die Zeile bis an den Kartenrand; die Karte selbst schneidet das (`overflow-hidden`) wieder passend zur Rundung ab.
 */
const LIST_ROW =
  "-mx-(--card-spacing) px-(--card-spacing) transition-colors motion-reduce:transition-none hover:bg-muted/50";

/**
 * Maße der Inhaltskarten je eigener Größe („Anpassen“). „Mittel“ (Standard) ist seit 02.10.2026 etwas enger als zuerst
 * (Innenabstand 20 statt 24 px, auf Wunsch „ein bisschen zu groß“); „Groß“ hat die ursprüngliche Luft.
 */
const WIDGET_SIZE: Record<
  BlockSize,
  { card: string; chip: string; title: string; content: string }
> = {
  s: {
    card: "[--card-spacing:--spacing(4)]",
    chip: "size-7 rounded-md [&_svg]:size-4",
    title: "text-base",
    content: "gap-3",
  },
  m: {
    card: "[--card-spacing:--spacing(5)]",
    chip: "size-8 rounded-lg [&_svg]:size-4",
    title: "",
    content: "gap-4",
  },
  l: {
    card: "[--card-spacing:--spacing(6)]",
    chip: "size-9 rounded-lg [&_svg]:size-5",
    title: "",
    content: "gap-4",
  },
};

export function Widget({
  id,
  title,
  icon,
  accent,
  description,
  children,
  more,
  action,
  emphasis = false,
  size = DEFAULT_BLOCK_SIZE,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  accent: Accent;
  description?: string;
  children: React.ReactNode;
  more?: { href: string; label: string };
  /** Kleine Aktion rechts im Kopf der Karte (z. B. „Ausblenden“). */
  action?: React.ReactNode;
  /** Hebt die Karte als „hier ist etwas zu tun“ hervor (Symbolfläche in der Markenfarbe). */
  emphasis?: boolean;
  /** Eigene Größe („Anpassen“): Klein enger und mit kleinerem Kopf, Groß mit mehr Luft (und über die volle Breite, `CardGrid`). */
  size?: BlockSize;
}) {
  const dims = WIDGET_SIZE[size];
  return (
    <section aria-labelledby={id} className="h-full">
      {/* Seit 17.10.2026 (Entwurf 4) eine schlichte weiße Karte wie überall in der Anwendung (Finanzen, Mitglieder …) – keine
          getönten Kacheln mehr: Farbe tragen nur die Kennzahlen oben und, was etwas bedeutet (überfällig, ungelesen). */}
      <Card className={cn("h-full", dims.card)}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex shrink-0 items-center justify-center",
                dims.chip,
                emphasis ? "bg-primary text-primary-foreground" : ACCENT[accent].tile,
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              {/* Ebene 3: Die Gruppen des Dashboards („Für dich“, „Anstehend“ …) tragen die Ebene-2-Überschriften. */}
              <CardTitle id={id} role="heading" aria-level={3} className={dims.title}>
                {title}
              </CardTitle>
              {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
            </div>
            {action && <div className="shrink-0 self-start">{action}</div>}
          </div>
        </CardHeader>
        <CardContent className={cn("flex flex-1 flex-col", dims.content)}>
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

/** Datumsfläche (Monat über Tag) zum schnellen Überfliegen von Terminlisten; der Text daneben nennt das Datum ausgeschrieben. */
function DateTile({ value, accent }: { value: Date | string; accent: Accent }) {
  const { day, month } = berlinParts(value);
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none",
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

/**
 * Leerer Inhalt einer Dashboard-Karte als eine ruhige Zeile (Entwurf 4): kleines Symbol, kurzer fetter Satz, Erklärung dahinter
 * – statt eines grauen Kastens, der die Karte hoch und leer wirken ließ. Meist ist „nichts da“ eine gute Nachricht.
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
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5",
          ACCENT[accent].tile,
        )}
      >
        {icon}
      </span>
      <p className="min-w-0 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{title}.</span> {children}
      </p>
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
    // Bernsteinfarbener Hinweis mit Warnsymbol und Pfeil zur Helferplanung – seit 17.10.2026 ohne Streifen und Schein, in der
    // Rundung der übrigen Karten. Die Rolle `alert` (Screenreader) und der Text bleiben wie bisher.
    <Alert
      variant="warning"
      className="relative grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 rounded-xl border border-amber-300/70 bg-amber-50 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] dark:border-amber-400/25 dark:bg-amber-500/10"
    >
      <span
        aria-hidden="true"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 [&_svg]:size-5"
      >
        <TriangleAlertIcon />
      </span>
      <div className="relative min-w-0">
        <AlertTitle className="text-base font-semibold">
          Helferschichten sind noch nicht besetzt
        </AlertTitle>
        <AlertDescription className="text-foreground/80">
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
      </div>
      <Link
        href="/helferplanung"
        aria-label="Zur Helferplanung"
        className="relative hidden size-10 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-amber-950 transition-colors hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none sm:flex"
      >
        <ArrowRightIcon className="size-5" aria-hidden="true" />
      </Link>
    </Alert>
  );
}

export function UpcomingEvents({
  events,
  size = DEFAULT_BLOCK_SIZE,
}: {
  events: NonNullable<DashboardData["events"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-termine"
      size={size}
      title="Kommende Veranstaltungen"
      icon={<AREA_ICON.veranstaltungen />}
      accent="violet"
      more={{ href: "/kalender", label: "Zum Kalender" }}
    >
      {events.upcoming.length === 0 ? (
        <Empty icon={<TelescopeIcon />} accent="violet" title="Keine Termine in Sicht">
          Keine kommenden Veranstaltungen – neue erscheinen hier, sobald sie geplant sind.
        </Empty>
      ) : (
        <ExpandableList
          className="divide-y"
          initial={initialRows(size, 3)}
          itemNoun="weitere Termine"
        >
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

export function MyShifts({
  shifts,
  size = DEFAULT_BLOCK_SIZE,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-meine-schichten"
      size={size}
      title="Meine Einsätze"
      icon={<AREA_ICON.einsaetze />}
      accent="emerald"
      more={{ href: "/helferplanung", label: "Zur Helferplanung" }}
    >
      {shifts.mine.length === 0 ? (
        <Empty icon={<FaceSlightlySmilingIcon />} accent="emerald" title="Noch keine Einsätze">
          Du bist aktuell für keine Schicht eingetragen.
        </Empty>
      ) : (
        <ExpandableList
          className="divide-y"
          initial={initialRows(size, 3)}
          itemNoun="weitere Einsätze"
        >
          {shifts.mine.map((assignment) => (
            <li
              key={assignment.assignmentId}
              className={cn("flex items-start gap-3 py-3 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={assignment.startsAt} accent="emerald" />
              <Link
                href={`/helferplanung/${assignment.event.id}?schicht=${assignment.shiftId}`}
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

export function OpenShifts({
  shifts,
  size = DEFAULT_BLOCK_SIZE,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-offene-schichten"
      size={size}
      title="Hier werden Helfer gesucht"
      icon={<AREA_ICON.helferplanung />}
      accent="amber"
      more={{ href: "/helferplanung", label: "Alle Schichten in der Helferplanung" }}
    >
      {shifts.open.length === 0 ? (
        <Empty icon={<PartyPopperIcon />} accent="emerald" title="Alle Schichten besetzt">
          Im Moment sind alle Schichten besetzt. Danke.
        </Empty>
      ) : (
        <ExpandableList
          className="divide-y"
          initial={initialRows(size, 3)}
          itemNoun="weitere Schichten"
        >
          {shifts.open.map((shift) => (
            <li
              key={shift.shiftId}
              className={cn(
                "grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-x-4",
                LIST_ROW,
              )}
            >
              <div className="min-w-0 sm:col-span-2">
                {/* Abzeichen („Beginnt bald“) in der Zeile des Schichtnamens – so steht „Eintragen“ unten immer an
                    derselben Stelle, mit oder ohne Abzeichen. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/helferplanung/${shift.event.id}?schicht=${shift.shiftId}`}
                    className="text-base font-semibold underline-offset-4 hover:underline"
                  >
                    {shift.title}
                  </Link>
                  <UrgencyBadge health={shift.health} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {shift.event.title} · {formatDateShort(shift.startsAt)},{" "}
                  {formatTimeRange(shift.startsAt, shift.endsAt)}
                </p>
              </div>
              <FillBar filled={shift.filled} required={shift.requiredCount} health={shift.health} />
              {/* Am Handy unter dem Besetzungsbalken so breit wie die Karte (gut treffbar), ab 640 px rechts daneben – die Zeile
                  wird kürzer, und die Karte steht nicht mehr viel höher als ihre Nachbarin. */}
              {shift.signup.allowed && (
                <QuickSignUpButton
                  shiftId={shift.shiftId}
                  eventId={shift.event.id}
                  size="default"
                  className="w-full sm:w-auto"
                />
              )}
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

type OpenInvoiceRow = NonNullable<DashboardData["payments"]>["items"][number];
type Payments = NonNullable<DashboardData["payments"]>;

const dueSoon = (invoice: OpenInvoiceRow) =>
  !invoice.overdue && invoice.dueInDays !== null && invoice.dueInDays <= 1;

/**
 * Die offenen Rechnungen als Liste (dringendste zuerst) – überfällige rötlich, heute/morgen fällige bernsteinfarben, der Grund
 * steht immer auch als Text da. „Bezahlt“ (nur mit `finance:manage`) markiert eine Rechnung als bezahlt; die Meldung bietet
 * „Rückgängig“ an. `initial`: so viele stehen zuerst da, der Rest hinter „weitere anzeigen“.
 */
function InvoiceList({
  payments,
  initial,
  compact = false,
}: {
  payments: Payments;
  initial: number;
  /** In der schmalen Kachel: Knopf unter dem Namen statt daneben. */
  compact?: boolean;
}) {
  return (
    <ExpandableList
      className="grid gap-2.5"
      initial={initial}
      itemNoun={payments.items.length === initial + 1 ? "weitere Rechnung" : "weitere Rechnungen"}
    >
      {payments.items.map((invoice) => {
        const due = dueText(invoice.dueInDays);
        return (
          <li
            key={invoice.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border p-3",
              invoice.overdue
                ? "border-red-300 bg-red-50 dark:border-red-400/30 dark:bg-red-400/10"
                : dueSoon(invoice)
                  ? "border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10"
                  : "bg-muted/40",
            )}
          >
            <div className="min-w-0">
              {invoice.canOpen ? (
                <a
                  href={`/api/dokumente/${invoice.documentId}/download`}
                  className="font-semibold break-words underline-offset-4 hover:underline"
                >
                  {invoice.name}
                </a>
              ) : (
                <span className="font-semibold break-words">{invoice.name}</span>
              )}
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">
                  {invoice.amountCents !== null
                    ? formatEuroFromCents(invoice.amountCents)
                    : "Betrag fehlt"}
                </span>
                {invoice.dueDate && (
                  <span
                    className={cn(
                      invoice.overdue && "font-semibold text-red-700 dark:text-red-300",
                      dueSoon(invoice) && "font-semibold text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {" "}
                    · Fällig: {formatCalendarDate(invoice.dueDate)}
                    {due ? ` – ${due}` : ""}
                  </span>
                )}
              </p>
            </div>
            {payments.canManage && (
              <MarkPaidButton
                invoiceId={invoice.id}
                name={invoice.name}
                className={compact ? "w-full" : "w-full sm:w-auto"}
              />
            )}
          </li>
        );
      })}
    </ExpandableList>
  );
}

/** Summe der offenen Rechnungen – groß wie eine Kennzahl, mit Anzahl und Überfälligem darunter. */
function PaymentsSum({ payments, className }: { payments: Payments; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}>
      <span className="text-3xl leading-tight font-bold tracking-tight tabular-nums">
        <CountUp value={payments.totalCents} kind="euro" />
      </span>
      <span className="text-sm text-muted-foreground">
        offen in {payments.count} {payments.count === 1 ? "Rechnung" : "Rechnungen"}
      </span>
      {payments.overdueCount > 0 && (
        <span className="text-sm font-semibold text-red-700 dark:text-red-300">
          {payments.overdueCount} überfällig
        </span>
      )}
    </p>
  );
}

const ALL_INVOICES = { href: "/finanzen/rechnungen?stand=offen", label: "Alle offenen Rechnungen" };

/**
 * Offene Zahlungen (nur für Rollen mit `finance:read`): oben die Summe, darunter die offenen Rechnungen. Als eigene Karte
 * unter den Kennzahlen – im Kachelraster steht stattdessen `PaymentsTile`.
 */
export function OpenPayments({
  payments,
  size = DEFAULT_BLOCK_SIZE,
}: {
  payments: Payments;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-offene-zahlungen"
      size={size}
      title="Offene Zahlungen"
      icon={<AREA_ICON.finanzen />}
      accent="teal"
      emphasis={payments.overdueCount > 0}
      description="Rechnungen, die der Verein noch bezahlen muss"
      more={payments.count > 0 ? ALL_INVOICES : undefined}
    >
      {payments.count === 0 ? (
        <Empty icon={<CircleCheckBigIcon />} accent="teal" title="Alles bezahlt">
          Es gibt keine offenen Rechnungen.
        </Empty>
      ) : (
        // Ab 1024 px: links die Summe als große Zahl (wie bei den Kennzahlen), rechts die Rechnungen.
        <div className="grid gap-4 lg:grid-cols-[minmax(13rem,1fr)_minmax(0,2.2fr)] lg:items-start lg:gap-8">
          <PaymentsSum
            payments={payments}
            className="lg:flex-col lg:items-start lg:gap-y-1 lg:self-stretch lg:border-r lg:pr-8"
          />
          <div className="grid min-w-0 gap-3">
            <InvoiceList payments={payments} initial={initialRows(size, 3)} />
            {payments.count > payments.items.length && (
              <p className="text-sm text-muted-foreground">
                Hier stehen die {payments.items.length} dringendsten von {payments.count} – die
                übrigen findest du unter „Alle offenen Rechnungen“.
              </p>
            )}
          </div>
        </div>
      )}
    </Widget>
  );
}

/**
 * Offene Zahlungen als fünfte Kachel im Kachelraster der Kennzahlen (Entwurf 4, 17.10.2026): weiß zwischen den Farbkarten,
 * damit Geld nicht wie eine weitere Statistik aussieht. Summe groß, darunter die dringendste Rechnung mit „Bezahlt“ – die
 * übrigen hinter „weitere anzeigen“ (nichts geht verloren). Dieselbe Region „Offene Zahlungen“ wie die Karte; ob sie hier
 * oder als Karte steht, entscheidet die Seite (ausgeblendet über „Anpassen“ fehlt sie hier wie dort).
 */
export function PaymentsTile({ payments }: { payments: Payments }) {
  return (
    <section
      aria-labelledby="w-offene-zahlungen-kachel"
      data-slot="card"
      className="flex h-full flex-col gap-3 rounded-2xl bg-card p-5 text-card-foreground shadow-sm ring-1 ring-foreground/10 dark:ring-foreground/15"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
            payments.overdueCount > 0 ? "bg-primary text-primary-foreground" : ACCENT.teal.tile,
          )}
        >
          <AREA_ICON.finanzen />
        </span>
        <h3 id="w-offene-zahlungen-kachel" className="text-sm leading-snug font-semibold">
          Offene Zahlungen
        </h3>
      </div>
      {payments.count === 0 ? (
        <Empty icon={<CircleCheckBigIcon />} accent="teal" title="Alles bezahlt">
          Es gibt keine offenen Rechnungen.
        </Empty>
      ) : (
        <>
          <PaymentsSum payments={payments} />
          <InvoiceList payments={payments} initial={1} compact />
          <Link
            href={ALL_INVOICES.href}
            className="group mt-auto inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {ALL_INVOICES.label}
            <ArrowRightIcon
              className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Link>
        </>
      )}
    </section>
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
  size = DEFAULT_BLOCK_SIZE,
}: {
  tasks: NonNullable<DashboardData["tasks"]>;
  organizer: boolean;
  size?: BlockSize;
}) {
  const sorted = sortByImportance(tasks.mine);
  // Hervorhebung nur, wenn wirklich etwas drängt (überfällig/dringend/hoch) – sonst verliert sie ihre Bedeutung.
  const urgent = sorted.some((task) => taskRank(task) <= 2);
  return (
    <Widget
      id="w-aufgaben"
      size={size}
      title="Meine Aufgaben"
      icon={<AREA_ICON.aufgaben />}
      accent="blue"
      emphasis={urgent}
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
        <ExpandableList
          className="grid gap-2.5"
          initial={initialRows(size, 3)}
          itemNoun="weitere Aufgaben"
        >
          {sorted.map((task) => (
            <li
              key={task.id}
              className={cn(
                "flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3 transition-shadow hover:shadow-sm motion-reduce:transition-none",
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
  size = DEFAULT_BLOCK_SIZE,
}: {
  notifications: DashboardData["notifications"];
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-benachrichtigungen"
      size={size}
      title="Benachrichtigungen"
      icon={<AREA_ICON.benachrichtigungen />}
      accent="amber"
      more={{ href: "/benachrichtigungen", label: "Alle Benachrichtigungen" }}
    >
      {notifications.latest.length === 0 ? (
        <Empty icon={<BellOffIcon />} accent="amber" title="Nichts Neues">
          Neue Benachrichtigungen erscheinen hier.
        </Empty>
      ) : (
        <ExpandableList className="grid gap-2" initial={initialRows(size, 3)} itemNoun="weitere">
          {notifications.latest.map((n) => (
            <li key={n.id}>
              <Link
                href={n.linkUrl ?? "/benachrichtigungen"}
                className={cn(
                  "grid gap-0.5 rounded-xl px-3 py-2.5 underline-offset-4 hover:underline",
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

export function Birthdays({
  birthdays,
  size = DEFAULT_BLOCK_SIZE,
}: {
  birthdays: NonNullable<DashboardData["birthdays"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-geburtstage"
      size={size}
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
        <ExpandableList className="divide-y" initial={initialRows(size, 3)} itemNoun="weitere">
          {birthdays.map((b) => (
            <li
              key={b.memberId}
              className={cn("flex items-center gap-3 py-2.5 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={b.date} accent="rose" />
              <div className="grid min-w-0 gap-0.5">
                <Link
                  href={`/mitglieder/${b.memberId}`}
                  className="text-base font-semibold underline-offset-4 hover:underline"
                >
                  {b.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  wird {b.turns} ·{" "}
                  <span className="whitespace-nowrap">
                    {formatDateShort(b.date)} ({inDaysLabel(b.inDays)})
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

/**
 * Runde Mitgliedsjubiläen der nächsten 60 Tage (höchstens fünf) – aufgebaut wie „Geburtstage“: Datumsfläche, Name, Stufe und
 * Tag. Die vollständige Liste eines Jahres (zum Drucken und Exportieren) steht unter „Ehrungen“.
 */
export function Anniversaries({
  anniversaries,
  size = DEFAULT_BLOCK_SIZE,
}: {
  anniversaries: NonNullable<DashboardData["anniversaries"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-jubilaeen"
      size={size}
      title="Jubiläen"
      icon={<AwardIcon />}
      accent="blue"
      description="Runde Mitgliedsjubiläen in den nächsten 60 Tagen"
      more={{ href: "/mitglieder/ehrungen", label: "Alle Ehrungen" }}
    >
      {anniversaries.length === 0 ? (
        <Empty icon={<AwardIcon />} accent="blue" title="Keine Jubiläen">
          In den nächsten 60 Tagen hat niemand ein rundes Mitgliedsjubiläum.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={initialRows(size, 3)} itemNoun="weitere">
          {anniversaries.map((a) => (
            <li
              key={a.memberId}
              className={cn("flex items-center gap-3 py-2.5 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={a.date} accent="blue" />
              <div className="grid min-w-0 gap-0.5">
                <Link
                  href={`/mitglieder/${a.memberId}`}
                  className="text-base font-semibold underline-offset-4 hover:underline"
                >
                  {a.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {yearsLabel(a.years)} Mitglied ·{" "}
                  <span className="whitespace-nowrap">
                    {formatDateShort(a.date)} ({inDaysLabel(a.inDays)})
                  </span>
                </span>
              </div>
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
export function RecentActivity({
  entries,
  size = DEFAULT_BLOCK_SIZE,
}: {
  entries: NonNullable<DashboardData["activity"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-aktivitaeten"
      size={size}
      title="Letzte Aktivitäten"
      icon={<AREA_ICON.protokoll />}
      accent="slate"
      more={{ href: "/protokoll", label: "Zum Änderungsprotokoll" }}
    >
      {entries.length === 0 ? (
        <Empty icon={<AREA_ICON.protokoll />} accent="slate" title="Noch nichts passiert">
          Änderungen im Verein erscheinen hier.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={initialRows(size, 4)} itemNoun="weitere">
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

export { ToneBadge };
