import { PAGE_STACK } from "@/components/shared/page-section";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladegerüste ganzer Seiten für die `loading.tsx` der Bereiche: Beim Öffnen steht sofort der Aufbau der fertigen Seite da –
 * Kopf, Filterleiste, Tabelle, Karten, Kalender oder Chat – statt einer leeren Fläche. Maße und Abstände folgen den echten
 * Bausteinen (`PageHeader`, `PageSection`, `CardHeader`, `TableCard`, Seitenrhythmus von `PageStack`), damit beim
 * Erscheinen der Inhalte nichts springt.
 *
 * Jedes Gerüst ist eine Live-Region (`PageLoading`: `role="status"`, `aria-busy`): Screenreader hören „Wird geladen …“
 * (oder `label`), die Flächen selbst sind leer. Sie pulsieren nur ohne „Bewegung reduzieren“ (`Skeleton`). Eigene Gerüste
 * einer Seite bauen auf die Bausteine hier (`PageLoading`, `FieldSkeleton`, `CardHeadSkeleton`, `FormCardSkeleton`,
 * `PageSectionSkeleton`, `lineWidth`) statt sie abzuschreiben.
 */

/** Unterschiedlich lange Zeilen wirken wie echter Text (fest, damit Server und Browser gleich zeichnen). */
const LINE_WIDTHS = ["w-2/5", "w-1/3", "w-1/2", "w-1/4", "w-3/5", "w-2/5", "w-1/3", "w-1/2"];

/** Breite der Zeile Nummer `index` (wiederholt sich nach acht Zeilen). */
export function lineWidth(index: number): string {
  return LINE_WIDTHS[index % LINE_WIDTHS.length]!;
}

/**
 * Wurzel jedes Gerüsts: Spalte wie `PageStack` und Live-Region – Screenreader hören `label`, die Flächen selbst sind leer.
 * `className` etwa für eine schmalere Seite (`mx-auto max-w-3xl`).
 */
export function PageLoading({
  label = "Wird geladen …",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-slot="page-stack"
      className={cn(PAGE_STACK, className)}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Wie `PageHeader` (Titel `text-3xl`, Beschreibung, Knöpfe rechts bzw. am Handy darunter), optional mit `BackLink` darüber. */
export function PageHeaderSkeleton({
  actions = 1,
  mobileActions = actions,
  description = true,
  backLink = false,
  className,
}: {
  /** Anzahl Knöpfe im Kopf (0 = keine). */
  actions?: number;
  /** Davon am Handy (die übrigen stecken dort im Menü „Weitere Aktionen“). */
  mobileActions?: number;
  description?: boolean;
  backLink?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-7 flex flex-col gap-3 in-data-[slot=page-stack]:mb-1 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 sm:flex-1">
        {backLink && <Skeleton className="mb-3 h-5 w-36" />}
        <Skeleton className="my-0.5 h-8 w-64 max-w-full" />
        {description && <Skeleton className="mt-2.5 h-4 w-96 max-w-full" />}
      </div>
      {actions > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: actions }, (_, index) => (
            <Skeleton
              key={index}
              className={cn(
                "h-9 rounded-lg",
                index === 0 ? "w-36" : "w-28",
                index >= mobileActions && "max-sm:hidden",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Filterleiste: Suche und Auswahlfelder (am Handy Suche und „Filter“). */
export function ToolbarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Skeleton className="h-9 min-w-0 flex-1 rounded-lg sm:max-w-80" />
      <Skeleton className="h-9 w-24 rounded-lg sm:hidden" />
      <Skeleton className="hidden h-9 w-40 rounded-lg sm:block" />
      <Skeleton className="hidden h-9 w-40 rounded-lg sm:block" />
      <Skeleton className="hidden h-9 w-20 rounded-lg sm:block" />
    </div>
  );
}

/** Formularfeld wie `TextField`/`SelectField`: Beschriftung und Eingabe (1,5 rem Abstand); `tall` für mehrzeilige Felder. */
export function FieldSkeleton({
  labelWidth = "w-28",
  tall = false,
  className,
}: {
  labelWidth?: string;
  tall?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Skeleton className={cn("h-4", labelWidth)} />
      <Skeleton className={cn("rounded-lg", tall ? "h-20" : "h-9")} />
    </div>
  );
}

/**
 * Kopf einer Karte wie `CardHeader`: Titel (`CardTitle`, etwa 19 px) und wahlweise ein Satz darunter (`CardDescription`).
 * `icon` für die kleineren Kartentitel mit Symbol davor (Profil, Datenschutz).
 */
export function CardHeadSkeleton({
  titleWidth = "w-40",
  description = false,
  icon = false,
}: {
  titleWidth?: string;
  description?: boolean;
  icon?: boolean;
}) {
  return (
    <div className="grid gap-2">
      {icon ? (
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className={cn("h-4", titleWidth)} />
        </div>
      ) : (
        <Skeleton className={cn("h-6 max-w-full", titleWidth)} />
      )}
      {description && <Skeleton className="h-4 w-3/5" />}
    </div>
  );
}

/**
 * Karte eines Formulars bzw. Abschnitts mit Kopf (`CardHeadSkeleton`) und darunter Feldern – ab `sm` in zwei Spalten, die
 * Felder mit den Nummern in `wide` über die ganze Breite. Mit `children` steht statt der Felder eigener Inhalt in der Karte.
 * Innenabstand und Lücken wie `Card` (1,25 rem).
 */
export function FormCardSkeleton({
  titleWidth,
  description = false,
  icon = false,
  fields = 4,
  wide = [],
  className,
  children,
}: {
  titleWidth?: string;
  description?: boolean;
  icon?: boolean;
  fields?: number;
  wide?: number[];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(CARD_SURFACE, "grid content-start gap-5 p-5", className)}>
      <CardHeadSkeleton titleWidth={titleWidth} description={description} icon={icon} />
      {children ?? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: fields }, (_, index) => (
            <FieldSkeleton
              key={index}
              labelWidth={index % 2 === 0 ? "w-28" : "w-24"}
              className={cn(wide.includes(index) && "sm:col-span-2")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Abschnitt wie `PageSection`: Überschrift (`text-lg`), wahlweise ein Satz darunter, eine kurze Angabe daneben (`note`,
 * „2 kommende“) und ein Knopf rechts – dann 0,75 rem bis zum Inhalt.
 */
export function PageSectionSkeleton({
  titleWidth = "w-40",
  description = false,
  note = false,
  action = false,
  children,
}: {
  titleWidth?: string;
  description?: boolean;
  note?: boolean;
  action?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex items-baseline gap-3">
            <Skeleton className={cn("my-0.5 h-6 max-w-full", titleWidth)} />
            {note && <Skeleton className="h-4 w-24" />}
          </div>
          {description && <Skeleton className="h-4 w-80 max-w-full" />}
        </div>
        {action && <Skeleton className="h-9 w-44 rounded-lg" />}
      </div>
      {children}
    </div>
  );
}

/** Raster einer Tabellenzeile: erste Spalte doppelt so breit wie die übrigen. */
function gridColumns(count: number): string {
  return `minmax(0,2fr) repeat(${count - 1}, minmax(0,1fr))`;
}

/**
 * Tabelle in ihrer Karte (`TableCard`): Kopfzeile und Zeilen. Nur mit `stack` am Handy gestapelt wie `<Table stack>` (drei
 * Zeilen je Eintrag, ohne Kopfzeile); ohne `stack` bleibt es wie die echte Tabelle auch am Handy eine Tabelle mit Kopfzeile –
 * dort mit den ersten (höchstens drei) Spalten, der Rest liegt wie bei der echten Tabelle rechts außerhalb.
 */
export function TableSkeleton({
  rows = 8,
  columns = 4,
  stack = false,
}: {
  rows?: number;
  columns?: number;
  /** So wie die Seite: `true` nur, wo sie `<Table stack>` nutzt. */
  stack?: boolean;
}) {
  const count = Math.max(2, columns);
  const phone = Math.min(count, 3);
  const style = {
    "--table-columns": gridColumns(count),
    "--table-columns-phone": gridColumns(phone),
  } as React.CSSProperties;
  const row = stack
    ? "hidden grid-cols-(--table-columns) md:grid"
    : "grid grid-cols-(--table-columns-phone) md:grid-cols-(--table-columns)";
  // Spalten über die ersten drei hinaus stehen am Handy nicht im Bild.
  const cell = (column: number) => column >= phone && "max-md:hidden";
  return (
    <div className={cn(CARD_SURFACE, "overflow-hidden")} style={style}>
      <div className={cn("h-10 items-center gap-4 border-b bg-muted/50 px-4", row)}>
        {Array.from({ length: count }, (_, column) => (
          <Skeleton key={column} className={cn("h-3.5 w-20 max-w-full", cell(column))} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="border-b last:border-0">
          <div className={cn("h-12 items-center gap-4 px-4", row)}>
            {Array.from({ length: count }, (_, column) => (
              <Skeleton
                key={column}
                className={cn("h-4", column === 0 ? lineWidth(index + 2) : "w-3/5", cell(column))}
              />
            ))}
          </div>
          {stack && (
            <div className="grid gap-2 px-4 py-3 md:hidden">
              <Skeleton className={cn("h-4", lineWidth(index + 2))} />
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Karte mit Titel (`CardTitle`) und einigen Zeilen – Baustein für Listen, Karten-Raster und Detailseiten. */
export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn(CARD_SURFACE, "grid gap-3 p-5", className)}>
      <Skeleton className="mb-1 h-6 w-2/5" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", index === lines - 1 ? "w-1/2" : "w-full")} />
      ))}
    </div>
  );
}

/**
 * Allgemeine Seite (auch Vorgabe für `app/(app)/loading.tsx`): Kopf, wahlweise Filterleiste, darunter eine Karte mit
 * Listenzeilen.
 */
export function ListPageSkeleton({
  rows = 5,
  toolbar = false,
  actions = 1,
  label,
}: {
  rows?: number;
  toolbar?: boolean;
  actions?: number;
  label?: string;
}) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={actions} />
      {toolbar && <ToolbarSkeleton />}
      <div className={CARD_SURFACE}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b px-5 py-4 last:border-0">
            <div className="grid min-w-0 flex-1 gap-2">
              <Skeleton className={cn("h-4", lineWidth(index))} />
              <Skeleton className={cn("h-3.5", lineWidth(index + 3))} />
            </div>
            <Skeleton className="hidden h-8 w-20 rounded-lg sm:block" />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}

/** Listenseite mit Tabelle (Mitglieder, Dokumente …): Kopf, Filterleiste, Tabelle (`stack` wie die Tabelle der Seite). */
export function TablePageSkeleton({
  rows = 8,
  columns = 4,
  stack = false,
  toolbar = true,
  actions = 1,
  label,
}: {
  rows?: number;
  columns?: number;
  stack?: boolean;
  toolbar?: boolean;
  actions?: number;
  label?: string;
}) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={actions} />
      {toolbar && <ToolbarSkeleton />}
      <TableSkeleton rows={rows} columns={columns} stack={stack} />
    </PageLoading>
  );
}

/** Raster aus Karten (Abteilungen …): eine Spalte am Handy, zwei ab `md`, drei ab `xl`. */
export function CardGridSkeleton({
  cards = 6,
  actions = 1,
  label,
}: {
  cards?: number;
  actions?: number;
  label?: string;
}) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={actions} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <CardSkeleton key={index} lines={index % 2 === 0 ? 3 : 2} />
        ))}
      </div>
    </PageLoading>
  );
}

/** Detailseite (Mitglied, Veranstaltung …): Zurück-Link, Kopf, links zwei Drittel Inhalt, rechts eine Spalte mit Seitenkarten. */
export function DetailPageSkeleton({ actions = 2, label }: { actions?: number; label?: string }) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={actions} backLink />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <FormCardSkeleton titleWidth="w-1/3">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="grid gap-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className={cn("h-4", lineWidth(index + 1))} />
                </div>
              ))}
            </div>
          </FormCardSkeleton>
          <CardSkeleton lines={4} />
        </div>
        <div className="grid content-start gap-6">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={2} />
        </div>
      </div>
    </PageLoading>
  );
}

/** In einigen Tagen stehen Termine – fest verteilt, damit das Gerüst wie ein Monat aussieht. */
const BUSY_DAYS = new Set([2, 5, 9, 10, 16, 19, 23, 26, 30]);

/**
 * Kalender: Kopf mit drei Knöpfen, Leiste mit Blättern, Monatsname und Ansicht, die Filter (am Handy nur „Filter“, sonst
 * Art, Abteilung, „Nur meine Termine“ und „Filtern“ – eine Suche gibt es dort nicht), darunter ab `md` das Monatsraster
 * (sieben Spalten, fünf Wochen, Tageskästchen 6,5 rem hoch) und am Handy die Terminliste.
 */
export function CalendarPageSkeleton({ actions = 3, label }: { actions?: number; label?: string }) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={actions} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
          <Skeleton className="ml-1 h-6 w-36" />
        </div>
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Skeleton className="h-9 w-24 rounded-lg sm:hidden" />
        <Skeleton className="hidden h-9 w-44 rounded-lg sm:block" />
        <Skeleton className="hidden h-9 w-48 rounded-lg sm:block" />
        <div className="hidden h-9 items-center gap-2 sm:flex">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="hidden h-9 w-20 rounded-lg sm:block" />
      </div>
      <div className={cn(CARD_SURFACE, "hidden overflow-hidden md:block")}>
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="p-2">
              <Skeleton className="h-3.5 w-6" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }, (_, index) => (
            <div
              key={index}
              className="grid h-26 content-start gap-1.5 border-t border-l p-1 [&:nth-child(-n+7)]:border-t-0 [&:nth-child(7n+1)]:border-l-0"
            >
              <Skeleton className="size-6 rounded-full" />
              {BUSY_DAYS.has(index) && <Skeleton className="h-5 w-11/12 rounded-md" />}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}

/** Volle Höhe der Nachrichten-Seite: Bildschirm minus Kopfzeile und Innenabstand von `<main>` (wie `nachrichten/page.tsx`). */
export const CHAT_PAGE_HEIGHT =
  "h-[calc(100dvh-var(--app-header-height)-2rem)] min-h-[28rem] sm:h-[calc(100dvh-var(--app-header-height)-3rem)] xl:h-[calc(100dvh-var(--app-header-height)-4rem)]";

/**
 * Nachrichten: Kopf, darunter die Chatfläche über die ganze Höhe – links die Chatliste (rundes Bild, Name, Anfang der
 * letzten Nachricht), rechts ab `md` der Verlauf mit Blasen auf dem Chat-Hintergrund und die Eingabe.
 */
export function ChatPageSkeleton({ label }: { label?: string }) {
  return (
    <PageLoading label={label} className={cn(CHAT_PAGE_HEIGHT, "gap-0")}>
      <PageHeaderSkeleton actions={1} className="mb-4 in-data-[slot=page-stack]:mb-4" />
      <div className={cn(CARD_SURFACE, "flex min-h-0 flex-1 overflow-hidden")}>
        <div className="flex w-full flex-col border-r md:w-80 lg:w-96">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 border-b px-4 py-3">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="grid min-w-0 flex-1 gap-2">
                <Skeleton className={cn("h-4", lineWidth(index + 4))} />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden min-w-0 flex-1 flex-col md:flex">
          <div className="flex items-center gap-3 border-b px-3 py-2.5">
            <Skeleton className="size-10 rounded-full" />
            <div className="grid gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-2 bg-chat-wallpaper px-6 py-3">
            <Skeleton className="h-14 w-2/5 rounded-lg bg-chat-bubble-other" />
            <Skeleton className="h-10 w-1/3 rounded-lg bg-chat-bubble-other" />
            <Skeleton className="h-12 w-2/5 self-end rounded-lg bg-chat-bubble-own" />
            <Skeleton className="h-16 w-1/2 rounded-lg bg-chat-bubble-other" />
          </div>
          <div className="flex items-center gap-2 border-t px-3 py-2.5">
            <Skeleton className="h-10 flex-1 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
