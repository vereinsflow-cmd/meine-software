import { describe, expect, it } from "vitest";
import { NotificationType } from "@/generated/prisma/enums";
import {
  buildPushPayload,
  NOTIFICATIONS_PATH,
  pushTargetUrl,
  pushTextFor,
  pushUrgency,
  PUSH_TTL_SECONDS,
} from "@/modules/notifications/push-payload";

const APP_URL = "https://app.vereins-flow.com";
const TYPES = Object.values(NotificationType);

describe("Push-Nutzlast: Inhalt", () => {
  it("hat für JEDE Art der Benachrichtigung einen kurzen deutschen Text", () => {
    expect(TYPES.length).toBeGreaterThan(0);
    for (const type of TYPES) {
      const { title, body } = pushTextFor(type);
      expect(title.length, type).toBeGreaterThan(3);
      expect(title.length, type).toBeLessThanOrEqual(40);
      expect(body.length, type).toBeGreaterThan(10);
      expect(body.length, type).toBeLessThanOrEqual(80);
    }
  });

  it("enthält NIE Titel, Text oder Namen der Benachrichtigung – nur feste Sätze je Art", () => {
    const secretTitle = "Neue Schicht: Aufbau Sommerfest mit Hanna Helfer";
    const secretBody = "Hanna Helfer, Vereinsheim, Treffpunkt 17:00, Tel. 0170 1234567";
    for (const type of TYPES) {
      // buildPushPayload nimmt Titel und Text gar nicht entgegen; die Prüfung zeigt, dass das so bleibt.
      const payload = buildPushPayload(
        { type, linkUrl: "/veranstaltungen/abc", title: secretTitle, body: secretBody } as never,
        APP_URL,
      );
      const json = JSON.stringify(payload);
      for (const forbidden of ["Hanna", "Helfer", "Sommerfest", "Vereinsheim", "0170", "17:00"]) {
        expect(json, type).not.toContain(forbidden);
      }
      expect(payload.notification.title).toBe(pushTextFor(type).title);
      expect(payload.notification.body).toBe(pushTextFor(type).body);
    }
  });

  it("nennt keine Namen und keine Ziffern-Personendaten in den festen Texten", () => {
    for (const type of TYPES) {
      const { title, body } = pushTextFor(type);
      expect(`${title} ${body}`, type).not.toMatch(/[0-9@]/);
    }
  });

  it("kennt die Beispiele aus dem Konzept", () => {
    expect(pushTextFor("MESSAGE").title).toBe("Neue Nachricht");
    expect(pushTextFor("SHIFT_ASSIGNED").title).toBe("Neue Schicht für dich");
    expect(pushTextFor("SHIFT_REMINDER").title).toBe("Erinnerung an deine Schicht");
  });

  it("spricht durchgehend in der Du-Form, die auch die Oberfläche verwendet (kein „Sie“)", () => {
    for (const type of TYPES) {
      const { title, body } = pushTextFor(type);
      expect(`${title} ${body}`, type).not.toMatch(/\b(Sie|Ihre|Ihnen|Ihr)\b/);
    }
  });
});

describe("Push-Nutzlast: Format Declarative Web Push", () => {
  it("liefert web_push 8030 mit Titel, Text und absolutem Ziel der eigenen Adresse", () => {
    expect(buildPushPayload({ type: "MESSAGE", linkUrl: "/nachrichten/abc123" }, APP_URL)).toEqual({
      web_push: 8030,
      notification: {
        title: "Neue Nachricht",
        body: "Du hast eine neue Nachricht in deinem Verein.",
        navigate: "https://app.vereins-flow.com/nachrichten/abc123",
        lang: "de",
        dir: "ltr",
      },
    });
  });

  it("besteht den JSON-Rundlauf (so geht die Nutzlast über die Leitung)", () => {
    const payload = buildPushPayload({ type: "EVENT_CANCELLED", linkUrl: null }, APP_URL);
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});

describe("Push-Ziel (pushTargetUrl)", () => {
  it("setzt interne Pfade an die Adresse der Anwendung (auch mit Anfrageteil und Anker)", () => {
    expect(pushTargetUrl("/veranstaltungen/x?tab=schichten#a", APP_URL)).toBe(
      "https://app.vereins-flow.com/veranstaltungen/x?tab=schichten#a",
    );
  });

  it("nutzt nur die Herkunft von APP_URL – ein Pfad in APP_URL stört nicht", () => {
    expect(pushTargetUrl("/aufgaben", "https://example.org/unterordner/")).toBe(
      "https://example.org/aufgaben",
    );
  });

  it("fällt ohne Link auf das Benachrichtigungscenter zurück", () => {
    const fallback = `https://app.vereins-flow.com${NOTIFICATIONS_PATH}`;
    expect(pushTargetUrl(null, APP_URL)).toBe(fallback);
    expect(pushTargetUrl(undefined, APP_URL)).toBe(fallback);
    expect(pushTargetUrl("", APP_URL)).toBe(fallback);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example/phish",
    "http://evil.example",
    "javascript:alert(1)",
    "\\\\evil.example",
    "/\\evil.example",
    "veranstaltungen/relativ",
    "/pfad\nmit-umbruch",
    "/pfad\u0000null",
  ])("führt nie auf eine fremde oder ungültige Adresse: %j", (link) => {
    const url = pushTargetUrl(link, APP_URL);
    expect(new URL(url).origin).toBe(APP_URL);
    expect(url).toBe(`${APP_URL}${NOTIFICATIONS_PATH}`);
  });
});

describe("Push-Zustellung: Dringlichkeit und Lebensdauer", () => {
  it("weckt das Gerät sofort nur bei zeitkritischen Meldungen", () => {
    const high = TYPES.filter((type) => pushUrgency(type) === "high").sort();
    expect(high).toEqual(
      ["EVENT_CANCELLED", "EVENT_REMINDER", "SHIFT_CANCELLED", "SHIFT_REMINDER"].sort(),
    );
    expect(pushUrgency("MESSAGE")).toBe("normal");
  });

  it("hält eine Meldung höchstens sechs Stunden zurück", () => {
    expect(PUSH_TTL_SECONDS).toBe(6 * 3600);
  });
});
