import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "../e2e/helpers";

/**
 * Rauchtest gegen den Produktions-Build (siehe playwright.prod.config.ts). Er fängt Fehler, die der Dev-Server verdeckt:
 * Skripte oder Stile, die von der strengen Content-Security-Policy blockiert werden, fehlerhafte Cookies unter `__Host-`,
 * Sicherheits-Header und die Startprüfung der Konfiguration.
 */
interface Findings {
  /** Verletzungen der Content-Security-Policy (Richtlinie und blockierte Adresse). */
  csp: string[];
  /** Skriptfehler und Fehlermeldungen der Browser-Konsole. */
  errors: string[];
  /** Fehlgeschlagene Anfragen (ohne bewusst abgebrochene). */
  failed: string[];
}

type WithCsp = { __csp?: string[] };

/** Beobachtet alles, was im Browser schiefgeht. Muss vor dem ersten `goto` aufgerufen werden. */
async function watch(page: Page): Promise<Findings> {
  const findings: Findings = { csp: [], errors: [], failed: [] };
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const list = ((window as unknown as WithCsp).__csp ??= []);
      list.push(
        `${event.violatedDirective}: ${event.blockedURI || "inline"} ${(event.sample ?? "").slice(0, 70)}`,
      );
    });
  });
  page.on("pageerror", (error) => findings.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") findings.errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "";
    if (!/ERR_ABORTED/.test(reason)) findings.failed.push(`${request.url()} – ${reason}`);
  });
  return findings;
}

async function collectCsp(page: Page, findings: Findings): Promise<void> {
  findings.csp.push(...(await page.evaluate(() => (window as unknown as WithCsp).__csp ?? [])));
}

const PAGES = [
  "/dashboard",
  "/mitglieder",
  "/mitglieder/statistik",
  "/veranstaltungen",
  "/helferplanung",
  "/kalender",
  "/aufgaben",
  "/nachrichten",
  "/nachrichten/neu",
  "/dokumente",
  "/abteilungen",
  "/benutzer",
  "/einstellungen",
  "/protokoll",
  "/finanzen",
  "/hilfe",
  "/hilfe/meldungen",
  "/profil",
  "/datenschutz",
  "/benachrichtigungen",
];

test.describe("Produktions-Build", () => {
  test("alle Hauptseiten laden ohne Verstöße gegen die Sicherheitsrichtlinie, Skriptfehler und fehlgeschlagene Anfragen", async ({
    page,
  }) => {
    const findings = await watch(page);
    await login(page, USERS.admin);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first(), path).toBeVisible();
      await page.waitForLoadState("networkidle");
      await collectCsp(page, findings);
    }
    expect(findings.csp, "Verstöße gegen die Content-Security-Policy").toEqual([]);
    expect(findings.errors, "Skriptfehler / Konsolenfehler").toEqual([]);
    expect(findings.failed, "fehlgeschlagene Anfragen").toEqual([]);
  });

  test("Stile sind geladen, Dialoge und Meldungen funktionieren unter der strengen Richtlinie", async ({
    page,
  }) => {
    const findings = await watch(page);
    await login(page, USERS.admin);
    await page.goto("/dokumente");
    await page.waitForLoadState("networkidle");

    // Die Seite ist gestaltet (nicht nur reines HTML): die Hauptschaltfläche hat eine Hintergrundfarbe.
    const upload = page.getByRole("button", { name: "Dokument hochladen" });
    await expect(upload).toBeVisible();
    expect(await upload.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );

    // Dialog öffnen, Datei hochladen (Formular-Upload im Produktionsbetrieb) → Meldung erscheint.
    await upload.click();
    const dialog = page.getByRole("dialog", { name: "Dokument hochladen" });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const name = `Rauchtest-${Date.now() % 100000}.txt`;
    await dialog
      .getByLabel(/^Datei/)
      .setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("Rauchtest") });
    await dialog.getByRole("button", { name: "Hochladen", exact: true }).click();
    const toast = page.getByText("Dokument hochgeladen.");
    await expect(toast).toBeVisible();

    // Die Meldung ist gestaltet: Sonner setzt seine Stile per eingefügtem <style> – sie dürfen nicht blockiert werden.
    const toaster = page.locator("[data-sonner-toaster]");
    expect(await toaster.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");

    // Aufräumen: Dokument wieder löschen.
    await page.getByRole("button", { name: `${name} löschen` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
    await expect(page.getByText("Dokument gelöscht.")).toBeVisible();

    // Darstellung wechseln: next-themes arbeitet mit einem Inline-Skript (Nonce) und dem Attribut "class" am <html>.
    await page.getByRole("button", { name: /Benutzermenü/ }).click();
    await page.getByRole("menuitemradio", { name: "Dunkel" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/); // bleibt nach dem Neuladen erhalten (lokal gespeichert)
    await collectCsp(page, findings);
    expect(findings.csp, "Verstöße gegen die Content-Security-Policy").toEqual([]);
    expect(findings.errors, "Konsolenfehler").toEqual([]);
  });

  test("Sicherheitsmerkmale: Header mit frischem Nonce je Anfrage, Cookie mit __Host-Präfix, keine Technologie-Hinweise", async ({
    page,
    request,
  }) => {
    const first = await request.get("/anmelden");
    const second = await request.get("/anmelden");
    const headers = first.headers();

    expect(headers["strict-transport-security"]).toMatch(/max-age=\d+; includeSubDomains/);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();
    const csp = headers["content-security-policy"]!;
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    const nonce = (headers: Record<string, string>) =>
      /'nonce-([^']+)'/.exec(headers["content-security-policy"]!)![1];
    expect(nonce(headers)).not.toBe(nonce(second.headers())); // frischer Nonce bei jeder Anfrage

    await login(page, USERS.mitglied);
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "__Host-vf_session");
    expect(session, "Sitzungs-Cookie mit __Host-Präfix").toBeDefined();
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(await page.evaluate(() => document.cookie)).not.toContain("vf_session");
  });

  test("Fehlerseiten und Schnittstellen verraten nichts über den Aufbau", async ({
    page,
    request,
  }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const denied = await request.get("/api/members/export");
    expect(denied.status()).toBe(401);
    const body = await denied.text();
    expect(body).not.toMatch(/at .*\.(js|ts):\d+|node_modules|prisma|stack/i);

    await login(page, USERS.mitglied);
    await page.goto("/veranstaltungen/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Nicht gefunden")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Error:|at .*:\d+:\d+|prisma/i);
  });
});
