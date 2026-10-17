"use client";

import { useLayoutEffect, useRef } from "react";
import { formatEuroFromCents } from "@/lib/dates";

/**
 * Zahl, die beim ersten Öffnen kurz hochzählt (Kennzahlen des Dashboards). Die Seite kommt aus dem Server schon mit der
 * fertigen Zahl – ohne JavaScript oder mit „Bewegung reduzieren“ bleibt es dabei. Gezählt wird nur einmal je Sitzung im Tab:
 * Das Dashboard öffnet man oft am Tag, ein jedes Mal wiederholtes Hochzählen wirkte bald langsam statt lebendig.
 *
 * Das Zählen dauert 0,7 s; danach steht genau der Text aus dem Server da. Ziffern mit fester Breite (`tabular-nums` an der Zahl) – nichts wackelt beim Zählen.
 */
const DURATION_MS = 700;
const STORAGE_KEY = "vf-count-up";

/** Ob in diesem Seitenaufruf gezählt wird: einmal entschieden und für alle Zahlen derselben Seite gleich. */
let decision: { at: number; play: boolean } | null = null;

function shouldPlay(): boolean {
  const now = Date.now();
  // Alle Zahlen einer Seite werden im selben Augenblick eingebunden; eine spätere Rückkehr zum Dashboard entscheidet neu.
  if (decision && now - decision.at < 1000) return decision.play;
  let play = false;
  try {
    play =
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches &&
      window.sessionStorage.getItem(STORAGE_KEY) === null;
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    play = false; // kein Speicher (privates Fenster, gesperrt): lieber still als bei jedem Aufruf
  }
  decision = { at: now, play };
  return play;
}

function format(value: number, kind: CountUpKind): string {
  if (kind === "euro") return formatEuroFromCents(value);
  return value.toLocaleString("de-DE", { maximumFractionDigits: kind === "decimal" ? 1 : 0 });
}

export type CountUpKind = "integer" | "decimal" | "euro";

export function CountUp({ value, kind = "integer" }: { value: number; kind?: CountUpKind }) {
  const ref = useRef<HTMLSpanElement>(null);

  // Gezählt wird direkt im Textknoten (kein React-Zustand: 60 Bilder je Sekunde ohne Neuzeichnen der Karte). Es bleibt derselbe
  // Knoten, den React angelegt hat – am Ende steht wieder genau der Text aus dem Server darin.
  useLayoutEffect(() => {
    const node = ref.current?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE || value === 0 || !shouldPlay()) return;
    const final = format(value, kind);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      // Kräftiges Abbremsen zum Ende (wie --ease-out): schnell los, ruhig ankommen
      const eased = 1 - Math.pow(1 - t, 4);
      const current = kind === "decimal" ? value * eased : Math.round(value * eased);
      node.nodeValue = t >= 1 ? final : format(current, kind);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    node.nodeValue = format(0, kind);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      node.nodeValue = final;
    };
  }, [value, kind]);

  return <span ref={ref}>{format(value, kind)}</span>;
}
