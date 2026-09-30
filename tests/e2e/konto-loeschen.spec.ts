import { expect, test } from "@playwright/test";
import { USERS, followLink, login, open } from "./helpers";

/**
 * Öffentliche Anleitung zur Kontolöschung (`/konto-loeschen`). Google Play verlangt für Apps mit Benutzerkonten eine Seite, die
 * ohne Anmeldung erklärt, wie man Konto und Daten löscht; ihre Adresse steht in der Play Console. Geprüft: erreichbar ohne
 * Anmeldung und ohne Weiterleitung, nennt App und Entwickler, enthält keine Vereins- oder Personendaten und ist von Anmeldung,
 * Rechtstexten und „Datenschutz“ in der Anwendung aus verlinkt. Die Support-Adresse kommt aus SUPPORT_EMAIL (im E2E-Server
 * gesetzt, siehe playwright.config.ts). Barrierefreiheit: a11y.spec.ts, Smartphone: konto-loeschen.mobil.spec.ts.
 */
const SUPPORT_EMAIL = "support@vereinsflow.test";

test.describe("Konto löschen – öffentliche Seite", () => {
  test("ohne Anmeldung erreichbar, ohne Weiterleitung, mit App, Entwickler und allen Abschnitten", async ({
    page,
    request,
  }) => {
    const response = await request.get("/konto-loeschen", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^text\/html/);
    // Gleiche strenge Richtlinie wie jede Seite (aus dem Proxy)
    expect(response.headers()["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );

    await page.goto("/konto-loeschen");
    await expect(page).toHaveURL(/\/konto-loeschen$/);
    await expect(page).toHaveTitle("Konto löschen · VereinsFlow");
    await expect(page.getByRole("heading", { level: 1, name: "Konto löschen" })).toBeVisible();

    // App und Entwickler – so, wie sie im Store-Eintrag stehen
    const facts = page.getByRole("main").locator("dl");
    await expect(facts.locator("div").filter({ hasText: "Entwickler" }).locator("dd")).toHaveText(
      "VereinsFlow",
    );
    await expect(facts.locator("div").filter({ hasText: /^App/ }).locator("dd")).toHaveText(
      "VereinsFlow – Android-App, Web-App auf dem iPhone und im Browser (localhost:3100)",
    );

    for (const name of [
      "1. Konto in der App löschen (Android und iPhone)",
      "2. Konto im Browser löschen",
      "3. Bedenkzeit von 14 Tagen und Antrag zurückziehen",
      "4. Was gelöscht wird",
      "5. Was erhalten bleibt – und warum",
      "6. Kein Zugang mehr zum Konto?",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
    }
    // Die Schritte nennen die Beschriftungen der Anwendung
    const main = page.getByRole("main");
    for (const label of [
      "„Konto löschen …“",
      "„Löschung beantragen“",
      "„Antrag zurückziehen“",
      "„Gelöschtes Mitglied“",
    ]) {
      await expect(main).toContainText(label);
    }

    // Ohne Zugang: Verein oder Support des Betreibers (SUPPORT_EMAIL)
    await expect(main.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`,
    );
    // Keine Vereins- oder Personendaten auf der öffentlichen Seite
    await expect(page.locator("body")).not.toContainText("@demo-verein.local");
    await expect(page.locator("body")).not.toContainText("TSV Musterstadt");
  });

  test("Links der Seite: „Datenschutz“ führt über die Anmeldung dorthin, „Passwort vergessen“ ist öffentlich", async ({
    page,
  }) => {
    const main = page.getByRole("main");
    await open(page, "/konto-loeschen");
    await followLink(
      page,
      main.getByRole("link", { name: "Datenschutz", exact: true }),
      /\/anmelden\?next=%2Fdatenschutz$/,
    );

    await open(page, "/konto-loeschen");
    await followLink(
      page,
      main.getByRole("link", { name: "Passwort vergessen" }),
      /\/passwort-vergessen$/,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("verlinkt von Anmeldung, Impressum, Datenschutzerklärung und „Datenschutz“ in der Anwendung", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { level: 1, name: "Konto löschen" });
    const target = /\/konto-loeschen$/;

    // Anmeldeseite: Fußzeile neben Impressum und Datenschutz
    await open(page, "/anmelden");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link")).toHaveText([
      "Impressum",
      "Datenschutz",
      "Konto löschen",
    ]);
    await followLink(page, footer.getByRole("link", { name: "Konto löschen" }), target);
    await expect(heading).toBeVisible();

    // Rechtstexte: in der Fußzeile, in der Datenschutzerklärung zusätzlich bei „Ihre Rechte“
    await open(page, "/impressum");
    await expect(footer.getByRole("link")).toHaveText([
      "Impressum",
      "Datenschutzerklärung",
      "Konto löschen",
    ]);
    await open(page, "/datenschutzerklaerung");
    await expect(footer.getByRole("link", { name: "Konto löschen" })).toHaveAttribute(
      "href",
      "/konto-loeschen",
    );
    await followLink(
      page,
      page.getByRole("main").getByRole("link", { name: "Konto löschen" }),
      target,
    );
    await expect(heading).toBeVisible();

    // In der Anwendung: „Datenschutz“, Abschnitt „Konto und Daten löschen“ – die Seite bleibt auch angemeldet erreichbar
    await login(page, USERS.mitglied);
    await open(page, "/datenschutz");
    await followLink(
      page,
      page
        .getByRole("region", { name: "Konto und Daten löschen" })
        .getByRole("link", { name: "Konto löschen" }),
      target,
    );
    await expect(heading).toBeVisible();
  });
});
