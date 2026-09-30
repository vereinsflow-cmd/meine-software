import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login } from "./helpers";

/**
 * App-Ansicht (Android-App als Trusted Web Activity, Home-Bildschirm auf dem iPhone): Service Worker, Offline-Seite, Digital
 * Asset Links und Sicherheitsrichtlinie. Das Manifest (`display: "standalone"`, Symbole) prüft app-symbol.spec.ts, die sicheren
 * Bereiche am Smartphone app-ansicht.mobil.spec.ts.
 *
 * Der E2E-Server ist der Entwicklungsserver – dort registriert VereinsFlow den Service Worker bewusst nicht selbst (nur im
 * Produktions-Build, siehe components/layout/service-worker.tsx). Die Tests hier registrieren ihn deshalb gezielt; dass der
 * Produktions-Build es von allein tut, prüft tests/prod-smoke.
 */

/** Test-Fingerabdruck aus playwright.config.ts (ANDROID_APP_CERT_SHA256) – ein Beispielwert, kein echter Schlüssel. */
const E2E_CERT_SHA256 = Array.from({ length: 32 }, () => "E2").join(":");

const get = (request: import("@playwright/test").APIRequestContext, url: string) =>
  request.get(url, { maxRedirects: 0 });

/** Registriert den Service Worker wie die Anwendung und wartet, bis er die Seite steuert. */
async function registerServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const controlled = new Promise<void>((resolve) => {
      if (navigator.serviceWorker.controller) resolve();
      else navigator.serviceWorker.addEventListener("controllerchange", () => resolve());
    });
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    await controlled; // clients.claim() beim Aktivieren – ohne Neuladen
  });
}

/** Alle Einträge der Ablage (Cache Storage) dieser Adresse, als Pfade. */
function cachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        paths.push(new URL(request.url).pathname);
      }
    }
    return paths;
  });
}

test.describe("App-Ansicht", () => {
  test("Service Worker unter /sw.js: ohne Anmeldung, JavaScript, wird bei jedem Aufruf neu geprüft", async ({
    request,
  }) => {
    const response = await get(request, "/sw.js");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-type"]).toMatch(/^application\/javascript/);
    expect(headers["cache-control"]).toBe("no-cache");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(await response.text()).toContain('const OFFLINE_URL = "/offline.html"');
  });

  test("Offline-Seite: ohne Anmeldung erreichbar, deutsch, ohne Skript, barrierefrei", async ({
    page,
    request,
  }) => {
    const response = await get(request, "/offline.html");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^text\/html/);
    // Gleiche strenge Richtlinie wie jede Seite (aus dem Proxy): Skripte nur mit Nonce – die Seite hat keine.
    expect(response.headers()["content-security-policy"]).toContain("'strict-dynamic'");

    await page.goto("/offline.html");
    await expect(page).toHaveTitle("Keine Verbindung · VereinsFlow");
    await expect(page.getByRole("heading", { level: 1, name: "Keine Verbindung" })).toBeVisible();
    await expect(page.getByRole("img", { name: "VereinsFlow" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Erneut versuchen" })).toBeVisible();
    expect(await page.locator("script").count()).toBe(0);
    expect(await violations(page)).toEqual([]);
  });

  test("Digital Asset Links: öffentlich, ohne Weiterleitung, JSON im Format von Google", async ({
    request,
  }) => {
    const response = await get(request, "/.well-known/assetlinks.json");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^application\/json/);
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.vereinsflow.app",
          sha256_cert_fingerprints: [E2E_CERT_SHA256],
        },
      },
    ]);
  });

  test("Sicherheitsrichtlinie erlaubt Service Worker und Manifest nur von der eigenen Adresse", async ({
    request,
  }) => {
    const csp = (await get(request, "/anmelden")).headers()["content-security-policy"]!;
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
    // Unverändert streng:
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("ohne Netz erscheint die Offline-Seite, mit Netz wieder die echte Seite – gespeichert wird nur die Offline-Seite", async ({
    page,
    context,
  }) => {
    await login(page, USERS.admin);
    await registerServiceWorker(page);
    // Navigation Preload aus: sonst lädt der Browser /api/…-Aufrufe (Export, Download), die der Service Worker nicht
    // beantwortet, ein zweites Mal (siehe public/sw.js).
    const preload = await page.evaluate(
      async () =>
        (await (await navigator.serviceWorker.ready).navigationPreload.getState()).enabled,
    );
    expect(preload).toBe(false);

    // Angemeldete Seiten mit Personendaten aufrufen: Sie dürfen nicht in der Ablage landen.
    await page.goto("/mitglieder");
    await expect(page.getByRole("heading", { level: 1, name: "Mitglieder" })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await cachedPaths(page)).toEqual(["/offline.html"]);

    await context.setOffline(true);
    await page.goto("/mitglieder");
    await expect(page).toHaveTitle("Keine Verbindung · VereinsFlow"); // unsere Seite, nicht die Fehlerseite des Browsers
    await expect(page.getByRole("heading", { level: 1, name: "Keine Verbindung" })).toBeVisible();
    await expect(page).toHaveURL(/\/mitglieder$/); // Adresse bleibt – „Erneut versuchen“ lädt genau sie neu
    await expect(page.locator("body")).not.toContainText("@demo-verein.local");

    await context.setOffline(false);
    await page.getByRole("link", { name: "Erneut versuchen" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mitglieder" })).toBeVisible();
    expect(await cachedPaths(page)).toEqual(["/offline.html"]);
  });
});
