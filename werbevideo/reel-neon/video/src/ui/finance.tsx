/**
 * Finanzen wie /finanzen am Handy (finanzen-cockpit.png) und das Kassenbuch (finanzen-kassenbuch-buchungen.png).
 *
 * Bildraum (scrollY 0): Titel y≈240, „Geschäftsjahr 2026“ y≈375 (Datum weggelassen, damit der Film nicht veraltet), Knopf y 474–582,
 * Reiterleiste y 666–798 (Kacheln 678–786), Karten: Kontostand y 870–1494, Offene Rechnungen y 1542–2034,
 * Überschuss y 2082–2778 (Abstand 48).
 */
import React from "react";
import { C, CONTENT_W, KPI_GRADIENT, type KpiAccent, R, ROW_TINT, SHADOW, TEXT, W, withAlpha } from "./tokens";
import { Icon, type IconName } from "./icons";
import { Button, PageTitle, Tabs, X3 } from "./primitives";
import { KpiShell, KpiValue, Sparkline } from "./kpi";
import { clamp01, formatEuro } from "./motion";

/* ------------------------------------------------------------------ Kennzahlkarte */

export type StatCardProps = {
  label: string;
  accent: KpiAccent;
  icon: IconName;
  /** Betrag in Euro (darf hochzählen) */
  value: number;
  /** mit Vorzeichen („+5.286,30 €“) */
  signed?: boolean;
  /** ein bis zwei Sätze unter der Zahl (der zweite halbfett) */
  lines: string[];
  /** Kurs (Werte je Monat); ohne = keine Kurve */
  points?: number[];
  /** 0..1 – Kurs zeichnet sich */
  draw?: number;
  /** Breite in CSS-px (Standard 358 = volle Inhaltsbreite) */
  width?: number;
  /** 0..1 – Karte steigt auf */
  appear?: number;
  /** 0..1 – Karte hebt sich (Hervorhebung) */
  lift?: number;
  style?: React.CSSProperties;
};

/** Kennzahl der Finanzen (FinanceKpiCard der App): Verlauf, große Zahl, Sätze, optional Kurs unten. */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  accent,
  icon,
  value,
  signed,
  lines,
  points,
  draw = 1,
  width = CONTENT_W,
  appear = 1,
  lift = 0,
  style,
}) => {
  const text = formatEuro(value, signed);
  // Schriftgröße wie fitSize() der App: clamp(1.05rem, (Kartenbreite − 2,5rem) / (0,64 · Zeichen), 2.15rem)
  const fs = Math.max(16.8, Math.min(34.4, (width - 40) / (0.64 * text.length)));
  const a = clamp01(appear);
  return (
    <X3 width={width}>
      <KpiShell
        label={label}
        accent={accent}
        icon={icon}
        width={width}
        lift={lift}
        style={{
          ...(a < 1 ? { opacity: a, transform: `translateY(${(1 - appear) * 30}px) scale(${0.96 + 0.04 * appear})` } : {}),
          ...style,
        }}
        extra={
          points && points.length > 1 ? (
            <div style={{ margin: "0 -20px", marginTop: "auto", paddingTop: 12 }}>
              <Sparkline points={points} width={width} draw={draw} ink={KPI_GRADIENT[accent].ink} />
            </div>
          ) : undefined
        }
      >
        <div style={{ marginTop: 12 }}>
          <KpiValue fontSize={fs}>{text}</KpiValue>
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 2, ...TEXT.sm, color: "rgba(255,255,255,0.95)" }}>
          {lines.map((line, i) => (
            <div key={i} style={{ fontWeight: i === 1 ? W.semibold : W.medium }}>
              {line}
            </div>
          ))}
        </div>
      </KpiShell>
    </X3>
  );
};

/** Kurs des Kontostands (4 Monate, aus der Aufnahme nachgemessen). */
export const BALANCE_POINTS = [9850, 12357.9, 13883.1, 13944.47];
/** Kurs des Überschusses 2026 (Jan–Okt, Kassenbuch ab Juli). */
export const SURPLUS_POINTS = [0, 0, 0, 0, 0, 0, 4102, 4810, 5286.3, 5286.3];

export const KontostandCard: React.FC<Partial<StatCardProps>> = (p) => (
  <StatCard label="Kontostand gesamt" accent="blue" icon="wallet" value={13944.47} lines={["Girokonto und Barkasse"]} points={BALANCE_POINTS} {...p} />
);
export const OffeneRechnungenCard: React.FC<Partial<StatCardProps>> = (p) => (
  <StatCard
    label="Offene Rechnungen"
    accent="amber"
    icon="receipt-text"
    value={1549.5}
    lines={["2 Rechnungen zu bezahlen", "davon 1 überfällig"]}
    {...p}
  />
);
export const UeberschussCard: React.FC<Partial<StatCardProps>> = (p) => (
  <StatCard
    label="Überschuss 2026"
    accent="emerald"
    icon="trending-up"
    value={5286.3}
    signed
    lines={["Einnahmen minus Ausgaben", "seit 01.07.2026"]}
    points={SURPLUS_POINTS}
    {...p}
  />
);

/* ------------------------------------------------------------------ Seite */

export const FINANCE_TABS = ["Übersicht", "Beiträge", "Kassenbuch", { label: "Rechnungen", count: 1 }, "Abschluss"];

export type FinancePageProps = {
  /** Beträge der drei Karten (dürfen hochzählen) */
  balance?: number;
  invoices?: number;
  surplus?: number;
  /** Kurs zeichnen 0..1 */
  balanceDraw?: number;
  surplusDraw?: number;
  /** Auftritt je Karte (Kontostand, Rechnungen, Überschuss) */
  cardAppear?: number[];
  /** Hervorhebung je Karte */
  cardLift?: number[];
  /** gewählter Reiter (Kommazahl = Kachel gleitet) */
  tab?: number;
  /** 0..1 – „Einnahme oder Ausgabe erfassen“ gedrückt */
  addPressed?: number;
  headAppear?: number;
};

/** Ganze Seite „Finanzen“ (Übersicht) – Inhalt unter der Kopfzeile, in AppShell setzen. */
export const FinancePage: React.FC<FinancePageProps> = ({
  balance = 13944.47,
  invoices = 1549.5,
  surplus = 5286.3,
  balanceDraw = 1,
  surplusDraw = 1,
  cardAppear = [],
  cardLift = [],
  tab = 0,
  addPressed = 0,
  headAppear = 1,
}) => (
  <X3 width={CONTENT_W}>
    <FinanceHeader tab={tab} addPressed={addPressed} headAppear={headAppear} />
    <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
      <KontostandCard value={balance} draw={balanceDraw} appear={cardAppear[0] ?? 1} lift={cardLift[0] ?? 0} />
      <OffeneRechnungenCard value={invoices} appear={cardAppear[1] ?? 1} lift={cardLift[1] ?? 0} />
      <UeberschussCard value={surplus} draw={surplusDraw} appear={cardAppear[2] ?? 1} lift={cardLift[2] ?? 0} />
    </div>
  </X3>
);

/** Kopf jeder Finanzseite: „Finanzen“, Unterzeile, Hauptknopf, Reiterleiste. */
export const FinanceHeader: React.FC<{
  description?: string;
  button?: string;
  buttonIcon?: IconName;
  tab?: number;
  addPressed?: number;
  headAppear?: number;
}> = ({ description = "Geschäftsjahr 2026", button = "Einnahme oder Ausgabe erfassen", buttonIcon, tab = 0, addPressed = 0, headAppear = 1 }) => (
  <X3 width={CONTENT_W}>
    <PageTitle
      title="Finanzen"
      appear={headAppear}
      description={description}
      actions={
        <Button pressed={addPressed} icon={buttonIcon}>
          {button}
        </Button>
      }
    />
    <Tabs items={FINANCE_TABS} activeIndex={tab} width={CONTENT_W} style={{ marginBottom: 24 }} />
  </X3>
);

/* ------------------------------------------------------------------ Kassenbuch */

export type LedgerEntry = {
  number: string;
  date: string;
  title: string;
  /** Gegenüber (z. B. „Sportbund Musterkreis“) */
  counterparty?: string;
  /** Kategorie · Abteilungen */
  category: string;
  account: string;
  attachment?: string;
  /** Betrag in Euro (negativ = Ausgabe) */
  amount: number;
};

export const LEDGER: LedgerEntry[] = [
  {
    number: "2026-0027",
    date: "05.10.2026",
    title: "Fahrtkosten Auswärtsspiel Handball Damen",
    category: "Fahrtkosten · Handball",
    account: "Barkasse",
    attachment: "Quittung Fahrtkosten Auswärtsspiel.jpg",
    amount: -64.2,
  },
  {
    number: "2026-0026",
    date: "02.10.2026",
    title: "Übungsleiterpauschalen September",
    category: "Übungsleiter · Jugendarbeit, Handball, Tischtennis",
    account: "Girokonto",
    attachment: "Abrechnung Übungsleiter September 2026.pdf",
    amount: -450,
  },
  {
    number: "2026-0025",
    date: "01.10.2026",
    title: "Übungsleiterzuschuss 2. Halbjahr",
    counterparty: "Sportbund Musterkreis",
    category: "Zuschüsse",
    account: "Girokonto",
    attachment: "Bewilligung Übungsleiterzuschuss 2026.pdf",
    amount: 540,
  },
  {
    number: "2026-0024",
    date: "28.09.2026",
    title: "Druckerpapier, Briefmarken, Ordner",
    counterparty: "Schreibwaren Lange",
    category: "Büro und Porto",
    account: "Barkasse",
    attachment: "Kassenbon Bürobedarf.jpg",
    amount: -46.8,
  },
];

const td: React.CSSProperties = { padding: 8, verticalAlign: "top" };

/** Eine Buchung (<tr>): Nummer · Datum, Titel, Kategorie, Konto, Beleg (Markenfarbe), Betrag rechts (Einnahme grün, dark:text-emerald-400). */
export const LedgerRow: React.FC<
  LedgerEntry & {
    /** 0..1 – Zeile erscheint (gleitet von oben herein) */
    appear?: number;
    /** 0..1 – Zeile in der Markenfarbe getönt */
    highlight?: number;
    last?: boolean;
  }
> = ({ number, date, title, counterparty, category, account, attachment, amount, appear = 1, highlight = 0, last }) => {
  const a = clamp01(appear);
  const move: React.CSSProperties = a < 1 ? { transform: `translateY(${(1 - appear) * -14}px)` } : {};
  return (
    <tr style={{ opacity: a, borderBottom: last ? undefined : `1px solid ${C.border}`, background: highlight > 0 ? withAlpha(C.primary, ROW_TINT * clamp01(highlight)) : undefined }}>
      <td style={{ ...td, whiteSpace: "normal" }}>
        <div style={move}>
          <div style={{ ...TEXT.sm, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
            {number} · {date}
          </div>
          <div style={{ fontWeight: W.medium, overflowWrap: "anywhere" }}>{title}</div>
          {counterparty ? <div style={{ ...TEXT.sm, color: C.muted, overflowWrap: "anywhere" }}>{counterparty}</div> : null}
          <div style={{ ...TEXT.sm, color: C.muted }}>{category}</div>
          <div style={{ ...TEXT.sm, color: C.muted }}>{account}</div>
          {attachment ? <div style={{ ...TEXT.sm, color: C.primary, overflowWrap: "anywhere" }}>{attachment}</div> : null}
        </div>
      </td>
      <td style={{ ...td, textAlign: "right", fontWeight: W.semibold, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        <div style={move}>
          <span style={{ color: amount > 0 ? C.green : undefined }}>{formatEuro(amount, true)}</span>
        </div>
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        <div style={{ ...move, display: "inline-flex", width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
          <Icon name="more-horizontal" size={16} />
        </div>
      </td>
    </tr>
  );
};

/** „27 Buchungen“ + Tabelle der Buchungen (Kassenbuch am Handy). */
export const LedgerTable: React.FC<{
  entries?: LedgerEntry[];
  total?: number;
  rowAppear?: number[];
  rowHighlight?: number[];
}> = ({ entries = LEDGER, total = 27, rowAppear, rowHighlight }) => (
  <X3 width={CONTENT_W}>
    <div style={{ marginBottom: 8, ...TEXT.sm, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{Math.round(total)} Buchungen</div>
    <div style={{ overflow: "hidden", borderRadius: R.xl, background: C.card, boxShadow: SHADOW.card }}>
      {/* Spaltenbreiten fest (an der Aufnahme gemessen) – so bricht „Übungsleiter · Jugendarbeit, …“ wie in der App um */}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", borderSpacing: 0, ...TEXT.sm }}>
        <thead style={{ background: C.tableHead }}>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ boxSizing: "border-box", width: 206, height: 40, padding: "0 8px", textAlign: "left", fontWeight: W.medium, color: C.muted, whiteSpace: "nowrap" }}>Beschreibung</th>
            <th style={{ boxSizing: "border-box", height: 40, padding: "0 8px", textAlign: "right", fontWeight: W.medium, color: C.muted, whiteSpace: "nowrap" }}>Betrag</th>
            <th style={{ boxSizing: "border-box", height: 40, padding: "0 8px", width: 48 }} />
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <LedgerRow key={e.number} {...e} appear={rowAppear?.[i] ?? 1} highlight={rowHighlight?.[i] ?? 0} last={i === entries.length - 1} />
          ))}
        </tbody>
      </table>
    </div>
  </X3>
);
