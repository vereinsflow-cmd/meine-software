/**
 * App-Teile der Szene „mitglieder“ (echter Dunkelmodus aus src/ui, nur zusammengesetzt):
 *   ImportVorschau  Seite „Mitglieder importieren“ wie ui/members → ImportPage, aber mit waagerechtem Tabellen-Scroll
 *   ZeilenGlut      rotes Leuchten über der fehlerhaften Zeile (liegt im Bildraum der Seite über der Tabelle)
 *   Fehlerkarte     die fehlerhafte Zeile, aus der Tabelle herausgehoben, mit dem echten Hinweis
 *   DateiKarte      „mitglieder.csv – aus Excel gespeichert“ (ImportFileChip) mit Neon-Schein
 */
import React from "react";
import { NEON, rgba } from "../../neon";
import { Badge, BackLink, Button, PageTitle, X3 } from "../../ui/primitives";
import { IMPORT_ROWS, ImportFileChip, ImportPreviewTable, ImportStepCard, ImportSummary } from "../../ui/members";
import { C, CONTENT_W, FONT, R, TEXT, W } from "../../ui/tokens";
import { textWidth } from "../../ui/measure";
import { clamp01 } from "../../ui/motion";

/** Bildraum der Import-Seite (scrollY 0): Tabelle ab y 2013, Kopf 123 hoch, Zeilen je 123 (gemessen am Still Ui-Import) */
export const IMPORT_TABLE_TOP = 2013;
export const IMPORT_ROW_H = 123;
/** Index der fehlerhaften Zeile (Zeile 4, Lasse Meinert) */
export const ERROR_INDEX = IMPORT_ROWS.findIndex((r) => r.status === "error");
export const ERROR_ROW = IMPORT_ROWS[ERROR_INDEX];
/** Oberkante der fehlerhaften Zeile im Bildraum (scrollY 0) */
export const ERROR_ROW_TOP = IMPORT_TABLE_TOP + IMPORT_ROW_H * (1 + ERROR_INDEX);
/** Seiteninhalt links/rechts im Bildraum */
export const CONTENT_X = 48;
export const CONTENT_PX = CONTENT_W * 3;

/** Seite „Mitglieder importieren“ (Aufbau wie ImportPage) – in AppShell setzen. */
export const ImportVorschau: React.FC<{
  summaryAppear: number;
  rowAppear: number[];
  scrollX?: number;
  importPressed?: number;
}> = ({ summaryAppear, rowAppear, scrollX = 0, importPressed = 0 }) => {
  const okCount = IMPORT_ROWS.filter((r) => r.status === "ok").length;
  return (
    <X3 width={CONTENT_W}>
      <BackLink>Alle Mitglieder</BackLink>
      <PageTitle title="Mitglieder importieren" description="Lade eine CSV-Datei hoch. Du siehst zuerst eine Vorschau – erst danach wird etwas gespeichert." />
      <div style={{ display: "grid", gap: 24 }}>
        <ImportStepCard fileAppear={1} />
        <div style={{ display: "grid", gap: 16 }}>
          <ImportSummary appear={summaryAppear} />
          <ImportPreviewTable rowAppear={rowAppear} scrollX={scrollX} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button pressed={importPressed}>{okCount} Mitglieder importieren</Button>
          </div>
        </div>
      </div>
    </X3>
  );
};

const RED = C.destructive;

/**
 * Rotes Leuchten über einer Tabellenzeile (Bildraum der Seite): Tönung, Lichtkante, Schein; flare = kurzes Aufblitzen.
 * hollow 0..1: die Zeile ist herausgehoben – zurück bleibt das leere, dunkle Fach.
 * rest 0..1: so viel vom roten Leuchten bleibt am Fach (1 = voll); nach dem Abheben ≈ 0,2, sonst stehen zwei rote Kästen
 * übereinander (das Rot gehört dann zur herausgehobenen Karte).
 */
export const ZeilenGlut: React.FC<{ top: number; k: number; flare?: number; hollow?: number; rest?: number }> = ({ top, k, flare = 0, hollow = 0, rest = 1 }) => {
  if (k <= 0.001) return null;
  const a = clamp01(k) * clamp01(rest);
  const h = clamp01(hollow);
  const tint = `linear-gradient(90deg, ${rgba(RED, (0.2 + 0.18 * flare) * a)} 0%, ${rgba(RED, (0.12 + 0.12 * flare) * a)} 100%)`;
  return (
    <div
      style={{
        position: "absolute",
        left: CONTENT_X,
        top,
        width: CONTENT_PX,
        height: IMPORT_ROW_H,
        borderRadius: 6,
        pointerEvents: "none",
        background: h > 0.001 ? `${tint}, linear-gradient(${rgba("#120B0D", 0.94 * h)}, ${rgba("#120B0D", 0.94 * h)})` : tint,
        boxShadow: [
          `inset 0 0 0 3px ${rgba(RED, 0.85 * a)}`,
          `inset 0 0 24px ${rgba(RED, (0.35 + 0.3 * flare) * a)}`,
          `0 0 26px ${rgba(RED, (0.55 + 0.35 * flare) * a)}`,
          `0 0 70px ${rgba(RED, (0.3 + 0.25 * flare) * a)}`,
        ].join(", "),
      }}
    />
  );
};

/** dunkler Schleier über Tabellenkopf und den Zeilen über der fehlerhaften Zeile (Bildraum, scrollY abgezogen) */
export const ZeilenSchleier: React.FC<{ top: number; bottom: number; k: number }> = ({ top, bottom, k }) => {
  if (k <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: CONTENT_X - 6,
        top,
        width: CONTENT_PX + 12,
        height: bottom - top,
        pointerEvents: "none",
        borderRadius: 18,
        background: rgba("#07080C", 0.86 * clamp01(k)),
      }}
    />
  );
};

/** Prüf-Lichtband: läuft über die Tabelle der Vorschau (Bildraum der Seite), y = Mitte des Bands */
export const PruefBand: React.FC<{ y: number; alpha: number }> = ({ y, alpha }) => {
  if (alpha <= 0.001) return null;
  const h = 150;
  return (
    <div style={{ position: "absolute", left: CONTENT_X, top: y - h / 2, width: CONTENT_PX, height: h, pointerEvents: "none", mixBlendMode: "screen", opacity: clamp01(alpha) }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${rgba(NEON.blue, 0)} 0%, ${rgba(NEON.blue, 0.16)} 28%, ${rgba(NEON.sky, 0.42)} 46%, ${rgba("#FFFFFF", 0.75)} 50%, ${rgba(NEON.sky, 0.42)} 54%, ${rgba(NEON.blue, 0.16)} 72%, ${rgba(NEON.blue, 0)} 100%)`,
          maskImage: "linear-gradient(90deg, rgba(0,0,0,0) 0%, #000 12%, #000 88%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage: "linear-gradient(90deg, rgba(0,0,0,0) 0%, #000 12%, #000 88%, rgba(0,0,0,0) 100%)",
        }}
      />
    </div>
  );
};

/** Maße der Fehlerkarte (CSS-px der App, wie die Tabelle 358 breit) */
export const FK_W = CONTENT_W;
export const FK_LINE = 40;
export const FK_HINT = 72;

/** Hinweis in zwei Zeilen, an der Leerstelle nahe der Mitte getrennt („Bitte gib eine gültige“ / „E-Mail-Adresse ein.“) */
const hintLines = (): [string, string] => {
  const text = ERROR_ROW.hint ?? "";
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === " " && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i;
  return best < 0 ? [text, ""] : [text.slice(0, best), text.slice(best + 1)];
};
/** Schriftgröße des Hinweises: so groß wie möglich (höchstens 22 CSS-px), die längere Zeile passt in die Kartenbreite */
const hintSize = (lines: string[]) => {
  const avail = FK_W - 2 * 14;
  const widest = Math.max(1, ...lines.map((l) => textWidth(l, 100, W.semibold)));
  return Math.min(22, (avail / widest) * 100);
};

/**
 * Die fehlerhafte Zeile als eigene Karte (CSS-px, Spalten wie in der Tabelle: Zeile · Mitglied · Ergebnis) mit
 * rotem Leuchtrand; open 0..1 klappt darunter den echten Hinweis auf. glow 0..~1,4.
 */
export const Fehlerkarte: React.FC<{ open: number; glow: number }> = ({ open, glow }) => {
  const o = clamp01(open);
  const lines = hintLines();
  const hs = hintSize(lines);
  const g = Math.max(0, glow);
  return (
    <X3 width={FK_W} height={FK_LINE + FK_HINT}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: FK_W,
          height: FK_LINE + FK_HINT * o,
          boxSizing: "border-box",
          borderRadius: R.lg,
          overflow: "hidden",
          fontFamily: FONT,
          color: C.fg,
          background: `linear-gradient(180deg, #24161A 0%, ${C.card} 100%)`,
          boxShadow: [
            `inset 0 0 0 1px ${rgba(RED, 0.9)}`,
            `inset 0 1px 0 ${rgba("#FFFFFF", 0.12)}`,
            `0 0 6px ${rgba(RED, 0.7 * g)}`,
            `0 0 18px ${rgba(RED, 0.5 * g)}`,
            `0 0 46px ${rgba(RED, 0.32 * g)}`,
          ].join(", "),
        }}
      >
        {/* Zeile wie in der Tabelle */}
        <div style={{ position: "relative", height: FK_LINE, ...TEXT.sm }}>
          <div style={{ position: "absolute", left: 8, top: 0, height: FK_LINE, display: "flex", alignItems: "center", color: C.muted, fontVariantNumeric: "tabular-nums" }}>
            {ERROR_ROW.line}
          </div>
          <div style={{ position: "absolute", left: 58, top: 0, height: FK_LINE, display: "flex", alignItems: "center", fontWeight: W.medium }}>{ERROR_ROW.name}</div>
          <div style={{ position: "absolute", left: 188, top: 0, height: FK_LINE, display: "flex", alignItems: "center" }}>
            <Badge tone="red">Fehler</Badge>
          </div>
        </div>
        {/* Hinweis klappt auf */}
        <div style={{ position: "absolute", left: 0, top: FK_LINE, width: FK_W, height: FK_HINT, opacity: clamp01(o * 1.6 - 0.3) }}>
          <div style={{ position: "absolute", left: 14, right: 14, top: 0, height: 1, background: rgba(RED, 0.35) }} />
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 0,
              height: FK_HINT - 2,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              fontSize: hs,
              lineHeight: 1.22,
              fontWeight: W.semibold,
              whiteSpace: "nowrap",
              color: "#FFE3E3",
              textShadow: `0 0 8px ${rgba(RED, 0.55)}`,
            }}
          >
            {lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </X3>
  );
};

/** Datei-Karte (ImportFileChip, ×3 im Bildraum) mit Lichtkante und blauem Schein – fliegt auf „Import“. */
export const DateiKarte: React.FC<{ check: number; glow: number }> = ({ check, glow }) => (
  <X3 width={262} height={62}>
    <div style={{ position: "absolute", left: 0, top: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 262, height: 62 }}>
      <div
        style={{
          borderRadius: R.xl,
          boxShadow: [`0 0 0 1px ${rgba(NEON.sky, 0.55)}`, `0 0 8px ${rgba(NEON.sky, 0.45 * glow)}`, `0 0 26px ${rgba(NEON.blue, 0.5 * glow)}`, `0 0 60px ${rgba(NEON.blue, 0.3 * glow)}`].join(", "),
        }}
      >
        <ImportFileChip check={check} />
      </div>
    </div>
  </X3>
);
