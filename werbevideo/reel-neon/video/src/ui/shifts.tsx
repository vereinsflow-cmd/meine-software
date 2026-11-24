/**
 * Helferplan einer Veranstaltung („Sommerfest 2027“) wie /helferplanung/[id] am Handy (schichten.png, schichten-liste.png)
 * und die Zeile „offene Schicht“ mit Besetzungsbalken (Dashboard/Helferplanung, phone-helferplanung-light-780.webp).
 *
 * Besetzungstext nach staffing-text.ts der App: „2 von 4 · 2 frei“ (frei grau), „0 von 3 · 3 frei“ (frei bernstein, solange
 * noch niemand eingetragen ist), „3 von 3 · voll“ (voll grün).
 *
 * Bildraum: ShiftsPage mit scrollY = 1821 entspricht schichten-liste.png – Getränkestand y 228–893, Grillstand 894–1559,
 * Kuchenbuffet 1559–2224 (je 665 hoch), „Eintragen“ x 678–957 in Zeile + 33.
 */
import React from "react";
import { C, CONTENT_W, R, SHADOW, TEXT, W, withAlpha } from "./tokens";

/** Text der Schicht in text-foreground/80 (dunkel: Weiß 80 %, 11 : 1 auf der Karte). */
const FG80 = withAlpha(C.fg, 0.8);
import { Icon } from "./icons";
import { BackLink, Button, PageTitle, ProgressBar, X3 } from "./primitives";
import { clamp01 } from "./motion";

export type ShiftButton = "eintragen" | "austragen" | "none";

export type Shift = {
  time: string;
  title: string;
  minAge?: number;
  task?: string;
  meetingPoint?: string;
  responsible?: string;
  capacity: number;
  /** Eingetragene (in Reihenfolge) */
  names: string[];
  button?: ShiftButton;
  /** Hinweis statt Knopf, z. B. Überschneidung mit der eigenen Schicht */
  note?: string;
};

export const SHIFTS: Shift[] = [
  {
    time: "09:00 – 11:00 Uhr",
    title: "Aufbau",
    minAge: 16,
    task: "Zelte, Tische und Bänke aufbauen",
    meetingPoint: "Vereinsheim, Lager",
    responsible: "Claudia Abel",
    capacity: 5,
    names: ["Hans Hellwig", "Lukas Koch", "Sophie Krüger", "Jonas Hoffmann", "Felix Becker"],
    button: "none",
  },
  {
    time: "12:00 – 15:00 Uhr",
    title: "Getränkestand",
    minAge: 16,
    task: "Getränke ausschenken und kassieren",
    meetingPoint: "Getränkestand am Eingang",
    responsible: "Bernd Vogt",
    capacity: 4,
    names: ["Hans Hellwig", "Laura Braun"],
    button: "eintragen",
  },
  {
    time: "12:00 – 16:00 Uhr",
    title: "Grillstand",
    minAge: 18,
    task: "Bratwurst und Steaks grillen",
    meetingPoint: "Grillzelt",
    responsible: "Bernd Vogt",
    capacity: 3,
    names: [],
    button: "eintragen",
  },
  {
    time: "13:00 – 17:00 Uhr",
    title: "Kuchenbuffet",
    task: "Kuchen annehmen und verkaufen",
    meetingPoint: "Kuchenzelt",
    responsible: "Bernd Vogt",
    capacity: 3,
    names: ["Maria Mertens"],
    button: "eintragen",
  },
  {
    time: "18:00 – 20:00 Uhr",
    title: "Abbau",
    minAge: 16,
    task: "Alles abbauen und aufräumen",
    meetingPoint: "Vereinsheim, Lager",
    responsible: "Bernd Vogt",
    capacity: 6,
    names: ["Paul Koch"],
    button: "eintragen",
  },
];

/** Hinweis der App, wenn sich eine Schicht mit der eigenen überschneidet. */
export const OVERLAP_NOTE = "Überschneidet sich mit deiner Schicht „Getränkestand“ (Sommerfest 2027, 12:00 – 15:00 Uhr).";

/** Besetzung in Worten (staffing-text.ts der App). */
export const staffing = (filled: number, capacity: number) => {
  const count = `${filled} von ${capacity}`;
  if (filled >= capacity) return { count, note: "voll", color: C.green, strong: true };
  return { count, note: `${capacity - filled} frei`, color: filled === 0 ? C.orange : C.muted, strong: filled === 0 };
};

export type ShiftCardProps = Shift & {
  /** Zahl der Eingetragenen (darf animieren; Standard names.length) – gerundet angezeigt */
  filled?: number;
  /** eigener Name, der hinten angehängt wird („Anna Adler (du)“) */
  me?: string;
  /** 0..1 – eigener Name erscheint */
  meAppear?: number;
  /** 0..1 – Knopf gedrückt */
  pressed?: number;
  /** 0..1 – Zeile getönt (bg-primary/5, ohne dark: in der App) */
  highlight?: number;
  /** 0..1 – Wechsel „Eintragen“ (blau) → „Austragen“ (schwarz) */
  signedUp?: number;
  /** 0..1 – Zeile erscheint */
  appear?: number;
  /** Trennlinie oben (zweite und weitere Zeile) */
  divider?: boolean;
};

/** Eine Schicht im Helferplan (ShiftRow der App, Handy-Fassung): 356 CSS-px breit (1068 im Bildraum), Getränkestand 665 hoch. */
export const ShiftCard: React.FC<ShiftCardProps> = (props) => (
  <X3 width={CONTENT_W - 2}>
    <ShiftRow {...props} />
  </X3>
);

const ShiftRow: React.FC<ShiftCardProps> = ({
  time,
  title,
  minAge,
  task,
  meetingPoint,
  responsible,
  capacity,
  names,
  button = "eintragen",
  note,
  filled,
  me,
  meAppear = 1,
  pressed = 0,
  highlight = 0,
  signedUp,
  appear = 1,
  divider,
}) => {
  const meA = me ? clamp01(meAppear) : 0;
  const n = Math.round(filled ?? names.length + (me ? (meA >= 0.5 ? 1 : 0) : 0));
  const st = staffing(n, capacity);
  const a = clamp01(appear);
  // Knopf: „Eintragen“ (Markenfarbe) ↔ „Austragen“ (Schriftfarbe), weich überblendet
  const su = signedUp ?? (button === "austragen" ? 1 : 0);
  const showBtn = button !== "none";
  const allNames = [...names];
  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        columnGap: 16,
        rowGap: 8,
        padding: 16,
        borderTop: divider ? `1px solid ${C.border}` : undefined,
        background: highlight > 0 ? withAlpha(C.primary, 0.05 * clamp01(highlight)) : undefined,
        opacity: a,
        transform: a < 1 ? `translateY(${(1 - appear) * 16}px)` : undefined,
      }}
    >
      <div style={{ gridColumn: 1, gridRow: 1, alignSelf: "center", ...TEXT.sm, fontVariantNumeric: "tabular-nums" }}>{time}</div>

      <div style={{ gridColumn: "1 / span 2", minWidth: 0 }}>
        <div style={{ ...TEXT.base, fontWeight: W.semibold }}>
          {title}
          {minAge ? <span style={{ marginLeft: 8, ...TEXT.sm, fontWeight: W.normal, color: C.muted }}>ab {minAge} Jahren</span> : null}
        </div>
        {task ? <div style={{ ...TEXT.sm, color: FG80 }}>{task}</div> : null}
        {meetingPoint || responsible ? (
          <div style={{ marginTop: 6, ...TEXT.sm, color: C.muted }}>
            {meetingPoint ? <div>Treffpunkt: {meetingPoint}</div> : null}
            {responsible ? <div>Verantwortlich: {responsible}</div> : null}
          </div>
        ) : null}
        {note ? <div style={{ marginTop: 6, ...TEXT.sm, color: C.muted }}>{note}</div> : null}
      </div>

      <div style={{ gridColumn: "1 / span 2", minWidth: 0 }}>
        <div style={{ ...TEXT.sm, fontWeight: W.medium, fontVariantNumeric: "tabular-nums" }}>
          {st.count}{" "}
          <span style={{ fontWeight: st.strong ? W.medium : W.normal, color: st.color }}>· {st.note}</span>
        </div>
        <div style={{ marginTop: 2, ...TEXT.sm, color: FG80 }}>
          {allNames.length === 0 ? (
            // leer: „Noch niemand eingetragen“ blendet aus, danach der eigene Name ein (kein Sprung)
            <span style={{ display: "inline-grid" }}>
              <span style={{ gridArea: "1 / 1", color: C.muted, opacity: 1 - clamp01(meA * 2) }}>Noch niemand eingetragen</span>
              {me && meA > 0.5 ? (
                <span style={{ gridArea: "1 / 1", opacity: clamp01(meA * 2 - 1), transform: `translateY(${(1 - clamp01(meA * 2 - 1)) * 6}px)` }}>{me} (du)</span>
              ) : null}
            </span>
          ) : (
            <>
              {allNames.join(", ")}
              {me && meA > 0 ? (
                <span style={{ opacity: meA, display: "inline-block", transform: `translateY(${(1 - meA) * 6}px)` }}>
                  , {me} (du)
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div style={{ gridColumn: 2, gridRow: 1, margin: "-6px -8px -6px 0", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: 2 }}>
        {showBtn ? (
          <Button variant="ghost" size="sm" pressed={pressed} style={{ height: 44, position: "relative" }} textColor={su >= 0.5 ? C.fg : C.primary}>
            <span style={{ display: "inline-grid" }}>
              {/* nacheinander: „Eintragen“ gleitet nach oben weg, danach kommt „Austragen“ von unten */}
              <span style={{ gridArea: "1 / 1", opacity: 1 - clamp01(su * 2), transform: `translateY(${-5 * clamp01(su * 2)}px)`, color: C.primary, textAlign: "right" }}>Eintragen</span>
              <span style={{ gridArea: "1 / 1", opacity: clamp01(su * 2 - 1), transform: `translateY(${5 * (1 - clamp01(su * 2 - 1))}px)`, color: C.fg, textAlign: "right" }}>Austragen</span>
            </span>
          </Button>
        ) : null}
        <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="more-horizontal" size={16} />
        </div>
      </div>
    </div>
  );
};

/** Kopf der Abschnittskarte: „Tagesablauf“ und „9 von 21 Plätzen besetzt · 12 frei“. */
const PlanHeader: React.FC<{ filled: number; required: number }> = ({ filled, required }) => {
  const free = Math.max(0, required - filled);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 16, rowGap: 4, padding: "16px 16px 12px" }}>
      <div style={{ ...TEXT.lg, fontWeight: W.semibold }}>Tagesablauf</div>
      <div style={{ ...TEXT.sm, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontWeight: W.semibold }}>
          {filled} von {required}
        </span>{" "}
        Plätzen besetzt
        {free > 0 ? <span style={{ color: C.muted }}> · {free} frei</span> : null}
      </div>
    </div>
  );
};

export type ShiftsPageProps = {
  shifts?: Shift[];
  /** je Schicht überschreibbare Eigenschaften (filled, me, pressed, highlight, signedUp, appear, note …) */
  overrides?: Partial<ShiftCardProps>[];
  /** 0..1 Auftritt des Seitenkopfs */
  headAppear?: number;
};

/** Ganze Seite „Sommerfest 2027“ (Inhalt unter der Kopfzeile – in AppShell setzen, scrollY für die Liste). */
export const ShiftsPage: React.FC<ShiftsPageProps> = ({ shifts = SHIFTS, overrides = [], headAppear = 1 }) => {
  const merged = shifts.map((s, i) => ({ ...s, ...overrides[i] }));
  const filled = merged.reduce((sum, s) => {
    const meA = s.me ? clamp01(s.meAppear ?? 1) : 0;
    const f = Math.round(s.filled ?? s.names.length + (s.me && meA >= 0.5 ? 1 : 0));
    return sum + Math.min(f, s.capacity);
  }, 0);
  const required = merged.reduce((sum, s) => sum + s.capacity, 0);
  const facts = ["Samstag, 12. Juni 2027", "14:00 – 22:00 Uhr", "Sportplatz am Vereinsheim"];
  return (
    <X3 width={CONTENT_W}>
      <BackLink>Helferplanung</BackLink>
      <PageTitle
        title="Sommerfest 2027"
        appear={headAppear}
        description={
          <>
            <span style={{ display: "block", overflow: "hidden" }}>
              <span style={{ marginLeft: -20, display: "flex", flexWrap: "wrap", rowGap: 2 }}>
                {facts.map((f) => (
                  <span key={f} style={{ display: "flex", minWidth: 0 }}>
                    <span style={{ width: 20, flexShrink: 0, textAlign: "center" }}>·</span>
                    <span style={{ minWidth: 0 }}>{f}</span>
                  </span>
                ))}
              </span>
            </span>
            <span style={{ marginTop: 4, display: "inline-block", fontWeight: W.medium, color: C.primary }}>Zur Veranstaltung</span>
          </>
        }
        actions={
          <>
            <Button icon="plus">Neue Schicht</Button>
            <Button variant="outline" icon="printer">
              Drucken
            </Button>
            <Button variant="outline" icon="download">
              CSV-Export
            </Button>
          </>
        }
      />
      <div style={{ overflow: "hidden", borderRadius: R.xl, border: `1px solid ${C.border}`, background: C.card, boxShadow: SHADOW.xs }}>
        <PlanHeader filled={filled} required={required} />
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {merged.map((s, i) => (
            <ShiftRow key={s.title} {...s} divider={i > 0} />
          ))}
        </div>
      </div>
    </X3>
  );
};

/* ------------------------------------------------------------------ Offene Schicht mit Balken */

export type OpenShiftItemProps = {
  title?: string;
  sub?: string;
  filled?: number;
  capacity?: number;
  /** 0..1 – Füllung des Balkens (Standard filled/capacity) */
  fill?: number;
  /** 0..1 – „Eintragen“ gedrückt */
  pressed?: number;
  showButton?: boolean;
};

/** Offene Schicht wie im Dashboard/der Helferplanung: Name, Veranstaltung, Besetzungsbalken, „Eintragen“ in voller Breite. */
export const OpenShiftItem: React.FC<OpenShiftItemProps> = ({
  title = "Grillstand",
  sub = "Sommerfest 2027 · Sa., 12.06., 12:00 – 16:00 Uhr",
  filled = 0,
  capacity = 3,
  fill,
  pressed = 0,
  showButton = true,
}) => {
  const n = Math.round(filled);
  const free = Math.max(0, capacity - n);
  const f = fill ?? n / capacity;
  return (
    <X3 width={CONTENT_W - 40}>
      <div style={{ display: "grid", gap: 8, padding: "12px 0" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TEXT.base, fontWeight: W.semibold }}>{title}</div>
          <div style={{ ...TEXT.sm, color: C.muted }}>{sub}</div>
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <ProgressBar fill={f} />
          <div style={{ ...TEXT.xs, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
            {n} von {capacity} Helfern
            {free > 0 ? (
              <strong style={{ color: C.fg }}>
                {" "}
                · {free} {free === 1 ? "Platz" : "Plätze"} frei
              </strong>
            ) : null}
          </div>
        </div>
        {showButton ? (
          <Button block pressed={pressed} style={{ borderRadius: 999 }}>
            Eintragen
          </Button>
        ) : null}
      </div>
    </X3>
  );
};

/** Gesamtbesetzung als Balken (für Übersichten): „9 von 21 Plätzen besetzt“. */
export const ShiftTotalsBar: React.FC<{ filled: number; required: number; width?: number }> = ({ filled, required, width = CONTENT_W }) => {
  const f = clamp01(filled / required);
  return (
    <X3 width={width}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ ...TEXT.sm, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontWeight: W.semibold }}>
            {Math.round(filled)} von {required}
          </span>{" "}
          Plätzen besetzt
          <span style={{ color: C.muted }}> · {Math.max(0, required - Math.round(filled))} frei</span>
        </div>
        <ProgressBar fill={f} tone={f >= 1 ? "full" : "primary"} />
      </div>
    </X3>
  );
};

