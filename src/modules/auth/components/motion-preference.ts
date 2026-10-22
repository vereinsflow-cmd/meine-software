import { MOTION_STORAGE_KEY } from "../stage";

/**
 * Die Wahl „Bewegung anhalten“ der Anmeldebühne – gemerkt in diesem Browser (`localStorage`), damit der Ring beim nächsten
 * Besuch und auf den anderen Seiten der Bühne (Passwort vergessen, Code) gleich stillsteht. Ein winziger Speicher mit
 * Abonnement: Der Knopf liest ihn über `useSyncExternalStore` (auf dem Server immer „läuft“), die Schleife hört mit.
 * Ohne Speicher (privates Fenster, gesperrt) gilt die Wahl nur bis zum Neuladen.
 */
const listeners = new Set<() => void>();
let paused: boolean | null = null;

function read(): boolean {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY) === "angehalten";
  } catch {
    return false;
  }
}

export const motionPreference = {
  get(): boolean {
    paused ??= read();
    return paused;
  },
  /** Auf dem Server (und beim Hydrieren) läuft die Bühne – erst danach gilt die gemerkte Wahl. */
  getServer(): boolean {
    return false;
  },
  set(value: boolean): void {
    paused = value;
    try {
      if (value) window.localStorage.setItem(MOTION_STORAGE_KEY, "angehalten");
      else window.localStorage.removeItem(MOTION_STORAGE_KEY);
    } catch {
      // kein Speicher: gilt nur für diesen Seitenaufruf
    }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
