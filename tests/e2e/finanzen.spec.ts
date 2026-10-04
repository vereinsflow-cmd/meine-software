import { expect, test, type Page } from "@playwright/test";
import { USERS, login, open, openNavGroup } from "./helpers";

/**
 * Finanzen im Browser: Der Vorstand (Kassenwart) öffnet den Bereich, richtet das Kassenbuch ein, bucht, storniert und
 * korrigiert. Mitglieder und Helfer haben keinen Zugang. Die E2E-Datenbank wird je Lauf neu aufgebaut – das Kassenbuch
 * ist dort anfangs nicht eingerichtet; der erste Test richtet es ein, die folgenden nutzen es (Tests laufen nacheinander).
 */

async function ensureLedger(page: Page): Promise<void> {
  await open(page, "/finanzen/kassenbuch");
  const setup = page.getByRole("button", { name: "Kassenbuch einrichten" });
  if (await setup.isVisible()) {
    await page.getByLabel("Bank").fill("Sparkasse Musterstadt");
    await page.getByLabel("Anfangsbestand in €").first().fill("11.200,00");
    await page.getByLabel("Anfangsbestand in €").nth(1).fill("239,80");
    await setup.click();
  }
  await expect(page.getByRole("button", { name: "Neue Buchung" })).toBeVisible({ timeout: 20_000 });
}

async function book(
  page: Page,
  entry: {
    kind: "Einnahme" | "Ausgabe";
    amount: string;
    description: string;
    category: string;
    account?: string;
  },
): Promise<void> {
  await page.getByRole("button", { name: "Neue Buchung" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Buchung" });
  await dialog.getByText(entry.kind, { exact: true }).click();
  await dialog.getByLabel("Betrag in €").fill(entry.amount);
  if (entry.account) await dialog.getByLabel("Konto").selectOption({ label: entry.account });
  await dialog.getByLabel("Beschreibung").fill(entry.description);
  await dialog.getByLabel("Kategorie").selectOption({ label: entry.category });
  await dialog
    .getByRole("button", { name: entry.kind === "Einnahme" ? "Einnahme buchen" : "Ausgabe buchen" })
    .click();
  await expect(dialog).toHaveCount(0);
}

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

test.describe("Finanzen – Kassenwart", () => {
  test("Vorstand findet die Finanzen unter „Organisation“; die Übersicht zeigt die offenen Rechnungen", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).first();
    await openNavGroup(nav, "Organisation");
    await nav.getByRole("link", { name: "Finanzen" }).click();
    await expect(page).toHaveURL(/\/finanzen$/);
    await expect(page.getByRole("heading", { level: 1, name: "Finanzen" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Bereiche der Finanzen" })).toBeVisible();
    // Seed: zwei offene Rechnungen (349,50 € und 1.200,00 €, eine davon überfällig).
    const kennzahlen = page.getByRole("region", { name: "Kennzahlen" });
    await expect(kennzahlen).toContainText("Offene Rechnungen");
    await expect(kennzahlen).toContainText("1.549,50 €");
    await expect(kennzahlen).toContainText("davon 1 überfällig");
    await expect(page.getByRole("heading", { name: "Das steht an" })).toBeVisible();
    await expect(
      page.getByText(/seit \d+ Tagen überfällig|seit gestern überfällig/).first(),
    ).toBeVisible();
  });

  test("Rechnungen: offen und bezahlt, „Bezahlt“ mit Rückgängig", async ({ page }) => {
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/rechnungen");
    await expect(page.getByRole("button", { name: "Rechnung hochladen" })).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(3); // Kopf + zwei offene
    await page.getByRole("link", { name: "Bezahlt", exact: true }).click();
    await expect(page).toHaveURL(/stand=bezahlt/);
    await expect(
      page
        .getByRole("table")
        .getByRole("cell", { name: /bezahlt am/ })
        .first(),
    ).toBeVisible();
  });

  test("Kassenbuch: einrichten, Einnahme und Ausgabe buchen, Kontostand, Storno", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    await ensureLedger(page);
    const strip = page.getByRole("region", { name: "Kontostände" });
    await expect(strip).toContainText("Girokonto");
    await expect(strip).toContainText("Barkasse");

    await book(page, {
      kind: "Ausgabe",
      amount: "42,90",
      description: "E2E Markierungsfarbe",
      category: "Sportmaterial",
      account: "Barkasse",
    });
    await expect(row(page, "E2E Markierungsfarbe")).toContainText("−42,90 €");
    await book(page, {
      kind: "Einnahme",
      amount: "86,00",
      description: "E2E Getränkeverkauf",
      category: "Verkauf Speisen und Getränke",
      account: "Barkasse",
    });
    await expect(row(page, "E2E Getränkeverkauf")).toContainText("+86,00 €");

    // Stornieren über „⋯“: die Buchung bleibt sichtbar, das Storno verweist auf sie.
    await row(page, "E2E Getränkeverkauf")
      .first()
      .getByRole("button", { name: /Weitere Aktionen/ })
      .click();
    await page.getByRole("menuitem", { name: "Stornieren" }).click();
    const confirm = page.getByRole("dialog", { name: /stornieren\?/ });
    await confirm.getByRole("button", { name: "Stornieren" }).click();
    await expect(confirm.getByRole("alert")).toContainText("Grund");
    await confirm.getByLabel("Grund").fill("Testbuchung");
    await confirm.getByRole("button", { name: "Stornieren" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(row(page, "E2E Getränkeverkauf").first()).toContainText(
      /storniert durch Nr\. \d{4}-\d{4}/,
    );
    await expect(row(page, "Storno zu Nr.").first()).toContainText("−86,00 €");
  });

  test("Barkasse kann nicht ins Minus – mit verständlicher Meldung", async ({ page }) => {
    await login(page, USERS.vorstand);
    await ensureLedger(page);
    await page.getByRole("button", { name: "Neue Buchung" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Buchung" });
    await dialog.getByLabel("Betrag in €").fill("99.999,00");
    await dialog.getByLabel("Konto").selectOption({ label: "Barkasse" });
    await dialog.getByLabel("Beschreibung").fill("Viel zu viel");
    await dialog.getByLabel("Kategorie").selectOption({ label: "Sportmaterial" });
    await dialog.getByRole("button", { name: "Ausgabe buchen" }).click();
    await expect(dialog.getByText(/Barkasse wäre am \d{2}\.\d{2}\.\d{4} im Minus/)).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Korrigieren: Storno und neue Buchung in einem Schritt", async ({ page }) => {
    await login(page, USERS.vorstand);
    await ensureLedger(page);
    await book(page, {
      kind: "Ausgabe",
      amount: "120,00",
      description: "E2E Hallenmiete",
      category: "Hallen- und Platzmiete",
    });
    await row(page, "E2E Hallenmiete")
      .first()
      .getByRole("button", { name: /Weitere Aktionen/ })
      .click();
    await page.getByRole("menuitem", { name: "Korrigieren" }).click();
    const dialog = page.getByRole("dialog", { name: /korrigieren/ });
    await expect(dialog.getByLabel("Beschreibung")).toHaveValue("E2E Hallenmiete");
    await dialog.getByLabel("Betrag in €").fill("125,00");
    await dialog.getByLabel("Grund der Korrektur").fill("Betrag falsch abgetippt");
    await dialog.getByRole("button", { name: "Korrigieren" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "E2E Hallenmiete").first()).toContainText("−125,00 €");
    await expect(page.getByText(/Storno zu Nr\..*Betrag falsch abgetippt/).first()).toBeVisible();
  });
});

test.describe("Finanzen – Anfangsbestand", () => {
  test("Anfangsbestand korrigieren: der alte wird storniert, der neue gilt ab Beginn", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    await ensureLedger(page);
    await page.getByRole("button", { name: "Anfangsbestand Girokonto korrigieren" }).click();
    const dialog = page.getByRole("dialog", { name: "Anfangsbestand Girokonto" });
    await dialog.getByLabel("Anfangsbestand in €").fill("11.250,00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Anfangsbestand korrigiert").first()).toContainText(/−11\.2\d0,00\s€/);
    await expect(row(page, "Anfangsbestand Girokonto").first()).toContainText("+11.250,00 €");
  });
});

test.describe("Finanzen – ohne Berechtigung", () => {
  test("Mitglied und Helfer haben weder Menüpunkt noch Zugriff", async ({ page }) => {
    for (const email of [USERS.mitglied, USERS.helfer]) {
      await login(page, email);
      await expect(
        page
          .getByRole("navigation", { name: "Hauptnavigation" })
          .first()
          .getByRole("link", { name: "Finanzen" }),
      ).toHaveCount(0);
      for (const path of ["/finanzen", "/finanzen/kassenbuch", "/finanzen/rechnungen"]) {
        await open(page, path);
        await expect(page.getByText("Kein Zugriff")).toBeVisible();
      }
      await page.context().clearCookies();
    }
  });
});
