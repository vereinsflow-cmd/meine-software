"use client";

import { useEffect, useState } from "react";

/**
 * Die Kennzahlen blenden beim ersten Erscheinen nacheinander ein (je 50 ms versetzt, 8 px von unten, 300 ms) – einmal je
 * Seitenaufruf: Kehrt man über die Reiter zurück, stehen sie sofort da (sonst wirkte das häufige Wechseln langsam). Die Klassen
 * stehen schon im Server-HTML, die Bewegung beginnt also mit dem ersten Bild; „Bewegung reduzieren“ schaltet sie ab
 * (`motion-safe`). Nach einer Sekunde verschwinden die Klassen ganz: Wird eine Karte später neu aufgebaut (andere Breite),
 * liefe die Animation sonst noch einmal ab – samt kurz unsichtbarer Karte.
 */
let entered = false;

export const ENTRANCE =
  "motion-safe:animate-in motion-safe:duration-300 motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-2";

export const entranceDelay = (index: number) => ({ animationDelay: `${index * 50}ms` });

/** Ob die Karten gerade einblenden sollen (nur beim ersten Erscheinen je Seitenaufruf, eine Sekunde lang). */
export function useEntrance(): boolean {
  const [enter, setEnter] = useState(() => !entered);
  useEffect(() => {
    entered = true;
    const timer = window.setTimeout(() => setEnter(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  return enter;
}

/** Hülle einer Karte, die beim ersten Erscheinen versetzt einblendet (`index` bestimmt die Verzögerung). */
export function Entrance({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const enter = useEntrance();
  return (
    <div
      style={enter ? entranceDelay(index) : undefined}
      className={[className, enter ? ENTRANCE : ""].filter(Boolean).join(" ") || undefined}
    >
      {children}
    </div>
  );
}
