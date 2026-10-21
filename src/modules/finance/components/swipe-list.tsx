"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Liste, die man am Handy seitlich wischt (die Abteilungs-„Töpfe“ der Übersicht): mit der Tastatur erreichbar – ein Tabstopp,
 * die Pfeiltasten scrollen – nur, solange sie wirklich überläuft. Auf breiten Fenstern stehen die Kacheln im Raster, dort wäre
 * der Tabstopp ohne Funktion. Geprüft beim Erscheinen und bei jeder Größenänderung (`ResizeObserver` meldet sich auch gleich
 * beim Beobachten); vor dem Laden des Skripts ist die Liste kein Tabstopp.
 */
export function SwipeList({ children, ...props }: React.ComponentProps<"ul">) {
  const ref = useRef<HTMLUListElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScrolls(node.scrollWidth > node.clientWidth + 1));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <ul ref={ref} tabIndex={scrolls ? 0 : undefined} {...props}>
      {children}
    </ul>
  );
}
