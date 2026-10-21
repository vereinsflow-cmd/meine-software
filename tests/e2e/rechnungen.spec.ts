import { expect, test, type Locator, type Page } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/**
 * Rechnungen und offene Zahlungen. Die Demo-Daten enthalten zwei offene Rechnungen (349,50 € in 14 Tagen fällig,
 * 1.200,00 € seit 3 Tagen überfällig) und eine bezahlte. Hochgeladen wird als Vorstand (Kassenwart) – der Admin lädt in
 * anderen Tests schon viel hoch (Upload-Grenze je Person).
 */
/** Kalendertage ab heute (Berlin) – wie die Anwendung, nicht in 24-Stunden-Schritten (Sommerzeit). */
const isoDay = (offset: number) => {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
};
const berlinDay = (offset: number) => isoDay(offset).split("-").reverse().join(".");
const pdf = (text: string) =>
  Buffer.from(
    `%PDF-1.4\n% ${text}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  );
/** Euro-Beträge enthalten ein geschütztes Leerzeichen vor „€“. */
const euro = (text: string) => new RegExp(text.replace(/\./g, "\\.").replace(" €", "\\s€"));
const payments = (page: Page) => page.getByRole("region", { name: "Offene Zahlungen" });
/** Zeilen der Dokumentenliste (jede hat ihr Menü „…“) – sichtbar steht der Name ohne „.pdf“. */
const documentRows = (page: Page) =>
  page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^Aktionen für / }) });
/** Die Zeile eines Dokuments, gefunden über den Link mit dem vollen Namen. */
const documentRow = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });
/** Voller Name einer Rechnung aus dem sichtbaren Text ihrer Zeile („Rechnung vom 15.09.2026“ + „.pdf“). */
const invoiceNameIn = async (row: Locator) =>
  `${(await row.innerText()).match(/Rechnung vom \d{2}\.\d{2}\.\d{4}/)![0]}.pdf`;
/** Wählt im Menü „…“ eines Dokuments einen Punkt (ein Klick vor der Hydration geht verloren – dann erneut). */
async function chooseFromMenu(page: Page, name: string, item: string): Promise<void> {
  const menu = page.getByRole("menu");
  await expect(async () => {
    if (!(await menu.isVisible()))
      await page.getByRole("button", { name: `Aktionen für ${name}`, exact: true }).click();
    await expect(menu).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await menu.getByRole("menuitem", { name: item, exact: true }).click();
}

/** Klappt verborgene Rechnungen auf, falls es welche gibt (die Kachel im Kennzahlen-Raster zeigt zuerst nur eine). */
async function showAllInvoices(card: Locator) {
  const more = card.getByRole("button", { name: /weitere Rechnung(en)? anzeigen/ });
  if (await more.isVisible()) await more.click();
}

test.describe.configure({ mode: "serial" }); // die Tests bauen auf dem Stand des vorigen auf

test("Dashboard: nur Vorstand und Verwaltung sehen die offenen Zahlungen – Summe, Überfälliges, dringendste zuerst", async ({
  page,
  browser,
}) => {
  await login(page, USERS.vorstand);
  await open(page, "/dashboard");
  const card = payments(page);
  await expect(card).toBeVisible();
  await expect(card).toContainText(euro("1.549,50 €"));
  await expect(card).toContainText("offen in 2 Rechnungen");
  await expect(card).toContainText("1 überfällig");
  const rows = card.getByRole("listitem");
  await expect(rows.first()).toContainText(euro("1.200,00 €"));
  await expect(rows.first()).toContainText("seit 3 Tagen überfällig");
  // Als Kachel im Kennzahlen-Raster steht zuerst nur die dringendste – die übrigen hinter „weitere anzeigen“
  await showAllInvoices(card);
  await expect(rows.nth(1)).toContainText("fällig in 14 Tagen");
  await expect(card.getByRole("link", { name: /Alle offenen Rechnungen/ })).toHaveAttribute(
    "href",
    "/finanzen/rechnungen?stand=offen",
  );

  for (const who of [USERS.mitglied, USERS.abteilung, USERS.helfer]) {
    const context = await browser.newContext();
    const other = await context.newPage();
    await login(other, who);
    await open(other, "/dashboard");
    await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(payments(other)).toHaveCount(0);
    await context.close();
  }
});

test("Rechnung hochladen: automatischer Name, Betrag und Fälligkeit, dann auf dem Dashboard als bezahlt markieren", async ({
  page,
}) => {
  await login(page, USERS.vorstand);
  await open(page, "/dokumente");
  await page.getByRole("button", { name: "Dokument hochladen" }).click();
  const dialog = page.getByRole("dialog", { name: "Dokument hochladen" });
  await dialog.getByLabel(/^Datei/).setInputFiles({
    name: "scan_0815.pdf",
    mimeType: "application/pdf",
    buffer: pdf("Rechnung Sportgeräte"),
  });

  const invoiceBox = dialog.getByRole("checkbox", { name: /Das ist eine Rechnung/ });
  await invoiceBox.check();
  // Auslesen klappt hier nicht (kein echter Schlüssel im Test) – dann trägt man selbst ein, der Name bleibt automatisch.
  await expect(dialog.getByText(/ließ sich gerade nicht auslesen/)).toBeVisible();
  await expect(dialog.getByLabel("Name der Rechnung")).toHaveAttribute(
    "placeholder",
    `Rechnung vom ${berlinDay(0)}`,
  );
  await expect(dialog.getByLabel(/^Wer darf es sehen/)).toHaveValue("BOARD"); // Rechnungen: zunächst „Nur Vorstand“
  // Zwei Antworten statt eines Häkchens: Ein Klick auf die schon gewählte Antwort wählt sie nicht ab (mit dem
  // vorab angehakten Kästchen landete eine Rechnung so versehentlich ohne Betrag als bezahlt).
  const due = dialog.getByRole("radio", { name: "Muss noch bezahlt werden" });
  await expect(due).toBeChecked();
  await due.click();
  await expect(due).toBeChecked();
  await dialog.getByRole("radio", { name: "Ist schon bezahlt" }).check();
  await expect(dialog.getByLabel(/^Betrag/)).toHaveCount(0);
  await expect(dialog.getByText(/wird als bezahlt abgelegt/)).toBeVisible();
  await due.check();

  // Ohne Betrag geht es nicht.
  await dialog.getByRole("button", { name: "Hochladen", exact: true }).click();
  await expect(dialog.getByText("Bitte gib den Betrag ein.")).toBeVisible();

  await dialog.getByLabel(/^Betrag/).fill("89,90");
  await dialog.getByLabel("Fällig am").fill(isoDay(10));
  await dialog.getByRole("button", { name: "Hochladen", exact: true }).click();
  await expect(
    page.getByText("Rechnung hochgeladen – sie steht jetzt bei den offenen Zahlungen."),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // Das nächste Dokument ist wieder ein ganz normales: kein Häkchen „Rechnung“, Zugriff wieder „Alle Mitglieder“.
  // Nach dem Hochladen lädt die Seite ihre Liste neu – ein Klick mitten hinein kann verloren gehen (in der CI geschehen),
  // darum erst abwarten und notfalls noch einmal öffnen.
  await page.waitForLoadState("networkidle");
  const invoiceCheckbox = dialog.getByRole("checkbox", { name: /Das ist eine Rechnung/ });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Dokument hochladen" }).click({ timeout: 2000 });
    }
    await expect(invoiceCheckbox).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(invoiceCheckbox).not.toBeChecked();
  await expect(dialog.getByLabel(/^Wer darf es sehen/)).toHaveValue("ALL_MEMBERS");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const name = `Rechnung vom ${berlinDay(0)}.pdf`;
  const row = documentRow(page, name);
  await expect(row).toHaveCount(1);
  // Rechte Spalte: Betrag und Schild; „Bezahlt“ zartgrün daneben.
  await expect(row).toContainText(euro("89,90 €"));
  await expect(row).toContainText("fällig in 10 Tagen");
  await expect(row).toContainText("Nur Vorstand");
  await expect(row.getByRole("button", { name: `„${name}“ als bezahlt markieren` })).toBeVisible();

  // Auf dem Dashboard: neue Summe, die Rechnung steht unter den dringendsten.
  await open(page, "/dashboard");
  const card = payments(page);
  await expect(card).toContainText(euro("1.639,40 €"));
  await expect(card).toContainText("offen in 3 Rechnungen");
  await showAllInvoices(card);
  const mine = card.getByRole("listitem").filter({ hasText: name });
  await expect(mine).toContainText(euro("89,90 €"));

  await mine.getByRole("button", { name: `„${name}“ als bezahlt markieren` }).click();
  await expect(page.getByText(`„${name}“ ist als bezahlt markiert.`)).toBeVisible();
  await expect(card).toContainText(euro("1.549,50 €"));
  await expect(card.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

  // Verklickt? „Rückgängig“ öffnet sie wieder – danach endgültig bezahlt.
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(card).toContainText(euro("1.639,40 €"));
  await card
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button", { name: /als bezahlt markieren/ })
    .click();
  await expect(card).toContainText(euro("1.549,50 €"));
});

test("Mehrere Rechnungen auf einmal gehen nicht; ohne Finanzrecht gibt es die Rechnungs-Angaben gar nicht", async ({
  page,
  browser,
}) => {
  await login(page, USERS.vorstand);
  await open(page, "/dokumente");
  await page.getByRole("button", { name: "Dokument hochladen" }).click();
  const dialog = page.getByRole("dialog", { name: "Dokument hochladen" });
  await dialog.getByLabel(/^Datei/).setInputFiles([
    { name: "a.pdf", mimeType: "application/pdf", buffer: pdf("A") },
    { name: "b.pdf", mimeType: "application/pdf", buffer: pdf("B") },
  ]);
  await dialog.getByRole("checkbox", { name: /Das ist eine Rechnung/ }).check();
  await dialog.getByLabel(/^Betrag/).fill("10");
  await dialog.getByRole("button", { name: "2 Dateien hochladen" }).click();
  await expect(dialog.getByText(/Rechnungen lädst du bitte einzeln hoch/)).toBeVisible();
  await expect(dialog).toBeVisible();

  const context = await browser.newContext();
  const lead = await context.newPage();
  await login(lead, USERS.abteilung);
  await open(lead, "/dokumente");
  await lead.getByRole("button", { name: "Dokument hochladen" }).click();
  await expect(
    lead.getByRole("dialog", { name: "Dokument hochladen" }).getByRole("checkbox", {
      name: /Rechnung/,
    }),
  ).toHaveCount(0);
  // Auch die Rechnungen des Vorstands zeigen ihr keinen Betrag (sie sieht die Belege „Nur Vorstand“ ohnehin nicht), und
  // Filterknöpfe für Rechnungen gibt es für sie nicht.
  await expect(lead.getByText(/überfällig seit|fällig in \d+ Tagen|bezahlt am/)).toHaveCount(0);
  await expect(
    lead
      .getByRole("navigation", { name: "Dokumente filtern" })
      .getByRole("link", { name: /Rechnungen/ }),
  ).toHaveCount(0);
  await context.close();
});

test("Dokumente: Filterknopf „Offene Rechnungen“ und Zahlungsstand im Bearbeiten-Fenster", async ({
  page,
}) => {
  await login(page, USERS.vorstand);
  await open(page, "/dokumente");
  // Die Knöpfe nennen die echten Zahlen (2 offene aus den Demo-Daten, die vorige Rechnung ist bezahlt).
  const nav = page.getByRole("navigation", { name: "Dokumente filtern" });
  await nav.getByRole("link", { name: "Offene Rechnungen 2", exact: true }).click();
  await expect(page).toHaveURL(/rechnungen=offen/);
  await expect(nav.getByRole("link", { name: "Offene Rechnungen 2", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const rows = documentRows(page);
  await expect(rows).toHaveCount(2); // die beiden offenen aus den Demo-Daten
  // Die Hallenmiete (1.200,00 €) – über den Betrag gefunden, ihr Name hängt am Tag der Demo-Daten.
  const hallenmiete = await invoiceNameIn(rows.filter({ hasText: euro("1.200,00 €") }));
  const row = documentRow(page, hallenmiete);
  await expect(row).toContainText("überfällig seit 3 Tagen");

  await chooseFromMenu(page, hallenmiete, "Bearbeiten");
  const edit = page.getByRole("dialog", { name: "Dokument bearbeiten" });
  await expect(edit.getByLabel(/^Betrag/)).toHaveValue("1200,00");
  await edit.getByLabel("Fällig am").fill(isoDay(20));
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dokument gespeichert.")).toBeVisible();
  await expect(row).toContainText("fällig in 20 Tagen");

  await chooseFromMenu(page, hallenmiete, "Bearbeiten");
  await edit.getByLabel("Zahlungsstand").selectOption("PAID");
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dokument gespeichert.").first()).toBeVisible();
  await expect(rows).toHaveCount(1); // bezahlt – nicht mehr unter „offen“

  // „Alle Rechnungen“ zeigt auch die bezahlten – mit „bezahlt am …“.
  await nav.getByRole("link", { name: /^Alle Rechnungen \d+$/ }).click();
  await expect(page).toHaveURL(/rechnungen=alle/);
  await expect(documentRow(page, hallenmiete)).toContainText(/bezahlt am \d{2}\.\d{2}\.\d{4}/);

  // „Bezahlt“ in der Liste – das Bearbeiten-Fenster derselben Zeile zeigt danach „Bezahlt“, nicht den alten Stand.
  const otherName = await invoiceNameIn(documentRows(page).filter({ hasText: euro("349,50 €") }));
  const other = documentRow(page, otherName);
  await other.getByRole("button", { name: /als bezahlt markieren/ }).click();
  await expect(other).toContainText(/bezahlt am \d{2}\.\d{2}\.\d{4}/);
  await expect(other.getByRole("button", { name: /als bezahlt markieren/ })).toHaveCount(0);
  await chooseFromMenu(page, otherName, "Bearbeiten");
  await expect(edit.getByLabel("Zahlungsstand")).toHaveValue("PAID");
  await page.keyboard.press("Escape");
});

test("Rechnung auslesen: Name, Betrag, Fälligkeit und „schon bezahlt“ werden vorausgefüllt", async ({
  page,
}) => {
  // Die Antwort der KI wird vorgetäuscht – geprüft wird, was das Fenster daraus macht und was gespeichert wird.
  let calls = 0;
  await page.route("**/api/rechnungen/auslesen", async (route) => {
    calls += 1;
    await route.fulfill({
      json: {
        ok: true,
        data: {
          ok: true,
          prefill: {
            title: "Getränke Müller – Sommerfest",
            amount: "45,80",
            dueDate: isoDay(7),
            paid: true,
            note: null,
          },
        },
      },
    });
  });
  await login(page, USERS.vorstand);
  await open(page, "/finanzen/rechnungen");
  await page.getByRole("button", { name: "Rechnung hochladen" }).click();
  const dialog = page.getByRole("dialog", { name: "Rechnung hochladen" });
  await expect(dialog.getByText(/werden Betrag, Fälligkeit und Name ausgelesen/)).toBeVisible();
  await dialog.getByLabel(/^Datei/).setInputFiles({
    name: "IMG_2041.pdf",
    mimeType: "application/pdf",
    buffer: pdf("Getränke Sommerfest"),
  });

  await expect(dialog.getByText(/Ausgelesen – laut Rechnung schon bezahlt/)).toBeVisible();
  expect(calls).toBe(1);
  await expect(dialog.getByLabel("Name der Rechnung")).toHaveValue("Getränke Müller – Sommerfest");
  await expect(dialog.getByRole("radio", { name: "Ist schon bezahlt" })).toBeChecked();
  // Wechselt man auf „muss noch bezahlt werden“, stehen Betrag und Fälligkeit schon da.
  await dialog.getByRole("radio", { name: "Muss noch bezahlt werden" }).check();
  await expect(dialog.getByLabel(/^Betrag/)).toHaveValue("45,80");
  await expect(dialog.getByLabel("Fällig am")).toHaveValue(isoDay(7));
  await dialog.getByRole("radio", { name: "Ist schon bezahlt" }).check();

  await dialog.getByRole("button", { name: "Hochladen", exact: true }).click();
  await expect(page.getByText("Rechnung hochgeladen – als schon bezahlt abgelegt.")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await open(page, "/finanzen/rechnungen?stand=alle");
  await expect(page.getByText("Getränke Müller – Sommerfest.pdf").first()).toBeVisible();
});
