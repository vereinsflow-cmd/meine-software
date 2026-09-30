/*
 * Service Worker von VereinsFlow – Grundlage der App-Ansicht (Android-App, Home-Bildschirm auf dem iPhone).
 *
 * Registriert von src/components/layout/service-worker.tsx (nur im Produktions-Build), gilt für die ganze Anwendung (Bereich „/“).
 * Er hat drei Aufgaben:
 *   1. Offline-Seite: Kann eine Seite wegen fehlender Verbindung nicht geladen werden, zeigt er /offline.html statt der
 *      Fehlerseite des Browsers.
 *   2. Aktualisierung: Eine neue Fassung dieser Datei übernimmt sofort (siehe „Installation und Aktualisierung“).
 *   3. Push-Benachrichtigungen (Web Push): Meldung anzeigen und beim Tippen die passende Seite öffnen – siehe unten.
 *
 * DATENSCHUTZ – die wichtigste Regel dieser Datei: Der Service Worker speichert NIE Seiten, Antworten der Schnittstellen oder
 * sonstige Daten der Benutzer. Abgelegt wird allein die Offline-Seite (statisch, ohne Vereins- oder Personendaten, bringt Stile,
 * Logo und Symbol selbst mit). Seiten kommen immer frisch vom Server; alle anderen Anfragen (Skripte, Bilder, Server Actions,
 * /api/…) fasst er gar nicht an – für sie gelten die normalen Regeln des Browsers und des Servers. Ein verlorenes oder geteiltes
 * Gerät enthält dadurch nichts, was nach dem Abmelden noch lesbar wäre.
 */

// --- Offline-Seite ----------------------------------------------------------------------------------------------------

const OFFLINE_URL = "/offline.html";
/**
 * Fassung der Offline-Seite (Anfang ihres SHA-256). Ändert sich die Seite, muss sich dieser Wert ändern: Nur eine geänderte
 * sw.js lässt den Browser den Service Worker neu installieren und die Seite neu ablegen. tests/unit/service-worker.test.ts
 * prüft das und nennt den richtigen Wert.
 */
const OFFLINE_REVISION = "849d78a8b118";
const OFFLINE_CACHE = `vf-offline-${OFFLINE_REVISION}`;

// --- Installation und Aktualisierung ----------------------------------------------------------------------------------
//
// Strategie: Eine neue Fassung wartet nicht, bis alle Fenster geschlossen sind (`skipWaiting`), und übernimmt sofort auch schon
// offene Fenster (`clients.claim`). Das ist hier gefahrlos, weil der Service Worker keine Programmteile oder Seiten
// zwischenspeichert – alte und neue Fassung können also nie verschiedene Stände von Skripten und Seiten mischen. Der Browser
// prüft bei jedem Seitenaufruf, ob sich sw.js geändert hat (Registrierung mit `updateViaCache: "none"`, dazu der Header
// `Cache-Control: no-cache` aus next.config.ts); geändert heißt: installieren → sofort aktiv.

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      // `reload`: an einem möglicherweise veralteten HTTP-Zwischenspeicher vorbei direkt vom Server holen.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Alle anderen Ablagen dieser Adresse entfernen (ältere Fassungen der Offline-Seite). VereinsFlow nutzt die Ablage sonst
      // nirgends – so kann auch nichts liegen bleiben, das eine frühere Fassung versehentlich gespeichert hätte.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name)),
      );
      // Navigation Preload bleibt ausdrücklich AUS (die Einstellung gilt für die Registrierung, über Fassungen hinweg): Damit
      // lädt der Browser jeden Seitenaufruf schon vorab – auch /api/…, das dieser Service Worker nicht beantwortet. Solche
      // Aufrufe holt der Browser dann ein zweites Mal: CSV-Export und Datenexport liefen doppelt (zweimal im Protokoll, zwei
      // Abrufe vom Rate-Limit), Downloads würden doppelt übertragen. Der Preis: Ein Seitenaufruf wartet, falls der Service Worker
      // gerade ruht, kurz auf dessen Start. Seitenwechsel innerhalb der Anwendung sind keine Seitenaufrufe – für sie gibt es
      // Navigation Preload ohnehin nicht.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.disable();
      await self.clients.claim();
    })(),
  );
});

// --- Seitenaufrufe ----------------------------------------------------------------------------------------------------
//
// Nur Seitenaufrufe (GET-Navigationen) der eigenen Adresse, außer /api/… (Downloads, Kalender, Export): immer über das Netz;
// NUR wenn das Netz fehlt (die Anfrage scheitert ganz), kommt die Offline-Seite. Antworten mit Fehlerstatus (404, 500 …) und
// Weiterleitungen (z. B. zur Anmeldung) gehen unverändert an den Browser. Nichts davon wird gespeichert.

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(loadPage(request));
});

async function loadPage(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
    return offline ?? Response.error();
  }
}

// --- Push-Benachrichtigungen ------------------------------------------------------------------------------------------
//
// Ereignisse: "push" (Meldung anzeigen) und "notificationclick" (Fenster fokussieren oder öffnen). Der Server (src/server/jobs/
// push-queue.ts) schickt das Format „Declarative Web Push“: {"web_push":8030,"notification":{"title","body","navigate", …}}.
// iOS/iPadOS 18.4+ zeigt solche Nachrichten selbst an, ohne diesen Code; alle anderen Browser lesen dasselbe JSON hier.
//
// Regel für den Inhalt: keine Namen, keine Personendaten, kein Nachrichtentext – nur ein kurzer, allgemeiner deutscher Text
// (der Server bildet ihn allein aus dem Typ der Benachrichtigung) und die Adresse der Seite. Benachrichtigungen erscheinen auf
// dem Sperrbildschirm und laufen über den Push-Dienst des Browser-Herstellers. Geöffnet wird ausschließlich die eigene Adresse.

const PUSH_ICON = "/app-icon-192.png";
/** Einfarbiges Symbol für die Statusleiste von Android (nur die Deckkraft zählt); erzeugt von docs/brand/generate-app-icons.mjs. */
const PUSH_BADGE = "/push-badge.png";
const NOTIFICATIONS_PATH = "/benachrichtigungen";
const FALLBACK_PUSH = {
  title: "Neue Benachrichtigung",
  body: "Öffne VereinsFlow, um sie zu lesen.",
};

/** Nur Adressen der eigenen Herkunft; alles andere (fremde Server, kaputte Werte) führt zum Benachrichtigungscenter. */
function ownUrl(value) {
  try {
    if (typeof value === "string" && value.trim()) {
      const url = new URL(value, self.location.origin);
      if (url.origin === self.location.origin) return url.href;
    }
  } catch {
    // ungültige Adresse – siehe unten
  }
  return new URL(NOTIFICATIONS_PATH, self.location.origin).href;
}

/** Liest Titel, Text und Ziel aus der Nachricht; bei allem Unlesbaren gilt ein allgemeiner Text (es muss immer etwas erscheinen). */
function readPush(event) {
  let notification = null;
  try {
    const data = event.data ? event.data.json() : null;
    if (
      data &&
      data.web_push === 8030 &&
      data.notification &&
      typeof data.notification === "object"
    ) {
      notification = data.notification;
    }
  } catch {
    // kein JSON – allgemeiner Text
  }
  const text = (value, fallback, max) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
  return {
    title: text(notification && notification.title, FALLBACK_PUSH.title, 100),
    body: text(notification && notification.body, FALLBACK_PUSH.body, 200),
    navigate: ownUrl(notification && notification.navigate),
  };
}

self.addEventListener("push", (event) => {
  const { title, body, navigate } = readPush(event);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: PUSH_ICON,
      badge: PUSH_BADGE,
      lang: "de",
      dir: "ltr",
      data: { navigate },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  event.waitUntil(openTarget(ownUrl(data && data.navigate)));
});

/** Ein offenes Fenster der Anwendung nach vorn holen und zum Ziel schicken – sonst ein neues öffnen. */
async function openTarget(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    try {
      const focused = await client.focus();
      if (focused && typeof focused.navigate === "function") await focused.navigate(url);
      return;
    } catch {
      // Fenster nicht mehr erreichbar – nächstes versuchen, zuletzt ein neues öffnen
    }
  }
  await self.clients.openWindow(url);
}
