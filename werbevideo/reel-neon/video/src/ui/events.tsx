/**
 * Termin-Detail („Fußball-Training D-Jugend“, termin-detail.png) mit der Karte „Deine Teilnahme“ und der Tag im
 * Kalender (kalender-donnerstag.png).
 *
 * Bildraum (scrollY 0): Zurück-Link y≈330, Titel y 351–456, Datumszeile y 486–540, Schilder y≈570–642,
 * Knöpfe y≈687–795, Karte „Deine Teilnahme“ y 873–1418 (Status y≈1151, Knöpfe y 1250–1358), Karte „Details“ ab y≈1490.
 */
import React from "react";
import { C, CONTENT_W, R, TEXT, W } from "./tokens";
import { Icon } from "./icons";
import { BackLink, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageTitle, X3 } from "./primitives";
import { clamp01, easeInOut, mix } from "./motion";
import { textWidth } from "./measure";

/* ------------------------------------------------------------------ Teilnahme */

export type RsvpCardProps = {
  /**
   * 0..1 – von „Du hast noch nicht geantwortet.“ + [Zusagen][Absagen]
   * zu „✓ Du hast zugesagt.“ + [× Abmelden] (Nachher-Zustand wie RsvpPanel der App).
   */
  progress?: number;
  /** 0..1 – „Zusagen“ gedrückt */
  pressed?: number;
  title?: string;
  description?: string;
  style?: React.CSSProperties;
};

/** Karte „Deine Teilnahme“ (CardHeader + RsvpPanel). */
export const RsvpCard: React.FC<RsvpCardProps> = ({
  progress = 0,
  pressed = 0,
  title = "Deine Teilnahme",
  description = "Anmeldung optional",
  style,
}) => {
  const p = clamp01(progress);
  // Ablauf: „Zusagen“ und alter Satz blenden aus → Platz schließt sich → neuer Satz, Haken zeichnet sich, „Abmelden“
  const fadeOld = clamp01(p / 0.3);
  const collapse = easeInOut(clamp01((p - 0.2) / 0.4));
  const labelOld = clamp01((p - 0.2) / 0.2);
  const fadeNew = clamp01((p - 0.32) / 0.3);
  const iconIn = easeInOut(clamp01((p - 0.25) / 0.3));
  const draw = clamp01((p - 0.38) / 0.5);

  const zusagenW = 2 + 28 + 16 + 8 + textWidth("Zusagen", 15, W.semibold);
  const absW = textWidth("Absagen", 15, W.medium);
  const abmW = textWidth("Abmelden", 15, W.medium);

  return (
    <X3 width={CONTENT_W}>
      <Card style={style}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gap: 12 }}>
            {/* 1 px Luft unten wie in der Aufnahme gemessen (Karte dort 545 statt 542 Bildpixel hoch) */}
            <div style={{ display: "flex", alignItems: "center", ...TEXT.sm, fontWeight: W.medium, marginBottom: 1 }}>
              <span style={{ width: 24 * iconIn, flexShrink: 0, overflow: "visible", display: "flex" }}>
                {draw > 0 ? <Icon name="check" size={16} color={C.check} draw={draw} /> : null}
              </span>
              <span style={{ display: "inline-grid" }}>
                <span style={{ gridArea: "1 / 1", opacity: 1 - fadeOld }}>Du hast noch nicht geantwortet.</span>
                <span style={{ gridArea: "1 / 1", opacity: fadeNew }}>Du hast zugesagt.</span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 0 }}>
              <div
                style={{
                  width: zusagenW * (1 - collapse),
                  marginRight: 8 * (1 - collapse),
                  opacity: 1 - fadeOld,
                  overflow: "visible",
                  display: "flex",
                  transform: `scale(${mix(fadeOld, 1, 0.9)})`,
                  transformOrigin: "left center",
                }}
              >
                {fadeOld < 1 ? (
                  <Button icon="check" pressed={pressed}>
                    Zusagen
                  </Button>
                ) : null}
              </div>
              <Button variant="outline" icon="x">
                <span style={{ position: "relative", display: "inline-block", width: mix(collapse, absW, abmW), height: 21.75 }}>
                  <span style={{ position: "absolute", left: 0, top: 0, opacity: 1 - labelOld }}>Absagen</span>
                  <span style={{ position: "absolute", left: 0, top: 0, opacity: fadeNew }}>Abmelden</span>
                </span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </X3>
  );
};

/* ------------------------------------------------------------------ Details */

/**
 * dy/pull: Ausgleich der Rundung (CSS-px). Die App rundet Grundlinien auf Bildpixel (1/3 px), der Nachbau auf ganze
 * CSS-px – je Zeile an der Aufnahme nachgemessen: dy verschiebt nur den Wert, pull kürzt die Zeile.
 */
const DETAILS: { label: string; value: React.ReactNode; dy?: number; pull?: number }[] = [
  { label: "Beginn", value: "03.06.2027 17:00 Uhr", dy: -1 },
  { label: "Ende", value: "03.06.2027 18:30 Uhr", dy: -1 },
  {
    label: "Ort",
    value: (
      <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}>
        <Icon name="map-pin" size={16} style={{ marginTop: 2 }} />
        <span>Sportplatz</span>
      </span>
    ),
    pull: 1,
  },
  { label: "Abteilung", value: "Jugendarbeit", dy: 1 },
  { label: "Zielgruppe", value: "–", dy: 1 },
  { label: "Teilnehmer", value: "Keine Begrenzung" },
];

/** Karte „Details“ unter der Teilnahme (Beginn, Ende, Ort …). */
export const EventDetailsCard: React.FC = () => (
  <Card>
    <CardHeader>
      <CardTitle>Details</CardTitle>
    </CardHeader>
    <CardContent style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", rowGap: 16, columnGap: 24 }}>
        {DETAILS.map((d) => (
          <div key={d.label} style={{ minWidth: 0, marginBottom: d.pull ? -d.pull : undefined }}>
            <div style={{ ...TEXT.xs, fontWeight: W.medium, letterSpacing: "0.025em", color: C.muted, textTransform: "uppercase" }}>{d.label}</div>
            <div style={{ marginTop: 2, ...TEXT.sm, overflowWrap: "break-word", ...(d.dy ? { position: "relative", top: d.dy } : {}) }}>{d.value}</div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

/* ------------------------------------------------------------------ Seite */

export type EventDetailPageProps = {
  title?: string;
  date?: string;
  /** Teilnahme 0..1 (siehe RsvpCard) */
  rsvp?: number;
  /** 0..1 – „Zusagen“ gedrückt */
  rsvpPressed?: number;
  /** 0..1 Auftritt des Seitenkopfs */
  headAppear?: number;
  /** 0..1 Auftritt der Karte „Deine Teilnahme“ (steigt auf) */
  cardAppear?: number;
};

/** Ganze Seite eines Termins (Inhalt unter der Kopfzeile – in AppShell setzen). */
export const EventDetailPage: React.FC<EventDetailPageProps> = ({
  title = "Fußball-Training D-Jugend",
  date = "Donnerstag, 3. Juni 2027 · 17:00 – 18:30 Uhr",
  rsvp = 0,
  rsvpPressed = 0,
  headAppear = 1,
  cardAppear = 1,
}) => {
  const ca = clamp01(cardAppear);
  return (
    <X3 width={CONTENT_W}>
      <BackLink>Alle Veranstaltungen</BackLink>
      <PageTitle
        title={title}
        appear={headAppear}
        description={
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {date}
            <Badge tone="green">Veröffentlicht</Badge>
            <Badge tone="gray">Training</Badge>
          </span>
        }
        actions={
          <>
            <Button icon="pencil">Bearbeiten</Button>
            <Button variant="outline" icon="more-horizontal">
              Weitere Aktionen
            </Button>
          </>
        }
      />
      <div style={{ display: "grid", gap: 24 }}>
        <div style={ca < 1 ? { opacity: ca, transform: `translateY(${(1 - cardAppear) * 24}px)` } : undefined}>
          <RsvpCard progress={rsvp} pressed={rsvpPressed} />
        </div>
        <EventDetailsCard />
      </div>
    </X3>
  );
};

/* ------------------------------------------------------------------ Kalender */

export type CalendarEntry = {
  time: string;
  title: string;
  /** Art, Abteilung … (gedämpft, mit Abstand) */
  meta: string[];
  location?: string;
  /** Farbe des linken Streifens */
  stripe: string;
  /** Hintergrund (Art des Termins, dunkel: Training emerald-950/40, Sitzung violet-950/40 … – C.emerald50 usw.) */
  bg: string;
};

/** Donnerstag, 3. Juni 2027 aus kalender-donnerstag.png. */
export const CALENDAR_THURSDAY: CalendarEntry[] = [
  { time: "17:00 – 18:30", title: "Fußball-Training D-Jugend", meta: ["Training", "Jugendarbeit"], location: "Sportplatz", stripe: "#D97706", bg: C.emerald50 },
  { time: "19:00 – 20:30", title: "Sitzung der Abteilungsleitungen", meta: ["Sitzung"], location: "Vereinsheim, Besprechungsraum", stripe: "#8E51FF", bg: C.violet50 },
];

/** Ein Termin im Kalender (EntryRow der App): farbiger Streifen links, Uhrzeit, Titel, gedämpfte Angaben. */
export const CalendarEntryRow: React.FC<
  CalendarEntry & {
    /** 0..1 – gleitet herein */
    appear?: number;
    /** 0..1 – hervorgehoben (Ring in Markenfarbe) */
    highlight?: number;
    /** 0..1 – gedrückt */
    pressed?: number;
  }
> = ({ time, title, meta, location, stripe, bg, appear = 1, highlight = 0, pressed = 0 }) => {
  const a = clamp01(appear);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        boxSizing: "border-box",
        borderRadius: R.lg,
        border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${stripe}`,
        padding: 12,
        background: bg,
        boxShadow: highlight > 0 ? `0 0 0 ${2 * clamp01(highlight)}px ${C.primary}` : undefined,
        filter: pressed > 0 ? `brightness(${1 - 0.05 * clamp01(pressed)})` : undefined,
        opacity: a,
        transform: a < 1 || pressed > 0 ? `translateX(${(1 - appear) * 30}px) scale(${1 - 0.02 * clamp01(pressed)})` : undefined,
      }}
    >
      <span style={{ ...TEXT.sm, fontWeight: W.medium, fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span style={{ display: "grid", minWidth: 0, gap: 4 }}>
        <span style={{ fontWeight: W.medium }}>{title}</span>
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 2, ...TEXT.sm, color: C.muted }}>
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
          {location ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="map-pin" size={14} />
              {location}
            </span>
          ) : null}
        </span>
      </span>
    </div>
  );
};

/** Ein Tag der Kalender-Liste: Überschrift „Donnerstag, 3. Juni 2027“ und die Termine darunter. */
export const CalendarDayItem: React.FC<{
  date?: string;
  entries?: CalendarEntry[];
  /** Auftritt je Termin */
  entryAppear?: number[];
  /** Hervorhebung je Termin */
  entryHighlight?: number[];
  entryPressed?: number[];
}> = ({ date = "Donnerstag, 3. Juni 2027", entries = CALENDAR_THURSDAY, entryAppear, entryHighlight, entryPressed }) => (
  <X3 width={CONTENT_W}>
    <div>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, ...TEXT.sm, fontWeight: W.semibold }}>{date}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {entries.map((e, i) => (
          <CalendarEntryRow key={e.title} {...e} appear={entryAppear?.[i] ?? 1} highlight={entryHighlight?.[i] ?? 0} pressed={entryPressed?.[i] ?? 0} />
        ))}
      </div>
    </div>
  </X3>
);

/** Weitere Tage aus kalender-donnerstag.png (für eine ganze Liste). */
export const CALENDAR_DAYS: { date: string; entries: CalendarEntry[] }[] = [
  { date: "Donnerstag, 3. Juni 2027", entries: CALENDAR_THURSDAY },
  {
    date: "Freitag, 4. Juni 2027",
    entries: [{ time: "19:00 – 20:30", title: "Handball-Training Damen", meta: ["Training", "Handball"], location: "Sporthalle Nord", stripe: "#E7000B", bg: C.emerald50 }],
  },
  {
    date: "Samstag, 5. Juni 2027",
    entries: [{ time: "09:00 – 13:00", title: "Arbeitseinsatz Vereinsheim", meta: ["Arbeitseinsatz"], location: "Vereinsheim", stripe: "#FE9A00", bg: C.amber50 }],
  },
  {
    date: "Montag, 7. Juni 2027",
    entries: [{ time: "19:30 – 21:30", title: "Vorstandssitzung", meta: ["Sitzung"], location: "Vereinsheim, Besprechungsraum", stripe: "#8E51FF", bg: C.violet50 }],
  },
  {
    date: "Dienstag, 8. Juni 2027",
    entries: [{ time: "18:30 – 20:00", title: "Fußball-Training Herren", meta: ["Training", "Fußball"], location: "Sportplatz", stripe: "#16A34A", bg: C.emerald50 }],
  },
];

/** Kalender-Liste (Agenda, grid gap-5) mehrerer Tage. */
export const CalendarAgenda: React.FC<{ days?: typeof CALENDAR_DAYS; dayAppear?: number[] }> = ({ days = CALENDAR_DAYS, dayAppear }) => (
  <X3 width={CONTENT_W}>
    <div style={{ display: "grid", gap: 20 }}>
      {days.map((d, i) => {
        const a = clamp01(dayAppear?.[i] ?? 1);
        return (
          <div key={d.date} style={a < 1 ? { opacity: a, transform: `translateY(${(1 - a) * 20}px)` } : undefined}>
            <CalendarDayItem date={d.date} entries={d.entries} />
          </div>
        );
      })}
    </div>
  </X3>
);
