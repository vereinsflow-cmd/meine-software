import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { proxy } from "@/proxy";

/**
 * Der Proxy leitet Besucher ohne Sitzungs-Cookie zur Anmeldung – außer auf den öffentlichen Seiten. Geprüft wird vor allem, dass
 * die Adressen, die ohne Anmeldung erreichbar sein MÜSSEN, es auch bleiben: Rechtstexte und die Anleitung zur Kontolöschung
 * (Google Play ruft sie ohne Anmeldung auf, ihre Adresse steht in der Play Console) sowie Service Worker, Offline-Seite und
 * Digital Asset Links der App. Im Browser prüfen das zusätzlich die E2E-Tests (konto-loeschen.spec.ts, app-ansicht.spec.ts).
 */
const request = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });

const location = (response: Response) => response.headers.get("location");

describe("Proxy: öffentliche Seiten und Weiterleitung zur Anmeldung", () => {
  it.each([
    "/anmelden",
    "/passwort-vergessen",
    "/impressum",
    "/datenschutzerklaerung",
    "/konto-loeschen",
    "/sw.js",
    "/offline.html",
    "/.well-known/assetlinks.json",
  ])("%s ist ohne Anmeldung erreichbar – mit derselben strengen Sicherheitsrichtlinie", (path) => {
    const response = proxy(request(path));
    expect(location(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("content-security-policy")).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
  });

  it("geschützte Seiten leiten ohne Cookie zur Anmeldung und merken sich das Ziel", () => {
    const response = proxy(request("/datenschutz"));
    expect(response.status).toBe(307);
    expect(location(response)).toBe("http://localhost:3000/anmelden?next=%2Fdatenschutz");
  });

  it("öffentlich sind nur genau diese Pfade – keine Unterseiten oder ähnlich lautenden Adressen", () => {
    for (const path of ["/konto-loeschen/abc", "/konto-loeschen-alt", "/impressum/x"]) {
      expect(location(proxy(request(path))), path).toMatch(/\/anmelden\?next=/);
    }
  });

  it("mit Sitzungs-Cookie leitet der Proxy nicht weiter – die eigentliche Prüfung macht die Seite", () => {
    expect(location(proxy(request("/datenschutz", `${SESSION_COOKIE_NAME}=abc`)))).toBeNull();
  });
});
