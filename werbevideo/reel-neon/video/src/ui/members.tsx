/**
 * Mitgliederliste wie /mitglieder am Handy (mitglieder.png) und der Import-Schritt (mitglieder-import-vorschau.png).
 *
 * Bildraum (scrollY 0): Titel „Mitglieder“ y≈240, „233 Einträge“ y≈375, Knopfreihe 1 y 474–582, Reihe 2 y 606–714,
 * Suche + Filter y 798–906, Tabelle ab y 951 (Kopf 954–1074), erste Zeile y 1076–1329, zweite 1329–1584.
 */
import React from "react";
import { C, CONTENT_W, R, ROW_TINT, SHADOW, TEXT, W, withAlpha } from "./tokens";
import { Icon } from "./icons";
import { BackLink, Badge, Button, PageTitle, SearchField, X3 } from "./primitives";
import { clamp01, formatDE } from "./motion";

export type Member = {
  name: string;
  role?: string;
  account?: boolean;
  status?: string;
};

/** Die ersten zehn Zeilen aus mitglieder.png. */
export const MEMBERS: Member[] = [
  { name: "Abel, Claudia", role: "Abteilungsleiterin Fußball", account: true },
  { name: "Adler, Anna", role: "1. Vorsitzende", account: true },
  { name: "Albrecht, Dieter" },
  { name: "Bauer, Doris" },
  { name: "Bauer, Klaus" },
  { name: "Bauer, Marco" },
  { name: "Baumann, Holger" },
  { name: "Baumann, Martin" },
  { name: "Baumann, Patrick" },
  { name: "Beck, Emil" },
];

const cell: React.CSSProperties = { padding: 8, verticalAlign: "middle", textAlign: "left" };

const SortHead: React.FC<{ label: string; icon: "arrow-up" | "chevrons-up-down" }> = ({ label, icon }) => (
  <th style={{ ...cell, height: 40, paddingTop: 0, paddingBottom: 0, fontWeight: W.medium, color: C.muted, whiteSpace: "nowrap" }}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: -4, padding: `${2}px ${4}px` }}>
      {label}
      <Icon name={icon} size={14} style={{ opacity: 0.7 }} />
    </span>
  </th>
);

export type MemberRowProps = Member & {
  /** 0..1 – Zeile gleitet von rechts herein und blendet auf */
  appear?: number;
  /** 0..1 – Zeile in der Markenfarbe getönt (z. B. neu importiert) */
  highlight?: number;
  /** letzte Zeile ohne Unterkante */
  last?: boolean;
};

/** Eine Tabellenzeile (<tr>): Name fett-medium, Funktion gedämpft, blaues „Benutzerkonto“, grünes „Aktiv“. */
export const MemberRow: React.FC<MemberRowProps> = ({ name, role, account, status = "Aktiv", appear = 1, highlight = 0, last }) => {
  const a = clamp01(appear);
  const move: React.CSSProperties = a < 1 ? { transform: `translateX(${(1 - appear) * 40}px)` } : {};
  return (
    <tr
      style={{
        opacity: a,
        borderBottom: last ? undefined : `${1}px solid ${C.border}`,
        background: highlight > 0 ? withAlpha(C.primary, ROW_TINT * clamp01(highlight)) : undefined,
      }}
    >
      <td style={{ ...cell, whiteSpace: "normal" }}>
        <div style={move}>
          <div style={{ fontWeight: W.medium }}>{name}</div>
          {role ? <div style={{ ...TEXT.xs, color: C.muted }}>{role}</div> : null}
          {account ? (
            <Badge tone="blue" style={{ display: "flex", marginTop: 4 }}>
              Benutzerkonto
            </Badge>
          ) : null}
        </div>
      </td>
      <td style={{ ...cell, whiteSpace: "nowrap" }}>
        <div style={move}>
          <Badge tone="green">{status}</Badge>
        </div>
      </td>
    </tr>
  );
};

export type MemberTableProps = {
  members?: Member[];
  /** Auftritt je Zeile (0..1); fehlt ein Wert, ist die Zeile sichtbar */
  rowAppear?: number[];
  /** Hervorhebung je Zeile (0..1) */
  rowHighlight?: number[];
  style?: React.CSSProperties;
};

/** Tabelle in der TableCard der App (Karte mit feinem hellem Ring, Kopfzeile „Name ↑ / Status ⇅“ auf muted/50). */
export const MemberTable: React.FC<MemberTableProps> = ({ members = MEMBERS, rowAppear, rowHighlight, style }) => (
  <X3 width={CONTENT_W}>
  <div style={{ overflow: "hidden", borderRadius: R.xl, background: C.card, boxShadow: SHADOW.card, ...style }}>
    <table style={{ width: "100%", borderCollapse: "collapse", borderSpacing: 0, ...TEXT.sm }}>
      <thead style={{ background: C.tableHead }}>
        <tr style={{ borderBottom: `${1}px solid ${C.border}` }}>
          <SortHead label="Name" icon="arrow-up" />
          <SortHead label="Status" icon="chevrons-up-down" />
        </tr>
      </thead>
      <tbody>
        {members.map((m, i) => (
          <MemberRow key={m.name} {...m} appear={rowAppear?.[i] ?? 1} highlight={rowHighlight?.[i] ?? 0} last={i === members.length - 1} />
        ))}
      </tbody>
    </table>
  </div>
  </X3>
);

export type MembersPageProps = {
  /** Zahl hinter „Einträge“ (darf beim Hochzählen eine Kommazahl sein, wird gerundet) */
  count?: number;
  members?: Member[];
  rowAppear?: number[];
  rowHighlight?: number[];
  /** 0..1 – Knopf „Import“ gedrückt */
  importPressed?: number;
  /** 0..1 – Knopf „Neues Mitglied“ gedrückt */
  newPressed?: number;
  /** getippter Suchtext */
  search?: string;
  /** 0..1 Auftritt des Seitenkopfs */
  headAppear?: number;
};

/** Ganze Seite „Mitglieder“ (Inhalt unter der Kopfzeile – in AppShell setzen). */
export const MembersPage: React.FC<MembersPageProps> = ({
  count = 233,
  members,
  rowAppear,
  rowHighlight,
  importPressed = 0,
  newPressed = 0,
  search,
  headAppear = 1,
}) => {
  const n = Math.round(count);
  return (
    <X3 width={CONTENT_W}>
      <PageTitle
        title="Mitglieder"
        appear={headAppear}
        description={
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDE(n)} {n === 1 ? "Eintrag" : "Einträge"}
          </span>
        }
        actions={
          <>
            <Button icon="plus" pressed={newPressed}>
              Neues Mitglied
            </Button>
            <Button variant="outline" icon="inbox">
              Anträge
            </Button>
            <Button variant="outline" icon="upload" pressed={importPressed}>
              Import
            </Button>
            <Button variant="outline" icon="download">
              Export
            </Button>
            <Button variant="outline" icon="chart-no-axes-combined">
              Statistik
            </Button>
          </>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, marginBottom: 16 }}>
        <SearchField placeholder="Name, Nummer oder E-Mail suchen …" value={search} />
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            alignSelf: "end",
            gap: 6,
            height: 36,
            boxSizing: "border-box",
            padding: `0 ${12}px`,
            borderRadius: R.lg,
            border: `${1}px solid ${C.border}`,
            // FilterToggle der App: bg-background, dunkel dark:bg-input/30
            background: C.inputBg,
            boxShadow: SHADOW.xs,
            ...TEXT.sm,
            fontWeight: W.medium,
            whiteSpace: "nowrap",
          }}
        >
          <Icon name="filter" size={16} />
          Filter
        </div>
      </div>
      <MemberTable members={members} rowAppear={rowAppear} rowHighlight={rowHighlight} />
    </X3>
  );
};

/**
 * Datei-Kachel für den Import-Schritt: „mitglieder.csv“ mit Unterzeile „aus Excel gespeichert“.
 * Gestaltet wie die Karten der Import-Seite (Karte, feiner Ring), links ein Dateisymbol auf grün getönter Kachel
 * (dunkel wie die Symbolkacheln der App, ACCENT.emerald: emerald-400/15, Symbol emerald-300).
 * appear 0..1 = fliegt ein; check 0..1 = grüner Haken zeichnet sich (Datei gelesen).
 */
export const ImportFileChip: React.FC<{
  name?: string;
  sub?: string;
  appear?: number;
  check?: number;
  style?: React.CSSProperties;
}> = ({ name = "mitglieder.csv", sub = "aus Excel gespeichert", appear = 1, check = 0, style }) => {
  const a = clamp01(appear);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        boxSizing: "border-box",
        padding: `${10}px ${16}px ${10}px ${10}px`,
        borderRadius: R.xl,
        background: C.card,
        boxShadow: SHADOW.card,
        opacity: a,
        transform: a < 1 ? `translateY(${(1 - appear) * 16}px) scale(${0.9 + 0.1 * appear})` : undefined,
        ...style,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(0,212,146,0.15)",
          color: "#5EE9B5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="file-text" size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TEXT.sm, fontWeight: W.semibold, color: C.fg, whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ ...TEXT.xs, color: C.muted, whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {check > 0 ? (
        <div style={{ marginLeft: 4, color: C.check }}>
          <Icon name="circle-check" size={20} draw={check} />
        </div>
      ) : null}
    </div>
  );
};

/** Rahmen eines Import-Schritts (rounded-xl border p-4, ohne eigene Fläche – wie in der App). */
const StepBox: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ borderRadius: R.xl, border: `1px solid ${C.border}`, padding: 16, ...style }}>{children}</div>
);

/** Schritt „1. Datei auswählen“ der Import-Seite: Erklärung, „CSV-Datei wählen“, Dateiname, „Vorlage herunterladen“. */
export const ImportStepCard: React.FC<{
  /** gewählte Datei (leer = „Keine Datei ausgewählt“) */
  fileName?: string;
  /** 0..1 – „CSV-Datei wählen“ gedrückt */
  pressed?: number;
  /** 0..1 – Dateiname blendet ein */
  fileAppear?: number;
}> = ({ fileName = "mitglieder.csv", pressed = 0, fileAppear = 1 }) => {
  const fa = clamp01(fileAppear);
  return (
    <X3 width={CONTENT_W}>
      <StepBox>
        <div style={{ marginBottom: 4, ...TEXT.base, fontWeight: W.medium }}>1. Datei auswählen</div>
        <div style={{ marginBottom: 12, ...TEXT.sm, color: C.muted }}>
          CSV-Datei (Semikolon oder Komma getrennt) mit mindestens den Spalten <b style={{ fontWeight: W.bold }}>Vorname</b> und{" "}
          <b style={{ fontWeight: W.bold }}>Nachname</b>. Weitere Spalten: Mitgliedsnummer, E-Mail, Telefon, Straße, PLZ, Ort, Geburtsdatum,
          Eintritt, Austritt, Status, Funktion, Abteilungen, Notizen. Höchstens 2.000 Zeilen.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <Button variant="outline" icon="upload" pressed={pressed}>
            CSV-Datei wählen
          </Button>
          <span style={{ display: "inline-grid", ...TEXT.sm, color: C.muted }}>
            {/* nacheinander: alter Satz aus, dann Dateiname ein */}
            <span style={{ gridArea: "1 / 1", opacity: 1 - clamp01(fa * 2) }}>{fa < 1 ? "Keine Datei ausgewählt" : ""}</span>
            <span style={{ gridArea: "1 / 1", opacity: clamp01(fa * 2 - 1) }}>{fileName}</span>
          </span>
          <Button variant="ghost" size="sm" icon="download">
            Vorlage herunterladen
          </Button>
        </div>
      </StepBox>
    </X3>
  );
};

/** Schritt „2. Vorschau prüfen“ mit den Schildern „5 gültig · 0 Duplikate · 1 fehlerhaft“ (Zahlen dürfen hochzählen). */
export const ImportSummary: React.FC<{ valid?: number; dupes?: number; errors?: number; appear?: number }> = ({
  valid = 5,
  dupes = 0,
  errors = 1,
  appear = 1,
}) => (
  <X3 width={CONTENT_W}>
    <StepBox>
      <div style={{ marginBottom: 8, ...TEXT.base, fontWeight: W.medium }}>2. Vorschau prüfen</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Badge tone="green" appear={appear}>
          {Math.round(valid)} gültig
        </Badge>
        <Badge tone="orange" appear={appear}>
          {Math.round(dupes)} Duplikate
        </Badge>
        <Badge tone="red" appear={appear}>
          {Math.round(errors)} fehlerhaft
        </Badge>
      </div>
    </StepBox>
  </X3>
);

export type ImportRowStatus = "ok" | "duplicate" | "error";
export type ImportRow = { line: number; name: string; status: ImportRowStatus; hint?: string };

/** Vorschau-Zeilen aus mitglieder-import-vorschau*.png (Zeile 4 mit ungültiger E-Mail). */
export const IMPORT_ROWS: ImportRow[] = [
  { line: 2, name: "Mila Brockmann", status: "ok" },
  { line: 3, name: "Jonte Albers", status: "ok" },
  { line: 4, name: "Lasse Meinert", status: "error", hint: "Bitte gib eine gültige E-Mail-Adresse ein." },
  { line: 5, name: "Greta Hinrichs", status: "ok" },
  { line: 6, name: "Ida Kortmann", status: "ok" },
  { line: 7, name: "Bastian Rehbein", status: "ok" },
];

const IMPORT_STATUS: Record<ImportRowStatus, { label: string; tone: "green" | "orange" | "red" }> = {
  ok: { label: "wird importiert", tone: "green" },
  duplicate: { label: "übersprungen (Duplikat)", tone: "orange" },
  error: { label: "Fehler", tone: "red" },
};

// h-10 + Unterkante: beim Nachbau (1×) frisst die halbe Rahmenlinie 1 px der Kopfzeile – daher 41
const importHead: React.CSSProperties = { height: 41, padding: "0 8px", textAlign: "left", verticalAlign: "middle", fontWeight: W.medium, whiteSpace: "nowrap", color: C.muted };
const importCell: React.CSSProperties = { padding: 8, verticalAlign: "middle", whiteSpace: "nowrap" };
// Text neben dem Schild sitzt in der Aufnahme 1 px höher (Rundung der Grundlinie, an allen Zeilen gleich)
const textNudge: React.CSSProperties = { position: "relative", top: -1 };

/**
 * Ergebnistabelle der Import-Vorschau („Zeile · Mitglied · Ergebnis · Hinweis“). Am Handy breiter als die Karte – rechts
 * abgeschnitten wie in der Aufnahme; scrollX (CSS-px) schiebt sie nach links (…-hinweis.png).
 */
export const ImportPreviewTable: React.FC<{
  rows?: ImportRow[];
  /** Auftritt je Zeile (0..1) */
  rowAppear?: number[];
  /** Hervorhebung je Zeile (0..1), z. B. die Fehlerzeile */
  rowHighlight?: number[];
  /** waagerechter Scroll der Tabelle (CSS-px) */
  scrollX?: number;
}> = ({ rows = IMPORT_ROWS, rowAppear, rowHighlight, scrollX = 0 }) => (
  <X3 width={CONTENT_W}>
    <div style={{ overflow: "hidden", borderRadius: R.xl, background: C.card, boxShadow: SHADOW.card }}>
      <table style={{ width: "100%", borderCollapse: "collapse", borderSpacing: 0, ...TEXT.sm, transform: scrollX ? `translateX(${-scrollX}px)` : undefined }}>
        <thead style={{ background: C.tableHead }}>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ ...importHead, width: 64 }}>Zeile</th>
            <th style={importHead}>Mitglied</th>
            <th style={importHead}>Ergebnis</th>
            <th style={importHead}>Hinweis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const a = clamp01(rowAppear?.[i] ?? 1);
            const hl = clamp01(rowHighlight?.[i] ?? 0);
            const st = IMPORT_STATUS[r.status];
            const move: React.CSSProperties = a < 1 ? { transform: `translateX(${(1 - a) * 40}px)` } : {};
            return (
              <tr
                key={r.line}
                style={{
                  opacity: a,
                  borderBottom: i === rows.length - 1 ? undefined : `1px solid ${C.border}`,
                  background: hl > 0 ? withAlpha(C.primary, ROW_TINT * hl) : undefined,
                }}
              >
                <td style={{ ...importCell, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ ...move, ...textNudge }}>{r.line}</div>
                </td>
                <td style={{ ...importCell, fontWeight: W.medium }}>
                  <div style={{ ...move, ...textNudge }}>{r.name}</div>
                </td>
                <td style={importCell}>
                  <div style={move}>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                </td>
                <td style={{ ...importCell, color: C.muted }}>
                  <div style={{ ...move, ...textNudge }}>{r.hint ?? ""}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </X3>
);

/** Seite „Mitglieder importieren“ mit Vorschau (mitglieder-import-vorschau.png): Schritt 1, Schritt 2, Ergebnistabelle, Knopf. */
export const ImportPage: React.FC<{
  fileAppear?: number;
  pressed?: number;
  /** 0..1 – Schritt 2 (Schilder) erscheint */
  summaryAppear?: number;
  /** Auftritt je Tabellenzeile */
  rowAppear?: number[];
  rowHighlight?: number[];
  /** 0..1 – „5 Mitglieder importieren“ gedrückt */
  importPressed?: number;
}> = ({ fileAppear = 1, pressed = 0, summaryAppear = 1, rowAppear, rowHighlight, importPressed = 0 }) => {
  const sa = clamp01(summaryAppear);
  const reveal: React.CSSProperties | undefined = sa < 1 ? { opacity: sa, transform: `translateY(${(1 - sa) * 16}px)` } : undefined;
  const okCount = IMPORT_ROWS.filter((r) => r.status === "ok").length;
  return (
    <X3 width={CONTENT_W}>
      <BackLink>Alle Mitglieder</BackLink>
      <PageTitle title="Mitglieder importieren" description="Lade eine CSV-Datei hoch. Du siehst zuerst eine Vorschau – erst danach wird etwas gespeichert." />
      <div style={{ display: "grid", gap: 24 }}>
        <ImportStepCard fileAppear={fileAppear} pressed={pressed} />
        <div style={{ display: "grid", gap: 16, ...reveal }}>
          <ImportSummary appear={summaryAppear} />
          <ImportPreviewTable rowAppear={rowAppear} rowHighlight={rowHighlight} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button pressed={importPressed}>{okCount} Mitglieder importieren</Button>
          </div>
        </div>
      </div>
    </X3>
  );
};
