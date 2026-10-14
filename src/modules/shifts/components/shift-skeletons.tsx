import {
  FieldSkeleton,
  lineWidth,
  PageHeaderSkeleton,
  PageLoading,
  PageSectionSkeleton,
  TableSkeleton,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladegerüste der Helferplanung (für die `loading.tsx` unter app/(app)/helferplanung): Übersicht, Helferplan einer
 * Veranstaltung, Helferstunden und „Helferplan drucken“. Aufbau, Abstände und Raster wie auf den fertigen Seiten (ruhige
 * Zeilen in einer Karte, Zeitleiste ab `md`), damit beim Erscheinen der Inhalte nichts springt. Die Flächen pulsieren nur
 * ohne „Bewegung reduzieren“ (`Skeleton`).
 */

/**
 * Übersicht: Kopf mit „Helferstunden“ und „Helferplan drucken“, darunter „Meine Einsätze“ (Zeilen mit „Austragen“) und die
 * kommenden Veranstaltungen (Datum links, rechts Name, Eckdaten und Schichten mit freien Plätzen).
 */
export function HelperPlanningSkeleton() {
  return (
    <PageLoading label="Helferplanung wird geladen …">
      <PageHeaderSkeleton actions={2} description={false} />
      <PageSectionSkeleton titleWidth="w-40" note>
        <div className={CARD_SURFACE}>
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-5 px-4 py-3 sm:px-6 [&+&]:border-t"
            >
              <div className="grid min-w-0 flex-1 gap-2">
                <Skeleton className={cn("h-4", lineWidth(index + 2))} />
                <Skeleton className={cn("h-3.5", lineWidth(index))} />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </PageSectionSkeleton>
      <PageSectionSkeleton titleWidth="w-72" note>
        <div className={CARD_SURFACE}>
          {Array.from({ length: 2 }, (_, event) => (
            <div
              key={event}
              className="grid gap-x-5 gap-y-2 px-4 pt-5 pb-4 sm:px-6 lg:grid-cols-[7.5rem_minmax(0,1fr)] [&+&]:border-t"
            >
              <Skeleton className="h-5 w-24" />
              <div className="grid min-w-0 gap-2">
                <Skeleton className={cn("h-5", lineWidth(event + 1))} />
                <Skeleton className="h-4 w-3/5" />
                <div className="mt-1">
                  {Array.from({ length: 2 }, (_, shift) => (
                    <div
                      key={shift}
                      className="flex min-h-11 items-center justify-between gap-5 border-t py-2"
                    >
                      <Skeleton className={cn("h-4", lineWidth(event + shift + 3))} />
                      <Skeleton className="h-8 w-20 rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageSectionSkeleton>
    </PageLoading>
  );
}

/** Balken der Zeitleiste im Gerüst: Lage in Prozent der Breite, Bahn von oben. */
const BARS = [
  { left: 0, width: 28, lane: 0 },
  { left: 30, width: 42, lane: 0 },
  { left: 18, width: 34, lane: 1 },
  { left: 74, width: 26, lane: 0 },
];

/**
 * Helferplan einer Veranstaltung: Zurück-Link, Kopf mit „Neue Schicht“, „Drucken“ und „CSV-Export“, darunter die Karte
 * „Tagesablauf“ – ab `md` mit Zeitleiste, dann die Schichten (Zeit · Name · Besetzung · Knopf).
 */
export function ShiftPlanSkeleton() {
  return (
    <PageLoading label="Helferplan wird geladen …">
      <PageHeaderSkeleton actions={3} backLink />
      <div className={cn(CARD_SURFACE, "overflow-hidden")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 pb-3 sm:px-6">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="hidden px-6 pb-5 md:block lg:px-10">
          <div className="flex h-5 justify-between">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-3 w-9" />
            ))}
          </div>
          <div className="h-px bg-border" />
          {/* Etwa so hoch wie die echte Zeitleiste mit Band und zwei Bahnen (2,2 + 2 × 2,6 + 0,5 rem). */}
          <div className="relative h-32">
            <Skeleton className="absolute top-1.5 left-0 h-5 w-1/2" />
            {BARS.map((bar, index) => (
              <Skeleton
                key={index}
                className="absolute h-9 rounded-lg"
                style={{
                  left: `calc(${bar.left}% + 2px)`,
                  width: `calc(${bar.width}% - 4px)`,
                  top: `${2.2 + bar.lane * 2.6}rem`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="border-t">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 sm:px-6 xl:grid-cols-[8.5rem_minmax(10rem,1fr)_minmax(0,16rem)_9.5rem] xl:gap-x-6 [&+&]:border-t"
            >
              <Skeleton className="col-start-1 row-start-1 h-4 w-28 self-center xl:self-start" />
              <div className="col-span-2 grid content-start gap-2 xl:col-span-1 xl:col-start-2 xl:row-start-1">
                <Skeleton className={cn("h-5", lineWidth(index + 2))} />
                <Skeleton className={cn("h-4", lineWidth(index))} />
              </div>
              <div className="col-span-2 grid content-start gap-2 xl:col-span-1 xl:col-start-3 xl:row-start-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className="col-start-2 row-start-1 h-8 w-24 justify-self-end rounded-lg xl:col-start-4" />
            </div>
          ))}
        </div>
      </div>
    </PageLoading>
  );
}

/** Helferstunden: Zurück-Link, Kopf mit Satz, Auswahl des Jahres und die Tabelle (Name, Einsätze, Stunden). */
export function HoursSkeleton() {
  return (
    <PageLoading label="Helferstunden werden geladen …">
      <PageHeaderSkeleton actions={0} backLink />
      <div className="flex items-end gap-2">
        <FieldSkeleton labelWidth="w-10" className="w-32" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <TableSkeleton rows={6} columns={3} stack />
    </PageLoading>
  );
}

/**
 * „Helferplan drucken“: eine mittige Spalte (`max-w-3xl`) mit Zurück-Link, Kopf mit „Drucken“ und dem Kasten zum Eingrenzen
 * (Veranstaltungen zum Ankreuzen, Von/Bis, „Nur freie Plätze“, Inhalt und Ausrichtung, „Auswahl anwenden“), darunter die
 * Vorschau des Ausdrucks.
 */
export function PrintPlanSkeleton() {
  return (
    <PageLoading label="Helferplan wird geladen …" className="mx-auto w-full max-w-3xl">
      <PageHeaderSkeleton actions={1} backLink />
      <div className={cn(CARD_SURFACE, "grid gap-4 p-4")}>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-80 max-w-full" />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex h-5 items-center gap-2">
                <Skeleton className="size-4 shrink-0 rounded-sm" />
                <Skeleton className={cn("h-4", lineWidth(index + 2))} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldSkeleton labelWidth="w-10" />
          <FieldSkeleton labelWidth="w-10" />
          <div className="flex h-9 items-center gap-2 self-end">
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          {["w-80", "w-48"].map((options) => (
            <div key={options} className="grid gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className={cn("h-5 max-w-full", options)} />
            </div>
          ))}
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-4 w-2/3" />
        <div
          className={cn(CARD_SURFACE, "grid content-start gap-3 rounded-none px-4 py-5 sm:px-12")}
        >
          <Skeleton className="h-8 w-3/5" />
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="mt-3 h-16 w-full" />
          ))}
        </div>
      </div>
    </PageLoading>
  );
}
