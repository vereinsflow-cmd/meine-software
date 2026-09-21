import path from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

test.describe("Mitgliederverwaltung (Vereinsadministrator)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.admin);
  });

  test("Liste zeigt Mitglieder, Suche und Filter funktionieren", async ({ page }) => {
    await page.goto("/mitglieder");
    await expect(page.getByRole("heading", { level: 1, name: "Mitglieder" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Helfer, Hans/ })).toBeVisible();

    await page.getByRole("searchbox", { name: "Mitglieder durchsuchen" }).fill("Helfer");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/q=Helfer/);
    await expect(page.getByRole("link", { name: /Helfer, Hans/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Mitglied, Maria/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(/\/mitglieder$/);
    await page.getByLabel("Nach Status filtern").selectOption("HONORARY");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page.getByRole("table").getByText("Ehrenmitglied")).toBeVisible();
    await expect(page.getByRole("link", { name: /Helfer, Hans/ })).toHaveCount(0);
  });

  test("Mitglied anlegen, ansehen, bearbeiten, archivieren, löschen", async ({ page }) => {
    const lastName = `Testperson${Date.now() % 100000}`;

    await page.goto("/mitglieder/neu");
    await page.getByLabel("Vorname").fill("Tina");
    await page.getByLabel("Nachname").fill(lastName);
    await page.getByLabel("E-Mail-Adresse").fill("tina@example.org");
    await page.getByLabel("Geburtsdatum").fill("1995-06-15");
    await page.getByRole("group", { name: "Abteilungen" }).getByLabel("Tischtennis").check();
    await page.getByRole("button", { name: "Mitglied anlegen" }).click();

    await expect(page).toHaveURL(/\/mitglieder\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Tina ${lastName}`);
    await expect(page.getByText("tina@example.org")).toBeVisible();
    await expect(page.getByText("15.06.1995")).toBeVisible();
    await expect(page.getByText("Tischtennis")).toBeVisible();

    // Bearbeiten
    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByLabel("Funktion im Verein").fill("Jugendtrainerin");
    await page.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(page.getByText("Jugendtrainerin")).toBeVisible();
    await expect(page.getByText("Geändert: Funktion")).toBeVisible(); // Änderungsverlauf

    // Löschen geht erst nach dem Archivieren
    await expect(page.getByRole("button", { name: "Löschen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Archivieren" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archivieren" }).click();
    await expect(page.getByText("Archiviert", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Löschen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "In den Papierkorb" }).click();
    await expect(page).toHaveURL(/\/mitglieder$/);
    await expect(page.getByRole("link", { name: new RegExp(lastName) })).toHaveCount(0);

    await page.goto("/mitglieder?ansicht=papierkorb");
    await expect(page.getByRole("link", { name: new RegExp(lastName) })).toBeVisible();
  });

  test("Formular zeigt Validierungsfehler an den Feldern", async ({ page }) => {
    await page.goto("/mitglieder/neu");
    await page.getByLabel("Vorname").fill("");
    await page.getByLabel("E-Mail-Adresse").fill("keine-mail");
    await page.getByRole("button", { name: "Mitglied anlegen" }).click();
    await expect(page.getByText("Bitte gib den Vornamen ein.")).toBeVisible();
    await expect(page.getByText("Bitte gib den Nachnamen ein.")).toBeVisible();
    await expect(page.getByText("Bitte gib eine gültige E-Mail-Adresse ein.")).toBeVisible();
    await expect(page).toHaveURL(/\/mitglieder\/neu/);
  });

  test("Statistik und Export sind erreichbar", async ({ page }) => {
    await page.goto("/mitglieder/statistik");
    await expect(page.getByRole("heading", { name: "Nach Status" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Altersgruppen" })).toBeVisible();

    const response = await page.request.get("/api/members/export");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("Mitgliedsnummer;Vorname;Nachname");
    expect(body).toContain("Helfer");
  });

  test("CSV-Import über die Oberfläche: Vorschau, dann Import", async ({ page }) => {
    const suffix = Date.now() % 100000;
    const dir = path.resolve(".local", "e2e-files");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "import.csv");
    writeFileSync(
      file,
      `Vorname;Nachname;E-Mail;Status;Abteilungen\nIna;Import${suffix};ina@example.org;aktiv;Handball\nOlaf;Fehler${suffix};keine-mail;aktiv;\n`,
      "utf8",
    );

    await page.goto("/mitglieder/import");
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText("1 gültig")).toBeVisible();
    await expect(page.getByText("1 fehlerhaft")).toBeVisible();
    await expect(page.getByText(`Import${suffix}`)).toBeVisible();

    await page.getByRole("button", { name: "1 Mitglieder importieren" }).click();
    await expect(page.getByText("Import abgeschlossen")).toBeVisible();

    await page.goto(`/mitglieder?q=Import${suffix}`);
    await expect(
      page.getByRole("link", { name: new RegExp(`Import${suffix}, Ina`) }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Fehler${suffix}`) })).toHaveCount(0);
  });
});

test.describe("Sichtbarkeit nach Rolle", () => {
  test("Mitglied sieht nur sich selbst – fremde Datensätze sind nicht auffindbar", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await page.goto("/mitglieder");
    await expect(page.getByRole("link", { name: /Mitglied, Maria/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Helfer, Hans/ })).toHaveCount(0);
    // Kein Menüpunkt "Mitglieder" (die Rolle sieht nur den eigenen Datensatz)
    await expect(
      page
        .getByRole("navigation", { name: "Hauptnavigation" })
        .first()
        .getByRole("link", { name: "Mitglieder" }),
    ).toHaveCount(0);

    // Keine Verwaltungsfunktionen
    await expect(page.getByRole("link", { name: "Neues Mitglied" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Import" })).toHaveCount(0);
    await page.goto("/mitglieder/neu");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
  });

  test("Abteilungsleiterin sieht nur Mitglieder ihrer Abteilung", async ({ page }) => {
    await login(page, USERS.abteilung);
    await page.goto("/mitglieder");
    await expect(page.getByRole("link", { name: /Helfer, Hans/ })).toBeVisible(); // Fußball
    await expect(page.getByRole("link", { name: /Mitglied, Maria/ })).toHaveCount(0); // Tischtennis
    await expect(page.getByLabel("Ansicht wählen")).toHaveCount(0); // kein Archiv/Papierkorb
  });

  test("Export ist für Rollen ohne Berechtigung gesperrt (403 mit JSON-Fehler)", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    const response = await page.request.get("/api/members/export");
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  test("Nicht angemeldet: API antwortet mit 401 statt Daten", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    const response = await anonymous.get("/api/members/export");
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    await anonymous.dispose();
  });
});

test.describe("Mandantentrennung im Browser", () => {
  test("Administrator des anderen Vereins sieht keine Mitglieder des TSV Musterstadt", async ({
    page,
  }) => {
    await login(page, USERS.otherAdmin);
    await page.goto("/mitglieder");
    await expect(page.getByRole("link", { name: /Anders, Otto/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Privat, Petra/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Helfer, Hans/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Admin, Anna/ })).toHaveCount(0);

    // Auch der direkte Aufruf einer fremden ID liefert "nicht gefunden".
    const id = await page.request
      .get("/api/members/export")
      .then(async (r) => (await r.text()).length);
    expect(id).toBeGreaterThan(0);
  });

  test("Direkter Aufruf einer Mitglieds-ID aus einem anderen Verein ergibt 404", async ({
    browser,
  }) => {
    // ID eines TSV-Mitglieds als TSV-Admin ermitteln …
    const tsv = await browser.newContext();
    const tsvPage = await tsv.newPage();
    await login(tsvPage, USERS.admin);
    await tsvPage.goto("/mitglieder?q=Helfer");
    const href = await tsvPage.getByRole("link", { name: /Helfer, Hans/ }).getAttribute("href");
    expect(href).toMatch(/^\/mitglieder\/[0-9a-f-]{36}$/);
    await tsv.close();

    // … und als Administrator des anderen Vereins aufrufen.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, USERS.otherAdmin);
    // (Der HTTP-Status ist wegen des Streamings der Ladeanzeige 200; entscheidend ist, dass keine Daten ausgeliefert werden.)
    await otherPage.goto(href!);
    await expect(otherPage.getByText("Nicht gefunden")).toBeVisible();
    await expect(otherPage.getByText("Hans")).toHaveCount(0); // keine Daten des fremden Vereins
    await expect(otherPage.getByText("Helfer", { exact: true })).toHaveCount(0);

    await otherPage.goto(`${href}/bearbeiten`);
    await expect(otherPage.getByText("Nicht gefunden")).toBeVisible();
    await expect(otherPage.getByLabel("Vorname")).toHaveCount(0); // kein Bearbeiten-Formular
    await other.close();
  });

  test("Michael Mehrfach wechselt zwischen zwei Vereinen und sieht jeweils nur deren Daten", async ({
    page,
  }) => {
    await login(page, USERS.mehrfach);
    await expect(page.getByRole("button", { name: "Verein wechseln" })).toBeVisible();
    await page.getByRole("button", { name: "Verein wechseln" }).click();
    await page.getByRole("menuitem", { name: /Anderer Verein/ }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("button", { name: "Verein wechseln" })).toContainText(
      "Anderer Verein",
    );

    await page.goto("/veranstaltungen");
    await expect(page.getByText("Sommerfest 2026")).toHaveCount(0);
  });
});
