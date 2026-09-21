"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Breite eines Elements in Pixeln (0, bis sie gemessen ist). Die Diagramme zeichnen sich damit in echter Größe statt als
 * verkleinertes Bild – Schrift und Linien bleiben auf dem Smartphone genauso scharf und lesbar wie am Bildschirm.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Der Beobachter meldet die Größe gleich beim Anmelden und danach bei jeder Änderung.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
