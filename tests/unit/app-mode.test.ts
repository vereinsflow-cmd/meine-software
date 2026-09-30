import { describe, expect, it } from "vitest";
import { detectAppMode, isAppMode, type AppModeEnvironment } from "@/lib/app-mode";

/** Nachbau der wenigen Browser-Eigenschaften, die die Erkennung liest. */
function browser({
  referrer = "",
  displayMode = "browser",
  standalone,
  storage = new Map<string, string>(),
  storageThrows = false,
}: {
  referrer?: string;
  displayMode?: "browser" | "standalone" | "fullscreen";
  standalone?: boolean;
  storage?: Map<string, string>;
  storageThrows?: boolean;
} = {}): AppModeEnvironment {
  return {
    document: { referrer },
    matchMedia: (query) => ({ matches: query === `(display-mode: ${displayMode})` }),
    navigator: standalone === undefined ? {} : { standalone },
    sessionStorage: {
      getItem: (key) => {
        if (storageThrows) throw new Error("gesperrt");
        return storage.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (storageThrows) throw new Error("gesperrt");
        storage.set(key, value);
      },
    },
  };
}

describe("App-Ansicht erkennen (detectAppMode)", () => {
  it("normaler Browser-Tab", () => {
    expect(detectAppMode(browser())).toBe("browser");
    expect(detectAppMode(browser({ referrer: "https://app.vereins-flow.com/dashboard" }))).toBe(
      "browser",
    );
    expect(isAppMode(browser())).toBe(false);
  });

  it("vom Startbildschirm: Media-Abfrage standalone/fullscreen oder navigator.standalone (ältere iPhones)", () => {
    expect(detectAppMode(browser({ displayMode: "standalone" }))).toBe("home-screen");
    expect(detectAppMode(browser({ displayMode: "fullscreen" }))).toBe("home-screen");
    expect(detectAppMode(browser({ standalone: true }))).toBe("home-screen");
    expect(detectAppMode(browser({ standalone: false }))).toBe("browser");
    expect(isAppMode(browser({ displayMode: "standalone" }))).toBe(true);
  });

  it("Android-App: erkennt den Start-Verweis und merkt ihn sich für die weiteren Seiten dieses Tabs", () => {
    const storage = new Map<string, string>();
    expect(
      detectAppMode(browser({ referrer: "android-app://com.vereinsflow.app/", storage })),
    ).toBe("android-app");
    // Nächste Seite: Der Verweis zeigt jetzt auf die vorige Seite – die Erkennung bleibt.
    expect(
      detectAppMode(
        browser({
          referrer: "https://app.vereins-flow.com/anmelden",
          displayMode: "standalone",
          storage,
        }),
      ),
    ).toBe("android-app");
    expect(storage.get("vf:app-mode")).toBe("android-app");
  });

  it("gesperrter Sitzungsspeicher bricht die Erkennung nicht ab", () => {
    expect(
      detectAppMode(
        browser({ referrer: "android-app://com.vereinsflow.app/", storageThrows: true }),
      ),
    ).toBe("android-app");
    expect(detectAppMode(browser({ displayMode: "standalone", storageThrows: true }))).toBe(
      "home-screen",
    );
  });
});
