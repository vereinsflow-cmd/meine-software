import { expect, test, type Page } from "@playwright/test";
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
  await expect(rows.nth(1)).toContainText("fällig in 14 Tagen");
  await expect(card.getByRole("link", { name: /Alle offenen Rechnungen/ })).toHaveAttribute(
    "href",
    "/dokumente?rechnungen=offen",
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
  await expect(
    dialog.getByText(`Sie heißt dann automatisch „Rechnung vom ${berlinDay(0)}“.`),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Dokument hochladen" }).click();
  await expect(dialog.getByRole("checkbox", { name: /Das ist eine Rechnung/ })).not.toBeChecked();
  await expect(dialog.getByLabel(/^Wer darf es sehen/)).toHaveValue("ALL_MEMBERS");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const name = `Rechnung vom ${berlinDay(0)}.pdf`;
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(euro("Rechnung · offen · 89,90 €"));
  await expect(row).toContainText("fällig in 10 Tagen");
  await expect(row).toContainText("Nur Vorstand");

  // Auf dem Dashboard: neue Summe, die Rechnung steht unter den dringendsten.
  await open(page, "/dashboard");
  const card = payments(page);
  await expect(card).toContainText(euro("1.639,40 €"));
  await expect(card).toContainText("offen in 3 Rechnungen");
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
  // Auch die Rechnungen des Vorstands zeigen ihr keinen Betrag (sie sieht die Belege „Nur Vorstand“ ohnehin nicht).
  await expect(lead.getByText(/Rechnung · offen/)).toHaveCount(0);
  await context.close();
});

test("Dokumente: Filter „Nur offene Rechnungen“ und Zahlungsstand im Bearbeiten-Fenster", async ({
  page,
}) => {
  await login(page, USERS.vorstand);
  await open(page, "/dokumente?rechnungen=offen");
  const rows = page.getByRole("row").filter({ hasText: /Rechnung vom/ });
  await expect(rows).toHaveCount(2); // die beiden offenen aus den Demo-Daten
  // Die Hallenmiete (1.200,00 €) – über den Betrag gefunden, ihr Name hängt am Tag der Demo-Daten.
  const hallenmiete = (await rows.filter({ hasText: euro("1.200,00 €") }).innerText()).match(
    /Rechnung vom [\d.]+\.pdf/,
  )![0];
  const row = rows.filter({ hasText: hallenmiete });
  await expect(row).toContainText("seit 3 Tagen überfällig");

  await row.getByRole("button", { name: `${hallenmiete} bearbeiten` }).click();
  const edit = page.getByRole("dialog", { name: "Dokument bearbeiten" });
  await expect(edit.getByLabel(/^Betrag/)).toHaveValue("1200,00");
  await edit.getByLabel("Fällig am").fill(isoDay(20));
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dokument gespeichert.")).toBeVisible();
  await expect(row).toContainText("fällig in 20 Tagen");

  await row.getByRole("button", { name: `${hallenmiete} bearbeiten` }).click();
  await edit.getByLabel("Zahlungsstand").selectOption("PAID");
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dokument gespeichert.").first()).toBeVisible();
  await expect(rows).toHaveCount(1); // bezahlt – nicht mehr unter „offen“

  await open(page, "/dokumente?rechnungen=alle");
  await expect(page.getByRole("row").filter({ hasText: hallenmiete })).toContainText(
    /Rechnung · bezahlt am/,
  );

  // „Bezahlt“ in der Liste – das Bearbeiten-Fenster derselben Zeile zeigt danach „Bezahlt“, nicht den alten Stand.
  const otherName = (
    await page
      .getByRole("row")
      .filter({ hasText: euro("349,50 €") })
      .innerText()
  ).match(/Rechnung vom [\d.]+\.pdf/)![0]; // nach „Bezahlt“ steht der Betrag nicht mehr im Abzeichen
  const other = page.getByRole("row").filter({ hasText: otherName });
  await other.getByRole("button", { name: /als bezahlt markieren/ }).click();
  await expect(other).toContainText(/Rechnung · bezahlt am/);
  await other.getByRole("button", { name: /bearbeiten$/ }).click();
  await expect(edit.getByLabel("Zahlungsstand")).toHaveValue("PAID");
  await page.keyboard.press("Escape");
});
