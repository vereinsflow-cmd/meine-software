import type { ReactNode } from "react";
import { formatDateLong, formatDateShort } from "@/lib/dates";
import type { PrintOrientation } from "@/lib/print";
import { cn } from "@/lib/utils";
import {
  type PrintContent,
  contactSentence,
  endSentence,
  eventSpansDays,
  eventWhenText,
  freePlaces,
  shiftStatusText,
  shiftTimeText,
  shiftsSpanDays,
  signUpHint,
  slotsOf,
} from "@/modules/shifts/print-plan";
import type { PrintPlanEvent, PrintShiftDto } from "@/modules/shifts/service";

/**
 * Der Helferplan als Papier (seit 03.10.2026, Entwurf 4 „Liste mit Schreiblinien“ – ein erster Entwurf mit Kacheln,
 * Schildern und Stempel wirkte „zu KI-lastig“): je Veranstaltung ein **Aushang** fürs Schwarze Brett und eine
 * **Anwesenheitsliste** für die Verantwortlichen vor Ort. Bewusst schlicht wie selbst getippt: Arial, schwarz auf weiß,
 * nur waagerechte Linien, die Angaben als ganze Sätze – keine Symbole, Kärtchen, Schilder oder Tönungen. Nur Namen, nie
 * Kontaktdaten der Helfer (der Ansprechpartner der Veranstaltung ja).
 *
 * Maße in mm und pt statt rem: Die Vorschau am Bildschirm soll genau so umbrechen wie das Papier, unabhängig von der mit dem
 * Fenster wachsenden Grundschrift. Spalten richten sich nach der Breite des Blatts (Containerabfragen `/blatt`, ab 150 mm –
 * A4 hoch hat 182 mm Inhalt): Uhrzeit bzw. Schicht links neben den Zeilen, Schreiblinien zu dritt, quer zu viert; am Handy
 * steht alles untereinander und die Linien zu zweit.
 */

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
  const showNotice = content !== "anwesenheit";
  const showAttendance = content !== "aushang";
  const sheet = { clubName, orientation, generatedAtLabel };
  return (
    <div className="grid gap-8 print:block">
      {events.map((event, index) => {
        const titleId = `veranstaltung-${event.id}`;
        // Mehrtägig: an jeder Schicht der Tag – auch wenn (etwa nach „Nur freie Plätze“) alle am ersten Tag liegen.
        const multiDay = eventSpansDays(event) || shiftsSpanDays(event);
        return (
          <section key={event.id} aria-labelledby={titleId} className="grid gap-8 print:block">
            {showNotice && (
              <Sheet {...sheet} breakBefore={index > 0}>
                <Notice event={event} logoUrl={logoUrl} titleId={titleId} multiDay={multiDay} />
              </Sheet>
            )}
            {showAttendance && (
              <Sheet {...sheet} breakBefore={showNotice || index > 0}>
                <Attendance
                  event={event}
                  titleId={showNotice ? null : titleId}
                  multiDay={multiDay}
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
        "@container/blatt mx-auto flex w-full flex-col bg-white px-4 py-5 font-print text-[11pt] leading-snug text-black shadow-sm ring-1 ring-foreground/10 sm:px-[15mm] sm:py-[12mm]",
        orientation === "quer"
          ? "max-w-[297mm] sm:min-h-[210mm]"
          : "max-w-[210mm] sm:min-h-[297mm]",
        "print:min-h-0 print:max-w-none print:p-0 print:shadow-none print:ring-0",
        breakBefore && "print:break-before-page",
      )}
    >
      <div
        aria-hidden="true"
        className="mb-[8mm] flex justify-between gap-4 text-[9pt] print:hidden"
      >
        <span>{clubName}</span>
        <span>Helferplan</span>
      </div>
      {children}
      <p aria-hidden="true" className="mt-auto pt-[6mm] text-[9pt] print:hidden">
        Erstellt am {generatedAtLabel}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- Aushang ----------------------------------------------------------------- */

function Notice({
  event,
  logoUrl,
  titleId,
  multiDay,
}: {
  event: PrintPlanEvent;
  logoUrl: string | null;
  titleId: string;
  multiDay: boolean;
}) {
  const location = locationOf(event);
  const contact = contactSentence(event);
  return (
    <>
      <div className="flex items-start justify-between gap-[6mm]">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[20pt] leading-tight font-bold break-words">
            Helferplan {event.title}
          </h2>
          <p className="mt-[2mm] text-[12pt] break-words">
            {eventWhenText(event)}
            {location && (
              <>
                <br />
                {location}
              </>
            )}
          </p>
        </div>
        {logoUrl && (
          // Vereinslogo oben rechts wie auf einem Briefkopf – schlichtes <img>: steht sofort im HTML (schnelles Drucken),
          // schmückend, der Vereinsname steht in der Kopfzeile.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-[16mm] w-auto max-w-[40mm] shrink-0 object-contain"
          />
        )}
      </div>
      <p className="mt-[4mm] mb-[6mm] max-w-[165mm] text-[12pt] break-words">
        {signUpHint(event.shifts)}
        {contact && ` ${contact}`}
      </p>
      {event.shifts.map((shift) => (
        <ShiftBlock key={shift.id} shift={shift} multiDay={multiDay} />
      ))}
    </>
  );
}

/**
 * Eine Schicht auf dem Aushang: kräftige Linie darüber, links die Uhrzeit, rechts Name und Aufgabe, darunter Treffpunkt,
 * Verantwortliche(r) und der Stand als Satz; dann je Platz eine Schreiblinie – belegte mit Namen, freie leer. Geschlossene
 * Schichten bekommen keine leeren Linien (dort teilt nur der Veranstalter ein, der Satz sagt es).
 */
function ShiftBlock({ shift, multiDay }: { shift: PrintShiftDto; multiDay: boolean }) {
  const headingId = `schicht-${shift.id}`;
  const status = shiftStatusText(shift);
  const slots = slotsOf(shift);
  const lines = shift.closed ? slots.filter((name) => name !== null) : slots;
  const where = [
    shift.meetingPoint && endSentence(`Treffpunkt: ${shift.meetingPoint}`),
    shift.responsible && endSentence(`Verantwortlich: ${shift.responsible}`),
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article
      aria-labelledby={headingId}
      className="grid break-inside-avoid border-t-[1.2pt] border-black pt-[2.5mm] pb-[4.5mm] @min-[150mm]/blatt:grid-cols-[45mm_1fr]"
    >
      <p className="text-[14pt] leading-tight">
        {multiDay && <span className="block text-[11pt]">{formatDateShort(shift.startsAt)}</span>}
        {shiftTimeText(shift)}
      </p>
      <div className="min-w-0">
        <h3 id={headingId} className="text-[14pt] leading-tight font-normal break-words">
          <b className="font-bold">{shift.title}</b>
          {shift.taskName && <> – {shift.taskName}</>}
        </h3>
        <p className="mt-[0.8mm] break-words">
          {where && (
            <>
              {where}
              <br />
            </>
          )}
          {status.emphasis && <b className="text-[12pt] font-bold">{status.emphasis} </b>}
          {status.text}
        </p>
      </div>
      {lines.length > 0 && (
        <ol className="col-span-full grid grid-cols-2 gap-x-[7mm] @min-[150mm]/blatt:grid-cols-3 @min-[230mm]/blatt:grid-cols-4">
          {lines.map((name, index) => (
            <li
              key={index}
              className="flex min-h-[9.5mm] min-w-0 items-end border-b-[0.6pt] border-black pb-[1.2mm] pl-[1mm] text-[12pt] leading-tight break-words"
            >
              {name ?? <span className="sr-only">frei</span>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/* ------------------------------------------------------------- Anwesenheit ------------------------------------------------------------- */

/**
 * Anwesenheitsliste einer Veranstaltung: je Schicht links Zeit, Name, Treffpunkt und Verantwortliche(r), rechts eine Zeile
 * je Platz mit Nr., Name, Kästchen zum Abhaken und Platz für eine Bemerkung; freie Plätze als leere Zeilen für spontane
 * Helfer. `titleId` gesetzt = ohne Aushang gedruckt; dann benennt diese Überschrift den Abschnitt der Veranstaltung.
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
  const where = event.locationName ?? event.address;
  const date = `${formatDateLong(event.startsAt)}${
    eventSpansDays(event) ? ` bis ${formatDateLong(event.endsAt)}` : ""
  }`;
  // Freie Zeilen gibt es nur, wenn irgendwo noch Plätze frei sind – sonst wäre der Satz dazu irreführend.
  const hasFreeRows = event.shifts.some((shift) => freePlaces(shift) > 0);
  return (
    <>
      <h2 id={titleId ?? undefined} className="text-[18pt] leading-tight font-bold break-words">
        Anwesenheitsliste {event.title}
      </h2>
      <p className="mt-[2mm] mb-[6mm] break-words">
        {endSentence(`${date}${where ? `, ${where}` : ""}`)} Für die Verantwortlichen vor Ort: Bitte
        zu Beginn der Schicht abhaken, wer da ist.
        {hasFreeRows && " Wer spontan einspringt, wird in eine freie Zeile eingetragen."}
      </p>
      {/* Spaltenköpfe einmal oben (wie im Entwurf); für Screenreader trägt jede Tabelle ihre eigenen. Die Spalten
          entsprechen denen der Tabellen: 8 mm, 40 %, 25 mm, Rest. */}
      <div
        aria-hidden="true"
        className="hidden pb-[1.5mm] text-[10pt] font-bold @min-[150mm]/blatt:grid @min-[150mm]/blatt:grid-cols-[46mm_1fr]"
      >
        <span>Schicht</span>
        <span className="grid grid-cols-[8mm_40%_25mm_1fr]">
          <span>Nr.</span>
          <span>Name</span>
          <span className="text-center">Anwesend</span>
          <span>Bemerkung</span>
        </span>
      </div>
      {event.shifts.map((shift) => (
        <AttendanceBlock key={shift.id} shift={shift} multiDay={multiDay} />
      ))}
      {event.contactName && (
        <p className="mt-[3.5mm]">
          Die ausgefüllte Liste bitte nach der Veranstaltung an {event.contactName} zurückgeben.
        </p>
      )}
    </>
  );
}

function AttendanceBlock({ shift, multiDay }: { shift: PrintShiftDto; multiDay: boolean }) {
  const infoId = `anwesenheit-${shift.id}`;
  const slots = slotsOf(shift);
  return (
    <div className="grid break-inside-avoid border-t-[1.2pt] border-black pb-[2.5mm] @min-[150mm]/blatt:grid-cols-[46mm_1fr]">
      <div id={infoId} className="pt-[2.3mm] pr-[3mm] text-[10pt] leading-snug break-words">
        {multiDay && <span className="block">{formatDateShort(shift.startsAt)}</span>}
        <span className="block text-[12pt] leading-tight">{shiftTimeText(shift)}</span>
        <span className="mb-[1mm] block text-[12pt] leading-tight font-bold">{shift.title}</span>
        {shift.meetingPoint && <span className="block">Treffpunkt: {shift.meetingPoint}</span>}
        {shift.responsible && <span className="block">Verantwortlich: {shift.responsible}</span>}
        {shift.minAge !== null && <span className="block">Ab {shift.minAge} Jahren</span>}
        {shift.closed && <span className="block">Einteilung durch den Veranstalter</span>}
      </div>
      <table aria-labelledby={infoId} className="w-full table-fixed border-collapse self-start">
        <colgroup>
          <col className="w-[8mm]" />
          <col className="w-[40%]" />
          <col className="w-[25mm]" />
          <col />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">Nr.</th>
            <th scope="col">Name</th>
            <th scope="col">Anwesend</th>
            <th scope="col">Bemerkung</th>
          </tr>
        </thead>
        <tbody>
          {slots.length === 0 ? (
            <tr>
              <td colSpan={4} className="h-[9mm] pb-[1.3mm] align-bottom">
                Für diese Schicht sind keine Helfer nötig.
              </td>
            </tr>
          ) : (
            slots.map((name, index) => (
              <tr key={index} className="break-inside-avoid">
                <td className="h-[9mm] pb-[1.3mm] align-bottom">{index + 1}</td>
                <td className="align-bottom">
                  <div className="mr-[3mm] border-b-[0.6pt] border-black pb-[1.3mm] pl-[1mm] break-words">
                    {name ?? <span className="sr-only">frei</span>}
                  </div>
                </td>
                <td className="pb-[0.9mm] text-center align-bottom">
                  <span
                    aria-hidden="true"
                    className="inline-block size-[5mm] border-[0.8pt] border-black align-bottom"
                  />
                </td>
                <td className="align-bottom">
                  <div className="h-[1.3mm] border-b-[0.6pt] border-black" />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
