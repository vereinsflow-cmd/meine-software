import { expect, test, type Browser, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

const unique = (prefix: string) => `${prefix} ${Date.now() % 1_000_000}`;

async function as<T>(browser: Browser, email: string, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await login(page, email);
    return await run(page);
  } finally {
    await context.close();
  }
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" }).first();

test.describe("Hilfe & Support – Mitglied", () => {
  test("Menüpunkt, Ansprechpartner und Anleitung sind da; Verwaltungsfunktionen nicht", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await nav(page).getByRole("link", { name: "Hilfe & Support" }).click();
    await expect(page).toHaveURL(/\/hilfe\?von=%2Fdashboard$/); // merkt sich die Seite, von der man kam
    await expect(page.getByRole("heading", { level: 1, name: "Hilfe & Support" })).toBeVisible();

    // Ansprechpartner (aus den Demo-Daten)
    const contacts = page.getByRole("region", { name: "Ansprechpartner" });
    await expect(contacts.getByText("Anna Admin")).toBeVisible();
    await expect(contacts.getByRole("link", { name: "admin@demo-verein.local" })).toHaveAttribute(
      "href",
      "mailto:admin@demo-verein.local",
    );
    await expect(contacts.getByText("Bernd Vorstand")).toBeVisible();
    await expect(contacts.getByRole("link", { name: "01234 567890" })).toHaveAttribute(
      "href",
      "tel:01234567890",
    );

    // Nur für die Verwaltung
    await expect(page.getByRole("button", { name: "Ansprechpartner bearbeiten" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Eingegangene Meldungen/ })).toHaveCount(0);

    // Anleitung: Abschnitte für alle, keine für Vorstand/Verwaltung
    await expect(page.getByRole("heading", { level: 3, name: "Erste Schritte" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Helferschichten" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: /^Für (Vorstand|Verwaltung)/ }),
    ).toHaveCount(0);

    // Frage aufklappen
    await page.getByText("Wie melde ich mich zum ersten Mal an?").click();
    await expect(
      page.getByText("Öffne den Link in der Einladungs-E-Mail deines Vereins."),
    ).toBeVisible();
  });

  test("Suche in der Anleitung: findet, klappt Treffer auf und meldet, wenn nichts passt", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await open(page, "/hilfe");
    const search = page.getByLabel("Anleitung durchsuchen");

    await search.fill("Warteliste");
    await expect(page.getByRole("status").filter({ hasText: /Frage gefunden/ })).toBeVisible();
    await expect(page.getByText("Wie sage ich für eine Veranstaltung zu oder ab?")).toBeVisible();
    await expect(page.getByText("Klicke auf „Zusagen“ oder „Absagen“.")).toBeVisible(); // Treffer sind aufgeklappt
    await expect(page.getByText("Wie melde ich mich zum ersten Mal an?")).toHaveCount(0);

    // mehrere Wörter, Umlaute egal
    await search.fill("schicht eintragen");
    await expect(
      page.getByText("Wie trage ich mich als Helfer in eine Schicht ein?"),
    ).toBeVisible();
    await search.fill("zuruecksetzen"); // Schreibweise ohne Umlaut findet „zurücksetzen“
    await expect(page.getByText("Ich habe mein Passwort vergessen – was tun?")).toBeVisible();

    await search.fill("qwertzuiop-gibt-es-nicht");
    await expect(
      page.getByRole("status").filter({ hasText: "Keine passende Frage gefunden." }),
    ).toBeVisible();
    await expect(page.getByText(/Dazu gibt es noch keine Antwort/)).toBeVisible();

    await search.fill("");
    await expect(page.getByText("Wie melde ich mich zum ersten Mal an?")).toBeVisible();
  });

  test("Ein Sprung auf einen Anker öffnet die passende Frage", async ({ page }) => {
    await login(page, USERS.mitglied);
    await open(page, "/hilfe#faq-passwort-vergessen");
    await expect(
      page.getByText("Klicke auf der Anmeldeseite auf „Passwort vergessen?“."),
    ).toBeVisible();
  });

  test("Die Seite, von der man kam, wird nur übernommen, wenn sie zur Anwendung gehört", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);

    // Über die Seitenleiste von einer anderen Seite aus
    await open(page, "/kalender");
    await nav(page).getByRole("link", { name: "Hilfe & Support" }).click();
    await expect(page).toHaveURL(/von=%2Fkalender/);
    await page.getByRole("button", { name: "Problem melden" }).click();
    await expect(page.getByRole("dialog").getByText("/kalender")).toBeVisible();

    // Fremde Adressen werden verworfen
    for (const bad of ["https://boese.example", "//boese.example", "javascript:alert(1)"]) {
      await open(page, `/hilfe?von=${encodeURIComponent(bad)}`);
      await page.getByRole("button", { name: "Problem melden" }).click();
      await expect(page.getByRole("dialog", { name: "Problem melden" })).toBeVisible();
      await expect(page.getByRole("dialog").getByText(/Betroffene Seite/)).toHaveCount(0);
    }
  });
});

test.describe("Hilfe & Support – Problem melden und bearbeiten", () => {
  test("Meldung senden, Verwaltung wird benachrichtigt, bearbeitet und antwortet – die Person sieht die Antwort", async ({
    page,
    browser,
  }) => {
    const subject = unique("E2E Problem");
    const answer = "Wir kümmern uns darum – danke für den Hinweis!";
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    // --- Mitglied meldet ---------------------------------------------------------------------
    await login(page, USERS.mitglied);
    await open(page, "/hilfe?von=/helferplanung");
    await page.getByRole("button", { name: "Problem melden" }).click();
    const dialog = page.getByRole("dialog", { name: "Problem melden" });
    await expect(dialog.getByText("/helferplanung")).toBeVisible();

    await dialog.getByRole("button", { name: "Meldung senden" }).click(); // leer → Fehler an den Feldern
    await expect(
      dialog.getByText("Bitte fasse dein Anliegen in einer kurzen Überschrift zusammen."),
    ).toBeVisible();
    await expect(
      dialog.getByText("Bitte beschreibe genauer, was passiert ist oder was du wissen möchtest."),
    ).toBeVisible();

    await dialog.getByLabel(/^Worum geht es/).selectOption({ label: "Frage" });
    await dialog.getByLabel(/^Kurze Überschrift/).fill(subject);
    await dialog
      .getByLabel(/^Beschreibung/)
      .fill("Ich komme nicht weiter.\n<img src=x onerror=alert(1)> Das Bild fehlt.");
    await dialog.getByRole("button", { name: "Meldung senden" }).click();
    await expect(
      page.getByText("Danke! Deine Meldung wurde an die Vereinsverwaltung gesendet."),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);

    const mine = page.getByRole("region", { name: "Meine Meldungen" });
    const card = mine.getByRole("listitem", { name: `Meldung ${subject}` });
    await expect(card).toContainText("Neu");
    await expect(card).toContainText("Frage");
    await expect(card.getByText("<img src=x onerror=alert(1)>", { exact: false })).toBeVisible(); // als Text, nicht als Bild
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    expect(dialogs).toEqual([]);

    // --- Verwaltung: Benachrichtigung, Liste, Bearbeitung ---------------------------------------------
    await as(browser, USERS.admin, async (admin) => {
      await open(admin, "/benachrichtigungen");
      await expect(admin.getByText(`Neue Meldung: ${subject}`)).toBeVisible();

      await open(admin, "/hilfe");
      await admin.getByRole("link", { name: /Eingegangene Meldungen/ }).click();
      await expect(admin).toHaveURL(/\/hilfe\/meldungen$/);
      await expect(
        admin.getByRole("heading", { level: 1, name: "Eingegangene Meldungen" }),
      ).toBeVisible();

      const ticket = admin.getByRole("listitem", { name: `Meldung ${subject}` });
      await expect(ticket).toContainText("Von Maria Mitglied");
      await expect(ticket.getByRole("link", { name: "mitglied@demo-verein.local" })).toBeVisible();
      await expect(ticket.getByRole("link", { name: "/helferplanung" })).toBeVisible();
      await expect(ticket).toContainText("Neu");

      await ticket.getByLabel("Status").selectOption({ label: "In Bearbeitung" });
      await ticket.getByLabel(/^Antwort an die meldende Person/).fill(answer);
      await ticket.getByRole("button", { name: "Speichern" }).click();
      await expect(admin.getByText("Meldung gespeichert.")).toBeVisible();
      await expect(ticket).toContainText("In Bearbeitung");
    });

    // --- Mitglied sieht Antwort und Benachrichtigung -----------------------------------------------
    await open(page, "/hilfe");
    const updated = page
      .getByRole("region", { name: "Meine Meldungen" })
      .getByRole("listitem", { name: `Meldung ${subject}` });
    await expect(updated).toContainText("In Bearbeitung");
    await expect(updated).toContainText(answer);
    await open(page, "/benachrichtigungen");
    await expect(page.getByText(`Deine Meldung „${subject}“: In Bearbeitung`)).toBeVisible();

    // --- Erledigt: aus „Offen“ verschwunden, unter „Erledigt“ zu finden -------------------------------
    await as(browser, USERS.admin, async (admin) => {
      await open(admin, "/hilfe/meldungen");
      const ticket = admin.getByRole("listitem", { name: `Meldung ${subject}` });
      await ticket.getByLabel("Status").selectOption({ label: "Erledigt" });
      await ticket.getByRole("button", { name: "Speichern" }).click();
      await expect(admin.getByText("Meldung gespeichert.")).toBeVisible();

      await open(admin, "/hilfe/meldungen");
      await expect(admin.getByRole("listitem", { name: `Meldung ${subject}` })).toHaveCount(0);
      await admin
        .getByRole("navigation", { name: "Ansicht wählen" })
        .getByRole("link", { name: "Erledigt" })
        .click();
      await expect(admin).toHaveURL(/ansicht=erledigt/);
      await expect(admin.getByRole("listitem", { name: `Meldung ${subject}` })).toContainText(
        "Erledigt",
      );
    });
  });

  test("Zugriff: nur die Vereinsverwaltung sieht Meldungen; ein anderer Verein sieht keine des TSV", async ({
    page,
    browser,
  }) => {
    for (const email of [USERS.mitglied, USERS.helfer, USERS.vorstand]) {
      await login(page, email);
      await open(page, "/hilfe/meldungen");
      await expect(page.getByText("Kein Zugriff")).toBeVisible();
      await expect(page.getByLabel("Status")).toHaveCount(0);
      await page.context().clearCookies();
    }

    await as(browser, USERS.otherAdmin, async (other) => {
      await open(other, "/hilfe/meldungen");
      await expect(other.getByText("Keine offenen Meldungen")).toBeVisible();
      await expect(other.getByText("Wie ändere ich meine E-Mail-Adresse?")).toHaveCount(0);
      await open(other, "/hilfe");
      await expect(other.getByText(/noch keine Ansprechpartner hinterlegt/)).toBeVisible(); // andere Ansprechpartner als beim TSV
      await expect(other.getByText("Anna Admin")).toHaveCount(0);
    });
  });

  test("Die Anleitung zeigt jeder Rolle nur passende Abschnitte", async ({ page, browser }) => {
    await login(page, USERS.vorstand);
    await open(page, "/hilfe");
    await expect(
      page.getByRole("heading", { level: 3, name: "Für Vorstand: Mitglieder" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Für Vorstand: Helferplanung" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Für Verwaltung: Verein und Protokoll" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ansprechpartner bearbeiten" })).toHaveCount(0);

    await as(browser, USERS.admin, async (admin) => {
      await open(admin, "/hilfe");
      for (const title of [
        "Für Vorstand: Mitglieder",
        "Für Verwaltung: Benutzer und Rollen",
        "Für Verwaltung: Verein und Protokoll",
      ]) {
        await expect(admin.getByRole("heading", { level: 3, name: title })).toBeVisible();
      }
    });
  });
});

test.describe("Hilfe & Support – Ansprechpartner pflegen", () => {
  test("Verwaltung fügt einen Ansprechpartner hinzu (mit Prüfung), alle sehen ihn – und entfernt ihn wieder", async ({
    page,
    browser,
  }) => {
    const name = unique("Testperson");
    await login(page, USERS.admin);
    await open(page, "/hilfe");
    const contacts = page.getByRole("region", { name: "Ansprechpartner" });

    await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).click();
    const dialog = page.getByRole("dialog", { name: "Ansprechpartner bearbeiten" });
    await dialog.getByRole("button", { name: "Ansprechpartner hinzufügen" }).click();
    await dialog.getByLabel(/^Name \(Ansprechpartner 3\)/).fill(name);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(
      dialog.getByText("Bitte gib eine E-Mail-Adresse oder eine Telefonnummer an."),
    ).toBeVisible();

    await dialog.getByLabel(/^Zuständigkeit \(Ansprechpartner 3\)/).fill("Testfragen");
    await dialog.getByLabel(/^E-Mail \(Ansprechpartner 3\)/).fill("test.person@demo-verein.local");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Ansprechpartner gespeichert.")).toBeVisible();
    await expect(contacts.getByText(name)).toBeVisible();
    await expect(contacts.getByText("Testfragen")).toBeVisible();

    // Ein Mitglied sieht ihn ebenfalls
    await as(browser, USERS.mitglied, async (member) => {
      await open(member, "/hilfe");
      await expect(
        member.getByRole("region", { name: "Ansprechpartner" }).getByText(name),
      ).toBeVisible();
    });

    // Wieder entfernen (die übrigen Ansprechpartner bleiben)
    await open(page, "/hilfe");
    await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Ansprechpartner 3 entfernen" })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Ansprechpartner gespeichert.")).toBeVisible();
    await expect(contacts.getByText(name)).toHaveCount(0);
    await expect(contacts.getByText("Anna Admin")).toBeVisible();
  });
});
