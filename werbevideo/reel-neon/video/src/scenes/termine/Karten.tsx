/**
 * Karten der Szene „termine“:
 *   AbsageKarte   „Deine Teilnahme“ mit dem echten Absage-Ablauf der App (rsvp-panel.tsx): „Absagen“ →
 *                 „✕ Du hast abgesagt.“ + [✓ Doch zusagen] (ui/events.tsx kennt nur den Zusage-Ablauf)
 *   SchwebeKarte  App-Karte in einem Glasrahmen (der Glow kommt aus der Szene, die App-Schatten sind im Dunkeln unsichtbar)
 *   Tipp-Punkte   Mitte von „Zusagen“ (RsvpCard) und „Absagen“ (AbsageKarte), relativ zur Kartenmitte in Bildpixeln
 */
import React from "react";
import { GlassPanel, NEON, rgba } from "../../neon";
import { Icon } from "../../ui/icons";
import { textWidth } from "../../ui/measure";
import { clamp01, easeInOut, mix } from "../../ui/motion";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, X3 } from "../../ui/primitives";
import { C, CONTENT_W, TEXT, W } from "../../ui/tokens";

/** Karte „Deine Teilnahme“ im Bildraum: 358 × 182,6 CSS-px */
export const KARTE_W = CONTENT_W * 3;
export const KARTE_H = 548;
/** Glasrand um die App-Karte (Bildpixel) */
export const RAND = 36;
export const SCHWEBE_W = KARTE_W + 2 * RAND;
export const SCHWEBE_H = KARTE_H + 2 * RAND;

/** Knopfbreite wie in der App: Rand 2 + Innenabstand 28 + Symbol 16 + Abstand 8 + Text (CSS-px) */
const btnW = (label: string, weight: number) => 2 + 28 + 16 + 8 + textWidth(label, 15, weight);
/** Knopfmitte senkrecht: 20 + Kopf 51,875 + 20 + Statuszeile 22,75 + 12 + 18 (CSS-px) */
const BTN_CY = 20 + 51.875 + 20 + 22.75 + 12 + 18;

/** Mitte von „Zusagen“ relativ zur Kartenmitte (Bildpixel) */
export const zusagenPunkt = () => ({ x: (20 + btnW("Zusagen", W.semibold) / 2) * 3 - KARTE_W / 2, y: BTN_CY * 3 - KARTE_H / 2 });
/** Mitte von „Absagen“ relativ zur Kartenmitte (Bildpixel) */
export const absagenPunkt = () => ({
  x: (20 + btnW("Zusagen", W.semibold) + 8 + btnW("Absagen", W.medium) / 2) * 3 - KARTE_W / 2,
  y: BTN_CY * 3 - KARTE_H / 2,
});

export type AbsageKarteProps = {
  /** 0..1 – von „Du hast noch nicht geantwortet.“ + [Zusagen][Absagen] zu „✕ Du hast abgesagt.“ + [Doch zusagen] */
  progress?: number;
  /** 0..1 – „Absagen“ gedrückt */
  pressed?: number;
};

export const AbsageKarte: React.FC<AbsageKarteProps> = ({ progress = 0, pressed = 0 }) => {
  const p = clamp01(progress);
  // Ablauf wie RsvpCard: alter Satz und „Absagen“ blenden aus → Platz schließt sich → neuer Satz, Kreuz zeichnet sich
  const fadeOld = clamp01(p / 0.3);
  const collapse = easeInOut(clamp01((p - 0.2) / 0.4));
  const label = easeInOut(clamp01((p - 0.22) / 0.3));
  const fadeNew = clamp01((p - 0.32) / 0.3);
  const iconIn = easeInOut(clamp01((p - 0.25) / 0.3));
  const draw = clamp01((p - 0.38) / 0.5);
  const zuW = textWidth("Zusagen", 15, W.semibold);
  const dochW = textWidth("Doch zusagen", 15, W.semibold);
  const absW = btnW("Absagen", W.medium);
  return (
    <X3 width={CONTENT_W}>
      <Card>
        <CardHeader>
          <CardTitle>Deine Teilnahme</CardTitle>
          <CardDescription>Anmeldung optional</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", ...TEXT.sm, fontWeight: W.medium, marginBottom: 1 }}>
              <span style={{ width: 24 * iconIn, flexShrink: 0, overflow: "visible", display: "flex" }}>
                {draw > 0 ? <Icon name="x" size={16} color={C.muted} draw={draw} /> : null}
              </span>
              <span style={{ display: "inline-grid" }}>
                <span style={{ gridArea: "1 / 1", opacity: 1 - fadeOld }}>Du hast noch nicht geantwortet.</span>
                <span style={{ gridArea: "1 / 1", opacity: fadeNew }}>Du hast abgesagt.</span>
              </span>
            </div>
            <div style={{ display: "flex" }}>
              <Button icon="check">
                <span style={{ position: "relative", display: "inline-block", width: mix(label, zuW, dochW), height: 21.75 }}>
                  <span style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap", opacity: 1 - label }}>Zusagen</span>
                  <span style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap", opacity: label }}>Doch zusagen</span>
                </span>
              </Button>
              <div
                style={{
                  width: (absW + 8) * (1 - collapse),
                  display: "flex",
                  overflow: "visible",
                  opacity: 1 - fadeOld,
                  transform: `scale(${mix(fadeOld, 1, 0.9)})`,
                  transformOrigin: "left center",
                }}
              >
                {fadeOld < 1 ? (
                  <Button variant="outline" icon="x" pressed={pressed} style={{ marginLeft: 8 }}>
                    Absagen
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </X3>
  );
};

export type SchwebeKarteProps = {
  /** 0..1 – Glasrahmen sichtbar (0 = nur die App-Karte, z. B. noch im Bildschirm) */
  glass: number;
  /** äußerer Schein */
  glow: number;
  /** Lichtkante */
  edge?: number;
  /** 0..1 Glanzstreifen */
  sheen?: number;
  width?: number;
  height?: number;
  /** Glasrand (Bildpixel) */
  pad?: number;
  children: React.ReactNode;
};

/** App-Karte im Glasrahmen; Maße SCHWEBE_W × SCHWEBE_H (oder eigene) */
export const SchwebeKarte: React.FC<SchwebeKarteProps> = ({ glass, glow, edge = 1.2, sheen, width = SCHWEBE_W, height = SCHWEBE_H, pad = RAND, children }) => {
  const g = clamp01(glass);
  return (
    <div style={{ position: "relative", width, height }}>
      {g > 0.002 ? (
        <div style={{ position: "absolute", inset: 0, opacity: g }}>
          <GlassPanel width={width} height={height} radius={58} tint={0.18} glow={glow} edge={edge} sheen={sheen} light={-30} />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: pad, top: pad }}>{children}</div>
      {/* Licht der Kante fällt auf die Karte (Hauch Himmel oben) */}
      {g > 0.002 ? (
        <div
          style={{
            position: "absolute",
            left: pad,
            top: pad,
            right: pad,
            bottom: pad,
            borderRadius: 42,
            pointerEvents: "none",
            opacity: g,
            background: `linear-gradient(170deg, ${rgba(NEON.sky, 0.07)} 0%, ${rgba(NEON.sky, 0)} 34%)`,
            boxShadow: `inset 0 0 0 1px ${rgba(NEON.sky, 0.1)}`,
          }}
        />
      ) : null}
    </div>
  );
};
