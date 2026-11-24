/**
 * Rahmen jeder App-Seite (dunkel): Kopfzeile (Menü, Vereinslogo „TM“, Vereinsname, Suche, gelbe Glocke mit Zähler, Kreis „AA“)
 * und darunter der fast schwarze Seitengrund mit Innenabstand.
 *
 * Bildraum: 1170 breit; Kopfzeile y 0–192 (inkl. 3 px Unterkante), Seiteninhalt beginnt bei y = 192 + 48 = 240.
 * scrollY (Bildpixel) schiebt nur den Inhalt – die Kopfzeile bleibt stehen und deckt ab, wie in der App.
 */
import React from "react";
import { C, CSS_W, HEADER_H, PAGE_PAD, S, SCREEN_H, SCREEN_W, TEXT, W, withAlpha } from "./tokens";
import { Icon } from "./icons";
import { ROOT_STYLE, ScaledScope, X3 } from "./primitives";
import { clamp01 } from "./motion";
import { interpolateColors } from "remotion";

export type AppHeaderProps = {
  /** Vereinsname (kürzt sich mit „…“ wie in der App) */
  clubName?: string;
  /** Kürzel im Logo */
  clubInitials?: string;
  /** Kürzel im Benutzerkreis */
  userInitials?: string;
  /** Zahl an der Glocke (0 = ohne Zähler) */
  bellCount?: number;
  /** 0..1 – Zähler ploppt auf */
  bellPop?: number;
  /** 0..1 – Kopfzeile gleitet von oben herein */
  headerAppear?: number;
  /** 0..1 – Fläche unter der Kopfzeile: 0 Seitengrund (card/80 darüber = #141416), 1 Karte (#171719); AppShell setzt sie aus scrollY */
  surface?: number;
  /** durchscheinend mit Unschärfe wie live in der App (Standard aus: deckend wie in den Aufnahmen) */
  glass?: boolean;
};

const iconBtn: React.CSSProperties = {
  position: "relative",
  flexShrink: 0,
  width: 36,
  height: 36,
  boxSizing: "border-box",
  border: "1px solid transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Kopfzeile (CSS 390 × 64, Bildraum 1170 × 192). */
export const AppHeader: React.FC<AppHeaderProps> = ({
  clubName = "TSV Musterstadt 1890 e. V.",
  clubInitials = "TM",
  userInitials = "AA",
  bellCount = 1,
  bellPop = 1,
  headerAppear = 1,
  surface = 0,
  glass = false,
}) => {
  const a = clamp01(headerAppear);
  return (
    <X3 width={CSS_W} height={HEADER_H}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: CSS_W,
          height: HEADER_H,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          // App: bg-card/80 + Unschärfe. Deckend gerechnet: über dem Seitengrund #141416, gescrollt (über Karten) Kartenfarbe.
          ...(glass
            ? { background: withAlpha(C.card, 0.8), backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }
            : { background: interpolateColors(clamp01(surface), [0, 1], [C.header, C.card]) }),
          borderBottom: `1px solid ${C.border}`,
          opacity: a,
          transform: a < 1 ? `translateY(${(1 - a) * -20}px)` : undefined,
          zIndex: 10,
        }}
      >
        <div style={iconBtn}>
          <Icon name="menu" size={20} color={C.fg} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "0 1 auto" }}>
          <div
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              boxSizing: "border-box",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.mutedBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...TEXT.xs,
              fontWeight: W.semibold,
              color: C.muted,
            }}
          >
            {clubInitials}
          </div>
          <div style={{ ...TEXT.base, fontWeight: W.semibold, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {clubName}
          </div>
        </div>
        <div style={{ flex: "1 1 0%", display: "flex", justifyContent: "center", padding: "0 8px" }}>
          <div style={iconBtn}>
            <Icon name="search" size={20} color={C.fg} />
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <div style={iconBtn}>
            {/* Glocke wie in der App: gelb gefüllt (--bell), Umriss hellgold (--bell-outline) */}
            <Icon name="bell" size={20} color={C.bellOutline} fill={C.bell} />
            {bellCount > 0 ? (
              <span
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  height: 18,
                  minWidth: 18,
                  boxSizing: "border-box",
                  padding: "0 4px",
                  borderRadius: 999,
                  background: C.primary,
                  color: C.primaryFg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: TEXT.xs.fontSize,
                  lineHeight: 1,
                  fontWeight: W.semibold,
                  fontVariantNumeric: "tabular-nums",
                  boxShadow: `0 0 0 2px ${C.card}`,
                  transform: bellPop < 1 ? `scale(${Math.max(0, bellPop)})` : undefined,
                }}
              >
                {bellCount > 99 ? "99+" : bellCount}
              </span>
            ) : null}
          </div>
          <div style={{ flexShrink: 0, height: 40, boxSizing: "border-box", border: "1px solid transparent", padding: "0 6px", display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: C.primarySoft,
                boxShadow: `inset 0 0 0 1px ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...TEXT.xs,
                fontWeight: W.semibold,
                color: C.primary,
              }}
            >
              {userInitials}
            </div>
          </div>
        </div>
      </div>
    </X3>
  );
};

export type AppShellProps = AppHeaderProps & {
  /** Seiteninhalt (CSS-px, ohne eigene Skalierung) */
  children?: React.ReactNode;
  /** Scroll des Inhalts in Bildpixeln (wie scrollY der Aufnahmen im manifest) */
  scrollY?: number;
  /** Höhe in Bildpixeln (Standard 2532 wie die Aufnahmen) */
  height?: number;
  /** ohne Innenabstand p-4 */
  flush?: boolean;
  /** Seitengrund */
  background?: string;
  /** Kopfzeile weglassen */
  hideHeader?: boolean;
  style?: React.CSSProperties;
};

/** Ganze App-Seite im Bildraum: 1170 × height, Kopfzeile oben, Inhalt darunter (in CSS-px gesetzt, × 3 skaliert). */
export const AppShell: React.FC<AppShellProps> = ({ children, scrollY = 0, height = SCREEN_H, flush, background = C.page, hideHeader, style, ...header }) => (
  <div style={{ position: "relative", width: SCREEN_W, height, overflow: "hidden", background, ...style }}>
    <div style={{ ...ROOT_STYLE, position: "absolute", left: 0, top: 0, width: CSS_W, height: height / S, transform: `scale(${S})`, transformOrigin: "0 0" }}>
      <ScaledScope>
        <div style={{ position: "absolute", left: 0, top: HEADER_H - scrollY / S, width: CSS_W, boxSizing: "border-box", padding: flush ? 0 : PAGE_PAD }}>
          {children}
        </div>
        {hideHeader ? null : <AppHeader surface={clamp01(scrollY / 48)} {...header} />}
      </ScaledScope>
    </div>
  </div>
);

/** y (Bildpixel), an der der Seiteninhalt bei scrollY 0 beginnt: 192 + 48 = 240. */
export const CONTENT_TOP = (HEADER_H + PAGE_PAD) * S;
