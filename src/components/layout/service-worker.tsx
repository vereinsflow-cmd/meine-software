"use client";

import { useEffect } from "react";

/**
 * Meldet den Service Worker (public/sw.js) an – auf jeder Seite, auch schon auf der Anmeldeseite, damit die Offline-Seite in
 * der App-Ansicht von Anfang an bereitliegt. Nur im Produktions-Build: Im Entwicklungsmodus würde ein Service Worker neben dem
 * Neuladen beim Speichern (Fast Refresh) nur verwirren; die E2E-Tests registrieren ihn dort gezielt selbst
 * (tests/e2e/app-ansicht.spec.ts), der Produktions-Rauchtest prüft die Registrierung hier.
 *
 * `updateViaCache: "none"`: Der Browser fragt bei der Suche nach einer neuen Fassung immer beim Server nach (nie aus dem
 * HTTP-Zwischenspeicher). Scheitert die Registrierung (alter Browser, privates Fenster), läuft VereinsFlow unverändert weiter –
 * nur ohne Offline-Seite.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => undefined);
  }, []);
  return null;
}
