import { describe, expect, it } from "vitest";
import { decodeApplicationServerKey, detectPushSupport } from "@/lib/push-client";

type Env = Parameters<typeof detectPushSupport>[0];

function environment(options: {
  userAgent?: string;
  maxTouchPoints?: number;
  standaloneMedia?: boolean;
  navigatorStandalone?: boolean;
  serviceWorker?: boolean;
  pushManager?: boolean;
  notification?: boolean;
}): Env {
  const nav: Record<string, unknown> = {
    userAgent: options.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64) Chrome/130",
    maxTouchPoints: options.maxTouchPoints ?? 0,
    standalone: options.navigatorStandalone,
  };
  if (options.serviceWorker !== false) nav.serviceWorker = {};
  const win: Record<string, unknown> = {
    matchMedia: (query: string) => ({
      matches: options.standaloneMedia === true && query.includes("standalone"),
    }),
  };
  if (options.pushManager !== false) win.PushManager = function PushManager() {};
  if (options.notification !== false) win.Notification = function Notification() {};
  return { navigator: nav, window: win } as unknown as Env;
}

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const MAC_IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";

describe("Push-Unterstützung erkennen", () => {
  it("Desktop-Chrome und Android: unterstützt", () => {
    expect(detectPushSupport(environment({}))).toBe("supported");
  });

  it("Browser ohne Service Worker, PushManager oder Notification: nicht unterstützt", () => {
    expect(detectPushSupport(environment({ serviceWorker: false }))).toBe("unsupported");
    expect(detectPushSupport(environment({ pushManager: false }))).toBe("unsupported");
    expect(detectPushSupport(environment({ notification: false }))).toBe("unsupported");
  });

  it("iPhone im Browser-Tab: zuerst zum Home-Bildschirm hinzufügen – auch wenn die Schnittstellen fehlen", () => {
    expect(detectPushSupport(environment({ userAgent: IPHONE, pushManager: false }))).toBe(
      "needs-home-screen",
    );
    expect(detectPushSupport(environment({ userAgent: IPHONE }))).toBe("needs-home-screen");
  });

  it("iPad, das sich als Mac ausgibt (Touchscreen): ebenfalls Home-Bildschirm nötig; echter Mac nicht", () => {
    expect(detectPushSupport(environment({ userAgent: MAC_IPAD, maxTouchPoints: 5 }))).toBe(
      "needs-home-screen",
    );
    expect(detectPushSupport(environment({ userAgent: MAC_IPAD, maxTouchPoints: 0 }))).toBe(
      "supported",
    );
  });

  it("iPhone als Home-Bildschirm-App (display-mode oder navigator.standalone): unterstützt", () => {
    expect(detectPushSupport(environment({ userAgent: IPHONE, standaloneMedia: true }))).toBe(
      "supported",
    );
    expect(detectPushSupport(environment({ userAgent: IPHONE, navigatorStandalone: true }))).toBe(
      "supported",
    );
  });
});

describe("Anwendungsschlüssel (VAPID) dekodieren", () => {
  it("wandelt base64url in Bytes um (mit - und _, ohne Auffüllzeichen)", () => {
    // 0xfb 0xff 0xbf = "-_-_" in base64url ("+/+/" in base64 wäre "+/+/")
    expect([...decodeApplicationServerKey("-_-_")]).toEqual([0xfb, 0xff, 0xbf]);
    expect([...decodeApplicationServerKey("AQID")]).toEqual([1, 2, 3]);
    expect([...decodeApplicationServerKey("AQI")]).toEqual([1, 2]);
  });

  it("ein öffentlicher VAPID-Schlüssel (87 Zeichen) ergibt 65 Byte, beginnend mit 0x04", () => {
    const key = `BA${"A".repeat(85)}`;
    const bytes = decodeApplicationServerKey(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });
});
