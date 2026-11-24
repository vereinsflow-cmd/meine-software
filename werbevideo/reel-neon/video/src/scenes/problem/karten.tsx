/**
 * Karten des Chaos (problem, frage): stilisierte Tabellen-Karten („Mitglieder_final.xlsx“ …), Gruppenchat mit Blasen,
 * die sich stapeln, Zähler-Abzeichen, Dateiliste, Lichtpunkte. Alles auf dunklem Glas (neon/GlassPanel), ohne App-Bezug.
 */
import React from "react";
import { fontFamily } from "../../fonts";
import { GlassPanel, NEON, clamp01, lerp, rgba, textGlow } from "../../neon";
import { sp, POP } from "../../springs";
import { Icon } from "../../ui/icons";

/** Excel-Grün nur fürs Tabellen-Symbol (erkennbar „Tabelle“), sonst Markenpalette */
const SHEET_GREEN = "#1FA463";
/** Abzeichen-Rot (Alarm, nicht der orange Markenpunkt) */
export const BADGE_RED = "#FF4D57";

/** großer unscharfer Lichtpunkt (additiv), ersetzt die unscharfen Sterne der Referenz */
export const BokehDot: React.FC<{ size: number; color: string; alpha?: number }> = ({ size, color, alpha = 0.6 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      mixBlendMode: "screen",
      background: `radial-gradient(circle, ${rgba(color, alpha)} 0%, ${rgba(color, alpha * 0.62)} 38%, ${rgba(color, alpha * 0.18)} 58%, ${rgba(color, 0)} 70%)`,
    }}
  />
);

// ---- Tabelle ------------------------------------------------------------------------------

export type SheetRow = { name: string; dept: string; tel: number; mark?: "gelb" | "rot" | "neu" };

/** drei fast gleiche Listen – Zeilen leicht verschieden (Demo-Namen des TSV Musterstadt) */
export const SHEETS: { name: string; rows: SheetRow[] }[] = [
  {
    name: "Mitglieder_final.xlsx",
    rows: [
      { name: "Abel, Claudia", dept: "Fußball", tel: 0.72 },
      { name: "Adler, Anna", dept: "Vorstand", tel: 0.58 },
      { name: "Albrecht, Dieter", dept: "Tennis", tel: 0.66 },
      { name: "Bauer, Doris", dept: "Turnen", tel: 0.5 },
      { name: "Bauer, Klaus", dept: "Fußball", tel: 0.7 },
      { name: "Baumann, Holger", dept: "Tennis", tel: 0.62 },
      { name: "Beck, Emil", dept: "Fußball", tel: 0.55 },
    ],
  },
  {
    name: "Mitglieder_final2.xlsx",
    rows: [
      { name: "Abel, Claudia", dept: "Fußball", tel: 0.72 },
      { name: "Adler, Anna", dept: "Vorstand", tel: 0.58, mark: "gelb" },
      { name: "Albrecht, Dieter", dept: "Turnen", tel: 0.66 },
      { name: "Bauer, Klaus", dept: "Fußball", tel: 0.7 },
      { name: "Baumann, Holger", dept: "Tennis", tel: 0.4, mark: "rot" },
      { name: "Beck, Emil", dept: "Fußball", tel: 0.55 },
      { name: "Bauer, Doris", dept: "Turnen", tel: 0.5 },
    ],
  },
  {
    name: "Mitglieder_NEU.xlsx",
    rows: [
      { name: "Abel, Claudia", dept: "Fußball", tel: 0.72, mark: "neu" },
      { name: "Adler, Anna", dept: "Vorstand", tel: 0.64 },
      { name: "Bauer, Doris", dept: "Turnen", tel: 0.5 },
      { name: "Bauer, Klaus", dept: "Tennis", tel: 0.7, mark: "gelb" },
      { name: "Baumann, Holger", dept: "Tennis", tel: 0.62 },
      { name: "Beck, Emil", dept: "Fußball", tel: 0.48 },
      { name: "Albrecht, Dieter", dept: "Tennis", tel: 0.66 },
    ],
  },
];

const GridIcon: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.22,
      background: `linear-gradient(160deg, #2BC27A 0%, ${SHEET_GREEN} 55%, #13784A 100%)`,
      boxShadow: `0 0 ${size * 0.5}px ${rgba(SHEET_GREEN, 0.45)}, inset 0 1px 0 ${rgba("#FFFFFF", 0.35)}`,
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gridTemplateRows: "1fr 1fr 1fr",
      gap: size * 0.06,
      padding: size * 0.2,
      boxSizing: "border-box",
    }}
  >
    {Array.from({ length: 9 }, (_, i) => (
      <div key={i} style={{ background: rgba("#FFFFFF", i < 3 ? 0.95 : 0.7), borderRadius: 1.5 }} />
    ))}
  </div>
);

export const SHEET_W = 660;
export const SHEET_H = 560;

/** stilisierte Tabellen-Karte: Titelzeile mit Dateiname, Spaltenköpfe A B C, Zeilennummern, Namen, Abteilung, Telefon als Balken */
export const SheetCard: React.FC<{ index: number; w?: number; h?: number; tint?: number; glow?: number; edge?: number; solid?: boolean }> = ({ index, w = SHEET_W, h = SHEET_H, tint = 0.32, glow = 0.7, edge = 1.1, solid = false }) => {
  const sheet = SHEETS[index];
  const rowH = 56;
  const colW = [52, 250, 160, w - 56 - 52 - 250 - 160];
  const line = rgba(NEON.sky, 0.16);
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {/* deckender Grund: gestapelte Karten scheinen nicht durcheinander durch */}
      {solid ? <div style={{ position: "absolute", inset: 0, borderRadius: 30, background: "#060B1C" }} /> : null}
    <GlassPanel width={w} height={h} tint={tint} glow={glow} edge={edge} radius={30} padding={28}>
      <div style={{ fontFamily, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, height: 58, marginBottom: 18 }}>
          <GridIcon size={50} />
          <span style={{ fontWeight: 800, fontSize: 31, color: NEON.ice, letterSpacing: "-0.01em", whiteSpace: "nowrap", textShadow: textGlow(0.25, NEON.sky, NEON.blue, 0.4) }}>{sheet.name}</span>
        </div>
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${rgba(NEON.sky, 0.22)}`, background: rgba("#050A1C", 0.35) }}>
          {/* Spaltenköpfe */}
          <div style={{ display: "flex", height: 44, background: rgba(NEON.blue, 0.2), borderBottom: `1px solid ${line}` }}>
            {["", "Name", "Abteilung", "Telefon"].map((c, i) => (
              <div key={i} style={{ width: colW[i], borderRight: i < 3 ? `1px solid ${line}` : undefined, display: "flex", alignItems: "center", justifyContent: i === 0 ? "center" : "flex-start", padding: i === 0 ? 0 : "0 14px", boxSizing: "border-box", fontWeight: 800, fontSize: 21, color: rgba(NEON.ice, 0.78) }}>
                {c}
              </div>
            ))}
          </div>
          {sheet.rows.map((r, ri) => {
            const bg = r.mark === "gelb" ? rgba("#F9CC21", 0.2) : r.mark === "rot" ? rgba(BADGE_RED, 0.18) : r.mark === "neu" ? rgba(NEON.sky, 0.14) : ri % 2 ? rgba(NEON.sky, 0.035) : "transparent";
            return (
              <div key={ri} style={{ display: "flex", height: rowH, background: bg, borderBottom: ri < sheet.rows.length - 1 ? `1px solid ${line}` : undefined }}>
                <div style={{ width: colW[0], borderRight: `1px solid ${line}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 20, color: rgba(NEON.ice, 0.5) }}>{ri + 2}</div>
                <div style={{ width: colW[1], borderRight: `1px solid ${line}`, display: "flex", alignItems: "center", padding: "0 14px", boxSizing: "border-box", fontWeight: 500, fontSize: 24, color: rgba(NEON.ice, 0.9), whiteSpace: "nowrap", overflow: "hidden" }}>{r.name}</div>
                <div style={{ width: colW[2], borderRight: `1px solid ${line}`, display: "flex", alignItems: "center", padding: "0 14px", boxSizing: "border-box", fontWeight: 500, fontSize: 24, color: rgba(NEON.ice, 0.72), whiteSpace: "nowrap" }}>{r.dept}</div>
                <div style={{ width: colW[3], display: "flex", alignItems: "center", padding: "0 16px", boxSizing: "border-box" }}>
                  <div style={{ width: `${Math.round(r.tel * 100)}%`, height: 10, borderRadius: 5, background: r.mark === "rot" ? rgba(BADGE_RED, 0.75) : rgba(NEON.ice, 0.3) }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </GlassPanel>
    </div>
  );
};

// ---- Gruppenchat --------------------------------------------------------------------------

export type ChatMsg = { who: string; text: string; color: string; mine?: boolean };

const C1 = "#8FB0FF";
const C2 = "#5EE9B5";
const C3 = "#FFD230";
const C4 = "#FFB494";
const C5 = "#C9D6FF";

/** Blasen des Gruppenchats (stilisiert, ohne App-Bezug) */
export const CHAT: ChatMsg[] = [
  { who: "Jana", text: "Wer kommt Do??", color: C1 },
  { who: "Tom", text: "Liste aktuell?", color: C2 },
  { who: "Mia", text: "Ich hab die alte Version …", color: C3 },
  { who: "Paul", text: "Welche Liste gilt jetzt?", color: C4 },
  { who: "Du", text: "Ich schick sie gleich nochmal", color: C5, mine: true },
  { who: "Lena", text: "Do kann ich nicht.", color: C2 },
  { who: "Emre", text: "Wer bringt die Bälle mit?", color: C1 },
  { who: "Jana", text: "???", color: C1 },
  { who: "Tom", text: "Steht das irgendwo?", color: C2 },
  { who: "Mia", text: "Bin doppelt eingetragen", color: C3 },
  { who: "Paul", text: "Wer kommt denn jetzt?", color: C4 },
  { who: "Lena", text: "Hä, welche Liste?", color: C2 },
];

export const BUBBLE_H = 104;
export const BUBBLE_GAP = 14;

export const ChatBubble: React.FC<{ m: ChatMsg; p?: number }> = ({ m, p = 1 }) => {
  const q = clamp01(p);
  return (
    <div style={{ display: "flex", justifyContent: m.mine ? "flex-end" : "flex-start", height: BUBBLE_H }}>
      <div
        style={{
          maxWidth: "84%",
          height: BUBBLE_H,
          boxSizing: "border-box",
          padding: "14px 24px",
          borderRadius: 26,
          borderBottomLeftRadius: m.mine ? 26 : 8,
          borderBottomRightRadius: m.mine ? 8 : 26,
          background: m.mine
            ? `linear-gradient(180deg, ${rgba("#3466F0", 0.95)} 0%, ${rgba(NEON.deep, 0.95)} 100%)`
            : `linear-gradient(180deg, ${rgba("#1A2650", 0.92)} 0%, ${rgba("#111A3A", 0.92)} 100%)`,
          boxShadow: m.mine ? `0 0 26px ${rgba(NEON.blue, 0.5)}, inset 0 1px 0 ${rgba("#FFFFFF", 0.2)}` : `inset 0 1px 0 ${rgba("#FFFFFF", 0.1)}, inset 0 0 0 1px ${rgba(NEON.sky, 0.1)}`,
          fontFamily,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          transformOrigin: m.mine ? "100% 100%" : "0% 100%",
          transform: q < 0.999 ? `translateY(${((1 - q) * 26).toFixed(2)}px) scale(${lerp(0.82, 1, q).toFixed(4)})` : undefined,
          opacity: clamp01(q * 1.6),
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 21, color: m.mine ? rgba(NEON.ice, 0.75) : m.color, whiteSpace: "nowrap" }}>{m.who}</span>
        <span style={{ fontWeight: 500, fontSize: 31, color: NEON.ice, whiteSpace: "nowrap", letterSpacing: "-0.005em" }}>{m.text}</span>
      </div>
    </div>
  );
};

/** Zähler-Abzeichen (rot, glühend) */
export const CountBadge: React.FC<{ value: number; size?: number; pulse?: number }> = ({ value, size = 128, pulse = 0 }) => {
  const label = `${value}`;
  const wide = label.length >= 3;
  const w = wide ? size * 1.42 : size;
  return (
    <div
      style={{
        width: w,
        height: size,
        borderRadius: size / 2,
        background: `radial-gradient(120% 120% at 35% 25%, #FF8A90 0%, ${BADGE_RED} 45%, #D9263A 100%)`,
        boxShadow: [
          `0 0 ${(14 + 20 * pulse).toFixed(1)}px ${rgba(BADGE_RED, 0.85)}`,
          `0 0 ${(46 + 50 * pulse).toFixed(1)}px ${rgba(BADGE_RED, 0.5 + 0.3 * pulse)}`,
          `inset 0 2px 0 ${rgba("#FFFFFF", 0.4)}`,
          `0 0 0 6px ${rgba("#060914", 0.9)}`,
        ].join(", "),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        fontWeight: 800,
        fontSize: size * 0.46,
        color: "#FFFFFF",
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        textShadow: `0 0 12px ${rgba("#FFFFFF", 0.55)}`,
      }}
    >
      {label}
    </div>
  );
};

export const CHAT_W = 720;
export const CHAT_H = 880;
const HEAD = 126;

/**
 * Gruppenchat-Karte: Kopf („Eltern D-Jugend · Gruppe“), Blasen stapeln sich von unten, ältere rutschen nach oben weg.
 * arrivals[i] = Frame, an dem Blase i erscheint (undefined = gar nicht); f = absoluter Frame.
 */
export const ChatCard: React.FC<{ f: number; arrivals: (number | undefined)[]; msgs?: ChatMsg[]; w?: number; h?: number; title?: string; tint?: number; glow?: number }> = ({
  f,
  arrivals,
  msgs = CHAT,
  w = CHAT_W,
  h = CHAT_H,
  title = "Eltern D-Jugend",
  tint = 0.22,
  glow = 0.75,
}) => {
  const step = BUBBLE_H + BUBBLE_GAP;
  const bodyH = h - HEAD - 24;
  // Fortschritt je Blase (Feder mit leichtem Überschwingen)
  const ps = arrivals.map((a) => (a === undefined || f < a ? 0 : sp(f, a, POP)));
  return (
    <GlassPanel width={w} height={h} tint={tint} glow={glow} radius={34} padding={0}>
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: HEAD, display: "flex", alignItems: "center", gap: 20, padding: "0 30px", boxSizing: "border-box", borderBottom: `1px solid ${rgba(NEON.sky, 0.14)}`, background: rgba(NEON.blue, 0.08), fontFamily }}>
        <div style={{ width: 70, height: 70, borderRadius: 35, background: `linear-gradient(160deg, ${rgba("#2F5CF2", 0.95)}, ${rgba(NEON.deep, 0.95)})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 20px ${rgba(NEON.blue, 0.5)}` }}>
          <Icon name="users" size={36} color={NEON.ice} strokeWidth={2.2} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 33, color: NEON.ice, whiteSpace: "nowrap" }}>{title}</span>
          <span style={{ fontWeight: 500, fontSize: 23, color: NEON.mist, whiteSpace: "nowrap" }}>Gruppe</span>
        </div>
      </div>
      {/* Blasen: unten die neueste, darüber rutschen die älteren hoch (oben weich ausgeblendet) */}
      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          top: HEAD + 12,
          height: bodyH,
          overflow: "hidden",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 22%, #000 100%)",
          WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 22%, #000 100%)",
        }}
      >
        {msgs.map((m, i) => {
          if (ps[i] <= 0.001) return null;
          // Abstand nach oben = Summe der später gekommenen Blasen
          let above = 0;
          for (let j = i + 1; j < msgs.length; j++) above += step * clamp01(ps[j]);
          const y = bodyH - BUBBLE_H - 6 - above;
          if (y < -BUBBLE_H) return null;
          return (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: y }}>
              <ChatBubble m={m} p={ps[i]} />
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
};

// ---- kleine Schwebe-Karten (Tiefe im Hintergrund) -----------------------------------------

/** Dateiliste – drei Versionen derselben Liste */
export const FilesCard: React.FC<{ w: number; h: number; tint?: number }> = ({ w, h, tint = 0.85 }) => (
  <GlassPanel width={w} height={h} tint={tint} glow={0.6} padding={32}>
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily }}>
      {SHEETS.map((s, i) => (
        <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 54, height: 54, borderRadius: 13, background: rgba(NEON.ice, 0.14), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `inset 0 0 0 1px ${rgba(NEON.ice, 0.18)}` }}>
            <Icon name="file-text" size={28} color={NEON.ice} />
          </div>
          <span style={{ fontWeight: i === 2 ? 800 : 500, fontSize: 30, color: NEON.ice, whiteSpace: "nowrap" }}>{s.name}</span>
        </div>
      ))}
    </div>
  </GlassPanel>
);

/** Mitteilung mit rotem Punkt („neue Nachrichten“) */
export const NoticeCard: React.FC<{ w: number; h: number; text: string; tint?: number }> = ({ w, h, text, tint = 0.55 }) => (
  <GlassPanel width={w} height={h} tint={tint} glow={0.55} padding={28}>
    <div style={{ display: "flex", alignItems: "center", gap: 20, height: "100%", fontFamily }}>
      <div style={{ position: "relative", width: 64, height: 64, borderRadius: 32, background: rgba(NEON.ice, 0.14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="users" size={32} color={NEON.ice} />
        <div style={{ position: "absolute", right: -4, top: -4, width: 24, height: 24, borderRadius: 12, background: BADGE_RED, boxShadow: `0 0 14px ${rgba(BADGE_RED, 0.8)}` }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 26, color: NEON.ice, whiteSpace: "nowrap" }}>Eltern D-Jugend</span>
        <span style={{ fontWeight: 500, fontSize: 25, color: NEON.mist, whiteSpace: "nowrap" }}>{text}</span>
      </div>
    </div>
  </GlassPanel>
);

/** Text-Karte mit unscharfen Zeilen (wie die Indigo-Karten der Referenz t03.75) */
export const LinesCard: React.FC<{ w: number; h: number; tint?: number; lines?: number[] }> = ({ w, h, tint = 0.9, lines = [0.92, 0.8, 0.86, 0.6, 0.74] }) => (
  <GlassPanel width={w} height={h} tint={tint} glow={0.6} padding={34}>
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ width: `${l * 100}%`, height: 14, borderRadius: 7, background: rgba(NEON.ice, i === 0 ? 0.6 : 0.3) }} />
      ))}
    </div>
  </GlassPanel>
);
