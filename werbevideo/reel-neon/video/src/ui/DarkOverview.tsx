/**
 * Übersicht der dunklen Darstellung (Still „Ui-Dunkel-Uebersicht“, 3510 × 2532): zwölf Felder je halb so groß wie eine
 * Handy-Seite (585 × 1266). Oben die sechs Seiten des Films nebeneinander (Mitglieder, Termin, Schichten, Nachrichten, Chat,
 * Finanzen), unten Kalender, Kassenbuch, Dashboard, Import, alle Grundbausteine und hervorgehobene Zustände.
 * Nur zur Kontrolle von Farben und Lesbarkeit – nicht im Film.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { AppShell } from "./AppShell";
import { ImportPage, MembersPage } from "./members";
import { CalendarAgenda, EventDetailPage, RsvpCard } from "./events";
import { SHIFTS, ShiftCard, ShiftsPage, ShiftTotalsBar } from "./shifts";
import { CHATS, ChatListRow, ChatView, MessagesListPage } from "./messages";
import { FINANCE_TABS, FinancePage, LedgerTable } from "./finance";
import { DashboardTop, GroupHeading, TASKS, TasksWidget } from "./dashboard";
import { Avatar, Badge, Button, Checkbox, ProgressBar, SearchField, Tabs, X3 } from "./primitives";
import { C, CONTENT_W, SCREEN_H, SCREEN_W, TEXT } from "./tokens";

const TILE_W = SCREEN_W / 2;
const TILE_H = SCREEN_H / 2;
export const DARK_OVERVIEW_W = TILE_W * 6;
export const DARK_OVERVIEW_H = TILE_H * 2;

/** Ein Feld: Inhalt im Bildraum (1170 × 2532), auf die Hälfte verkleinert, Beschriftung unten links. */
const Tile: React.FC<{ col: number; row: number; label: string; children: React.ReactNode }> = ({ col, row, label, children }) => (
  <div style={{ position: "absolute", left: col * TILE_W, top: row * TILE_H, width: TILE_W, height: TILE_H, overflow: "hidden", background: C.page }}>
    <div style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, transform: "scale(0.5)", transformOrigin: "0 0" }}>{children}</div>
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 16px 7px 13px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.78)",
        boxShadow: `0 0 0 1px ${C.border}`,
        color: C.fg,
        font: "600 26px system-ui, -apple-system, sans-serif",
        letterSpacing: "0.01em",
      }}
    >
      {/* Signalorange der Marke als Kennpunkt */}
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF8A5E" }} />
      {label}
    </div>
  </div>
);

/** Fläche für Felder ohne App-Rahmen: Seitengrund mit Innenabstand wie main p-4. */
const Sheet: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 12 }) => (
  <div style={{ width: SCREEN_W, height: SCREEN_H, boxSizing: "border-box", padding: 48, background: C.page }}>
    <X3 width={CONTENT_W}>
      <div style={{ display: "grid", gap }}>{children}</div>
    </X3>
  </div>
);

const Row: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 8 }) => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap }}>{children}</div>
);

/** Alle Grundbausteine einmal: Knöpfe (auch gedrückt), Schilder, Reiter, Felder, Balken, Kästchen, runde Bilder. */
const Bausteine: React.FC = () => (
  <Sheet>
    <GroupHeading title="Knöpfe" />
    <Row>
      <Button icon="plus">Speichern</Button>
      <Button variant="outline" icon="download">
        Export
      </Button>
      <Button variant="ghost" icon="more-horizontal">
        Mehr
      </Button>
      <Button variant="link">Zur Veranstaltung</Button>
    </Row>
    {/* gedrückt: Haupt-, Umriss- und Erfolgsknopf (letzterer daneben auch ungedrückt) */}
    <Row>
      <Button pressed={1}>Gedrückt</Button>
      <Button variant="outline" pressed={1}>
        Gedrückt
      </Button>
      <Button variant="success" icon="plus">
        Neu
      </Button>
      <Button variant="success" pressed={1}>
        Neu
      </Button>
    </Row>
    <GroupHeading title="Schilder" />
    <Row gap={6}>
      <Badge tone="green">Aktiv</Badge>
      <Badge tone="blue">Benutzerkonto</Badge>
      <Badge tone="gray">Training</Badge>
      <Badge tone="orange">Hoch</Badge>
      <Badge tone="red">Blockiert</Badge>
      <Badge tone="outline">Ausgetreten</Badge>
    </Row>
    <GroupHeading title="Reiter" />
    <Tabs items={FINANCE_TABS} activeIndex={0} width={CONTENT_W} />
    <Tabs items={FINANCE_TABS} activeIndex={3} width={CONTENT_W} scrollX={150} />
    <GroupHeading title="Felder" />
    <SearchField placeholder="Name, Nummer oder E-Mail suchen …" />
    <SearchField value="Bauer" caret focus={1} />
    <GroupHeading title="Besetzung" />
    <ShiftTotalsBar filled={9} required={21} />
    <div style={{ display: "grid", gap: 8 }}>
      <ProgressBar fill={1} />
      <ProgressBar fill={0.5} />
    </div>
    <GroupHeading title="Kästchen und Bilder" />
    <Row gap={14}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...TEXT.xs, color: C.muted }}>
        <Checkbox checked={0} />
        Als Ankündigung
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...TEXT.xs, color: C.muted }}>
        <Checkbox checked={1} />
        Auch per E-Mail
      </span>
    </Row>
    <Row gap={10}>
      <Avatar icon="users" tone="emerald" />
      <Avatar icon="heart-handshake" tone="amber" />
      <Avatar icon="calendar-check" tone="violet" />
      <Avatar icon="network" tone="sky" />
      <Avatar icon="shield-check" tone="blue" />
      <Avatar initials="AA" bg={C.primarySoft} fg={C.primary} size={36} />
    </Row>
  </Sheet>
);

/** Hervorgehobene Zustände: zugesagt, eingetragen (getönt), Chat mit Ungelesenen (aktiv), Aufgaben-Karte. */
const Zustaende: React.FC = () => (
  <Sheet>
    <RsvpCard progress={1} />
    <div style={{ overflow: "hidden", borderRadius: 14, border: `1px solid ${C.border}`, background: C.card }}>
      <ShiftCard {...SHIFTS[2]} signedUp={1} me="Anna Adler" meAppear={1} highlight={1} />
    </div>
    <div style={{ overflow: "hidden", borderRadius: 14, border: `1px solid ${C.border}`, background: C.card }}>
      <ChatListRow {...CHATS[0]} unread={2} time="18:42" highlight={1} />
    </div>
    <TasksWidget tasks={[TASKS[0]]} />
  </Sheet>
);

export const UiDarkOverview: React.FC = () => (
  <AbsoluteFill style={{ background: C.page }}>
    {/* oben: die sechs Seiten des Films */}
    <Tile col={0} row={0} label="Mitglieder">
      <AppShell>
        <MembersPage />
      </AppShell>
    </Tile>
    <Tile col={1} row={0} label="Termin · Teilnahme">
      <AppShell>
        <EventDetailPage />
      </AppShell>
    </Tile>
    <Tile col={2} row={0} label="Schichten">
      <AppShell scrollY={1821}>
        <ShiftsPage />
      </AppShell>
    </Tile>
    <Tile col={3} row={0} label="Nachrichten">
      <AppShell>
        <MessagesListPage />
      </AppShell>
    </Tile>
    <Tile col={4} row={0} label="Chat">
      <AppShell>
        <ChatView composerText="Bin dabei!" composerCaret />
      </AppShell>
    </Tile>
    <Tile col={5} row={0} label="Finanzen">
      <AppShell>
        <FinancePage />
      </AppShell>
    </Tile>
    {/* unten: weitere Seiten, Bausteine, Zustände */}
    <Tile col={0} row={1} label="Kalender">
      <AppShell scrollY={12}>
        <CalendarAgenda />
      </AppShell>
    </Tile>
    <Tile col={1} row={1} label="Kassenbuch">
      <AppShell scrollY={13}>
        <LedgerTable rowHighlight={[0, 0, 1]} />
      </AppShell>
    </Tile>
    <Tile col={2} row={1} label="Dashboard">
      <AppShell>
        <DashboardTop />
      </AppShell>
    </Tile>
    <Tile col={3} row={1} label="Import">
      <AppShell>
        <ImportPage rowHighlight={[0, 0, 1]} />
      </AppShell>
    </Tile>
    <Tile col={4} row={1} label="Bausteine">
      <Bausteine />
    </Tile>
    <Tile col={5} row={1} label="Zustände">
      <Zustaende />
    </Tile>
    {/* feine Trennlinien zwischen den Feldern */}
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={`v${i}`} style={{ position: "absolute", left: i * TILE_W - 1, top: 0, width: 2, height: DARK_OVERVIEW_H, background: "rgba(255,255,255,0.14)" }} />
    ))}
    <div style={{ position: "absolute", left: 0, top: TILE_H - 1, width: DARK_OVERVIEW_W, height: 2, background: "rgba(255,255,255,0.14)" }} />
  </AbsoluteFill>
);
