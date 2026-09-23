import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, HandHeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import {
  addBerlinDays,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatTimeRange,
  parseBerlinDateTime,
} from "@/lib/dates";
import { clubLogoUrl } from "@/lib/club-logo";
import { buildPrintPageStyle, type PrintOrientation } from "@/lib/print";
import { enumParam, param, paramList, type RawSearchParams } from "@/lib/search-params";
import {
  getStaffingOverview,
  listShiftPlanForPrint,
  type PrintPlanEvent,
  type PrintShiftDto,
} from "@/modules/shifts/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferplan drucken" };

/** Datum aus dem URL-Parameter (JJJJ-MM-TT) als Beginn des Tages in Berlin; ungültig → nicht gesetzt. */
const dayParam = (params: RawSearchParams, key: string) => {
  const raw = param(params, key);
  return raw ? (parseBerlinDateTime(raw, "00:00") ?? undefined) : undefined;
};

/** Kontaktzeile aus den Ansprechpartner-Feldern der Veranstaltung; `null`, wenn keines gesetzt ist. */
function contactLine(event: PrintPlanEvent): string | null {
  const way = [event.contactEmail, event.contactPhone].filter(Boolean).join(" · ");
  if (!event.contactName && !way) return null;
  return event.contactName ? `${event.contactName}${way ? ` (${way})` : ""}` : way;
}

/**
 * Druckbare Helferliste einer Schicht: Kopfzeile mit Aufgabe, Zeit, Treffpunkt und Besetzungsstand; darunter eine
 * Tabelle mit einer Zeile je benötigtem Platz. Freie Plätze stehen als „— frei —“ da; ist noch niemand eingeteilt,
 * steht das zusätzlich deutlich in der Kopfzeile. `break-inside-avoid`, damit eine Schicht nicht mitten im
 * Seitenumbruch zerrissen wird (im Zweifel bleibt lieber Platz frei, als die Tabelle zu zerreißen).
 */
function ShiftBlock({ shift }: { shift: PrintShiftDto }) {
  const rows = Array.from({ length: shift.requiredCount }, (_, i) => shift.helperNames[i] ?? null);
  return (
    <div className="mb-6 break-inside-avoid">
      <h3 className="text-base font-semibold">
        {shift.title}{" "}
        <span className="text-sm font-normal">
          — {formatTimeRange(shift.startsAt, shift.endsAt)}
        </span>
      </h3>
      <p className="mb-1 text-sm">
        {shift.taskName && <>{shift.taskName} · </>}
        {shift.meetingPoint && <>Treffpunkt: {shift.meetingPoint} · </>}
        {shift.responsible && <>Verantwortlich: {shift.responsible} · </>}
        {shift.filled} von {shift.requiredCount} besetzt ({shift.fillLabel})
        {shift.filled === 0 && <strong> · Noch nicht besetzt</strong>}
      </p>
      {shift.requiredCount === 0 ? (
        <p className="text-sm text-muted-foreground print:text-black">
          Für diese Schicht sind keine Helfer nötig.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="w-8 py-1">Nr.</th>
              <th className="py-1">Name</th>
              <th className="w-24 py-1">Anwesend</th>
              <th className="w-32 py-1">Bemerkung</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((name, index) => (
              <tr key={index} className="[break-inside:avoid] border-b border-gray-400">
                <td className="py-1.5">{index + 1}</td>
                <td className="py-1.5">
                  {name ?? (
                    <span className="text-muted-foreground italic print:text-black">— frei —</span>
                  )}
                </td>
                <td className="py-1.5">☐</td>
                <td className="py-1.5"></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EventSection({ event }: { event: PrintPlanEvent }) {
  const location = [event.locationName, event.address].filter(Boolean).join(", ");
  const contact = contactLine(event);
  return (
    <section className="mb-8">
      <h2 className="mb-1 border-b border-black pb-1 text-xl font-bold">{event.title}</h2>
      <p className="mb-1 text-sm">
        {formatDateLong(event.startsAt)} ·{" "}
        {event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt)}
      </p>
      {location && <p className="mb-1 text-sm">Ort: {location}</p>}
      {contact && <p className="mb-3 text-sm">Ansprechpartner: {contact}</p>}
      {!location && !contact && <div className="mb-3" />}
      {event.shifts.map((shift) => (
        <ShiftBlock key={shift.id} shift={shift} />
      ))}
    </section>
  );
}

export default async function PrintShiftPlanPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "shifts:read")) return <NoAccess what="die Helferliste" />;

  const eventIds = paramList(params, "event");
  const from = dayParam(params, "von");
  const untilDay = dayParam(params, "bis");
  const onlyOpen = param(params, "nurOffen") === "1";
  const orientation: PrintOrientation =
    enumParam(params, "ausrichtung", ["hoch", "quer"]) ?? "hoch";

  const [pickerEvents, planEvents] = await Promise.all([
    getStaffingOverview(ctx),
    listShiftPlanForPrint(ctx, {
      eventIds: eventIds.length > 0 ? eventIds : undefined,
      from,
      to: untilDay ? addBerlinDays(untilDay, 1) : undefined, // "bis" gilt einschließlich
      onlyOpen,
    }),
  ]);

  const filtered = eventIds.length > 0 || Boolean(from) || Boolean(untilDay) || onlyOpen;
  const summary = [
    eventIds.length > 0
      ? `${eventIds.length} ${eventIds.length === 1 ? "ausgewählte Veranstaltung" : "ausgewählte Veranstaltungen"}`
      : null,
    from ? `ab ${formatDate(from)}` : null,
    untilDay ? `bis ${formatDate(untilDay)}` : null,
    onlyOpen ? "nur Schichten mit freien Plätzen" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Genau eine Veranstaltung ausgewählt: „Zurück“ führt zurück zu ihr statt zur allgemeinen Helferplanung.
  const backHref = eventIds.length === 1 ? `/helferplanung/${eventIds[0]}` : "/helferplanung";
  const backLabel = eventIds.length === 1 ? "Zurück zum Helferplan" : "Zurück zur Helferplanung";

  const pageStyle = buildPrintPageStyle({
    clubName: ctx.club.name,
    documentTitle: "Helferplan",
    generatedAtLabel: `${formatDateTime(new Date())} Uhr`,
    orientation,
  });
  const logoUrl = clubLogoUrl(ctx.clubId, ctx.club.logoSha256);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden">
        <p className="mb-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" /> {backLabel}
          </Link>
        </p>
        <PageHeader
          title="Helferplan drucken"
          description="Wähle Veranstaltungen oder einen Zeitraum – der Ausdruck ist zum Aushängen gedacht und enthält nur Namen, keine Kontaktdaten."
          actions={<PrintButton />}
        />

        <form
          key={JSON.stringify(params)}
          method="get"
          action="/helferplanung/drucken"
          role="search"
          aria-label="Ausdruck eingrenzen"
          className="mb-6 grid gap-4 rounded-xl border p-4"
        >
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              Veranstaltungen (ohne Auswahl: alle kommenden mit Helferbedarf)
            </legend>
            {pickerEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine kommenden Veranstaltungen mit Helferbedarf.
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {pickerEvents.map((event) => (
                  <label key={event.eventId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="event"
                      value={event.eventId}
                      defaultChecked={eventIds.includes(event.eventId)}
                      className="size-4"
                    />
                    {event.title}{" "}
                    <span className="text-muted-foreground">({formatDate(event.startsAt)})</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label htmlFor="hd-von">Von</Label>
              <Input id="hd-von" type="date" name="von" defaultValue={param(params, "von") ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hd-bis">Bis</Label>
              <Input id="hd-bis" type="date" name="bis" defaultValue={param(params, "bis") ?? ""} />
            </div>
            <div className="grid content-end">
              <label className="flex h-9 items-center gap-2 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  name="nurOffen"
                  value="1"
                  defaultChecked={onlyOpen}
                  className="size-4"
                />
                Nur freie Plätze
              </label>
            </div>
            <fieldset className="grid content-end gap-1.5">
              <legend className="sr-only">Ausrichtung</legend>
              <div className="flex h-9 items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ausrichtung"
                    value="hoch"
                    defaultChecked={orientation === "hoch"}
                  />
                  Hochformat
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ausrichtung"
                    value="quer"
                    defaultChecked={orientation === "quer"}
                  />
                  Querformat
                </label>
              </div>
            </fieldset>
          </div>

          <div className="flex gap-2">
            <Button type="submit">Auswahl anwenden</Button>
            {filtered && (
              <Button asChild variant="ghost">
                <Link href="/helferplanung/drucken">Zurücksetzen</Link>
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Ab hier: der eigentliche Ausdruck, in einer eigenen Hülle mit `id` (damit Tests ihn eindeutig von der
          übrigen Seite unterscheiden können – der App-Kopfbereich hat selbst ein `<header>`). `@page` setzt
          Format/Ränder und eine wiederkehrende Kopf-/Fußzeile mit Vereinsname, Titel, Erstellungsdatum und
          Seitenzahlen (erscheint auf jeder gedruckten Seite, nicht nur auf der ersten). */}
      <div id="helferplan-ausdruck">
        <style id="helferplan-seitenstil">{pageStyle}</style>
        <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <h1 className="text-2xl font-bold">{ctx.club.name}</h1>
            <p className="text-lg font-semibold">Helferplan</p>
            <p className="text-sm text-muted-foreground print:text-black">
              {summary || "Alle kommenden Veranstaltungen mit Helferbedarf"}
            </p>
            <p className="text-xs text-muted-foreground print:text-black">
              Erstellt am {formatDateTime(new Date())} Uhr
            </p>
          </div>
          {logoUrl && (
            // Schlichtes <img> statt Kachel oder next/image: steht sofort im HTML (für schnelles Drucken) und wird
            // mit Anmeldung geladen; schmückend, der Vereinsname steht daneben. Ohne Logo bleibt der Kopf wie gehabt.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-16 shrink-0 object-contain" />
          )}
        </header>

        {planEvents.length === 0 ? (
          <EmptyState
            icon={<HandHeartIcon />}
            title="Nichts zum Drucken"
            description={
              filtered
                ? "Für diese Auswahl gibt es keine Schichten. Passe die Filter an."
                : "Es sind aktuell keine kommenden Veranstaltungen mit Helferschichten geplant."
            }
          />
        ) : (
          planEvents.map((event) => <EventSection key={event.id} event={event} />)
        )}
      </div>
    </div>
  );
}
