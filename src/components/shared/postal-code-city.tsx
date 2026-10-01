"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/action-result";
import { cityChoices, decideCity, isGermanPostalCode } from "@/lib/postal-code";

/** Einmal geladene Postleitzahlen bleiben für die Sitzung im Browser (auch über Formulare hinweg). */
const loaded = new Map<string, Promise<string[] | null>>();

/** Orte zur Postleitzahl; `null`, wenn der Server gerade nicht antwortet – dann bleibt das Feld, wie es ist. */
function loadPlaces(code: string): Promise<string[] | null> {
  let pending = loaded.get(code);
  if (!pending) {
    pending = fetch(`/api/postleitzahlen/${code}`)
      .then(async (response) => {
        const body = (await response.json()) as ApiResponse<{ places: string[] }>;
        if (!response.ok || !body.ok) throw new Error("Postleitzahl nicht abrufbar");
        return body.data.places;
      })
      .catch(() => {
        loaded.delete(code); // z. B. kurz offline – beim nächsten Mal erneut versuchen
        return null;
      });
    loaded.set(code, pending);
  }
  return pending;
}

const VISIBLE_CHOICES = 8;

/**
 * „Ort automatisch ergänzen“: Sobald eine fünfstellige Postleitzahl im Feld steht, trägt die App den Ort ein – gehören
 * mehrere Orte dazu, stehen sie zur Auswahl. Selbst Geschriebenes wird nie überschrieben (`decideCity`); einen selbst
 * eingetragenen Ort nimmt die App wieder heraus, wenn er nicht mehr passt (andere Postleitzahl, anderes Land). Gehört ins
 * Formular direkt hinter das Feld „Ort“; zeigt nur etwas, wenn es eine Auswahl gibt, und meldet Ergänztes über eine
 * Live-Region (Screenreader).
 */
export function PostalCodeCity({
  postalCode,
  city,
  onCity,
  enabled = true,
}: {
  postalCode: string | null | undefined;
  city: string | null | undefined;
  /** `picked`: aus der Auswahl gewählt – das Formular setzt dann den Fokus zurück ins Feld „Ort“. */
  onCity: (city: string, how: { picked: boolean }) => void;
  /** z. B. nur, wenn als Land Deutschland gewählt ist */
  enabled?: boolean;
}) {
  const code = (postalCode ?? "").trim();
  const active = enabled && isGermanPostalCode(code);
  const [result, setResult] = useState<{ code: string; places: string[] } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [showAll, setShowAll] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  /** Nach „weitere anzeigen“: Fokus auf den ersten neu sichtbaren Ort (der Knopf selbst verschwindet). */
  const focusFrom = useRef<number | null>(null);

  /** Zuletzt von der App eingetragener Ort – nur er darf ersetzt oder wieder entfernt werden. */
  const autoFilled = useRef<string | null>(null);
  // Aktuelle Werte für spätere Antworten des Servers (sie kommen nach dem Rendern, in dem sie angefordert wurden)
  const latest = useRef({ city, onCity });
  useEffect(() => {
    latest.current = { city, onCity };
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void loadPlaces(code).then((places) => {
      if (cancelled || places === null) return;
      const { fill, clear } = decideCity(places, latest.current.city, autoFilled.current);
      if (fill) {
        autoFilled.current = fill;
        latest.current.onCity(fill, { picked: false });
        setAnnouncement(`Ort ergänzt: ${fill}`);
      } else if (clear) {
        autoFilled.current = null;
        latest.current.onCity("", { picked: false });
      }
      if (fill === null && cityChoices(places, clear ? "" : latest.current.city).length > 0) {
        setAnnouncement(`Zur Postleitzahl ${code} gehören mehrere Orte – bitte unten wählen.`);
      } else if (clear) {
        setAnnouncement("Ort entfernt.");
      }
      setShowAll(false);
      setResult({ code, places });
    });
    return () => {
      cancelled = true;
    };
  }, [code, active]);

  // Anderes Land gewählt: Ein von der App eingetragener deutscher Ort passt nicht mehr.
  useEffect(() => {
    if (enabled) return;
    const current = (latest.current.city ?? "").trim();
    if (autoFilled.current && current === autoFilled.current) {
      autoFilled.current = null;
      latest.current.onCity("", { picked: false });
    }
  }, [enabled]);

  useEffect(() => {
    if (!showAll || focusFrom.current === null) return;
    group.current?.querySelectorAll("button")[focusFrom.current]?.focus();
    focusFrom.current = null;
  }, [showAll]);

  function pick(place: string) {
    autoFilled.current = place;
    onCity(place, { picked: true });
    setAnnouncement(`Ort gewählt: ${place}`);
  }

  const places = active && result?.code === code ? result.places : [];
  const choices = cityChoices(places, city);
  const visible = showAll ? choices : choices.slice(0, VISIBLE_CHOICES);

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {choices.length > 0 && (
        <div
          ref={group}
          role="group"
          aria-label={`Orte zur Postleitzahl ${code}`}
          className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2"
        >
          <span className="text-muted-foreground">
            Zur Postleitzahl {code} gehören mehrere Orte:
          </span>
          {visible.map((place) => (
            <Button
              key={place}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pick(place)}
            >
              {place}
            </Button>
          ))}
          {visible.length < choices.length && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                focusFrom.current = visible.length;
                setShowAll(true);
              }}
            >
              {choices.length - visible.length} weitere anzeigen
            </Button>
          )}
        </div>
      )}
    </>
  );
}
