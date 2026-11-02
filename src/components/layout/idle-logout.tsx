"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/action-result";
import { formatCountdown, idleLoginUrl, idlePingInterval, idleStep } from "@/lib/idle-session";

/**
 * Automatische Abmeldung bei Inaktivität – als Ergänzung zur serverseitigen Prüfung.
 *
 * - Solange der Benutzer aktiv ist (Maus, Tastatur, Berühren, Scrollen), meldet die Seite dies dem Server (höchstens alle
 *   5 Minuten, siehe `idlePingInterval`), damit dessen Inaktivitäts-Frist nicht mitten in der Arbeit abläuft.
 * - Zwei Minuten vor dem Ende, das der Server nennt, erscheint ein Hinweis mit Countdown und „Angemeldet bleiben“ (verlängert
 *   die Sitzung auf dem Server). Davor fragt die Seite nach, ohne zu verlängern: Eine andere Registerkarte kann die Sitzung
 *   inzwischen verlängert haben – dann bleibt der Hinweis aus.
 * - Ist die Sitzung abgelaufen, geht es zur Anmeldung; der Bildschirm zeigt dann keine Vereinsdaten mehr. Nach der Anmeldung
 *   führt `next` zurück zur Seite, auf der man war.
 * Maßgeblich bleibt immer die Prüfung auf dem Server; dieses Skript ist nur Komfort und Zusatzschutz.
 */
export function IdleLogout({ idleMinutes }: { idleMinutes: number }) {
  // Ende der Sitzung, solange der Hinweis offen ist (sonst `null`), und die Uhr für den Countdown.
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stay = useRef<() => void>(() => undefined);

  useEffect(() => {
    const pingEvery = idlePingInterval(idleMinutes);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPing = Date.now(); // Das Laden der Seite hat die Sitzung eben erst geprüft.
    let knownEnd = Date.now() + idleMinutes * 60_000; // bis der Server etwas anderes sagt
    let warning = false;
    let gone = false;

    const expire = () => {
      gone = true;
      clearTimeout(timer);
      // Bewusst eine harte Navigation statt `router.push`: Sie verwirft den gesamten Client-Zwischenspeicher des Routers
      // (bereits geladene Seiten mit Vereinsdaten) und alle Zustände der Seite.
      window.location.assign(idleLoginUrl(window.location.pathname + window.location.search));
    };

    // Auskunft des Servers umsetzen: Hinweis zeigen oder schließen und zum nächsten Zeitpunkt erneut nachfragen.
    const plan = (remainingMs: number) => {
      if (gone) return;
      clearTimeout(timer);
      knownEnd = Date.now() + remainingMs;
      const step = idleStep(remainingMs);
      warning = step.warn;
      setEndsAt(step.warn ? knownEnd : null);
      setNow(Date.now());
      timer = setTimeout(() => void ask("GET"), step.askAgainInMs);
    };

    // POST zählt als Aktivität und verlängert die Sitzung; GET fragt nur nach.
    const ask = async (method: "GET" | "POST") => {
      try {
        const response = await fetch("/api/session/ping", {
          method,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (response.status === 401) {
          expire();
          return;
        }
        const body = (await response.json()) as ApiResponse<{ remainingMs: number }>;
        if (!body.ok) throw new Error(body.error.message);
        plan(body.data.remainingMs);
      } catch {
        // Keine Antwort (offline, Server startet neu): Es gilt das zuletzt bekannte Ende.
        if (Date.now() >= knownEnd) expire();
        else plan(knownEnd - Date.now());
      }
    };

    const activity = () => {
      if (warning || gone) return; // Im Hinweis zählt nur „Angemeldet bleiben“.
      const at = Date.now();
      if (at - lastPing >= pingEvery) {
        lastPing = at;
        void ask("POST");
      }
    };

    stay.current = () => {
      lastPing = Date.now();
      void ask("POST");
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, activity, { passive: true }));
    void ask("GET");

    return () => {
      gone = true;
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, activity));
    };
  }, [idleMinutes]);

  // Countdown: jede Sekunde neu, solange der Hinweis offen ist.
  useEffect(() => {
    if (endsAt === null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [endsAt]);

  return (
    <AlertDialog
      open={endsAt !== null}
      // Escape schließt den Hinweis – das heißt ebenfalls „Angemeldet bleiben“.
      onOpenChange={(open) => {
        if (!open) stay.current();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">Bist du noch da?</AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Aus Sicherheitsgründen wirst du nach längerer Inaktivität abgemeldet. Nicht gespeicherte
            Eingaben gehen dabei verloren.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p role="timer" className="text-center text-3xl font-semibold tabular-nums">
          Abmeldung in {formatCountdown((endsAt ?? now) - now)}
        </p>
        <AlertDialogFooter>
          <Button size="lg" className="w-full" onClick={() => stay.current()}>
            Angemeldet bleiben
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
