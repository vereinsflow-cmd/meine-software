import type { Metadata } from "next";
import Link from "next/link";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import { BackLink } from "@/components/shared/back-link";
import { addBerlinDays, formatDate, formatDateTime, parseBerlinDateTime } from "@/lib/dates";
import { clubLogoUrl } from "@/lib/club-logo";
import { buildPrintPageStyle, type PrintOrientation } from "@/lib/print";
import { enumParam, param, paramList, type RawSearchParams } from "@/lib/search-params";
import { ShiftPlanSheets } from "@/modules/shifts/components/print-plan";
import { PRINT_CONTENTS, previewLabel, type PrintContent } from "@/modules/shifts/print-plan";
import { getStaffingOverview, listShiftPlanForPrint } from "@/modules/shifts/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferplan drucken" };

const CONTENT_OPTIONS: { value: PrintContent; label: string }[] = [
  { value: "beides", label: "Aushang und Anwesenheitsliste" },
  { value: "aushang", label: "Nur Aushang" },
  { value: "anwesenheit", label: "Nur Anwesenheitsliste" },
];

/** Datum aus dem URL-Parameter (JJJJ-MM-TT) als Beginn des Tages in Berlin; ungültig → nicht gesetzt. */
const dayParam = (params: RawSearchParams, key: string) => {
  const raw = param(params, key);
  return raw ? (parseBerlinDateTime(raw, "00:00") ?? undefined) : undefined;
};

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
  const content: PrintContent = enumParam(params, "inhalt", PRINT_CONTENTS) ?? "beides";

  const [pickerEvents, planEvents] = await Promise.all([
    getStaffingOverview(ctx),
    listShiftPlanForPrint(ctx, {
      eventIds: eventIds.length > 0 ? eventIds : undefined,
      from,
      to: untilDay ? addBerlinDays(untilDay, 1) : undefined, // "bis" gilt einschließlich
      onlyOpen,
    }),
  ]);

  // Auswahl: kommende Veranstaltungen mit Helferbedarf – dazu die gewählten, die dort fehlen (z. B. alle Schichten schon vorbei),
  // sonst fiele die Veranstaltung beim nächsten „Auswahl anwenden“ stillschweigend aus der Auswahl.
  const pickerIds = new Set(pickerEvents.map((event) => event.eventId));
  const choices = [
    ...pickerEvents.map(({ eventId, title, startsAt }) => ({ eventId, title, startsAt })),
    ...planEvents
      .filter((event) => eventIds.includes(event.id) && !pickerIds.has(event.id))
      .map(({ id, title, startsAt }) => ({ eventId: id, title, startsAt })),
  ];
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

  const generatedAtLabel = `${formatDateTime(new Date())} Uhr`;
  const pageStyle = buildPrintPageStyle({
    clubName: ctx.club.name,
    documentTitle: "Helferplan",
    generatedAtLabel,
    orientation,
  });
  const logoUrl = clubLogoUrl(ctx.clubId, ctx.club.logoSha256);

  return (
    <div>
      <div className="mx-auto max-w-3xl print:hidden">
        <BackLink href={backHref}>{backLabel}</BackLink>
        <PageHeader
          title="Helferplan drucken"
          description="Wähle Veranstaltungen oder einen Zeitraum. Je Veranstaltung gibt es einen Aushang zum Eintragen und eine Anwesenheitsliste – mit Namen, aber ohne Kontaktdaten der Helfer."
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
            {choices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine kommenden Veranstaltungen mit Helferbedarf.
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {choices.map((event) => (
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

          <div className="grid gap-3 sm:grid-cols-3">
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
          </div>

          <div className="flex flex-wrap items-start gap-x-10 gap-y-3">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Was drucken?</legend>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {CONTENT_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="inhalt"
                      value={option.value}
                      defaultChecked={content === option.value}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Ausrichtung</legend>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
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
          übrigen Seite unterscheiden können). `@page` setzt Format/Ränder und eine wiederkehrende Kopf-/Fußzeile mit
          Vereinsname, Titel, Erstellungsdatum und Seitenzahlen (auf jeder gedruckten Seite, nicht nur auf der ersten). */}
      <div id="helferplan-ausdruck">
        <style id="helferplan-seitenstil">{pageStyle}</style>
        {planEvents.length === 0 ? (
          <div className="mx-auto max-w-3xl">
            <EmptyState
              icon={<AREA_ICON.helferplanung />}
              title="Nichts zum Drucken"
              description={
                filtered
                  ? "Für diese Auswahl gibt es keine Schichten. Passe die Filter an."
                  : "Es sind aktuell keine kommenden Veranstaltungen mit Helferschichten geplant."
              }
            />
          </div>
        ) : (
          <>
            <p className="mx-auto mb-3 max-w-3xl text-sm text-muted-foreground print:hidden">
              Vorschau · {summary || "Alle kommenden Veranstaltungen mit Helferbedarf"} ·{" "}
              {previewLabel(planEvents.length, content)}
            </p>
            <ShiftPlanSheets
              events={planEvents}
              clubName={ctx.club.name}
              logoUrl={logoUrl}
              orientation={orientation}
              content={content}
              generatedAtLabel={generatedAtLabel}
            />
          </>
        )}
      </div>
    </div>
  );
}
