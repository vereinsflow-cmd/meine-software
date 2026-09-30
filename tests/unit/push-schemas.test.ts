import { describe, expect, it } from "vitest";
import {
  isAllowedPushEndpoint,
  pushEndpointSchema,
  pushSubscribeSchema,
} from "@/modules/notifications/push-schemas";

const KEY = "B".repeat(87);
const AUTH = "a".repeat(22);
const FCM = "https://fcm.googleapis.com/fcm/send/abc123:APA91bHexampleexampleexample";

describe("Push-Adressen (SSRF-Schutz)", () => {
  it.each([
    FCM,
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
    "https://web.push.apple.com/QGE1cs",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://fcm.googleapis.com:443/wp/abc",
  ])("nimmt die Adresse bekannter Push-Dienste an: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://localhost/fcm/send/abc",
    "https://127.0.0.1/push",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/push",
    "https://intern.example/push",
    "https://fcm.googleapis.com.evil.example/fcm/send/abc",
    "https://evil.example/fcm.googleapis.com",
    "https://nutzer:passwort@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://evilpush.apple.com.example/x",
    "https://push.apple.com/x", // nur Unterdomänen von .push.apple.com
    "ftp://web.push.apple.com/x",
    "javascript:alert(1)",
    "kein-url",
    "",
  ])("lehnt ab: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it("lehnt überlange Adressen ab", () => {
    expect(isAllowedPushEndpoint(`${FCM}${"a".repeat(2100)}`)).toBe(false);
  });
});

describe("Push-Abo (pushSubscribeSchema)", () => {
  it("nimmt ein gültiges Abo an", () => {
    expect(pushSubscribeSchema.parse({ endpoint: FCM, keys: { p256dh: KEY, auth: AUTH } })).toEqual(
      { endpoint: FCM, keys: { p256dh: KEY, auth: AUTH } },
    );
  });

  it("ignoriert zusätzliche Felder des Browsers (z. B. expirationTime), gibt sie aber nicht weiter", () => {
    const parsed = pushSubscribeSchema.parse({
      endpoint: FCM,
      expirationTime: null,
      keys: { p256dh: KEY, auth: AUTH, extra: "x" },
    });
    expect(parsed).toEqual({ endpoint: FCM, keys: { p256dh: KEY, auth: AUTH } });
  });

  it.each([
    ["ohne Schlüssel", { endpoint: FCM }],
    ["zu kurzer Schlüssel", { endpoint: FCM, keys: { p256dh: "kurz", auth: AUTH } }],
    [
      "ungültige Zeichen im Schlüssel",
      { endpoint: FCM, keys: { p256dh: `${"B".repeat(86)}!`, auth: AUTH } },
    ],
    ["ungültiges Geheimnis", { endpoint: FCM, keys: { p256dh: KEY, auth: "a b".padEnd(22, "c") } }],
    ["fremde Adresse", { endpoint: "https://evil.example/x", keys: { p256dh: KEY, auth: AUTH } }],
    ["Zahl als Adresse", { endpoint: 42, keys: { p256dh: KEY, auth: AUTH } }],
  ])("lehnt ab: %s", (_name, input) => {
    expect(pushSubscribeSchema.safeParse(input).success).toBe(false);
  });
});

describe("Push-Abmeldung (pushEndpointSchema)", () => {
  it("verlangt eine zulässige Adresse", () => {
    expect(pushEndpointSchema.safeParse({ endpoint: FCM }).success).toBe(true);
    expect(
      pushEndpointSchema.safeParse({ endpoint: "https://evil.example/abcdefghijk" }).success,
    ).toBe(false);
    expect(pushEndpointSchema.safeParse({}).success).toBe(false);
  });
});
