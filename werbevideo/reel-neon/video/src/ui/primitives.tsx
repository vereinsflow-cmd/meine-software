/**
 * Grundbausteine wie in der App (shadcn/ui-Varianten der App). Maße in CSS-px der App, im Bildraum × 3 (X3).
 * Jeder Baustein hat nur Eigenschaften, die vom Frame gesteuert werden – keine Übergänge, keine Zeitgeber.
 */
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { interpolateColors } from "remotion";
import { AVATAR_TONE, type AvatarTone, C, FONT, R, S, SHADOW, TEXT, type TextSize, W, withAlpha } from "./tokens";
import { Icon, type IconName } from "./icons";
import { clamp01, mix, pressScale } from "./motion";
import { textWidth } from "./measure";

/** Grundstil wie body der App: Systemschrift, 16 px, Zeilenhöhe 1,5, Graustufen-Glättung. */
export const ROOT_STYLE: React.CSSProperties = {
  fontFamily: FONT,
  color: C.fg,
  fontSize: 16,
  lineHeight: 1.5,
  WebkitFontSmoothing: "antialiased",
  textRendering: "optimizeLegibility",
  boxSizing: "border-box",
};

/* ------------------------------------------------------------------ Maßstab */

const Scaled = createContext(false);

/**
 * Bringt CSS-px-Inhalt in den Bildraum (× 3). Innerhalb eines X3 (z. B. in AppShell) wird nicht noch einmal skaliert –
 * jeder Baustein lässt sich so allein (Bildraum) oder in einer Seite verwenden.
 * width/height in CSS-px; das äußere Kästchen ist 3 × so groß. Ohne height wird die Höhe gemessen, damit allein
 * verwendete Bausteine im Fluss (flex/grid, untereinander) ihren Platz einnehmen.
 */
export const X3: React.FC<{ width?: number; height?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  width,
  height,
  children,
  style,
}) => {
  const inside = useContext(Scaled);
  const inner = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (inside || height !== undefined || !inner.current) return;
    const h = inner.current.offsetHeight;
    if (h !== measured) setMeasured(h);
  });
  if (inside) return <>{children}</>;
  const h = height ?? measured;
  return (
    <div style={{ position: "relative", width: width !== undefined ? width * S : undefined, height: h !== undefined ? h * S : undefined, ...style }}>
      <div ref={inner} style={{ ...ROOT_STYLE, position: "absolute", left: 0, top: 0, width, height, transform: `scale(${S})`, transformOrigin: "0 0" }}>
        <Scaled.Provider value>{children}</Scaled.Provider>
      </div>
    </div>
  );
};

/** Markiert einen Bereich als bereits skaliert (für eigene Hüllen mit scale(3)). */
export const ScaledScope: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Scaled.Provider value>{children}</Scaled.Provider>
);

/** Textgröße der App als Stil: text("sm") → 15 px / 21,75 px. */
export const text = (size: TextSize, weight?: number): React.CSSProperties => ({
  ...TEXT[size],
  ...(weight ? { fontWeight: weight } : {}),
});

/* ------------------------------------------------------------------ Knopf */

export type ButtonVariant = "default" | "outline" | "ghost" | "link" | "success";
export type ButtonSize = "default" | "sm" | "lg" | "icon" | "icon-sm";

export type ButtonProps = {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Symbol vor der Beschriftung */
  icon?: IconName;
  /** Symbolgröße (Standard size-4 = 16, bei sm 14) */
  iconSize?: number;
  /** 0..1 – gedrückt: kleiner (0,96) und dunkler */
  pressed?: number;
  /** volle Breite */
  block?: boolean;
  textColor?: string;
  style?: React.CSSProperties;
};

const BTN_SIZE: Record<ButtonSize, React.CSSProperties> = {
  default: { height: 36, padding: "0 14px", gap: 8, borderRadius: R.lg },
  sm: { height: 32, padding: "0 12px", gap: 6, borderRadius: R.md },
  lg: { height: 40, padding: "0 16px", gap: 8, borderRadius: R.lg, ...TEXT.base },
  icon: { width: 36, height: 36, padding: 0, borderRadius: R.lg },
  "icon-sm": { width: 32, height: 32, padding: 0, borderRadius: R.md },
};

/**
 * Knopf wie Button der App (dunkel): default (hellblau mit dunkler Schrift, halbfett), outline (Fläche input/30, Rand --input),
 * ghost, link, success (hellgrün mit dunkler Schrift).
 */
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "default",
  size = "default",
  icon,
  iconSize,
  pressed = 0,
  block,
  textColor,
  style,
}) => {
  const p = clamp01(pressed);
  const base: React.CSSProperties = {
    display: block ? "flex" : "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
    ...TEXT.sm,
    fontWeight: W.medium,
    transform: p > 0 ? `scale(${pressScale(p)})` : undefined,
    ...BTN_SIZE[size],
    ...(block ? { width: "100%" } : {}),
  };
  let v: React.CSSProperties;
  switch (variant) {
    case "default":
      v = { background: interpolateColors(p, [0, 1], [C.primary, C.primaryPressed]), color: C.primaryFg, fontWeight: W.semibold, boxShadow: SHADOW.sm };
      break;
    case "success":
      v = { background: interpolateColors(p, [0, 1], [C.success, C.successPressed]), color: C.successFg, fontWeight: W.semibold, boxShadow: SHADOW.sm };
      break;
    case "outline":
      // dark:border-input dark:bg-input/30, gedrückt dark:bg-input/50
      v = { background: interpolateColors(p, [0, 1], [C.inputBg, C.inputBgPressed]), borderColor: C.input, boxShadow: SHADOW.xs, color: C.fg };
      break;
    case "ghost":
      // gedrückt dark:hover:bg-muted/50
      v = { background: p > 0 ? withAlpha(C.mutedBg, 0.5 * p) : "transparent", color: C.fg };
      break;
    case "link":
      v = { background: "transparent", color: C.primary };
      break;
  }
  const isz = iconSize ?? (size === "sm" ? 14 : 16);
  return (
    <div style={{ ...base, ...v, backgroundClip: "padding-box", ...(textColor ? { color: textColor } : {}), ...style }}>
      {icon ? <Icon name={icon} size={isz} /> : null}
      {children}
    </div>
  );
};

/* ------------------------------------------------------------------ Schild */

export type BadgeTone = "green" | "blue" | "gray" | "orange" | "red" | "outline";

const BADGE_TONE: Record<BadgeTone, React.CSSProperties> = {
  green: { background: C.greenBg, color: C.greenFg },
  blue: { background: C.blueBg, color: C.blueFg },
  gray: { background: C.mutedBg, color: C.muted },
  orange: { background: C.amberBg, color: C.amberFg },
  red: { background: C.redBg, color: C.redFg },
  // „ended“: nur umrandet, ring-foreground/25
  outline: { background: "transparent", color: C.muted, boxShadow: `inset 0 0 0 1px ${withAlpha(C.fg, 0.25)}` },
};

/**
 * Schild wie ToneBadge der App (h-6, px-2.5, text-xs, rund), dunkel bg-…-950 mit Schrift …-200.
 * green = Aktiv/Veröffentlicht, blue = Benutzerkonto, gray = Training.
 */
export const Badge: React.FC<{
  tone?: BadgeTone;
  children: React.ReactNode;
  icon?: IconName;
  /** 0..1 Auftritt (ploppt aus 0,6 auf 1) */
  appear?: number;
  style?: React.CSSProperties;
}> = ({ tone = "gray", children, icon, appear = 1, style }) => (
  <span
    style={{
      display: "inline-flex",
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      boxSizing: "border-box",
      height: 24,
      width: "fit-content",
      padding: "2px 10px",
      border: "1px solid transparent",
      borderRadius: R["4xl"],
      ...TEXT.xs,
      fontWeight: W.medium,
      whiteSpace: "nowrap",
      overflow: "hidden",
      ...BADGE_TONE[tone],
      ...(appear < 1 ? { opacity: clamp01(appear * 1.4), transform: `scale(${mix(appear, 0.6, 1)})` } : {}),
      ...style,
    }}
  >
    {icon ? <Icon name={icon} size={12} /> : null}
    {children}
  </span>
);

/* ------------------------------------------------------------------ Karte */

export type CardProps = {
  children?: React.ReactNode;
  /** "ring" = ring-1 + shadow-sm (Card der App), "border" = 1 px Rand + shadow-xs, "border-sm" = Rand + shadow-sm */
  frame?: "ring" | "border" | "border-sm";
  /** Abstand oben/unten und zwischen Kopf und Inhalt (--card-spacing): 20, "sm" 16, "none" 0 */
  size?: "default" | "sm" | "none";
  style?: React.CSSProperties;
};

/** Karte (rounded-xl, Kartenfarbe eine Stufe über dem Seitengrund, feiner heller Ring, leichter Schatten). */
export const Card: React.FC<CardProps> = ({ children, frame = "ring", size = "default", style }) => {
  const spacing = size === "sm" ? 16 : size === "none" ? 0 : 20;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: spacing,
        padding: `${spacing}px 0`,
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: R.xl,
        background: C.card,
        color: C.fg,
        ...TEXT.sm,
        ...(frame === "ring" ? { boxShadow: SHADOW.card } : { border: `1px solid ${C.border}`, boxShadow: frame === "border-sm" ? SHADOW.sm : SHADOW.xs }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ display: "grid", gap: 4, padding: "0 20px", ...style }}>{children}</div>
);
export const CardTitle: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 19, lineHeight: 1.375, fontWeight: W.bold, letterSpacing: "-0.025em", ...style }}>{children}</div>
);
export const CardDescription: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ ...TEXT.sm, color: C.muted, ...style }}>{children}</div>
);
export const CardContent: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ padding: "0 20px", ...style }}>{children}</div>
);

/* ------------------------------------------------------------------ Seitenkopf */

export type PageTitleProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Abstand nach unten (mb-7 = 28) */
  marginBottom?: number;
  /** 0..1 Auftritt von Titel, Unterzeile und Knöpfen (gestaffelt) */
  appear?: number;
  titleStyle?: React.CSSProperties;
  descriptionStyle?: React.CSSProperties;
};

/** Seitenkopf wie PageHeader der App: großer fetter Titel (text-3xl), gedämpfte Unterzeile, Knöpfe darunter. */
export const PageTitle: React.FC<PageTitleProps> = ({ title, description, actions, marginBottom = 28, appear = 1, titleStyle, descriptionStyle }) => {
  const part = (i: number): React.CSSProperties => {
    if (appear >= 1) return {};
    const q = clamp01(appear * 1.6 - i * 0.3);
    return { opacity: q, transform: `translateY(${(1 - q) * 14}px)` };
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom }}>
      <div style={{ maxWidth: "100%" }}>
        <div style={{ ...TEXT["3xl"], fontWeight: W.bold, letterSpacing: "-0.025em", overflowWrap: "break-word", ...part(0), ...titleStyle }}>{title}</div>
        {description !== undefined ? <div style={{ ...TEXT.base, color: C.muted, marginTop: 6, ...part(1), ...descriptionStyle }}>{description}</div> : null}
      </div>
      {actions ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, ...part(2) }}>{actions}</div> : null}
    </div>
  );
};

/** Zurück-Link über dem Titel („‹ Alle Veranstaltungen“). */
export const BackLink: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ marginBottom: 12, ...TEXT.sm, ...style }}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.muted }}>
      <Icon name="chevron-left" size={16} />
      <span>{children}</span>
    </span>
  </div>
);

/* ------------------------------------------------------------------ Suchfeld */

/** Eingabefeld wie Input der App (h-9, deckender Feldrand, dunkel Fläche input/30, text-base am Handy). */
export const SearchField: React.FC<{
  placeholder?: string;
  /** getippter Text (ersetzt den Platzhalter) */
  value?: string;
  /** Schreibmarke zeigen (Sichtbarkeit/Blinken steuert der Aufrufer) */
  caret?: boolean;
  /** 0..1 Fokusring */
  focus?: number;
  /** Platz rechts für das (unsichtbare) Löschkreuz von type="search" in Chrome – dort schneidet der Text ab (CSS-px) */
  cancelSpace?: number;
  style?: React.CSSProperties;
}> = ({ placeholder = "Suchen …", value, caret, focus = 0, cancelSpace = 46 / 3, style }) => (
  <div
    style={{
      position: "relative",
      boxSizing: "border-box",
      height: 36,
      minWidth: 0,
      border: `1px solid ${interpolateColors(clamp01(focus), [0, 1], [C.field, C.primary])}`,
      borderRadius: R.lg,
      background: C.inputBg,
      padding: "4px 12px",
      display: "flex",
      alignItems: "center",
      ...TEXT.base,
      // Fokussaum ring-3 ring-ring/50 (Ring = Markenfarbe)
      boxShadow: focus > 0 ? `0 0 0 3px ${withAlpha(C.primary, 0.5 * clamp01(focus))}` : undefined,
      ...style,
    }}
  >
    <div style={{ overflow: "hidden", whiteSpace: "nowrap", flex: 1, minWidth: 0, display: "flex", alignItems: "center", marginRight: cancelSpace }}>
      {value ? <span style={{ color: C.fg }}>{value}</span> : <span style={{ color: C.muted }}>{placeholder}</span>}
      {caret ? <span style={{ display: "inline-block", width: 1.5, height: 20, background: C.fg, marginLeft: 1 }} /> : null}
    </div>
  </div>
);

/* ------------------------------------------------------------------ Umschaltleiste */

export type TabItem = { label: string; count?: number };

/**
 * Umschaltleiste wie SEGMENT_BAR der App (Finanzen: „Übersicht · Beiträge · Kassenbuch · Rechnungen“). Dunkel: Leiste --muted
 * mit Ring foreground/10, gewählter Eintrag als hellere Kachel foreground/15 mit feinem Innenrand (ohne Schatten).
 * activeIndex darf eine Kommazahl sein – die Kachel gleitet dann zwischen den Einträgen.
 */
export const Tabs: React.FC<{
  items: (string | TabItem)[];
  activeIndex?: number;
  /** "lg" = h-9/px-3.5 (Finanzen), "md" = h-8/px-3 (Kalender, Rechnungen) */
  size?: "lg" | "md";
  /** feste Breite der Leiste in CSS-px (Überstand wird abgeschnitten wie am Handy) */
  width?: number;
  /** waagerechter Scroll der Leiste (CSS-px) */
  scrollX?: number;
  style?: React.CSSProperties;
}> = ({ items, activeIndex = 0, size = "lg", width, scrollX = 0, style }) => {
  const h = size === "lg" ? 36 : 32;
  const padX = size === "lg" ? 14 : 12;
  const gap = 4;
  const norm = items.map((it) => (typeof it === "string" ? { label: it } : it));
  const boxes: { x: number; w: number }[] = [];
  let x = 0;
  for (const it of norm) {
    let w = padX * 2 + textWidth(it.label, TEXT.sm.fontSize, W.medium);
    if (it.count !== undefined) w += 6 + Math.max(20, 12 + textWidth(String(it.count), TEXT.xs.fontSize, W.semibold));
    boxes.push({ x, w });
    x += w + gap;
  }
  const i0 = Math.max(0, Math.min(norm.length - 1, Math.floor(activeIndex)));
  const i1 = Math.min(norm.length - 1, i0 + 1);
  const t = clamp01(activeIndex - i0);
  return (
    <div
      style={{
        position: "relative",
        display: width ? "flex" : "inline-flex",
        boxSizing: "border-box",
        width,
        maxWidth: "100%",
        padding: 4,
        borderRadius: R.lg,
        background: C.mutedBg,
        boxShadow: `0 0 0 1px ${withAlpha(C.fg, 0.1)}`,
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ position: "relative", display: "flex", gap, transform: scrollX ? `translateX(${-scrollX}px)` : undefined }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: mix(t, boxes[i0].x, boxes[i1].x),
            width: mix(t, boxes[i0].w, boxes[i1].w),
            height: h,
            borderRadius: R.md,
            // dark:bg-foreground/15 dark:shadow-none dark:inset-ring-1 dark:inset-ring-foreground/20
            background: withAlpha(C.fg, 0.15),
            boxShadow: `inset 0 0 0 1px ${withAlpha(C.fg, 0.2)}`,
          }}
        />
        {norm.map((it, i) => (
          <div
            key={it.label}
            style={{
              position: "relative",
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              height: h,
              width: boxes[i].w,
              boxSizing: "border-box",
              ...TEXT.sm,
              fontWeight: W.medium,
              whiteSpace: "nowrap",
              color: interpolateColors(clamp01(1 - Math.abs(activeIndex - i)), [0, 1], [C.muted, C.fg]),
            }}
          >
            {it.label}
            {it.count !== undefined ? (
              <span
                style={{
                  minWidth: 20,
                  boxSizing: "border-box",
                  borderRadius: 999,
                  // dark:bg-amber-400/20 dark:text-amber-200
                  background: "rgba(255,185,0,0.2)",
                  padding: "0 6px",
                  textAlign: "center",
                  ...TEXT.xs,
                  fontWeight: W.semibold,
                  color: C.amberFg,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {it.count}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ Fortschrittsbalken */

export type ProgressTone = "auto" | "full" | "partial" | "empty" | "primary";
const PROGRESS_COLOR = { full: C.emerald500, partial: C.amber500, empty: C.red500, primary: C.primary } as const;

/** Besetzungsbalken wie FillBar der App: h-2, grau; Füllung grün (voll) / bernstein (teilweise) / rot (leer). */
export const ProgressBar: React.FC<{
  /** 0..1 */
  fill: number;
  tone?: ProgressTone;
  height?: number;
  style?: React.CSSProperties;
}> = ({ fill, tone = "auto", height = 8, style }) => {
  const f = clamp01(fill);
  const t = tone === "auto" ? (f >= 0.999 ? "full" : f <= 0.001 ? "empty" : "partial") : tone;
  return (
    <div style={{ height, borderRadius: 999, background: C.mutedBg, overflow: "hidden", ...style }}>
      <div style={{ width: `${f * 100}%`, height: "100%", borderRadius: 999, background: PROGRESS_COLOR[t] }} />
    </div>
  );
};

/* ------------------------------------------------------------------ Rundes Bild mit Symbol */

/** Kreis mit Symbol oder Buchstaben auf getönter Fläche (ChatAvatar: size-11 = 44, Symbol 20). */
export const Avatar: React.FC<{
  icon?: IconName;
  initials?: string;
  tone?: AvatarTone;
  bg?: string;
  fg?: string;
  size?: number;
  iconSize?: number;
  style?: React.CSSProperties;
}> = ({ icon, initials, tone = "emerald", bg, fg, size = 44, iconSize = 20, style }) => (
  <span
    style={{
      display: "flex",
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "50%",
      background: bg ?? AVATAR_TONE[tone].bg,
      color: fg ?? AVATAR_TONE[tone].fg,
      ...TEXT.xs,
      fontWeight: W.semibold,
      ...style,
    }}
  >
    {icon ? <Icon name={icon} size={iconSize} /> : initials}
  </span>
);

/* ------------------------------------------------------------------ Kästchen */

/** Natives Kästchen in Chrome mit color-scheme: dark – im Headless-Chrome gemessen: Rand, Fläche, Haken auf accent-color. */
const NATIVE_DARK = { border: "#858585", fill: "#3B3B3B", check: "#3B3B3B" } as const;

/** Kleines Kontrollkästchen (size-3.5, accent-primary) – checked 0..1 füllt in der Markenfarbe und zeichnet den Haken. */
export const Checkbox: React.FC<{ checked?: number; size?: number }> = ({ checked = 0, size = 14 }) => {
  const c = clamp01(checked);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: 3,
        border: `1px solid ${interpolateColors(c, [0, 1], [NATIVE_DARK.border, C.primary])}`,
        background: interpolateColors(c, [0, 1], [NATIVE_DARK.fill, C.primary]),
        flexShrink: 0,
      }}
    >
      {c > 0 ? (
        // Haken wie Chrome: Linienzug bei 20/50 → 40/70 → 80/20 % der Kästchenbreite, Strich 16 %, eckige Enden (über die ganze
        // Fläche inkl. Rand, daher −1). Zeichnet sich mit checked von links.
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", left: -1, top: -1, overflow: "visible" }}>
          <path
            d="M20 50L40 70L80 20"
            fill="none"
            stroke={NATIVE_DARK.check}
            strokeWidth={16}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            {...(c < 1 ? { pathLength: 1, strokeDasharray: "1 1", strokeDashoffset: 1 - c } : {})}
          />
        </svg>
      ) : null}
    </span>
  );
};
