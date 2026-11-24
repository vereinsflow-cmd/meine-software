/**
 * Dashboard (dashboard.png): Begrüßung „Willkommen, Anna!“ mit Rollen-Schild, Knöpfe, Reiter, das Kennzahlen-Karussell
 * (blau „Mitglieder 233 ▲ +23 (+11,0 %)“, rechts angeschnitten violett „Termine 17“), die Punkte darunter und die Gruppe
 * „Für dich“ mit der Karte „Meine Aufgaben“.
 *
 * Bildraum (scrollY 0): Begrüßung y≈234–363, Schild y≈393–447, „Neue Veranstaltung“ y≈501–609, Reiter y≈809–965,
 * Karte „Mitglieder“ x 48–886, y 1050–1985 (Zahl y≈1252–1329, Chip y 1379–1451), „Termine“ ab x 922, Punkte y≈2031–2054,
 * „FÜR DICH“ y≈2206–2247, Karte „Meine Aufgaben“ ab y≈2313.
 */
import React from "react";
import { interpolateColors } from "remotion";
import {
  C,
  CONTENT_W,
  KPI_GRADIENT,
  type KpiAccent,
  NBSP,
  R,
  SHADOW,
  TEXT,
  W,
  withAlpha,
} from "./tokens";
import { Icon, type IconName } from "./icons";
import { Badge, Button, PageTitle, X3 } from "./primitives";
import { KpiShell, KpiValue, Sparkline } from "./kpi";
import { clamp01, formatDE, mix } from "./motion";

/** Mitgliederzahl der letzten 12 Monate (Okt 25 – jetzt), aus der Aufnahme nachgemessen. */
export const MEMBER_POINTS = [
  210, 212, 213, 214, 215, 218, 221, 223, 224, 226, 225, 229, 233,
];

/** Begrüßung mit Rollen-Schild und den Knöpfen des Dashboards. */
export const Greeting: React.FC<{
  name?: string;
  role?: string;
  /** 0..1 Auftritt */
  appear?: number;
  /** Knöpfe zeigen */
  actions?: boolean;
  /** 0..1 – „Neues Mitglied“ gedrückt */
  newMemberPressed?: number;
}> = ({
  name = "Anna",
  role = "Vereinsadministrator",
  appear = 1,
  actions = true,
  newMemberPressed = 0,
}) => (
  <X3 width={CONTENT_W}>
    <PageTitle
      title={`Willkommen, ${name}!`}
      appear={appear}
      marginBottom={20}
      titleStyle={{
        ...TEXT["4xl"],
        fontWeight: W.extrabold,
        letterSpacing: "-0.03em",
      }}
      descriptionStyle={{ marginTop: 4 }}
      description={
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            // bg-primary/10 ring-1 ring-primary/20 ring-inset
            background: withAlpha(C.primary, 0.1),
            padding: "4px 12px",
            verticalAlign: "middle",
            ...TEXT.sm,
            fontWeight: W.medium,
            color: C.primary,
            boxShadow: `inset 0 0 0 1px ${withAlpha(C.primary, 0.2)}`,
          }}
        >
          <Icon name="shield-check" size={14} />
          {role}
        </span>
      }
      actions={
        actions ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              width: "100%",
            }}
          >
            <Button
              icon="plus"
              block
              style={{
                gridColumn: "span 2",
                borderRadius: 999,
                boxShadow: `0 8px 22px -10px ${C.primary}`,
              }}
            >
              Neue Veranstaltung
            </Button>
            <Button
              variant="outline"
              icon="plus"
              block
              pressed={newMemberPressed}
              style={{ borderRadius: 999 }}
            >
              Neues Mitglied
            </Button>
            <Button
              variant="outline"
              icon="filter"
              block
              style={{ borderRadius: 999 }}
            >
              Anpassen
            </Button>
          </div>
        ) : undefined
      }
    />
  </X3>
);

/**
 * Reiter des Dashboards (runde Leiste, am Handy waagerecht abgeschnitten). Dunkel wie dashboard-tabs.tsx der App:
 * Leiste muted/90 mit Ring foreground/10, gewählter Reiter foreground/15 mit Innenrand foreground/20 (ohne Schatten).
 */
export const DashboardTabs: React.FC<{ active?: number }> = ({
  active = 0,
}) => {
  const items = [
    "Übersicht",
    "Termine & Helfer",
    "Mitglieder",
    "Aufgaben & Aktivität",
  ];
  return (
    <X3 width={CONTENT_W}>
      <div
        style={{
          margin: "0 -16px",
          padding: "4px 16px",
          overflow: "hidden",
          maskImage:
            "linear-gradient(to right, #000 calc(100% - 48px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, #000 calc(100% - 48px), transparent)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "max-content",
            gap: 4,
            height: 52,
            boxSizing: "border-box",
            padding: 4,
            borderRadius: 999,
            background: withAlpha(C.mutedBg, 0.9),
            boxShadow: `0 0 0 1px ${withAlpha(C.fg, 0.1)}, ${SHADOW.sm}`,
          }}
        >
          {items.map((t, i) => (
            <div
              key={t}
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
                border: "1px solid transparent",
                borderRadius: 999,
                ...TEXT.base,
                fontWeight: i === active ? W.semibold : W.medium,
                color: i === active ? C.fg : C.muted,
                background: i === active ? withAlpha(C.fg, 0.15) : undefined,
                boxShadow:
                  i === active
                    ? `inset 0 0 0 1px ${withAlpha(C.fg, 0.2)}`
                    : undefined,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    </X3>
  );
};

/* ------------------------------------------------------------------ Kennzahlkarten mit Kurs */

/** Breite einer Karte im Karussell am Handy: w-[78%] von 358 CSS-px. */
export const KPI_CARD_W = CONTENT_W * 0.78;
/** Höhe der Karten im Karussell (935 Bildpixel). */
export const KPI_CARD_H = 935 / 3;

export type QuoteKpiCardProps = {
  label: string;
  accent: KpiAccent;
  icon: IconName;
  /** große Zahl (fertig formatiert) */
  value: string;
  /** Richtung der Veränderung: ▲ grün, ▼ rot */
  direction?: "up" | "down";
  /** „+23“ / „−2“ */
  amount: string;
  /** „(+11,0 %)“ */
  percent?: string;
  /** „in 12 Monaten“ */
  since?: string;
  /** Vergleich: Schild (positiv, grün auf Weiß) oder schlichter weißer Satz (neutral) */
  compare?: { text: string; tone: "success" | "neutral" };
  points: number[];
  /** Zeitraum-Knöpfe und der gewählte */
  periods?: string[];
  activePeriod?: string;
  /** Zeitraum rechts unten („Okt 25 – jetzt“, Teil nach „–“ fett) */
  range?: [string, string];
  draw?: number;
  chipAppear?: number;
  /** Veränderungs-Chip und Vergleich zeigen. Im Spot aus: Trendzahlen stehen nicht in der Faktenliste (manifest.json). */
  trends?: boolean;
  width?: number;
  height?: number;
  appear?: number;
  lift?: number;
};

/** Weiße Schilder auf der Verlaufskarte – auch im Dunkeln weiß (App: ohne dark:), Schrift daher in der hellen Stufe. */
const CHIP_UP = "#006045"; // emerald-800
const CHIP_DOWN = "#C10007"; // red-700

const chipBase: React.CSSProperties = {
  display: "inline-flex",
  minHeight: 24,
  alignItems: "center",
  gap: 4,
  borderRadius: 18,
  background: "#fff",
  padding: "2px 10px",
  boxShadow: "0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)",
};

/** Kennzahlkarte mit Kurs (StatCard + QuoteArea der App): Zahl, Veränderungs-Chip, Vergleich, Kurs, Zeitraum-Knöpfe. */
export const QuoteKpiCard: React.FC<QuoteKpiCardProps> = ({
  label,
  accent,
  icon,
  value,
  direction = "up",
  amount,
  percent,
  since,
  compare,
  points,
  periods = ["6 M", "12 M", "5 J"],
  activePeriod = "12 M",
  range = ["Okt 25", "jetzt"],
  draw = 1,
  chipAppear = 1,
  trends = false,
  width = 279,
  height = KPI_CARD_H,
  appear = 1,
  lift = 0,
}) => {
  const a = clamp01(appear);
  const ca = clamp01(chipAppear);
  return (
    <X3 width={width}>
      <KpiShell
        label={label}
        accent={accent}
        icon={icon}
        width={width}
        lift={lift}
        style={{
          height,
          ...(a < 1
            ? {
                opacity: a,
                transform: `translateY(${(1 - appear) * 30}px) scale(${0.96 + 0.04 * appear})`,
              }
            : {}),
        }}
        extra={
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              paddingTop: 16,
            }}
          >
            <div style={{ margin: "0 -20px" }}>
              <Sparkline
                points={points}
                width={width}
                draw={draw}
                ink={KPI_GRADIENT[accent].ink}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  gap: 2,
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.15)",
                  padding: 2,
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
                }}
              >
                {periods.map((p) => (
                  <span
                    key={p}
                    style={{
                      height: 24,
                      minWidth: 24,
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 999,
                      padding: "0 8px",
                      ...TEXT.xs,
                      fontWeight: W.bold,
                      whiteSpace: "nowrap",
                      background: p === activePeriod ? "#fff" : undefined,
                      color: p === activePeriod ? "#0F172B" : "#fff",
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
              <span
                style={{
                  ...TEXT.xs,
                  fontWeight: W.medium,
                  whiteSpace: "nowrap",
                }}
              >
                {range[0]} – <b style={{ fontWeight: W.bold }}>{range[1]}</b>
              </span>
            </div>
          </div>
        }
      >
        {/* text-4xl verdrängt in der App leading-none (tailwind-merge) → Zeilenhöhe 40 px */}
        <KpiValue fontSize={36} style={{ marginTop: 12, lineHeight: "40px" }}>
          {value}
        </KpiValue>
        {trends ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 8,
              rowGap: 4,
            }}
          >
            <span
              style={{
                ...chipBase,
                color: direction === "up" ? CHIP_UP : CHIP_DOWN,
                fontSize: 13,
                lineHeight: "18.2px",
                fontWeight: W.bold,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                opacity: ca,
                transform: ca < 1 ? `scale(${0.7 + 0.3 * ca})` : undefined,
                transformOrigin: "left center",
              }}
            >
              <span style={{ whiteSpace: "nowrap" }}>
                {direction === "up" ? "▲" : "▼"} {amount}
              </span>
              {percent ? (
                <span style={{ fontWeight: W.semibold, whiteSpace: "nowrap" }}>
                  {" "}
                  {percent}
                </span>
              ) : null}
            </span>
            {since ? (
              <span
                style={{
                  fontSize: 13,
                  lineHeight: "18.2px",
                  fontWeight: W.medium,
                  whiteSpace: "nowrap",
                  opacity: ca,
                }}
              >
                {since}
              </span>
            ) : null}
          </div>
        ) : null}
        {trends && compare ? (
          compare.tone === "success" ? (
            <div
              style={{
                ...chipBase,
                marginTop: 8,
                width: "fit-content",
                ...TEXT.sm,
                fontWeight: W.semibold,
                color: CHIP_UP,
              }}
            >
              {compare.text}
            </div>
          ) : (
            <div
              style={{
                marginTop: 8,
                ...TEXT.sm,
                fontWeight: W.medium,
                color: "rgba(255,255,255,0.95)",
                whiteSpace: "nowrap",
              }}
            >
              {compare.text}
            </div>
          )
        ) : null}
      </KpiShell>
    </X3>
  );
};

export type MembersKpiCardProps = {
  /** Mitgliederzahl (darf hochzählen) */
  value?: number;
  /** Veränderung in 12 Monaten */
  change?: number;
  /** Prozent der Veränderung */
  percent?: number;
  /** Vergleich zum Vormonat */
  vsLastMonth?: number;
  points?: number[];
  /** 0..1 – Kurs zeichnet sich */
  draw?: number;
  /** 0..1 – Chip „▲ +23 (+11,0 %)“ ploppt auf */
  chipAppear?: number;
  /** Vergleichs-Schild „+4 gegenüber dem Vormonat“ zeigen */
  showCompare?: boolean;
  /** Breite in CSS-px (Karussell am Handy 279,24) */
  width?: number;
  /** Höhe in CSS-px (Karussell am Handy 311,67 = 935 Bildpixel) */
  height?: number;
  /** 0..1 – Karte steigt auf */
  appear?: number;
  lift?: number;
};

/** Kennzahlkarte „Mitglieder“ (blau) mit Zahl, Veränderungs-Chip, Vergleich, Kurs und Zeitraum-Knöpfen. */
export const MembersKpiCard: React.FC<MembersKpiCardProps> = ({
  value = 233,
  change = 23,
  percent = 11,
  vsLastMonth = 4,
  points = MEMBER_POINTS,
  showCompare = true,
  width = KPI_CARD_W,
  ...rest
}) => (
  <QuoteKpiCard
    label="Mitglieder"
    accent="blue"
    icon="users"
    value={formatDE(Math.round(value))}
    direction={change < 0 ? "down" : "up"}
    amount={`${change < 0 ? "−" : "+"}${Math.abs(Math.round(change))}`}
    percent={`(${percent < 0 ? "−" : "+"}${formatDE(Math.abs(percent), 1)}${NBSP}%)`}
    since="in 12 Monaten"
    compare={
      showCompare
        ? { text: `+${vsLastMonth} gegenüber dem Vormonat`, tone: "success" }
        : undefined
    }
    points={points}
    width={width}
    {...rest}
  />
);

/** Termine je Woche (12 W), Anfang aus der Aufnahme nachgemessen (der Rest liegt am Handy außerhalb). */
export const EVENT_POINTS = [
  19, 19, 20, 20, 21, 20, 19, 18, 18, 17, 17, 18, 17,
];

/** Kennzahlkarte „Termine“ (violett) – im Karussell rechts angeschnitten. */
export const EventsKpiCard: React.FC<
  Omit<Partial<QuoteKpiCardProps>, "value"> & {
    value?: number;
    nextInDays?: number;
  }
> = ({ value = 17, nextInDays = 4, width = KPI_CARD_W, ...rest }) => (
  <QuoteKpiCard
    label="Termine"
    accent="violet"
    icon="calendar-check"
    value={formatDE(Math.round(value))}
    direction="down"
    amount="−2"
    percent={`(−10,5${NBSP}%)`}
    since="in 12 Wochen"
    compare={{
      text: `Nächster Termin in ${nextInDays} Tagen`,
      tone: "neutral",
    }}
    points={EVENT_POINTS}
    periods={["12 W", "6 M", "12 M"]}
    activePeriod="12 W"
    range={["11.03.", "jetzt"]}
    width={width}
    {...rest}
  />
);

/** Punkte unter dem Karussell: aktive Karte als breite Kapsel (w-5), andere als Punkt (Kommazahl = Übergang). */
export const KpiDots: React.FC<{ count?: number; active?: number }> = ({
  count = 4,
  active = 0,
}) => (
  <X3 width={CONTENT_W}>
    <div
      style={{
        marginTop: 8,
        display: "flex",
        justifyContent: "center",
        gap: 4,
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const on = clamp01(1 - Math.abs(active - i));
        return (
          <span
            key={i}
            style={{
              width: 24,
              height: 24,
              display: "grid",
              placeItems: "center",
            }}
          >
            <span
              style={{
                height: 8,
                width: mix(on, 8, 20),
                borderRadius: 999,
                background: interpolateColors(
                  on,
                  [0, 1],
                  // bg-muted-foreground/40 → bg-primary
                  [withAlpha(C.muted, 0.4), C.primary],
                ),
              }}
            />
          </span>
        );
      })}
    </div>
  </X3>
);

/** Karussell der Kennzahlen am Handy: Karten nebeneinander (Lücke 12), bis an den Bildschirmrand, darunter die Punkte. */
export const KpiCarousel: React.FC<{
  /** Karten (je KPI_CARD_W breit) */
  children: React.ReactNode;
  /** waagerechter Scroll in CSS-px (eine Karte weiter = KPI_CARD_W + 12) */
  scrollX?: number;
  /** Zahl der Punkte (Standard: Zahl der Karten) */
  dots?: number;
}> = ({ children, scrollX = 0, dots }) => {
  const items = React.Children.toArray(children);
  const step = KPI_CARD_W + 12;
  return (
    <X3 width={CONTENT_W}>
      <div
        style={{
          margin: "-4px -16px -40px",
          padding: "4px 16px 40px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            transform: scrollX ? `translateX(${-scrollX}px)` : undefined,
          }}
        >
          {items.map((item, i) => (
            <div key={i} style={{ flexShrink: 0, width: KPI_CARD_W }}>
              {item}
            </div>
          ))}
        </div>
      </div>
      <KpiDots count={dots ?? items.length} active={scrollX / step} />
    </X3>
  );
};

/* ------------------------------------------------------------------ Für dich */

/** Gruppen-Überschrift des Dashboards („• FÜR DICH ————“). */
export const GroupHeading: React.FC<{ title: string; appear?: number }> = ({
  title,
  appear = 1,
}) => {
  const a = clamp01(appear);
  return (
    <X3 width={CONTENT_W}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          ...TEXT.sm,
          fontWeight: W.semibold,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          // text-foreground/70
          color: withAlpha(C.fg, 0.7),
          opacity: a,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            flexShrink: 0,
            borderRadius: "50%",
            background: C.primary,
          }}
        />
        {title}
        <span
          style={{
            height: 1,
            flex: 1,
            background: C.border,
            transform: a < 1 ? `scaleX(${a})` : undefined,
            transformOrigin: "left center",
          }}
        />
      </div>
    </X3>
  );
};

export type Task = {
  title: string;
  due?: string;
  priority: string;
  status: string;
  high?: boolean;
  statusTone?: "gray" | "red";
};

export const TASKS: Task[] = [
  {
    title: "Helfer einteilen",
    due: "09.06.2027",
    priority: "Hoch",
    status: "Offen",
    high: true,
  },
  {
    title: "Bierzeltgarnituren mieten",
    priority: "Normal",
    status: "Blockiert",
    statusTone: "red",
  },
];

/**
 * Karte „Meine Aufgaben“ (Widget der App, hervorgehoben: Ring in Markenfarbe, blauer Schein oben links). Dunkel wie die App:
 * Schein blue-500 18 %, Ring 2 px primary/60, feine Lichtkante oben; Zeilen muted/40 bzw. hohe Priorität amber-400/10.
 */
export const TasksWidget: React.FC<{
  tasks?: Task[];
  description?: string;
  /** Auftritt je Aufgabe */
  rowAppear?: number[];
  /** 0..1 – Karte steigt auf */
  appear?: number;
}> = ({
  tasks = TASKS,
  description = "Im Verein: 5 offen, 0 überfällig",
  rowAppear,
  appear = 1,
}) => {
  const a = clamp01(appear);
  return (
    <X3 width={CONTENT_W}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          padding: "20px 0",
          overflow: "hidden",
          borderRadius: 28,
          // tile-tint: color-mix(in oklab, blue-500 18 %, transparent)
          background: `radial-gradient(120% 85% at 0% 0%, rgba(43,127,255,0.18), transparent 62%), ${C.card}`,
          boxShadow: `0 0 0 2px ${withAlpha(C.primary, 0.6)}, inset 0 1px 0 rgba(255,255,255,0.05), ${SHADOW.sm}`,
          ...TEXT.sm,
          ...(a < 1
            ? { opacity: a, transform: `translateY(${(1 - appear) * 24}px)` }
            : {}),
        }}
      >
        <div
          style={{
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 13.6,
              background: C.primary,
              color: C.primaryFg,
            }}
          >
            <Icon name="list-checks" size={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 19,
                lineHeight: 1.375,
                fontWeight: W.bold,
                letterSpacing: "-0.025em",
              }}
            >
              Meine Aufgaben
            </div>
            <div style={{ marginTop: 2, ...TEXT.sm, color: C.muted }}>
              {description}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: "0 20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {tasks.map((t, i) => {
              const ra = clamp01(rowAppear?.[i] ?? 1);
              return (
                <div
                  key={t.title}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                    borderRadius: R.xl,
                    // dark:border-amber-400/30 dark:bg-amber-400/10 bzw. bg-muted/40
                    border: `1px solid ${t.high ? "rgba(255,185,0,0.3)" : C.border}`,
                    background: t.high ? "rgba(255,185,0,0.1)" : withAlpha(C.mutedBg, 0.4),
                    padding: 12,
                    opacity: ra,
                    transform:
                      ra < 1 ? `translateX(${(1 - ra) * 30}px)` : undefined,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...TEXT.base, fontWeight: W.semibold }}>
                      {t.title}
                    </div>
                    {t.due ? (
                      <div style={{ ...TEXT.sm, color: C.muted }}>
                        Fällig: {t.due}
                      </div>
                    ) : null}
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Badge tone={t.high ? "orange" : "gray"}>
                      {t.priority}
                    </Badge>
                    <Badge tone={t.statusTone ?? "gray"}>{t.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
          <span
            style={{
              display: "inline-flex",
              width: "fit-content",
              alignItems: "center",
              gap: 6,
              paddingTop: 4,
              ...TEXT.sm,
              fontWeight: W.semibold,
              color: C.primary,
            }}
          >
            Alle Aufgaben
            <Icon name="arrow-right" size={16} />
          </span>
        </div>
      </div>
    </X3>
  );
};

/* ------------------------------------------------------------------ Seite */

export type DashboardTopProps = MembersKpiCardProps & {
  greetingAppear?: number;
  /** Karussell waagerecht (CSS-px) */
  carouselX?: number;
  /** Kennzahl „Termine“ (rechts angeschnitten) */
  eventsValue?: number;
  eventsDraw?: number;
  /** 0..1 – Gruppe „Für dich“ erscheint */
  forYouAppear?: number;
};

/** Oberer Teil des Dashboards (Begrüßung, Knöpfe, Reiter, Karussell mit Punkten, „Für dich“) – wie dashboard.png. */
export const DashboardTop: React.FC<DashboardTopProps> = ({
  greetingAppear = 1,
  carouselX = 0,
  eventsValue,
  eventsDraw,
  forYouAppear = 1,
  ...card
}) => (
  <X3 width={CONTENT_W}>
    <Greeting appear={greetingAppear} />
    <DashboardTabs />
    <div style={{ marginTop: 24 }}>
      <KpiCarousel scrollX={carouselX} dots={4}>
        <MembersKpiCard {...card} />
        <EventsKpiCard
          value={eventsValue}
          draw={eventsDraw}
          appear={card.appear}
        />
      </KpiCarousel>
    </div>
    <div style={{ marginTop: 40, display: "grid", gap: 16 }}>
      <GroupHeading title="Für dich" appear={forYouAppear} />
      <TasksWidget appear={forYouAppear} />
    </div>
  </X3>
);
