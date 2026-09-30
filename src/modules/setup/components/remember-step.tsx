"use client";

import { useEffect } from "react";
import { SETUP_PATH } from "@/lib/club-setup";
import { SETUP_STEP_IDS, type SetupStepId } from "../steps";

const STORAGE_KEY = "vf-einrichtung-schritt";

/** Zuletzt geöffneter Schritt – „Zurück zum Assistenten“ führt dorthin (nicht zum ersten übersprungenen Schritt). */
export function lastSetupStep(): SetupStepId | null {
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    return SETUP_STEP_IDS.find((id) => id === saved) ?? null;
  } catch {
    return null; // Speicher gesperrt (privates Fenster) – dann eben der erste offene Schritt
  }
}

/**
 * Merkt sich den gezeigten Schritt und schreibt ihn in die Adresse, wenn der Assistent ohne Angabe geöffnet wurde (nach
 * der Anmeldung). Ohne ihn in der Adresse spränge die Seite nach dem Speichern von selbst weiter – „ohne Angabe“ heißt
 * „erster offener Schritt“. Bewusst im Browser statt als weitere Weiterleitung: Nach einer Kette von Weiterleitungen
 * (Anmeldung → Dashboard → Assistent) übernimmt Next.js die letzte nicht in die Adresse.
 */
export function RememberStep({ step }: { step: SetupStepId }) {
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, step);
    } catch {
      // ohne Speicher kein Merken – kein Problem
    }
    if (window.location.pathname === SETUP_PATH && !window.location.search) {
      window.history.replaceState(null, "", `${SETUP_PATH}?schritt=${step}`);
    }
  }, [step]);
  return null;
}
