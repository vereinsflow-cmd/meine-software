/**
 * Browser-Seite der Push-Benachrichtigungen (Web Push): Unterstützung erkennen, dieses Gerät an- und abmelden.
 * Läuft nur im Browser. Die Gegenstelle sind die Routen unter /api/push/… und der Service Worker (public/sw.js).
 *
 * Die Adresse des Abos (`endpoint`) ist ein Geheimnis: Sie geht nur an die eigene Anwendung (gleiche Herkunft), nie in eine
 * URL, nie in eine Meldung oder ein Protokoll.
 */

export type PushSupport =
  /** Der Browser kann kein Web-Push. */
  | "unsupported"
  /** iPhone/iPad im Browser-Tab: Push gibt es dort nur für Web-Apps auf dem Home-Bildschirm (iOS 16.4 oder neuer). */
  | "needs-home-screen"
  | "supported";

interface SupportEnvironment {
  navigator: Navigator & { standalone?: boolean };
  window: Window;
}

/** iPhone, iPad, iPod – auch iPadOS, das sich im Browser als Mac ausgibt (erkennbar am Touchscreen). */
function isIos(nav: SupportEnvironment["navigator"]): boolean {
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1)
  );
}

function isHomeScreenApp(env: SupportEnvironment): boolean {
  return (
    env.window.matchMedia?.("(display-mode: standalone)").matches === true ||
    env.window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    env.navigator.standalone === true
  );
}

export function detectPushSupport(env: SupportEnvironment = { navigator, window }): PushSupport {
  if (isIos(env.navigator) && !isHomeScreenApp(env)) return "needs-home-screen";
  const capable =
    "serviceWorker" in env.navigator && "PushManager" in env.window && "Notification" in env.window;
  return capable ? "supported" : "unsupported";
}

/** Der VAPID-Schlüssel (base64url) als Bytes, wie `pushManager.subscribe` sie verlangt. */
export function decodeApplicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration("/");
}

/** Der Service Worker; wird bei Bedarf angemeldet (im Entwicklungsmodus meldet ihn sonst niemand an). */
async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await getRegistration();
  if (!existing) {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }
  return navigator.serviceWorker.ready;
}

/** Das Abo dieses Geräts im Browser, falls es eines gibt – ohne etwas anzumelden. */
export async function getDeviceSubscription(): Promise<PushSubscription | null> {
  const registration = await getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

async function callApi(method: "POST" | "DELETE", path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    keepalive: true,
  });
}

/** Ist dieses Gerät für die angemeldete Person schon eingeschaltet? */
export async function isDeviceSubscribed(): Promise<boolean> {
  const subscription = await getDeviceSubscription();
  if (!subscription) return false;
  const response = await callApi("POST", "/api/push/status", { endpoint: subscription.endpoint });
  if (!response.ok) return false;
  const json = (await response.json()) as { ok: boolean; data?: { subscribed?: boolean } };
  return json.ok && json.data?.subscribed === true;
}

export class PushEnableError extends Error {
  constructor(readonly reason: "denied" | "failed") {
    super(reason);
    this.name = "PushEnableError";
  }
}

/**
 * Schaltet Push für dieses Gerät ein. Nur nach einem Klick aufrufen: Die Abfrage der Erlaubnis muss durch eine Handlung der
 * Person ausgelöst werden (Safari und Firefox verlangen es, Chrome bewertet sonst die Seite schlechter).
 */
export async function enableDevicePush(publicKey: string): Promise<void> {
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") throw new PushEnableError("denied");

  const registration = await ensureRegistration();
  const options = {
    userVisibleOnly: true,
    applicationServerKey: decodeApplicationServerKey(publicKey),
  };
  let subscription: PushSubscription;
  try {
    subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe(options));
  } catch {
    throw new PushEnableError("failed");
  }

  let response: Response;
  try {
    response = await callApi("POST", "/api/push/subscription", subscription.toJSON());
  } catch {
    throw new PushEnableError("failed");
  }
  if (!response.ok) {
    // Der Server hat das Gerät nicht angenommen: nichts halb eingeschaltet lassen.
    await subscription.unsubscribe().catch(() => undefined);
    throw new PushEnableError("failed");
  }
}

/** Schaltet Push für dieses Gerät aus: erst auf dem Server (dort steht die Adresse), dann im Browser. */
export async function disableDevicePush(): Promise<void> {
  const subscription = await getDeviceSubscription();
  if (!subscription) return;
  const response = await callApi("DELETE", "/api/push/subscription", {
    endpoint: subscription.endpoint,
  });
  if (!response.ok && response.status !== 401) throw new Error("Abmelden fehlgeschlagen");
  await subscription.unsubscribe().catch(() => undefined);
}

/**
 * Beim Abmelden von VereinsFlow: dieses Gerät als Push-Empfänger entfernen, damit auf einem geteilten Gerät nach dem
 * Abmelden keine Meldungen der bisherigen Person mehr erscheinen. Bestmöglich und begrenzt (die Abmeldung darf nie hängen).
 * Wer sich später wieder anmeldet, schaltet Push im Profil neu ein.
 */
export async function forgetDevicePush(timeoutMs = 2000): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const attempt = disableDevicePush().catch(() => undefined);
  await Promise.race([attempt, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
