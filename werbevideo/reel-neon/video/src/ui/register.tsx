/** Kompositionen des UI-Baukastens (Schaukasten zum Vergleich mit den echten App-Aufnahmen). */
import React from "react";
import { Composition, Folder, Still } from "remotion";
import { AppShell } from "./AppShell";
import { Compare, COMPARE_H, COMPARE_W } from "./Showcase";
import { ImportPage, MembersPage } from "./members";
import { CalendarAgenda, EventDetailPage } from "./events";
import { ShiftsPage } from "./shifts";
import { ChatView, MessagesListPage } from "./messages";
import { FinancePage, LedgerTable } from "./finance";
import { DashboardTop } from "./dashboard";
import { DEMO_FRAMES, UiDemo } from "./Demo";
import { ANIMTEST_H, ANIMTEST_W, UiAnimTest } from "./AnimTest";
import { DARK_OVERVIEW_H, DARK_OVERVIEW_W, UiDarkOverview } from "./DarkOverview";
import { SCREEN_H, SCREEN_W } from "./tokens";

/** Links Nachbau, rechts Aufnahme – je Seite eine Vergleichstafel (2340 × 2532). */
const PAGES: { id: string; file: string; scrollY?: number; page: React.ReactNode }[] = [
  { id: "Ui-Mitglieder", file: "mitglieder.png", page: <MembersPage /> },
  { id: "Ui-Termin", file: "termin-detail.png", page: <EventDetailPage /> },
  { id: "Ui-Kalender", file: "kalender-donnerstag.png", scrollY: 12, page: <CalendarAgenda /> },
  { id: "Ui-Schichten", file: "schichten-liste.png", scrollY: 1821, page: <ShiftsPage /> },
  { id: "Ui-Nachrichten", file: "nachrichten-liste.png", page: <MessagesListPage /> },
  { id: "Ui-Chat", file: "nachrichten.png", page: <ChatView /> },
  { id: "Ui-Finanzen", file: "finanzen-cockpit.png", page: <FinancePage /> },
  { id: "Ui-Kassenbuch", file: "finanzen-kassenbuch-buchungen.png", scrollY: 13, page: <LedgerTable /> },
  { id: "Ui-Dashboard", file: "dashboard.png", page: <DashboardTop /> },
  { id: "Ui-Import", file: "mitglieder-import-vorschau.png", page: <ImportPage /> },
];

const makeStill = (p: (typeof PAGES)[number]): React.FC => {
  const C: React.FC = () => (
    <Compare file={p.file}>
      <AppShell scrollY={p.scrollY}>{p.page}</AppShell>
    </Compare>
  );
  C.displayName = p.id;
  return C;
};

const STILLS = PAGES.map((p) => ({ id: p.id, component: makeStill(p) }));

export const UiCompositions: React.FC = () => (
  <Folder name="UI-Baukasten">
    {STILLS.map((s) => (
      <Still key={s.id} id={s.id} component={s.component} width={COMPARE_W} height={COMPARE_H} />
    ))}
    {/* Zwischenzustände (meist 0,5) und Filmstreifen 0…1 – prüft, dass nichts bricht oder springt */}
    <Still id="Ui-Animationstest" component={UiAnimTest} width={ANIMTEST_W} height={ANIMTEST_H} />
    {/* dunkle Darstellung auf einen Blick: sechs Seiten des Films, weitere Seiten, Bausteine, Zustände (je halb so groß) */}
    <Still id="Ui-Dunkel-Uebersicht" component={UiDarkOverview} width={DARK_OVERVIEW_W} height={DARK_OVERVIEW_H} />
    {/* Bewegungsprobe aller Animations-Eigenschaften (Bildraum 1170 × 2532) */}
    <Composition id="Ui-Demo" component={UiDemo} durationInFrames={DEMO_FRAMES} fps={30} width={SCREEN_W} height={SCREEN_H} />
  </Folder>
);
