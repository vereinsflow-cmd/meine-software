/**
 * Kalender der App (dunkel) für den Glas-Bildschirm der Szene „termine“ – Aufbau wie kalender.png / kalender-donnerstag.png:
 * Seitenkopf „Kalender“, Knöpfe, Monatsleiste, Ansicht „Liste“, Filter und die Tagesliste ab Dienstag, 1. Juni 2027.
 * Die Seite scrollt bis „Donnerstag, 3. Juni 2027“ (mit senkrechter Bewegungsunschärfe); der Termin des Donnerstags
 * kann ausgeblendet werden, wenn er als Glaskarte aus dem Bildschirm steigt (DonnerstagBlock).
 * Abweichung von kalender-donnerstag.png: Der Donnerstag zeigt nur das Training – die „Sitzung der Abteilungsleitungen“
 * (Art „Sitzung“ = violett in der App) fällt im Film weg, weil der Film kein Violett zeigt (Vereinsblau statt Lila).
 */
import React, { useId } from "react";
import { AppHeader, AppShell } from "../../ui/AppShell";
import { CALENDAR_DAYS, CALENDAR_THURSDAY, CalendarEntryRow, type CalendarEntry } from "../../ui/events";
import { Icon } from "../../ui/icons";
import { Button, PageTitle, Tabs, X3 } from "../../ui/primitives";
import { C, CONTENT_W, TEXT, W } from "../../ui/tokens";
import { clamp01 } from "../../ui/motion";

/** sichtbare Höhe des Kalender-Bildschirms (Bildpixel bei 1170 Breite) */
export const KAL_SCREEN_H = 1560;
/** Oberkante der Überschrift „Donnerstag, 3. Juni 2027“ im Seitenraum (Bildpixel, scrollY 0) */
export const THU_TOP = 2265;
/** dort steht die Überschrift nach dem Scrollen (Bildpixel ab Oberkante der Kopfzeile) */
export const THU_SHOW = 252;
export const KAL_SCROLL = THU_TOP - THU_SHOW;
/** Block „Überschrift + Termin“ (Bildpixel): 21,75 + 8 + 101,5 CSS-px */
export const THU_BLOCK_H = 394;

/** Donnerstag im Film: nur „Fußball-Training D-Jugend“ (ohne den violetten Sitzungstermin, siehe oben) */
const DONNERSTAG: CalendarEntry[] = CALENDAR_THURSDAY.slice(0, 1);

/** Tage vor dem Donnerstag (kalender.png) */
const VORHER: { date: string; entries: CalendarEntry[] }[] = [
  {
    date: "Dienstag, 1. Juni 2027",
    entries: [{ time: "18:30 – 20:00", title: "Fußball-Training Herren", meta: ["Training", "Fußball"], location: "Sportplatz", stripe: "#16A34A", bg: C.emerald50 }],
  },
  {
    date: "Mittwoch, 2. Juni 2027",
    entries: [{ time: "19:00 – 21:00", title: "Tischtennis-Training", meta: ["Training", "Tischtennis"], location: "Turnhalle am Markt", stripe: "#2563EB", bg: C.emerald50 }],
  },
];

/** Ein Tag der Liste (wie CalendarDayItem), Überschrift und Termine einzeln ausblendbar */
const DayBlock: React.FC<{ date: string; entries: CalendarEntry[]; headOpacity?: number; entryOpacity?: number[]; highlight?: number[] }> = ({
  date,
  entries,
  headOpacity = 1,
  entryOpacity,
  highlight,
}) => (
  <div>
    <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, ...TEXT.sm, fontWeight: W.semibold, opacity: headOpacity }}>{date}</div>
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map((e, i) => (
        <div key={e.title} style={{ opacity: entryOpacity?.[i] ?? 1 }}>
          <CalendarEntryRow {...e} highlight={highlight?.[i] ?? 0} />
        </div>
      ))}
    </div>
  </div>
);

export type KalenderSeiteProps = {
  /** Scroll des Inhalts (Bildpixel) */
  scrollY: number;
  /** senkrechte Bewegungsunschärfe beim Scrollen (Bildpixel, 0 = aus) */
  motionBlur?: number;
  /** 0..1 – der Donnerstags-Termin ist herausgestiegen (Platz bleibt leer) */
  lifted?: number;
  /** 0..1 – Ring um den Donnerstags-Termin */
  highlight?: number;
};

export const KalenderSeite: React.FC<KalenderSeiteProps> = ({ scrollY, motionBlur = 0, lifted = 0, highlight = 0 }) => {
  const fid = `kal-mb-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const out = clamp01(lifted);
  const blur = motionBlur > 0.3;
  return (
    <div style={{ position: "relative", width: 1170, height: KAL_SCREEN_H, overflow: "hidden" }}>
      {blur ? (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <defs>
            <filter id={fid} x="0" y="-10%" width="100%" height="120%">
              <feGaussianBlur stdDeviation={`0 ${motionBlur.toFixed(2)}`} />
            </filter>
          </defs>
        </svg>
      ) : null}
      <div style={{ position: "absolute", inset: 0, filter: blur ? `url(#${fid})` : undefined }}>
        <AppShell scrollY={scrollY} height={KAL_SCREEN_H} hideHeader>
          <PageTitle
            title="Kalender"
            description="Alle Termine des Vereins und deine Helferschichten."
            actions={
              <>
                <Button icon="plus">Neuer Termin</Button>
                <Button variant="outline" icon="calendar-days">
                  Abonnieren
                </Button>
                <Button variant="outline" icon="calendar-check">
                  Veranstaltungen
                </Button>
              </>
            }
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Button variant="outline" size="icon" icon="chevron-left" />
            <Button variant="outline" size="icon">
              <Icon name="chevron-left" size={16} style={{ transform: "scaleX(-1)" }} />
            </Button>
            <Button variant="outline">Heute</Button>
            <span style={{ ...TEXT.xl, fontWeight: W.semibold, marginLeft: 6 }}>Juni 2027</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Tabs items={["Monat", "Woche", "Tag", "Liste"]} activeIndex={3} size="md" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <Button variant="outline" icon="sliders-horizontal">
              Filter
            </Button>
          </div>
          <div style={{ display: "grid", gap: 20 }}>
            {VORHER.map((d) => (
              <DayBlock key={d.date} date={d.date} entries={d.entries} />
            ))}
            <DayBlock date="Donnerstag, 3. Juni 2027" entries={DONNERSTAG} headOpacity={1 - out} entryOpacity={[1 - out]} highlight={[highlight]} />
            {CALENDAR_DAYS.slice(1, 3).map((d) => (
              <DayBlock key={d.date} date={d.date} entries={d.entries} />
            ))}
          </div>
        </AppShell>
      </div>
      {/* Kopfzeile bleibt stehen (wie in der App) und wird nicht verwischt */}
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <AppHeader surface={clamp01(scrollY / 48)} />
      </div>
    </div>
  );
};

/** Überschrift + Termin des Donnerstags – das Stück, das als Glaskarte aus dem Bildschirm steigt */
export const DonnerstagBlock: React.FC<{ highlight: number }> = ({ highlight }) => (
  <X3 width={CONTENT_W}>
    <DayBlock date="Donnerstag, 3. Juni 2027" entries={DONNERSTAG} highlight={[highlight]} />
  </X3>
);
