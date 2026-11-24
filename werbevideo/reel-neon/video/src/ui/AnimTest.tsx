/**
 * Probe der Zwischenzustände (Still „Ui-Animationstest“, 2340 × 4232): oben sieben Seiten je halb so groß (585 × 1266),
 * alle Animations-Eigenschaften mitten im Ablauf (meist 0,5); unten Filmstreifen 0 · ¼ · ½ · ¾ · 1 – dort sieht man,
 * ob etwas springt.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { AppShell } from "./AppShell";
import { MembersPage, ImportPage } from "./members";
import { EventDetailPage, RsvpCard, CalendarDayItem } from "./events";
import { ShiftCard, ShiftsPage, SHIFTS, OpenShiftItem } from "./shifts";
import { ChatView } from "./messages";
import { FinancePage, KontostandCard } from "./finance";
import { DashboardTop, KPI_CARD_W } from "./dashboard";
import { Badge, Checkbox, ProgressBar, Tabs, X3 } from "./primitives";
import { C, CONTENT_W, SCREEN_H, SCREEN_W } from "./tokens";

const STRIP_H = 1700;
export const ANIMTEST_W = SCREEN_W * 2;
export const ANIMTEST_H = SCREEN_H + STRIP_H;

const STEPS = [0, 0.25, 0.5, 0.75, 1];

/** Ein Feld: Inhalt im Bildraum (Standard eine ganze Seite 1170 × 2532), auf die Hälfte verkleinert, mit Beschriftung. */
const Panel: React.FC<{ col: number; row: number; label: string; h?: number; children: React.ReactNode }> = ({ col, row, label, h = SCREEN_H, children }) => (
  <div style={{ position: "absolute", left: col * (SCREEN_W / 2), top: row * (SCREEN_H / 2), width: SCREEN_W / 2, height: h / 2, overflow: "hidden", background: C.page }}>
    <div style={{ position: "relative", width: SCREEN_W, height: h, transform: "scale(0.5)", transformOrigin: "0 0" }}>{children}</div>
    <div style={{ position: "absolute", left: 8, bottom: 8, padding: "4px 10px", borderRadius: 8, background: "rgba(220,0,90,0.9)", color: "#fff", font: "600 20px system-ui" }}>{label}</div>
  </div>
);

/** Filmstreifen: dieselbe Komponente bei 0 · ¼ · ½ · ¾ · 1 untereinander. */
const Strip: React.FC<{ render: (p: number) => React.ReactNode; gap?: number }> = ({ render, gap = 6 }) => (
  <div style={{ display: "grid", gap }}>
    {STEPS.map((p) => (
      <div key={p} style={{ position: "relative" }}>
        {render(p)}
      </div>
    ))}
  </div>
);

export const UiAnimTest: React.FC = () => (
  <AbsoluteFill style={{ background: C.page }}>
    {/* 1 Mitglieder: Zähler halb, Zeilen gestaffelt, Import halb gedrückt */}
    <Panel col={0} row={0} label="Mitglieder · count 116,5 · Zeilen 1→0 · Import ½">
      <AppShell>
        <MembersPage count={116.5} headAppear={1} rowAppear={[1, 0.75, 0.5, 0.25, 0, 0.5, 0.5, 0.5, 0.5, 0.5]} rowHighlight={[0, 0.5]} importPressed={0.5} search="Bau" />
      </AppShell>
    </Panel>
    {/* 2 Termin: Teilnahme halb, Karte halb aufgestiegen */}
    <Panel col={1} row={0} label="Termin · rsvp ½ · cardAppear ½ · Kopf ½">
      <AppShell headerAppear={0.5} bellPop={0.5}>
        <EventDetailPage rsvp={0.5} rsvpPressed={0.5} cardAppear={0.5} headAppear={0.5} />
      </AppShell>
    </Panel>
    {/* 3 Schichten: Grillstand halb eingetragen */}
    <Panel col={2} row={0} label="Schichten · signedUp/me/highlight ½ · filled 0,5">
      <AppShell scrollY={1821}>
        <ShiftsPage
          overrides={[
            {},
            { appear: 0.5 },
            { pressed: 0.5, signedUp: 0.5, me: "Anna Adler", meAppear: 0.5, highlight: 0.5 },
            { filled: 1.5 },
          ]}
        />
      </AppShell>
    </Panel>
    {/* 4 Finanzen: Beträge halb, Kurven halb, Karten gestaffelt, Reiter gleitet */}
    <Panel col={3} row={0} label="Finanzen · Zähler/Kurven ½ · Reiter 0,5 · Karten 1/½/¼">
      <AppShell>
        <FinancePage balance={13944.47 / 2} invoices={1549.5 / 2} surplus={5286.3 / 2} balanceDraw={0.5} surplusDraw={0.5} cardAppear={[1, 0.5, 0.25]} cardLift={[0.5]} tab={0.5} addPressed={0.5} />
      </AppShell>
    </Panel>
    {/* 5 Chat: Ankündigung und Antwort halb, Lesezahl pulsiert, Text getippt */}
    <Panel col={0} row={1} label="Chat · Blasen ½ · read 4,5 · Puls ½ · Senden ½">
      <AppShell>
        <ChatView read={4.5} readPulse={0.5} announcementAppear={0.5} replyAppear={0.5} composerText="Bin dabei!" composerCaret sendPressed={0.5} />
      </AppShell>
    </Panel>
    {/* 6 Dashboard: Zahl halb, Kurs halb, Chip halb, Karussell halb gewischt */}
    <Panel col={1} row={1} label="Dashboard · value 116 · draw ½ · Karussell ½">
      <AppShell>
        <DashboardTop value={116} draw={0.5} chipAppear={0.5} carouselX={(KPI_CARD_W + 12) / 2} eventsDraw={0.5} forYouAppear={0.5} greetingAppear={1} />
      </AppShell>
    </Panel>
    {/* 7 Import: Datei, Schritt 2 und Zeilen halb */}
    <Panel col={2} row={1} label="Import · fileAppear/summary ½ · Zeilen gestaffelt">
      <AppShell>
        <ImportPage fileAppear={0.5} pressed={0.5} summaryAppear={0.5} rowAppear={[1, 1, 0.5, 0.25, 0, 0]} rowHighlight={[0, 0, 0.5]} />
      </AppShell>
    </Panel>
    {/* 8 Kleinteile: Reiter gleitet, Schild, Kästchen, Balken (je 0 · ¼ · ½ · ¾ · 1), Schicht- und Kalenderzeile halb */}
    <Panel col={3} row={1} label="Reiter/Schild/Kästchen/Balken 0…1 · Zeilen ½">
      <div style={{ padding: 48, display: "flex", flexDirection: "column", gap: 48 }}>
        <X3 width={CONTENT_W}>
          <div style={{ display: "grid", gap: 10 }}>
            {STEPS.map((p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* zwei kleine Reiter (md), damit Schild, Kästchen und Balken in die Zeile passen */}
                <Tabs items={["Übersicht", "Beiträge"]} size="md" activeIndex={p} style={{ flexShrink: 0 }} />
                <Badge tone="green" appear={p}>
                  Neu
                </Badge>
                <Checkbox checked={p} />
                <div style={{ flex: 1 }}>
                  <ProgressBar fill={p} />
                </div>
              </div>
            ))}
          </div>
        </X3>
        <OpenShiftItem filled={1.5} fill={0.5} pressed={0.5} />
        <CalendarDayItem entryAppear={[0.5, 0.25]} entryHighlight={[0.5, 0]} entryPressed={[0, 0.5]} />
      </div>
    </Panel>
    {/* Streifen: Teilnahme-Karte und Schichtzeile bei 0 · ¼ · ½ · ¾ · 1 */}
    <Panel col={0} row={2} h={STRIP_H * 2} label="RsvpCard progress 0 · ¼ · ½ · ¾ · 1">
      <div style={{ padding: "48px 48px 0" }}>
        <Strip render={(p) => <RsvpCard progress={p} pressed={p > 0 && p < 0.5 ? 0.5 : 0} />} gap={24} />
      </div>
    </Panel>
    <Panel col={1} row={2} h={STRIP_H * 2} label="ShiftCard signedUp/meAppear 0 · ¼ · ½ · ¾ · 1">
      <div style={{ padding: "48px 48px 0", background: C.card }}>
        <Strip render={(p) => <ShiftCard {...SHIFTS[2]} signedUp={p} me="Anna Adler" meAppear={p} highlight={p} pressed={p > 0 && p < 1 ? 0.5 : 0} />} gap={0} />
      </div>
    </Panel>
    <Panel col={2} row={2} h={STRIP_H * 2} label="Reiter activeIndex 0 · ¼ · ½ · ¾ · 1">
      <div style={{ padding: "48px 48px 0", display: "grid", gap: 36 }}>
        {STEPS.map((p) => (
          <X3 key={p} width={CONTENT_W}>
            <Tabs items={["Übersicht", "Beiträge", "Kassenbuch", { label: "Rechnungen", count: 1 }, "Abschluss"]} activeIndex={p} width={CONTENT_W} />
          </X3>
        ))}
      </div>
    </Panel>
    <Panel col={3} row={2} h={STRIP_H * 2} label="Kontostand draw/value 0 · ½ · 1">
      <div style={{ padding: "48px 48px 0", display: "grid", gap: 36 }}>
        {[0.02, 0.5, 1].map((p) => (
          <KontostandCard key={p} value={13944.47 * p} draw={p} />
        ))}
      </div>
    </Panel>
  </AbsoluteFill>
);
