import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, USERS, login, open } from "./helpers";

test.describe("Datenschutz – Seite und Einwilligungen", () => {
  test("Abschnitte sind vorhanden und für Mitglieder ohne Verwaltungsbereich", async ({ page }) => {
    await login(page, USERS.mitglied);
    await open(page, "/datenschutz");
    await expect(page.getByRole("heading", { level: 1, name: "Datenschutz" })).toBeVisible();
    for (const name of [
      "Wer ist verantwortlich?",
      "Welche Daten sind gespeichert?",
      "Meine Einwilligungen",
      "Meine Daten herunterladen",
      "Konto und Daten löschen",
    ]) {
      await expect(page.getByRole("region", { name })).toBeVisible();
    }
    await expect(
      page.getByRole("region", { name: "Offene Löschanträge in deinem Verein" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Wer ist verantwortlich?" })
        .getByText("TSV Musterstadt 1898 e.V."),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Welche Daten sind gespeichert?" })
        .getByText(/im Papierkorb und werden dann anonymisiert/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Meine Mitgliedsdaten ansehen" })).toHaveAttribute(
      "href",
      /\/mitglieder\/[0-9a-f-]{36}$/,
    );
    await expect(page.getByRole("link", { name: "Datenschutzerklärung" })).toBeVisible();
  });

  test("Einwilligung selbst erteilen und widerrufen – bleibt nach dem Neuladen erhalten", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await open(page, "/datenschutz");
    const consents = page.getByRole("region", { name: "Meine Einwilligungen" });
    const newsletter = consents.getByRole("switch", {
      name: "Vereinsinformationen und Newsletter per E-Mail",
    });

    // Ausgangszustand herstellen (unabhängig von früheren Läufen)
    if (await newsletter.isChecked()) {
      await newsletter.click();
      await expect(page.getByText("Einwilligung widerrufen.")).toBeVisible();
    }
    await newsletter.click();
    await expect(page.getByText("Einwilligung erteilt.")).toBeVisible();
    await page.reload();
    await expect(
      consents.getByRole("switch", { name: "Vereinsinformationen und Newsletter per E-Mail" }),
    ).toBeChecked();
    await expect(consents.getByText(/Erteilt am \d{2}\.\d{2}\.\d{4} \(online\)/)).toBeVisible();

    await consents
      .getByRole("switch", { name: "Vereinsinformationen und Newsletter per E-Mail" })
      .click();
    await expect(page.getByText("Einwilligung widerrufen.").last()).toBeVisible();
    await page.reload();
    await expect(
      consents.getByRole("switch", { name: "Vereinsinformationen und Newsletter per E-Mail" }),
    ).not.toBeChecked();

    // Verbindliche Einwilligungen sind nicht per Schalter änderbar.
    await expect(consents.getByRole("switch")).toHaveCount(2);
  });

  test("Die Verwaltung sieht die Einwilligung im Verlauf des Mitglieds", async ({
    page,
    browser,
  }) => {
    await login(page, USERS.mitglied);
    await open(page, "/datenschutz");
    const photos = page
      .getByRole("region", { name: "Meine Einwilligungen" })
      .getByRole("switch", { name: "Veröffentlichung von Fotos" });
    if (!(await photos.isChecked())) {
      await photos.click();
      await expect(page.getByText("Einwilligung erteilt.")).toBeVisible();
    }
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await login(adminPage, USERS.admin);
    await adminPage.goto("/mitglieder?q=Maria");
    await adminPage.getByRole("link", { name: /Mitglied, Maria/ }).click();
    await expect(adminPage.getByText(/Veröffentlichung von Fotos/).first()).toBeVisible();
    await expect(adminPage.getByText(/Erteilt am \d{2}\.\d{2}\.\d{4} \(online\)/)).toBeVisible();
    await admin.close();
    await photos.click(); // Aufräumen
    await expect(page.getByText("Einwilligung widerrufen.")).toBeVisible();
  });
});

test.describe("Datenschutz – Datenexport", () => {
  test("Export enthält die eigenen Daten, aber nichts über andere und keine Geheimnisse", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    const response = await page.request.get("/api/privacy/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["content-disposition"]).toMatch(
      /attachment; filename="vereinsflow-datenexport-\d{4}-\d{2}-\d{2}\.json"/,
    );
    expect(response.headers()["cache-control"]).toBe("no-store");

    const text = await response.text();
    const data = JSON.parse(text);
    expect(data).toMatchObject({
      format: "VereinsFlow-Datenexport",
      konto: { email: USERS.mitglied, vorname: "Maria", nachname: "Mitglied" },
    });
    expect(data.vereine[0]).toMatchObject({
      verein: "TSV Musterstadt 1898 e.V.",
      rolle: "Mitglied",
    });
    expect(
      data.vereine[0].mitglied.helferschichten.map((s: { schicht: string }) => s.schicht),
    ).toContain("Kuchenbuffet");

    for (const foreign of [
      USERS.helfer,
      USERS.admin,
      USERS.otherAdmin,
      "Hans",
      "argon2",
      "passwordHash",
      "tokenHash",
    ]) {
      expect(text, foreign).not.toContain(foreign);
    }
  });

  test("Die Seite bietet den Download an; ohne Anmeldung gibt es nichts", async ({
    page,
    playwright,
  }) => {
    await login(page, USERS.helfer);
    await open(page, "/datenschutz");
    await expect(page.getByRole("link", { name: "Daten herunterladen (JSON)" })).toHaveAttribute(
      "href",
      "/api/privacy/export",
    );

    const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    const response = await anonymous.get("/api/privacy/export");
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    await anonymous.dispose();
  });
});

test.describe("Datenschutz – Löschantrag", () => {
  test("Antrag stellen (mit Passwort), Verantwortliche sehen ihn, Antrag zurückziehen", async ({
    page,
    browser,
  }) => {
    await login(page, USERS.mitglied);
    await open(page, "/datenschutz");
    await page.getByRole("button", { name: "Konto löschen …" }).click();
    const dialog = page.getByRole("dialog", { name: "Konto und Daten löschen?" });

    // Ohne Bestätigung und mit falschem Passwort passiert nichts.
    await dialog.getByRole("button", { name: "Löschung beantragen" }).click();
    await expect(dialog.getByText("Bitte gib zur Bestätigung dein Passwort ein.")).toBeVisible();
    await expect(
      dialog.getByText("Bitte bestätige, dass du die Folgen verstanden hast."),
    ).toBeVisible();
    await dialog.getByLabel("Passwort").fill("falsches-Passwort-123");
    await dialog.getByLabel(/Ich habe verstanden/).check();
    await dialog.getByRole("button", { name: "Löschung beantragen" }).click();
    await expect(dialog.getByText("Das Passwort ist nicht korrekt.")).toBeVisible();

    // Richtiges Passwort → Antrag ist gestellt.
    await dialog.getByLabel("Passwort").fill(DEMO_PASSWORD);
    await dialog.getByLabel("Grund (freiwillig)").fill("Test im automatisierten Lauf");
    await dialog.getByRole("button", { name: "Löschung beantragen" }).click();
    await expect(page.getByText("Dein Löschantrag wurde gestellt.")).toBeVisible();
    const alert = page.getByRole("alert").filter({ hasText: "Löschung beantragt" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(
      /werden am \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} Uhr automatisch gelöscht/,
    );
    await expect(page.getByRole("button", { name: "Konto löschen …" })).toHaveCount(0);

    // Die Verwaltung sieht den offenen Antrag (und wurde benachrichtigt).
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await login(adminPage, USERS.admin);
    await adminPage.goto("/datenschutz");
    const requests = adminPage.getByRole("region", {
      name: "Offene Löschanträge in deinem Verein",
    });
    await expect(requests.getByText("Maria Mitglied")).toBeVisible();
    await adminPage.goto("/benachrichtigungen");
    await expect(adminPage.getByText("Löschantrag: Maria Mitglied")).toBeVisible();
    await admin.close();

    // Zurückziehen
    await alert.getByRole("button", { name: "Antrag zurückziehen" }).click();
    await expect(page.getByText("Der Löschantrag wurde zurückgezogen.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Konto löschen …" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Löschung beantragt" })).toHaveCount(0);
  });
});
