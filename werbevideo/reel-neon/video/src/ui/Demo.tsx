/**
 * Bewegungsprobe des Baukastens (Komposition „Ui-Demo“, 1170 × 2532): zeigt jede Animations-Eigenschaft einmal –
 * Zeilen gleiten herein, Zähler zählen, Knöpfe werden gedrückt, Kurven zeichnen sich. Nur zur Kontrolle, nicht im Film.
 */
import React from "react";
import { Sequence, useCurrentFrame } from "remotion";
import { AppShell } from "./AppShell";
import { MembersPage } from "./members";
import { EventDetailPage } from "./events";
import { ShiftsPage } from "./shifts";
import { ChatView } from "./messages";
import { FinancePage } from "./finance";
import { appear, countUp, press, progress, stagger } from "./motion";

const MembersScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AppShell headerAppear={appear(f, 0)}>
      <MembersPage
        headAppear={appear(f, 2)}
        count={countUp(f, 8, 40, 0, 233)}
        rowAppear={Array.from({ length: 10 }, (_, i) => stagger(f, 14, i, 3))}
        importPressed={press(f, 60)}
      />
    </AppShell>
  );
};

const EventScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AppShell>
      <EventDetailPage cardAppear={appear(f, 0)} rsvpPressed={press(f, 20)} rsvp={progress(f, 24, 50)} />
    </AppShell>
  );
};

const ShiftScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AppShell scrollY={1821}>
      <ShiftsPage
        overrides={[
          {},
          {},
          { pressed: press(f, 12), signedUp: appear(f, 16, 10), me: "Anna Adler", meAppear: appear(f, 18), highlight: appear(f, 14) },
        ]}
      />
    </AppShell>
  );
};

const ChatScene: React.FC = () => {
  const f = useCurrentFrame();
  const read = f < 20 ? 4 : 5;
  return (
    <AppShell>
      <ChatView read={read} readPulse={press(f, 20, 6)} replyAppear={appear(f, 30)} />
    </AppShell>
  );
};

const FinanceScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AppShell>
      <FinancePage
        balance={countUp(f, 6, 40, 0, 13944.47)}
        invoices={countUp(f, 14, 36, 0, 1549.5)}
        surplus={countUp(f, 22, 36, 0, 5286.3)}
        balanceDraw={progress(f, 10, 50)}
        surplusDraw={progress(f, 26, 60)}
        cardAppear={[stagger(f, 0, 0, 5), stagger(f, 0, 1, 5), stagger(f, 0, 2, 5)]}
        tab={0}
      />
    </AppShell>
  );
};

export const DEMO_FRAMES = 360;

export const UiDemo: React.FC = () => (
  <>
    <Sequence from={0} durationInFrames={80}>
      <MembersScene />
    </Sequence>
    <Sequence from={80} durationInFrames={70}>
      <EventScene />
    </Sequence>
    <Sequence from={150} durationInFrames={60}>
      <ShiftScene />
    </Sequence>
    <Sequence from={210} durationInFrames={60}>
      <ChatScene />
    </Sequence>
    <Sequence from={270} durationInFrames={90}>
      <FinanceScene />
    </Sequence>
  </>
);
