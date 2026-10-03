import type { ReactNode } from "react";
import {
  type LucideIcon,
  CalendarDaysIcon,
  CheckIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PenLineIcon,
  PhoneIcon,
  UserIcon,
} from "lucide-react";
import { clubInitials } from "@/lib/club-logo";
import {
  WEEKDAY_SHORT,
  berlinWeekday,
  formatDateLong,
  formatDateShort,
  formatTime,
  formatTimeRange,
} from "@/lib/dates";
import type { PrintOrientation } from "@/lib/print";
import { cn } from "@/lib/utils";
import {
  type PrintContent,
  eventSpansDays,
  freePlaces,
  needRows,
  openPlaces,
  shiftDays,
  shiftEndLabel,
  signUpPlaces,
  slotsOf,
} from "@/modules/shifts/print-plan";
import type { PrintPlanEvent, PrintShiftDto } from "@/modules/shifts/service";

/**
 * Der Helferplan als Papier (seit 03.10.2026, Entwurf 2 „Aushang zum Eintragen“): je Veranstaltung ein **Aushang** fürs
 * Schwarze Brett – großer Titel, Kasten „Wir brauchen noch N Helfer“, eine Kachel je Schicht mit Namen und Schreiblinien
 * für freie Plätze – und eine **Anwesenheitsliste** für die Verantwortlichen zum Abhaken vor Ort. Nur Namen, nie
 * Kontaktdaten der Helfer (Ansprechpartner der Veranstaltung ja – der steht ohnehin öffentlich am Termin).
 *
 * Maße in mm und pt statt rem: Die Vorschau am Bildschirm soll genau so umbrechen wie das Papier, unabhängig von der mit dem
 * Fenster wachsenden Grundschrift. Spalten richten sich nach der Breite des Blatts (Containerabfragen `/blatt`): auf A4 hoch
 * zwei Kacheln nebeneinander, quer drei, am Handy eine. Eine Akzentfarbe (Orange 700) mit sehr heller Tönung – im
 * Schwarz-Weiß-Druck bleibt alles über Form erkennbar (Stempel, kräftiger Rand, Schild).
 */

const STEPS = [
  "Freie Zeile bei deiner Wunschschicht suchen.",
  "Vor- und Nachnamen gut lesbar eintragen.",
  "Pünktlich am Treffpunkt sein.",
] as const;

/** Breite, ab der das Blatt zwei bzw. drei Spalten trägt (A4 hoch hat 182 mm Inhalt, quer 269 mm). */
const TWO_COLUMNS = "@min-[150mm]/blatt:grid-cols-2";
const THREE_COLUMNS = "@min-[230mm]/blatt:grid-cols-3";

const locationOf = (event: PrintPlanEvent) =>
  [event.locationName, event.address].filter(Boolean).join(", ");

export function ShiftPlanSheets({
  events,
  clubName,
  logoUrl,
  orientation,
  content,
  generatedAtLabel,
}: {
  events: PrintPlanEvent[];
  clubName: string;
  logoUrl: string | null;
  orientation: PrintOrientation;
  content: PrintContent;
  /** Bereits formatiert, z. B. „03.10.2026 14:32 Uhr“. */
  generatedAtLabel: string;
}) {
  const showPoster = content !== "anwesenheit";
  const showAttendance = content !== "aushang";
  const sheet = { clubName, orientation, generatedAtLabel };
  return (
    <div className="grid gap-8 print:block">
      {events.map((event, index) => {
        const titleId = `veranstaltung-${event.id}`;
        const days = shiftDays(event);
        return (
          <section key={event.id} aria-labelledby={titleId} className="grid gap-8 print:block">
            {showPoster && (
              <Sheet {...sheet} breakBefore={index > 0}>
                <Poster
                  event={event}
                  clubName={clubName}
                  logoUrl={logoUrl}
                  titleId={titleId}
                  days={days}
                />
              </Sheet>
            )}
            {showAttendance && (
              <Sheet {...sheet} breakBefore={showPoster || index > 0}>
                <Attendance
                  event={event}
                  titleId={showPoster ? null : titleId}
                  multiDay={days !== "none"}
                />
              </Sheet>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Ein Blatt: am Bildschirm weißes Papier (auch in der dunklen Darstellung – man sieht, was aus dem Drucker kommt) mit
 * angedeuteter Kopf- und Fußzeile; beim Drucken ohne Rahmen, Kopf und Fuß kommen dann aus `@page` (auf jeder Seite).
 */
function Sheet({
  clubName,
  orientation,
  generatedAtLabel,
  breakBefore,
  children,
}: {
  clubName: string;
  orientation: PrintOrientation;
  generatedAtLabel: string;
  breakBefore: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "@container/blatt mx-auto flex w-full flex-col rounded-xl bg-white px-4 py-5 text-[10pt] text-neutral-950 shadow-sm ring-1 ring-foreground/10 sm:px-[14mm] sm:py-[9mm]",
        orientation === "quer"
          ? "max-w-[297mm] sm:min-h-[210mm]"
          : "max-w-[210mm] sm:min-h-[297mm]",
        "print:min-h-0 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0",
        breakBefore && "print:break-before-page",
      )}
    >
      <div
        aria-hidden="true"
        className="mb-[4mm] flex justify-between gap-4 border-b-[0.2mm] border-neutral-300 pb-[1.5mm] text-[7.5pt] text-neutral-600 print:hidden"
      >
        <span className="font-semibold text-neutral-700">{clubName}</span>
        <span>Helferplan</span>
      </div>
      {children}
      <div aria-hidden="true" className="mt-auto pt-[6mm] print:hidden">
        <p className="border-t-[0.2mm] border-neutral-300 pt-[1.5mm] text-[7.5pt] text-neutral-600">
          Erstellt am {generatedAtLabel}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Aushang ----------------------------------------------------------------- */

function Poster({
  event,
  clubName,
  logoUrl,
  titleId,
  days,
}: {
  event: PrintPlanEvent;
  clubName: string;
  logoUrl: string | null;
  titleId: string;
  days: ReturnType<typeof shiftDays>;
}) {
  const open = openPlaces(event.shifts);
  const location = locationOf(event);
  return (
    <>
      <header className="grid gap-[5mm] @min-[150mm]/blatt:grid-cols-[1fr_64mm] @min-[150mm]/blatt:gap-x-[6mm] @min-[230mm]/blatt:grid-cols-[1fr_84mm]">
        <div className="flex min-w-0 flex-col">
          <ClubLine clubName={clubName} logoUrl={logoUrl} />
          <h2
            id={titleId}
            className="mt-[5mm] font-poster text-[28pt] leading-[0.95] font-bold tracking-tight break-words @min-[150mm]/blatt:text-[40pt]"
          >
            {event.title}
          </h2>
          <span
            aria-hidden="true"
            className="mt-[3mm] block h-[1.2mm] w-[22mm] rounded-full bg-orange-700"
          />
          <div className="mt-auto grid gap-[1.5mm] pt-[4mm]">
            <Fact icon={CalendarDaysIcon} big>
              <EventWhen event={event} />
            </Fact>
            {location && <Fact icon={MapPinIcon}>{location}</Fact>}
          </div>
        </div>
        <NeedBox shifts={event.shifts} open={open} days={days} />
      </header>

      <div className={cn("mt-[4.5mm] grid gap-[3mm]", TWO_COLUMNS, THREE_COLUMNS)}>
        {event.shifts.map((shift) => (
          <ShiftTile key={shift.id} shift={shift} multiDay={days !== "none"} />
        ))}
        <HowTo event={event} open={open} />
      </div>
    </>
  );
}

/** Datum und Uhrzeit im Kopf des Aushangs; mehrtägig mit beiden Tagen statt „Tag · Datum Zeit – Datum Zeit“. */
function EventWhen({ event }: { event: PrintPlanEvent }) {
  const day = (value: Date) => <b className="font-bold">{formatDateLong(value)}</b>;
  if (!eventSpansDays(event))
    return (
      <>
        {day(event.startsAt)} ·{" "}
        {event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt)}
      </>
    );
  if (event.allDay)
    return (
      <>
        {day(event.startsAt)} bis {day(event.endsAt)}
      </>
    );
  return (
    <>
      {day(event.startsAt)}, {formatTime(event.startsAt)} Uhr bis {day(event.endsAt)},{" "}
      {formatTime(event.endsAt)} Uhr
    </>
  );
}

function ClubLine({ clubName, logoUrl }: { clubName: string; logoUrl: string | null }) {
  return (
    <div className="flex items-center gap-[2.8mm]">
      {logoUrl ? (
        // Schlichtes <img> wie bisher: steht sofort im HTML (schnelles Drucken), schmückend – der Name steht daneben.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-[12mm] shrink-0 object-contain" />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-[12mm] shrink-0 place-items-center rounded-full border-[0.4mm] border-neutral-700 font-poster text-[10.5pt] font-bold text-neutral-700"
        >
          {clubInitials(clubName)}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[10.5pt] leading-tight font-bold break-words">{clubName}</p>
        <p className="text-[8.5pt] text-neutral-600">Helferplan</p>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  big = false,
  children,
}: {
  icon: LucideIcon;
  big?: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-[2.4mm]",
        big ? "text-[12.5pt] leading-tight" : "text-[10.5pt] leading-snug text-neutral-700",
      )}
    >
      <Icon aria-hidden="true" className="mt-[0.3em] size-[5mm] shrink-0 text-neutral-700" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * Kasten oben rechts: wie viele Helfer sich noch eintragen können, darunter je Schicht „N frei“, „voll“ oder
 * „geschlossen“ (Einteilung nur durch den Veranstalter).
 */
function NeedBox({
  shifts,
  open,
  days,
}: {
  shifts: PrintShiftDto[];
  open: number;
  days: ReturnType<typeof shiftDays>;
}) {
  const { shown, moreOpen, closedFree, withoutNeed } = needRows(shifts);
  // Freie Plätze gibt es auch dann noch, wenn man sich nirgends mehr eintragen kann (nur geschlossene Schichten).
  const anyFree = shifts.some((shift) => freePlaces(shift) > 0);
  // Liegen Schichten eine Woche oder mehr auseinander, steht das Datum unter dem Titel – als eigene Spalte ließe es dem
  // Titel zu wenig Platz.
  const stacked = days === "date";
  const footer = [
    moreOpen > 0 &&
      `+ ${moreOpen} ${moreOpen === 1 ? "weitere Schicht" : "weitere Schichten"} mit freien Plätzen`,
    closedFree > 0 && `${closedFree} ${closedFree === 1 ? "Schicht" : "Schichten"} geschlossen`,
    withoutNeed > 0 &&
      `${withoutNeed} ${withoutNeed === 1 ? "Schicht" : "Schichten"} ohne freie Plätze`,
  ].filter(Boolean);
  return (
    <div className="flex flex-col overflow-hidden rounded-[2.5mm] border-[0.5mm] border-orange-700 bg-white">
      <div className="border-b-[0.3mm] border-dashed border-orange-700 bg-orange-50 px-[3.5mm] pt-[2mm] pb-[1.8mm] text-center font-poster leading-tight">
        {open > 0 ? (
          <p>
            <span className="block text-[11pt] leading-tight font-semibold text-neutral-700">
              Wir brauchen noch
            </span>
            <span className="block text-[26pt] leading-none font-bold">
              <span className="text-orange-700">{open}</span> Helfer
            </span>
            <span className="block text-[11pt] leading-tight font-semibold text-neutral-700">
              – trag dich ein!
            </span>
          </p>
        ) : anyFree ? (
          <p>
            <span className="block text-[19pt] leading-none font-bold">Nichts zum Eintragen</span>
            <span className="mt-[1mm] block text-[11.5pt] leading-tight font-semibold text-neutral-700">
              Freie Plätze vergibt der Veranstalter.
            </span>
          </p>
        ) : (
          <p>
            <span className="block text-[19pt] leading-none font-bold">Alle Plätze besetzt</span>
            <span className="mt-[1mm] block text-[11.5pt] leading-tight font-semibold text-neutral-700">
              Danke an alle Helfer!
            </span>
          </p>
        )}
      </div>
      {anyFree && (
        <div className="px-[3.5mm] pt-[1.6mm] pb-[1.4mm]">
          <p className="mb-[0.4mm] text-[7.5pt] font-bold tracking-[0.1em] text-neutral-600 uppercase">
            Noch frei
          </p>
          <ul className="leading-tight">
            {shown.map((shift) => {
              const free = signUpPlaces(shift);
              const time = (
                <>
                  {days === "weekday" && `${WEEKDAY_SHORT[berlinWeekday(shift.startsAt)]} `}
                  {days === "date" && `${formatDateShort(shift.startsAt)} `}
                  {formatTime(shift.startsAt)}
                </>
              );
              return (
                <li
                  key={shift.id}
                  className={cn(
                    "grid items-baseline gap-x-[2.5mm] border-b-[0.2mm] border-dotted border-neutral-400 py-[0.6mm] text-[9pt] leading-tight last:border-b-0",
                    stacked
                      ? "grid-cols-[minmax(0,1fr)_auto]"
                      : "grid-cols-[minmax(0,1fr)_auto_auto]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[9.5pt] leading-tight break-words hyphens-auto",
                      free > 0 ? "font-bold" : "font-semibold text-neutral-600",
                    )}
                  >
                    {shift.title}
                    {stacked && (
                      <span className="block text-[8pt] font-normal whitespace-nowrap text-neutral-600">
                        {time}
                      </span>
                    )}
                  </span>
                  {!stacked && (
                    <span className="text-[8pt] whitespace-nowrap text-neutral-600">{time}</span>
                  )}
                  <span className="min-w-[12mm] text-right font-poster leading-none whitespace-nowrap">
                    {free > 0 ? (
                      <>
                        <span className="text-[12.5pt] leading-none font-bold">{free}</span>
                        <span className="ml-[0.5mm] text-[8.5pt] font-semibold">frei</span>
                      </>
                    ) : shift.closed && freePlaces(shift) > 0 ? (
                      <span className="inline-flex items-center gap-[0.8mm] text-[9pt] font-semibold text-neutral-600">
                        <LockIcon aria-hidden="true" className="size-[3mm]" />
                        geschlossen
                      </span>
                    ) : shift.requiredCount === 0 ? (
                      <span className="text-[9pt] font-semibold text-neutral-600">–</span>
                    ) : (
                      <span className="inline-flex items-center gap-[0.8mm] text-[9pt] font-semibold text-neutral-600">
                        <CheckIcon aria-hidden="true" className="size-[3mm]" />
                        voll
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {footer.length > 0 && (
            <p className="mt-[0.6mm] text-[8pt] leading-snug text-neutral-600">
              {footer.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Kachel einer Schicht: links groß die Uhrzeit und der Stand, rechts Titel, Aufgabe, Treffpunkt; darunter die Plätze –
 * Namen und für jeden freien Platz eine Schreiblinie. Geschlossene Schichten bekommen keine Schreiblinien (dort teilt
 * nur der Veranstalter ein), sondern einen Hinweis.
 */
function ShiftTile({ shift, multiDay }: { shift: PrintShiftDto; multiDay: boolean }) {
  const free = freePlaces(shift);
  const open = signUpPlaces(shift);
  const empty = shift.requiredCount > 0 && shift.filled === 0 && !shift.closed;
  const slots = slotsOf(shift);
  const lines = shift.closed ? slots.filter((name) => name !== null) : slots;
  const headingId = `schicht-${shift.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "flex break-inside-avoid flex-col overflow-hidden rounded-[2.5mm]",
        empty
          ? "border-[0.55mm] border-orange-700"
          : open > 0
            ? "border-[0.45mm] border-neutral-700"
            : "border-[0.3mm] border-neutral-400",
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[auto_1fr] gap-x-[3mm] border-b-[0.25mm] border-neutral-300 px-[3.2mm] pt-[2.4mm] pb-[2.3mm]",
          open > 0 ? "bg-orange-50" : "bg-neutral-100",
        )}
      >
        <div className="flex flex-col items-start border-r-[0.25mm] border-neutral-300 pr-[2mm]">
          {multiDay && (
            <p className="mb-[0.5mm] text-[8pt] font-semibold text-neutral-700">
              {formatDateShort(shift.startsAt)}
            </p>
          )}
          <p className="font-poster text-[22pt] leading-[0.95] font-bold">
            {formatTime(shift.startsAt)}
          </p>
          <p className="mt-[0.5mm] mb-[1.4mm] font-poster text-[10pt] leading-tight font-bold whitespace-nowrap text-neutral-700">
            bis {shiftEndLabel(shift)} Uhr
          </p>
          <ShiftStatus shift={shift} free={free} open={open} empty={empty} />
        </div>
        <div className="min-w-0">
          {/* Mindestalter als kleines Schild neben dem Titel – eine eigene Zeile machte die Kacheln höher. */}
          <div className="flex flex-wrap items-baseline gap-x-[2mm] gap-y-[0.5mm]">
            <h3
              id={headingId}
              className="min-w-0 font-poster text-[15pt] leading-none font-semibold break-words"
            >
              {shift.title}
            </h3>
            {shift.minAge !== null && (
              <span className="rounded-[0.8mm] border-[0.25mm] border-neutral-500 px-[1mm] py-[0.2mm] text-[7.5pt] leading-tight font-semibold whitespace-nowrap text-neutral-700">
                <span className="sr-only">Mindestalter </span>ab {shift.minAge} Jahren
              </span>
            )}
          </div>
          {shift.taskName && (
            <p className="mt-[0.8mm] text-[9pt] leading-tight break-words text-neutral-700">
              {shift.taskName}
            </p>
          )}
          {(shift.meetingPoint || shift.responsible) && (
            <dl className="mt-[1.3mm] grid grid-cols-1 gap-[0.35mm] text-[8.3pt] leading-snug">
              {shift.meetingPoint && (
                <MetaRow icon={MapPinIcon} label="Treffpunkt:">
                  {shift.meetingPoint}
                </MetaRow>
              )}
              {shift.responsible && (
                <MetaRow icon={UserIcon} label="Verantwortlich:">
                  {shift.responsible}
                </MetaRow>
              )}
            </dl>
          )}
        </div>
      </div>
      {slots.length === 0 && (
        <p className="px-[3.2mm] py-[2mm] text-[9pt] text-neutral-600">
          Für diese Schicht sind keine Helfer nötig.
        </p>
      )}
      {lines.length > 0 && (
        <ol className="flex flex-col px-[3.2mm] pt-[0.6mm] pb-[1.6mm]">
          {lines.map((name, index) =>
            name ? (
              <li
                key={index}
                className="flex min-h-[5.5mm] items-end gap-[2mm] border-b-[0.2mm] border-neutral-200 last:border-b-0"
              >
                <SlotNumber value={index + 1} />
                <span className="pb-[0.85mm] text-[10.5pt] leading-tight font-semibold break-words">
                  {name}
                </span>
              </li>
            ) : (
              <li key={index} className="flex h-[7.5mm] items-end gap-[2mm]">
                <SlotNumber value={index + 1} />
                <span
                  aria-hidden="true"
                  className="shrink-0 pb-[0.8mm] text-[8pt] text-neutral-600"
                >
                  Name:
                </span>
                <span className="sr-only">frei</span>
                <span
                  aria-hidden="true"
                  className="mb-[1.1mm] flex-1 border-b-[0.3mm] border-neutral-700"
                />
              </li>
            ),
          )}
        </ol>
      )}
      {shift.closed && free > 0 && (
        <p className="flex items-start gap-[1.4mm] px-[3.2mm] pt-[1mm] pb-[2mm] text-[8.5pt] leading-snug text-neutral-700">
          <LockIcon aria-hidden="true" className="mt-[0.4mm] size-[3.1mm] shrink-0" />
          {free} {free === 1 ? "Platz" : "Plätze"} frei – Einteilung durch den Veranstalter, bitte
          nicht selbst eintragen.
        </p>
      )}
    </article>
  );
}

function ShiftStatus({
  shift,
  free,
  open,
  empty,
}: {
  shift: PrintShiftDto;
  free: number;
  open: number;
  empty: boolean;
}) {
  if (shift.requiredCount === 0) return null;
  if (shift.closed && free > 0)
    return (
      <p className="mt-auto inline-flex items-center gap-[0.9mm] rounded-full border-[0.25mm] border-dashed border-neutral-400 px-[1.8mm] py-[0.8mm] font-poster text-[9pt] leading-none font-semibold tracking-[0.03em] whitespace-nowrap text-neutral-600">
        <LockIcon aria-hidden="true" className="size-[3.1mm]" />
        geschlossen
      </p>
    );
  if (empty)
    return (
      // Stempel: doppelter Rand, leicht schräg – fällt auch schwarz-weiß sofort auf.
      <p className="mt-auto mb-[0.4mm] -rotate-5 rounded-[0.8mm] border-[1.3mm] border-double border-orange-700 bg-white px-[1.3mm] pt-[0.55mm] pb-[0.45mm] text-center font-poster text-[8.5pt] leading-none font-bold tracking-[0.03em] whitespace-nowrap text-orange-700 uppercase">
        Noch nicht <br />
        besetzt
      </p>
    );
  if (open > 0)
    return (
      <p className="mt-auto inline-flex items-center gap-[0.9mm] rounded-full border-[0.5mm] border-orange-700 bg-white px-[1.8mm] py-[0.8mm] font-poster text-[9pt] leading-none font-bold tracking-[0.03em] whitespace-nowrap text-orange-700">
        <PenLineIcon aria-hidden="true" className="size-[3.1mm]" />
        {open} frei
      </p>
    );
  return (
    <p className="mt-auto inline-flex items-center gap-[0.9mm] rounded-full border-[0.25mm] border-dashed border-neutral-400 px-[1.8mm] py-[0.8mm] font-poster text-[9pt] leading-none font-semibold tracking-[0.03em] whitespace-nowrap text-neutral-600">
      <CheckIcon aria-hidden="true" className="size-[3.1mm]" />
      voll
    </p>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  // Fließtext statt Spalten: Ein langer Treffpunkt bricht unter der Beschriftung weiter, nicht in einer schmalen Spalte.
  return (
    <div className="relative min-w-0 pl-[4.3mm] break-words">
      <dt className="inline text-neutral-600">
        <Icon
          aria-hidden="true"
          className="absolute top-[0.35mm] left-0 size-[3.1mm] text-neutral-700"
        />
        {label}
      </dt>{" "}
      <dd className="inline break-words">{children}</dd>
    </div>
  );
}

function SlotNumber({ value }: { value: number }) {
  return (
    <span
      aria-hidden="true"
      className="mb-[0.8mm] grid size-[4.4mm] shrink-0 place-items-center rounded-full border-[0.25mm] border-neutral-400 text-[7pt] font-bold text-neutral-600"
    >
      {value}
    </span>
  );
}

/** Letztes Feld im Raster: kurze Anleitung (nur solange Plätze frei sind), Dank und der Ansprechpartner. */
function HowTo({ event, open }: { event: PrintPlanEvent; open: number }) {
  const hasContact = Boolean(event.contactName || event.contactPhone || event.contactEmail);
  return (
    <div className="flex break-inside-avoid flex-col rounded-[2.5mm] border-[0.35mm] border-dashed border-neutral-400 px-[4mm] pt-[3.4mm] pb-[3.2mm]">
      {open > 0 && (
        <>
          <h3 className="mb-[2.8mm] font-poster text-[17pt] leading-none font-semibold">
            So machst du mit
          </h3>
          <ol className="grid gap-[2.4mm] text-[10.5pt] leading-snug text-neutral-700">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-[2.2mm]">
                <span
                  aria-hidden="true"
                  className="grid size-[5.2mm] shrink-0 place-items-center rounded-full border-[0.3mm] border-neutral-700 text-[8pt] font-bold text-neutral-950"
                >
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-auto pt-[3mm] pb-[2.6mm] font-poster text-[19pt] leading-none font-bold text-orange-700">
        Danke für deine Hilfe!
      </p>
      {hasContact && (
        <div className="border-t-[0.2mm] border-neutral-300 pt-[2.4mm]">
          <p className="text-[7.5pt] font-bold tracking-[0.09em] text-neutral-600 uppercase">
            Fragen? Ansprechpartner
          </p>
          {event.contactName && (
            <p className="mt-[0.6mm] font-poster text-[13pt] leading-tight font-semibold break-words">
              {event.contactName}
            </p>
          )}
          {event.contactPhone && (
            <p className="flex items-center gap-[1.4mm] font-poster text-[12pt] leading-snug font-semibold">
              <PhoneIcon aria-hidden="true" className="size-[3.6mm] shrink-0" />
              {event.contactPhone}
            </p>
          )}
          {event.contactEmail && (
            <p className="flex items-center gap-[1.4mm] text-[9.5pt] leading-snug break-all">
              <MailIcon aria-hidden="true" className="size-[3.6mm] shrink-0" />
              {event.contactEmail}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Anwesenheit ------------------------------------------------------------- */

/**
 * Anwesenheitsliste einer Veranstaltung: je Schicht eine Tabelle Nr./Name/Anwesend/Bemerkung, freie Plätze als leere
 * Zeilen (für spontane Helfer). `titleId` gesetzt = ohne Aushang gedruckt; dann trägt dieses Blatt die Überschrift der
 * Veranstaltung.
 */
function Attendance({
  event,
  titleId,
  multiDay,
}: {
  event: PrintPlanEvent;
  titleId: string | null;
  multiDay: boolean;
}) {
  return (
    <>
      <div className="border-b-[0.4mm] border-neutral-950 pb-[3mm]">
        {titleId && (
          <h2
            id={titleId}
            className="mb-[1.2mm] font-poster text-[15pt] leading-tight font-bold break-words"
          >
            {event.title}
          </h2>
        )}
        <div className="flex flex-wrap items-end justify-between gap-x-[6mm] gap-y-[1mm]">
          <h3 className="font-poster text-[22pt] leading-none font-bold">
            Anwesenheit{" "}
            <span className="ml-[0.5mm] text-[13pt] font-semibold text-neutral-700">
              (für Verantwortliche)
            </span>
          </h3>
          <p className="text-[8.5pt] leading-snug text-neutral-600 @min-[150mm]/blatt:text-right">
            Vor Ort abhaken.
            <br />
            Spontane Helfer in freie Zeilen eintragen.
          </p>
        </div>
        <p className="mt-[1.2mm] text-[9.5pt] text-neutral-700">
          {!titleId && (
            <>
              <b className="font-bold text-neutral-950">{event.title}</b> ·{" "}
            </>
          )}
          {formatDateLong(event.startsAt)}
          {eventSpansDays(event) && ` bis ${formatDateLong(event.endsAt)}`}
          {(event.locationName ?? event.address) && <> · {event.locationName ?? event.address}</>}
        </p>
      </div>
      {event.shifts.map((shift) => (
        <AttendanceTable key={shift.id} shift={shift} multiDay={multiDay} />
      ))}
    </>
  );
}

const CELL = "border-[0.25mm] border-neutral-300 px-[2.4mm]";

function AttendanceTable({ shift, multiDay }: { shift: PrintShiftDto; multiDay: boolean }) {
  const slots = slotsOf(shift);
  const meta = [
    shift.taskName,
    shift.meetingPoint && `Treffpunkt: ${shift.meetingPoint}`,
    shift.responsible && `Verantwortlich: ${shift.responsible}`,
    shift.closed && "Einteilung durch den Veranstalter",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <table className="mt-[3.5mm] w-full border-collapse break-inside-avoid text-[9.5pt]">
      <caption className="rounded-t-[1.6mm] border-[0.25mm] border-b-0 border-neutral-300 bg-orange-50 px-[2.4mm] py-[1.1mm] text-left">
        <span className="grid grid-cols-[1fr_auto] items-baseline gap-x-[3mm]">
          <span className="min-w-0 font-poster text-[12.5pt] leading-tight">
            {/* Wie auf der Kachel: Tag nur bei mehrtägigen Veranstaltungen, das Ende über Mitternacht mit Tag. */}
            <span className="font-bold">
              {multiDay && `${formatDateShort(shift.startsAt)} `}
              {formatTime(shift.startsAt)} – {shiftEndLabel(shift)}&nbsp;Uhr
            </span>
            <span className="ml-[3mm] font-semibold">{shift.title}</span>
            {shift.minAge !== null && (
              <span className="ml-[2mm] inline-block rounded-[0.8mm] border-[0.25mm] border-neutral-500 px-[1mm] py-[0.2mm] align-[0.15em] font-sans text-[7.5pt] leading-tight font-semibold whitespace-nowrap text-neutral-700">
                <span className="sr-only">Mindestalter </span>ab {shift.minAge} Jahren
              </span>
            )}
          </span>
          <span
            className={cn(
              "text-[8.5pt] whitespace-nowrap text-neutral-700",
              shift.requiredCount > 0 && shift.filled === 0 && "font-bold text-neutral-950",
            )}
          >
            {shift.filled} von {shift.requiredCount} besetzt
          </span>
          {meta && <span className="col-span-2 text-[8.5pt] text-neutral-700">{meta}</span>}
        </span>
      </caption>
      <thead>
        <tr className="text-left text-[7.5pt] font-bold tracking-[0.08em] text-neutral-600 uppercase">
          <th
            scope="col"
            className={cn(
              CELL,
              "w-[9mm] border-b-[0.35mm] border-b-neutral-700 py-[0.9mm] text-center",
            )}
          >
            Nr.
          </th>
          <th
            scope="col"
            className={cn(CELL, "w-[40%] border-b-[0.35mm] border-b-neutral-700 py-[0.9mm]")}
          >
            Name
          </th>
          <th
            scope="col"
            className={cn(
              CELL,
              "w-[20mm] border-b-[0.35mm] border-b-neutral-700 py-[0.9mm] text-center",
            )}
          >
            Anwesend
          </th>
          <th scope="col" className={cn(CELL, "border-b-[0.35mm] border-b-neutral-700 py-[0.9mm]")}>
            Bemerkung
          </th>
        </tr>
      </thead>
      <tbody>
        {slots.length === 0 ? (
          <tr>
            <td colSpan={4} className={cn(CELL, "h-[6mm] text-neutral-600")}>
              Für diese Schicht sind keine Helfer nötig.
            </td>
          </tr>
        ) : (
          slots.map((name, index) => (
            <tr key={index} className="break-inside-avoid">
              <td className={cn(CELL, "h-[6mm] text-center text-[8.5pt] text-neutral-600")}>
                {index + 1}
              </td>
              <td
                className={cn(
                  CELL,
                  name ? "font-semibold" : "text-right text-[7.5pt] text-neutral-500",
                )}
              >
                {name ?? "frei"}
              </td>
              <td className={cn(CELL, "text-center")}>
                <span
                  aria-hidden="true"
                  className="inline-block size-[4.2mm] rounded-[0.6mm] border-[0.35mm] border-neutral-700 align-middle"
                />
              </td>
              <td className={CELL} />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
