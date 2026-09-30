/**
 * Läuft VereinsFlow gerade als App? Vorbereitet für spätere Anpassungen der App-Ansicht (etwa den Hinweis auf
 * Push-Benachrichtigungen) – bisher nutzt ihn noch keine Seite, das Verhalten ist überall gleich.
 *
 *   android-app  Android-App aus dem Play Store (Trusted Web Activity): Beim Start übergibt Android die Seite mit dem Verweis
 *                `android-app://com.vereinsflow.app/`.
 *   home-screen  Vom Startbildschirm geöffnet (Manifest `display: "standalone"`): iPhone/iPad oder als Web-App installiert.
 *   browser      Ganz normal im Browser-Tab.
 *
 * Nur im Browser aufrufen (z. B. in `useEffect`), nie beim Rendern auf dem Server – dort gibt es kein `window`.
 */
export type AppMode = "android-app" | "home-screen" | "browser";

/** Was die Erkennung vom Browser braucht – als eigener Typ, damit sie sich ohne echten Browser testen lässt. */
export interface AppModeEnvironment {
  document: Pick<Document, "referrer">;
  matchMedia: (query: string) => Pick<MediaQueryList, "matches">;
  navigator: object;
  sessionStorage?: Pick<Storage, "getItem" | "setItem">;
}

const ANDROID_APP_REFERRER = "android-app://";
/**
 * Den Verweis `android-app://` gibt es nur auf der ersten Seite nach dem Start der App; danach verweist jede Seite auf die
 * vorige. Deshalb merkt sich der Tab (nur für diese Sitzung, ohne Personenbezug), dass er in der Android-App läuft.
 */
const SESSION_KEY = "vf:app-mode";

export function detectAppMode(env: AppModeEnvironment = window): AppMode {
  if (env.document.referrer.startsWith(ANDROID_APP_REFERRER)) {
    try {
      env.sessionStorage?.setItem(SESSION_KEY, "android-app");
    } catch {
      // Speicher nicht verfügbar (z. B. gesperrt) – dann gilt die Erkennung nur für diese Seite.
    }
    return "android-app";
  }
  try {
    if (env.sessionStorage?.getItem(SESSION_KEY) === "android-app") return "android-app";
  } catch {
    // s. o.
  }
  const standalone =
    env.matchMedia("(display-mode: standalone)").matches ||
    env.matchMedia("(display-mode: fullscreen)").matches ||
    // Ältere iPhones (vor iOS 16.4) kennen die Media-Abfrage nicht, nur diese Eigenschaft.
    ("standalone" in env.navigator && env.navigator.standalone === true);
  return standalone ? "home-screen" : "browser";
}

/** Kurzform: als App geöffnet (Android-App oder Startbildschirm), nicht im Browser-Tab. */
export function isAppMode(env?: AppModeEnvironment): boolean {
  return detectAppMode(env) !== "browser";
}
