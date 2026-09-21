"use client";

import { useEffect, useRef } from "react";

/**
 * Automatische Abmeldung bei Inaktivität – als Ergänzung zur serverseitigen Prüfung.
 *
 * - Nach `idleMinutes` ohne Bedienung (Maus, Tastatur, Berühren, Scrollen) wird die Seite auf die Anmeldung
 *   umgeleitet; der Bildschirm zeigt dann keine Vereinsdaten mehr.
 * - Solange der Benutzer aktiv ist, meldet die Seite dies höchstens alle 5 Minuten dem Server, damit dessen
 *   Inaktivitäts-Timer nicht ablaufen (sonst wäre man mitten in der Arbeit abgemeldet).
 * Maßgeblich bleibt immer die Prüfung auf dem Server; dieses Skript ist nur Komfort und Zusatzschutz.
 */
export function IdleLogout({ idleMinutes }: { idleMinutes: number }) {
  const lastPing = useRef(0);

  useEffect(() => {
    const idleMs = idleMinutes * 60_000;
    let timer: ReturnType<typeof setTimeout>;

    const expire = () => {
      // Bewusst eine harte Navigation statt `router.push`: Sie verwirft den gesamten Client-Zwischenspeicher des Routers
      // (bereits geladene Seiten mit Vereinsdaten) und alle Zustände der Seite.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/anmelden?expired=1");
    };

    const activity = () => {
      clearTimeout(timer);
      timer = setTimeout(expire, idleMs);
      const now = Date.now();
      if (now - lastPing.current > 5 * 60_000) {
        lastPing.current = now;
        void fetch("/api/session/ping", { method: "POST", credentials: "same-origin" })
          .then((response) => {
            if (response.status === 401) expire();
          })
          .catch(() => undefined);
      }
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, activity, { passive: true }));
    lastPing.current = Date.now();
    timer = setTimeout(expire, idleMs);

    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, activity));
    };
  }, [idleMinutes]);

  return null;
}
