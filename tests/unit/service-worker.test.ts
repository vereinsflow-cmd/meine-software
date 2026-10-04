import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * Service Worker (public/sw.js) und Offline-Seite (public/offline.html). Der Service Worker läuft hier in einer
 * nachgebauten Umgebung (eigener vm-Kontext mit `self`, `caches`, `fetch`) – geprüft wird vor allem die Datenschutz-Regel:
 * Nichts außer der Offline-Seite landet in der Ablage, und außer Seitenaufrufen fasst er keine Anfrage an.
 * Das echte Verhalten im Browser prüfen tests/e2e/app-ansicht.spec.ts und der Produktions-Rauchtest.
 */
const ROOT = path.resolve(__dirname, "../..");
const SW_SOURCE = readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
const OFFLINE_HTML = readFileSync(path.join(ROOT, "public/offline.html"), "utf8");
const ORIGIN = "https://app.vereins-flow.com";

type Listener = (event: unknown) => void;

/** Nachgebaute Ablage (Cache Storage): Name → (Adresse → Antwort). */
function createCacheStorage() {
  const store = new Map<string, Map<string, Response>>();
  const resolve = (request: string | { url: string }) =>
    new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
  return {
    store,
    async open(name: string) {
      if (!store.has(name)) store.set(name, new Map());
      const entries = store.get(name)!;
      return {
        // Wie der Browser: lädt die Adresse und legt die Antwort ab.
        add: vi.fn(async (request: { url: string; cache?: string }) => {
          entries.set(resolve(request), new Response(OFFLINE_HTML, { status: 200 }));
        }),
        put: vi.fn(async (request: { url: string }, response: Response) => {
          entries.set(resolve(request), response);
        }),
      };
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name: string) {
      return store.delete(name);
    },
    async match(request: string, options?: { cacheName?: string }) {
      const names = options?.cacheName ? [options.cacheName] : [...store.keys()];
      for (const name of names) {
        const hit = store.get(name)?.get(resolve(request));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
}

/** Lädt public/sw.js in eine frische, nachgebaute Service-Worker-Umgebung. */
function loadServiceWorker() {
  const listeners = new Map<string, Listener>();
  const caches = createCacheStorage();
  const fetchMock = vi.fn<(request: unknown) => Promise<Response>>();
  const self = {
    location: { origin: ORIGIN },
    registration: {
      navigationPreload: {
        enable: vi.fn(async () => undefined),
        disable: vi.fn(async () => undefined),
      },
      showNotification: vi.fn(async (...args: [string, Record<string, unknown>]) => void args),
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async (): Promise<unknown[]> => []),
      openWindow: vi.fn(async (...args: [string]) => (void args, null)),
    },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  // `Request` löst relative Adressen wie im Service Worker gegen dessen Adresse auf.
  class ServiceWorkerRequest {
    url: string;
    cache?: string;
    constructor(url: string, init?: { cache?: string }) {
      this.url = new URL(url, ORIGIN).href;
      this.cache = init?.cache;
    }
  }
  vm.runInNewContext(SW_SOURCE, {
    self,
    caches,
    fetch: fetchMock,
    Request: ServiceWorkerRequest,
    Response,
    URL,
  });

  /** Löst ein Ereignis mit `waitUntil` aus (install, activate) und wartet, bis es fertig ist. */
  async function lifecycle(type: "install" | "activate") {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => (pending = promise) });
    await pending;
  }

  /** Löst ein fetch-Ereignis aus; liefert die Antwort des Service Workers oder `null`, wenn er die Anfrage nicht anfasst. */
  async function request(
    url: string,
    { mode = "navigate", method = "GET" }: { mode?: string; method?: string } = {},
  ): Promise<Response | null> {
    let answer: Promise<Response> | null = null;
    listeners.get("fetch")!({
      request: { url: new URL(url, ORIGIN).href, mode, method },
      respondWith: (response: Promise<Response>) => (answer = response),
    });
    return answer ? await answer : null;
  }

  /** Löst „push“ mit dem gegebenen Inhalt aus (Text, Objekt → JSON, `null` = ohne Nutzlast) und wartet auf die Anzeige. */
  async function push(payload: unknown) {
    let pending: Promise<unknown> = Promise.resolve();
    const data =
      payload === null
        ? null
        : { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) };
    listeners.get("push")!({ data, waitUntil: (promise: Promise<unknown>) => (pending = promise) });
    await pending;
  }

  /** Löst „notificationclick“ aus. */
  async function click(data: unknown) {
    let pending: Promise<unknown> = Promise.resolve();
    const notification = { data, close: vi.fn() };
    listeners.get("notificationclick")!({
      notification,
      waitUntil: (promise: Promise<unknown>) => (pending = promise),
    });
    await pending;
    return notification;
  }

  return { self, caches, fetchMock, lifecycle, request, push, click };
}

const revision = /const OFFLINE_REVISION = "([0-9a-f]+)"/.exec(SW_SOURCE)?.[1];
const offlineCache = `vf-offline-${revision}`;

async function installed() {
  const sw = loadServiceWorker();
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
  return sw;
}

describe("Service Worker", () => {
  it("legt bei der Installation nur die Offline-Seite ab – frisch vom Server – und übernimmt sofort", async () => {
    const sw = loadServiceWorker();
    await sw.lifecycle("install");
    expect([...sw.caches.store.keys()]).toEqual([offlineCache]);
    expect([...sw.caches.store.get(offlineCache)!.keys()]).toEqual([`${ORIGIN}/offline.html`]);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("räumt beim Aktivieren alle anderen Ablagen weg, schaltet Navigation Preload aus und übernimmt offene Fenster", async () => {
    const sw = loadServiceWorker();
    await sw.caches.open("vf-offline-alt");
    await sw.caches.open("irgendetwas-anderes");
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    expect(await sw.caches.keys()).toEqual([offlineCache]);
    // Mit Navigation Preload lüde der Browser /api/…-Aufrufe (Export, Download), die der Service Worker nicht beantwortet,
    // ein zweites Mal – der Export stünde doppelt im Protokoll.
    expect(sw.self.registration.navigationPreload.disable).toHaveBeenCalled();
    expect(sw.self.registration.navigationPreload.enable).not.toHaveBeenCalled();
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("Seitenaufrufe kommen immer vom Server und werden nicht gespeichert", async () => {
    const sw = await installed();
    sw.fetchMock.mockResolvedValue(new Response("<h1>Mitglieder</h1>", { status: 200 }));
    const page = await sw.request("/mitglieder?suche=Becker");
    expect(await page!.text()).toBe("<h1>Mitglieder</h1>");
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);

    // Auch Fehlerseiten des Servers und Weiterleitungen gehen unverändert durch – die Offline-Seite nur ohne Netz.
    sw.fetchMock.mockResolvedValue(new Response("Fehler", { status: 500 }));
    expect((await sw.request("/dashboard"))!.status).toBe(500);

    // In der Ablage liegt weiterhin nur die Offline-Seite.
    expect([...sw.caches.store.values()].flatMap((entries) => [...entries.keys()])).toEqual([
      `${ORIGIN}/offline.html`,
    ]);
  });

  it("ohne Netz: zeigt die Offline-Seite", async () => {
    const sw = await installed();
    sw.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const page = await sw.request("/nachrichten");
    expect(page!.status).toBe(200);
    expect(await page!.text()).toContain("Keine Verbindung");
  });

  it("fasst alles andere nicht an: Skripte, Bilder, Daten, Formulare, Schnittstellen, fremde Adressen", async () => {
    const sw = await installed();
    expect(await sw.request("/_next/static/chunks/app.js", { mode: "no-cors" })).toBeNull();
    expect(await sw.request("/dashboard?_rsc=1", { mode: "cors" })).toBeNull(); // Daten der Seitenwechsel
    expect(
      await sw.request("/api/session/ping", { mode: "same-origin", method: "POST" }),
    ).toBeNull();
    expect(await sw.request("/mitglieder/neu", { method: "POST" })).toBeNull(); // Formular ohne Skript
    expect(await sw.request("/api/dokumente/1/download")).toBeNull(); // Download als Seitenaufruf
    expect(await sw.request("https://example.org/")).toBeNull();
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it("schreibt außer bei der Installation nie in die Ablage", () => {
    // Zusätzlich zur Prüfung oben: Eine spätere Änderung, die Antworten speichert, soll hier auffallen und bewusst entschieden werden.
    expect(SW_SOURCE).not.toMatch(/\.put\(|\.addAll\(/);
    expect(SW_SOURCE.match(/\.add\(/g)).toHaveLength(1);
  });
});

describe("Service Worker – Push-Benachrichtigungen", () => {
  const declarative = (overrides: Record<string, unknown> = {}) => ({
    web_push: 8030,
    notification: {
      title: "Neue Nachricht",
      body: "Du hast eine neue Nachricht in deinem Verein.",
      navigate: `${ORIGIN}/nachrichten`,
      lang: "de",
      dir: "ltr",
      ...overrides,
    },
  });

  it("zeigt die Meldung aus dem Declarative-Web-Push-Format – mit App-Symbol und einfarbigem Statusleistensymbol", async () => {
    const sw = await installed();
    await sw.push(declarative());
    expect(sw.self.registration.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = sw.self.registration.showNotification.mock.calls[0]!;
    expect(title).toBe("Neue Nachricht");
    expect(options).toMatchObject({
      body: "Du hast eine neue Nachricht in deinem Verein.",
      icon: "/app-icon-192.png",
      badge: "/push-badge.png",
      lang: "de",
      data: { navigate: `${ORIGIN}/nachrichten` },
    });
  });

  it("zeigt bei unlesbarer oder fehlender Nutzlast einen allgemeinen Text (es muss immer etwas erscheinen)", async () => {
    for (const payload of [
      null,
      "kein json",
      { irgendwas: 1 },
      { web_push: 1, notification: {} },
    ]) {
      const sw = await installed();
      await sw.push(payload);
      const [title, options] = sw.self.registration.showNotification.mock.calls[0]!;
      expect(title).toBe("Neue Benachrichtigung");
      expect(options.body).toBe("Öffne VereinsFlow, um sie zu lesen.");
      expect(options.data).toEqual({ navigate: `${ORIGIN}/benachrichtigungen` });
    }
  });

  it("übernimmt nur Ziele der eigenen Adresse – fremde führen zum Benachrichtigungscenter", async () => {
    const sw = await installed();
    for (const navigate of [
      "https://evil.example/x",
      "//evil.example/x",
      "javascript:alert(1)",
      42,
    ]) {
      sw.self.registration.showNotification.mockClear();
      await sw.push(declarative({ navigate }));
      expect(sw.self.registration.showNotification.mock.calls[0]![1]).toMatchObject({
        data: { navigate: `${ORIGIN}/benachrichtigungen` },
      });
    }
    sw.self.registration.showNotification.mockClear();
    await sw.push(declarative({ navigate: "/helferplanung/abc" })); // relative Pfade gehören zur eigenen Adresse
    expect(sw.self.registration.showNotification.mock.calls[0]![1]).toMatchObject({
      data: { navigate: `${ORIGIN}/helferplanung/abc` },
    });
  });

  it("kürzt überlange Texte", async () => {
    const sw = await installed();
    await sw.push(declarative({ title: "T".repeat(500), body: "B".repeat(900) }));
    const [title, options] = sw.self.registration.showNotification.mock.calls[0]!;
    expect(title).toHaveLength(100);
    expect((options.body as string).length).toBe(200);
  });

  it("beim Tippen: schließt die Meldung und öffnet ein neues Fenster, wenn keines offen ist", async () => {
    const sw = await installed();
    const notification = await sw.click({ navigate: `${ORIGIN}/nachrichten` });
    expect(notification.close).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/nachrichten`);
  });

  it("beim Tippen: holt ein offenes Fenster der Anwendung nach vorn und schickt es zum Ziel", async () => {
    const sw = await installed();
    const navigate = vi.fn(async () => undefined);
    const focus = vi.fn(async () => ({ navigate }));
    sw.self.clients.matchAll.mockResolvedValue([
      { url: "https://fremd.example/", focus: vi.fn() },
      { url: `${ORIGIN}/dashboard`, focus },
    ]);
    await sw.click({ navigate: `${ORIGIN}/nachrichten` });
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/nachrichten`);
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("beim Tippen: öffnet nie eine fremde Adresse, auch wenn die Meldung eine enthielte", async () => {
    const sw = await installed();
    await sw.click({ navigate: "https://evil.example/phishing" });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/benachrichtigungen`);
    await sw.click(undefined);
    expect(sw.self.clients.openWindow).toHaveBeenLastCalledWith(`${ORIGIN}/benachrichtigungen`);
  });

  it("beim Tippen: ist das offene Fenster nicht erreichbar, öffnet er ein neues", async () => {
    const sw = await installed();
    sw.self.clients.matchAll.mockResolvedValue([
      {
        url: `${ORIGIN}/dashboard`,
        focus: vi.fn(async () => {
          throw new Error("weg");
        }),
      },
    ]);
    await sw.click({ navigate: `${ORIGIN}/aufgaben` });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/aufgaben`);
  });
});

describe("Offline-Seite", () => {
  it("Fassung im Service Worker passt zur Offline-Seite (sonst behalten Geräte die alte Fassung)", () => {
    const expected = createHash("sha256").update(OFFLINE_HTML).digest("hex").slice(0, 12);
    expect(
      revision,
      `public/offline.html wurde geändert: OFFLINE_REVISION in public/sw.js auf "${expected}" setzen`,
    ).toBe(expected);
  });

  it("deutsch, ohne Skript und ohne nachgeladene Dateien (muss ganz ohne Netz funktionieren)", () => {
    expect(OFFLINE_HTML).toContain('<html lang="de">');
    expect(OFFLINE_HTML).toContain("<title>Keine Verbindung · VereinsFlow</title>");
    expect(OFFLINE_HTML).toContain("Erneut versuchen");
    expect(OFFLINE_HTML).not.toMatch(/<script|<link|<img|<iframe|url\(|@import/i);
    expect(OFFLINE_HTML).not.toMatch(/(?:src|href)="(?!")/); // einziger Link: href="" (dieselbe Adresse neu laden)
    // Sichere Bereiche der App-Ansicht und das Logo aus dem Logo-Paket (erste Etappe des „V“ in den Pfaden des Pakets),
    // nicht mehr das alte mit den zwei Kreisen.
    expect(OFFLINE_HTML).toContain("viewport-fit=cover");
    expect(OFFLINE_HTML).toContain("env(safe-area-inset-bottom");
    expect(OFFLINE_HTML).toMatch(/<svg\s+class="logo"[^>]*role="img"[^>]*aria-label="VereinsFlow"/);
    expect(OFFLINE_HTML).toContain('d="M42.32 -40.00 L91.40 -40.00 L104.49 21.58 L55.41 21.58 Z"');
    expect(OFFLINE_HTML).not.toMatch(/<circle cx="785\.5"|#1c4a7a|#5b9cd6/i);
  });
});
