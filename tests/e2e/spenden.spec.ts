import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, chooseNewDonor, ensureLedger, login, open, openDonationDialog } from "./helpers";

/**
 * Spenden-Cockpit (Teil 1) im Browser: Der Kassenwart (Vorstand) erfasst Spenden – Geld eines Mitglieds, eine Sachspende
 * einer Firma und die Spendendose ohne Namen –, sieht sie im Cockpit, unter „Alle Spenden“ (Filter nach Bestätigung, Suche)
 * und unter „Spender“, trägt die Finanzamt-Angaben ein, ruft den Beleg bis 300 € auf, kennzeichnet eine Buchung im
 * Kassenbuch nachträglich als Spende, trägt die fehlende Anschrift der Spenderin nach, hängt Nachweise an die Sachspende
 * und storniert sie. Mitglieder ohne `finance:read` sehen nichts davon.
 *
 * Die E2E-Datenbank startet ohne Kassenbuch und ohne Spenden (Seed mit NODE_ENV=test); die Tests laufen nacheinander und
 * bauen aufeinander auf. Namen tragen eine Endung je Lauf, die Summe wird als Zuwachs geprüft – so stören weder die Spende
 * aus spenden.mobil.spec.ts noch ein zweiter Versuch in der CI. Am Handy: spenden.mobil.spec.ts.
 */

const YEAR = Number(
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(
    new Date(),
  ),
);
const suffix = String(Date.now() % 100000);
const MEMBER = "Maria Mitglied"; // Demo-Mitglied mit vollständiger Anschrift
const COMPANY = `Autohaus Brinkmann ${suffix} GmbH`;
const BOX = `Spendendose Theke ${suffix}`;
// Erst im Kassenbuch als Spende gebucht (Gegenüber), danach über „⋯“ als Spende gekennzeichnet.
const LATE_DONOR = `Erika Sommer ${suffix}`;
const LATE_TEXT = `Spende Sommerfest ${suffix}`;
// Nachweise der Sachspende von COMPANY (Datei und Vermerk), danach storniert.
const EVIDENCE_FILE = `lieferschein-${suffix}.pdf`;
const EVIDENCE_NOTE = `Lieferschein ${suffix} liegt beim Kassenwart`;

/** „1.234,56 €“ → 123456 */
function toCents(text: string): number {
  const match = /([\d.]+),(\d{2})/.exec(text);
  if (!match) throw new Error(`Kein Betrag in „${text}“`);
  return Number(match[1]!.replaceAll(".", "")) * 100 + Number(match[2]);
}

/** Summe der violetten Karte „Spenden {Jahr}“ im Cockpit. */
async function donationTotal(page: Page): Promise<number> {
  const value = page.locator(`[data-kpi="Spenden ${YEAR}"] [data-slot="kpi-value"]`);
  return toCents((await value.textContent()) ?? "");
}

const donationsTable = (page: Page) =>
  page.getByRole("table", { name: `Spenden ${YEAR}, neueste zuerst` });
const donorsTable = (page: Page) =>
  page.getByRole("table", { name: `Spender ${YEAR}, nach Summe der Spenden geordnet` });

test.describe.serial("Spenden – Kassenwart", () => {
  test("Spende erfassen: Geld eines Mitglieds, Sachspende einer Firma, Spendendose ohne Namen – das Cockpit zählt mit", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, USERS.vorstand);
    await ensureLedger(page);

    // Der Reiter „Spenden“ der Finanzen führt ins Cockpit.
    await open(page, "/finanzen");
    await page
      .getByRole("navigation", { name: "Bereiche der Finanzen" })
      .getByRole("link", { name: /^Spenden/ })
      .click();
    await expect(page).toHaveURL(/\/finanzen\/spenden$/);
    await expect(page.getByText(`Geschäftsjahr ${YEAR} · Stand`)).toBeVisible();
    await page.waitForLoadState("networkidle");
    const before = await donationTotal(page);

    // 1. Geld von einem Mitglied, per Überweisung (Vorgabe aus dem Girokonto), für die Abteilung Tischtennis.
    let dialog = await openDonationDialog(page);
    await expect(dialog.getByRole("radio", { name: "Geld", exact: true })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: /^Mitglied/ })).toBeChecked();
    await dialog
      .getByRole("combobox", { name: "Mitglied" })
      .selectOption({ label: "Mitglied, Maria" });
    await dialog.getByRole("textbox", { name: "Betrag in €" }).fill("120,00");
    await dialog
      .getByRole("combobox", { name: "Wofür?" })
      .selectOption({ label: "Abteilung: Tischtennis" });
    await expect(
      dialog.getByRole("combobox", { name: "Konto" }).locator("option:checked"),
    ).toHaveText("Girokonto");
    await expect(dialog.getByRole("radio", { name: /^Überweisung/ })).toBeChecked();
    // Überweisung bis 300 €: Dem Spender genügen Kontoauszug und Beleg des Vereins.
    await expect(
      dialog.getByText(/^Zuwendungsbestätigung: nicht nötig – Überweisung bis 300 €/),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Spende speichern" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(/^Spende gespeichert und gebucht als Nr\. \d{4}-\d{4}\.$/).first(),
    ).toBeVisible();

    // 2. Sachspende einer Firma, die als neuer Spender mit Anschrift entsteht – ohne Buchung im Kassenbuch.
    dialog = await openDonationDialog(page);
    // Die Umschaltleiste „Art“ besteht aus unsichtbaren Auswahlknöpfen in sichtbaren Kacheln – geklickt wird die Kachel.
    const inKind = page.getByRole("radio", { name: "Sachspende", exact: true });
    await dialog.locator("label").filter({ has: inKind }).click();
    await expect(dialog.getByRole("radio", { name: "Sachspende", exact: true })).toBeChecked();
    await expect(
      dialog.getByText(/^Eine Sache statt Geld – ohne Buchung im Kassenbuch/),
    ).toBeVisible();
    // „Ohne Namen“ gibt es nur bei Geld, ein Konto auch.
    await expect(dialog.getByRole("radio", { name: /^Ohne Namen/ })).toHaveCount(0);
    await expect(dialog.getByRole("combobox", { name: "Konto" })).toHaveCount(0);
    await chooseNewDonor(dialog);
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(COMPANY);
    await dialog
      .getByRole("combobox", { name: "Art", exact: true })
      .selectOption({ label: "Firma" });
    await dialog.getByRole("textbox", { name: "Straße und Hausnummer" }).fill("Industriestraße 4");
    // Erst der Ort, dann die Postleitzahl – die App ergänzt den Ort sonst selbst (hier derselbe).
    await dialog.getByRole("textbox", { name: "Ort", exact: true }).fill("Bielefeld");
    await dialog.getByRole("textbox", { name: "PLZ" }).fill("33602");
    await dialog
      .getByRole("textbox", { name: /^Was genau\?/ })
      .fill("12 Kisten Mineralwasser, neu");
    await dialog.getByRole("radio", { name: /^Betriebsvermögen/ }).check();
    await dialog.getByRole("textbox", { name: "Wert in €" }).fill("89,90");
    // Sachspenden brauchen immer eine Zuwendungsbestätigung.
    await expect(dialog.getByText(/^Zuwendungsbestätigung: nötig –/)).toBeVisible();
    await dialog.getByRole("button", { name: "Spende speichern" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Sachspende gespeichert.")).toBeVisible();

    // 3. Spendendose ohne Namen: kommt von selbst in die Barkasse, bar übergeben, keine Bestätigung möglich.
    dialog = await openDonationDialog(page);
    await dialog.getByRole("radio", { name: /^Ohne Namen/ }).check();
    await dialog.getByRole("textbox", { name: "Bezeichnung" }).fill(BOX);
    await expect(
      dialog.getByRole("combobox", { name: "Konto" }).locator("option:checked"),
    ).toHaveText("Barkasse");
    await expect(dialog.getByRole("radio", { name: /^Bar übergeben/ })).toBeChecked();
    await expect(dialog.getByRole("group", { name: "Zuwendungsbestätigung" })).toHaveCount(0);
    await dialog.getByRole("textbox", { name: "Betrag in €" }).fill("23,45");
    await dialog.getByRole("button", { name: "Spende speichern" }).click();
    await expect(dialog).toHaveCount(0);

    // Cockpit: Die Summe wächst um alle drei (120,00 + 89,90 + 23,45 €), auch die Sachspende ohne Buchung.
    await expect.poll(() => donationTotal(page)).toBe(before + 23_335);
    const kennzahlen = page.getByRole("region", { name: "Kennzahlen" });
    await expect(kennzahlen).toContainText("Nach Art");
    await expect(kennzahlen).toContainText("Sachspenden");

    // „Letzte Spenden“: die neueste (Spendendose) zuerst, jede mit Zweck und Stand der Bestätigung.
    const latest = page.getByRole("table", { name: `Die neuesten Spenden ${YEAR}` });
    const firstRow = latest.getByRole("row").nth(1);
    await expect(firstRow).toContainText(BOX);
    await expect(firstRow).toContainText("ohne Namen");
    await expect(firstRow).toContainText("23,45 €");
    await expect(firstRow.getByText("nicht möglich", { exact: true })).toBeVisible();
    const company = latest.getByRole("row").filter({ hasText: COMPANY });
    await expect(company).toContainText("Firma");
    await expect(company).toContainText("89,90 €");
    await expect(company.getByText("nötig", { exact: true })).toBeVisible();
    const member = latest.getByRole("row").filter({ hasText: MEMBER }).first();
    await expect(member).toContainText("Tischtennis");
    await expect(member.getByText("nicht nötig", { exact: true })).toBeVisible();

    // „Das steht an“: Die Firma wartet auf ihre Zuwendungsbestätigung.
    await expect(
      page.getByText(/^(1 Zuwendungsbestätigung fehlt|\d+ Zuwendungsbestätigungen fehlen)$/),
    ).toBeVisible();
    await expect(
      page.getByText(new RegExp(`${COMPANY}.* (wartet|warten) darauf\\.`)),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Wofür gespendet wurde" })).toBeVisible();
  });

  test("Finanzamt-Angaben: ohne sie kein Beleg bis 300 €; eingetragen gilt der Bescheid taggenau und der Beleg ist druckbar", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/einstellungen#finanzamt");
    const section = page.getByRole("region", { name: "Finanzamt", exact: true });
    await expect(section).toBeVisible();

    // Nur beim ersten Versuch (frische Datenbank) fehlen die Angaben noch – ein zweiter Versuch der CI findet sie gespeichert.
    if ((await section.getByRole("textbox", { name: "Steuernummer" }).inputValue()) === "") {
      await expect(section.getByText(/^Noch keine vollständigen Angaben/)).toBeVisible();
      // Das Cockpit mahnt sie an und führt hierher.
      await open(page, "/finanzen/spenden");
      await expect(page.getByText("Finanzamt-Angaben fehlen", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Angaben eintragen" }).click();
      await expect(page).toHaveURL(/\/finanzen\/einstellungen#finanzamt$/);

      // Der Beleg bis 300 € ist ohne sie nicht druckbar.
      await open(page, "/finanzen/spenden/beleg");
      await expect(page.getByRole("heading", { level: 1, name: "Beleg bis 300 €" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Noch nicht druckbar" })).toBeVisible();
      await expect(page.getByText(/^Trage zuerst die Finanzamt-Angaben ein/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Beleg drucken" })).toHaveCount(0);
      await expect(page.getByRole("article")).toHaveCount(0);
      await page.getByRole("link", { name: "Finanzamt-Angaben eintragen" }).click();
      await expect(page).toHaveURL(/\/finanzen\/einstellungen#finanzamt$/);
      await page.waitForLoadState("networkidle");
    }

    // Eintragen wie im Bescheid: Freistellungsbescheid vom 14.03. des Vorjahres – gilt 5 Jahre, taggenau.
    await section.getByRole("textbox", { name: "Finanzamt (nur der Ort)" }).fill("Musterstadt");
    await section.getByRole("textbox", { name: "Steuernummer" }).fill("12/345/67890");
    await section.getByRole("radio", { name: /^Freistellungsbescheid/ }).check();
    await section.getByLabel("Datum des Bescheids").fill(`${YEAR - 1}-03-14`);
    await section
      .getByRole("textbox", { name: "Letzter Veranlagungszeitraum" })
      .fill(String(YEAR - 3));
    await section.getByRole("textbox", { name: "Begünstigte Zwecke" }).fill("des Sports");
    // Stand und Satz erscheinen schon beim Tippen.
    await expect(
      section.getByText(`Gültig für Bestätigungen bis 14.03.${YEAR + 4}.`),
    ).toBeVisible();
    await expect(section.getByRole("figure")).toContainText(
      `Wir sind wegen Förderung des Sports nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes Musterstadt StNr. 12/345/67890, vom 14.03.${YEAR - 1} für den letzten Veranlagungszeitraum ${YEAR - 3}`,
    );
    await section.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Finanzamt-Angaben gespeichert.")).toBeVisible();

    // Nach dem Neuladen stehen die Angaben noch da.
    await open(page, "/finanzen/einstellungen#finanzamt");
    await expect(section.getByRole("textbox", { name: "Steuernummer" })).toHaveValue(
      "12/345/67890",
    );
    await expect(
      section.getByText(`Gültig für Bestätigungen bis 14.03.${YEAR + 4}.`),
    ).toBeVisible();

    // Das Cockpit nennt jetzt den Bescheid als ruhige Info statt „Finanzamt-Angaben fehlen“.
    await open(page, "/finanzen/spenden");
    await expect(page.getByText(`Freistellungsbescheid vom 14.03.${YEAR - 1}`)).toBeVisible();
    await expect(page.getByText(`Gültig für Bestätigungen bis 14.03.${YEAR + 4}.`)).toBeVisible();
    await expect(page.getByText("Finanzamt-Angaben fehlen", { exact: true })).toHaveCount(0);

    // Der Beleg ist druckbar – aus genau diesen Angaben, als eigener Vorschlag gekennzeichnet.
    await open(page, "/finanzen/spenden/beleg");
    const proof = page.getByRole("article", {
      name: "Beleg für den vereinfachten Zuwendungsnachweis (§ 50 Abs. 4 EStDV)",
    });
    await expect(proof).toContainText("TSV Musterstadt 1898 e.V.");
    await expect(proof).toContainText("Wir sind wegen Förderung des Sports");
    await expect(proof).toContainText("des Finanzamtes Musterstadt StNr. 12/345/67890");
    await expect(proof).toContainText("Die Zuwendung wird nur zur Förderung des Sports verwendet.");
    await expect(proof).toContainText(
      "Es handelt sich um eine Spende, nicht um einen Mitgliedsbeitrag.",
    );
    await expect(proof).toContainText("Kein amtliches Muster – Textvorschlag von VereinsFlow.");
    // Name und Betrag eines Spenders stehen nicht darauf – der Beleg gilt für alle gleich.
    await expect(proof).not.toContainText(MEMBER);
    await expect(page.getByRole("heading", { name: "Noch nicht druckbar" })).toHaveCount(0);
    const print = page.getByRole("button", { name: "Beleg drucken" });
    await expect(print).toBeVisible();
    // Beim Drucken bleibt nur das Blatt.
    await page.emulateMedia({ media: "print" });
    await expect(print).toBeHidden();
    await expect(proof).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });

  test("Alle Spenden: Filter nach Bestätigung, Suche nach Name und Buchungsnummer", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/spenden");
    await page.getByRole("link", { name: "Alle anzeigen" }).click();
    await expect(page).toHaveURL(/\/finanzen\/spenden\/alle$/);
    await expect(page.getByText(`Alle Spenden ${YEAR}`)).toBeVisible();

    const filters = page.getByRole("navigation", { name: "Nach Bestätigung filtern" });
    const filter = (name: RegExp) => filters.getByRole("link", { name });
    const table = donationsTable(page);
    const row = (text: string) => table.getByRole("row").filter({ hasText: text });
    await expect(filter(/^Alle/)).toHaveAttribute("aria-current", "page");
    await expect(row(COMPANY)).toContainText("Sachspende");
    await expect(row(COMPANY)).toContainText("12 Kisten Mineralwasser, neu");
    await expect(row(BOX)).toContainText(/Nr\. \d{4}-\d{4}/);
    await expect(row(MEMBER).first()).toContainText("Geldspende");
    expect(await violations(page)).toEqual([]);

    // „Nötig“: nur Spenden, für die eine Zuwendungsbestätigung fehlt.
    await filter(/^Nötig/).click();
    await expect(page).toHaveURL(/[?&]bestaetigung=noetig/);
    await expect(filter(/^Nötig/)).toHaveAttribute("aria-current", "page");
    await expect(row(COMPANY).getByText("nötig", { exact: true })).toBeVisible();
    await expect(row(BOX)).toHaveCount(0);
    await expect(row(MEMBER)).toHaveCount(0);

    // „Ohne Namen“: die Spendendose.
    await filter(/^Ohne Namen/).click();
    await expect(page).toHaveURL(/[?&]bestaetigung=ohne-namen/);
    await expect(row(BOX).getByText("nicht möglich", { exact: true })).toBeVisible();
    await expect(row(COMPANY)).toHaveCount(0);

    // „Nicht nötig“: die Überweisung bis 300 €.
    await filter(/^Nicht nötig/).click();
    await expect(page).toHaveURL(/[?&]bestaetigung=nicht-noetig/);
    await expect(row(MEMBER).first().getByText("nicht nötig", { exact: true })).toBeVisible();
    await expect(row(COMPANY)).toHaveCount(0);

    // Suche nach dem Namen – zurück unter „Alle“.
    await filter(/^Alle/).click();
    await expect(page).toHaveURL(/\/finanzen\/spenden\/alle$/);
    await page.waitForLoadState("networkidle");
    const search = page.getByRole("searchbox", { name: "Spenden durchsuchen" });
    await search.fill(`Brinkmann ${suffix}`);
    await search.press("Enter");
    await expect(page).toHaveURL(/[?&]q=Brinkmann/);
    await expect(table.getByRole("row")).toHaveCount(2); // Kopf + eine Spende
    await expect(row(COMPANY)).toBeVisible();
    await expect(page.getByText(/^1 Spende · zusammen 89,90\s€$/)).toBeVisible();

    // Suche nach der Buchungsnummer der Spendendose.
    await open(page, "/finanzen/spenden/alle");
    const number = /Nr\. (\d{4}-\d{4})/.exec((await row(BOX).textContent()) ?? "")?.[1];
    expect(number, "Buchungsnummer der Spendendose").toBeTruthy();
    await search.fill(number!);
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`[?&]q=${number}`));
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(row(BOX)).toBeVisible();

    // „⋯“ einer Geldspende: ändern, im Kassenbuch ansehen oder die Kennzeichnung zurücknehmen – kein Storno (das geht über
    // die Buchung).
    await row(BOX)
      .getByRole("button", { name: `Weitere Aktionen: Geldspende von ${BOX} über 23,45 €` })
      .click();
    await expect(page.getByRole("menuitem", { name: "Ändern" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Kennzeichnung zurücknehmen" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Stornieren" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Im Kassenbuch ansehen" }).click();
    await expect(page).toHaveURL(new RegExp(`/finanzen/kassenbuch\\?q=${number}$`));
    await expect(
      page.getByRole("link", { name: `Spende zu Buchung ${number} ansehen` }),
    ).toBeVisible();
  });

  test("Spender: Summe, Anschrift und Stand der Bestätigung je Spender; „⋯“ führt zu den Spenden", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    await open(page, "/finanzen/spenden");
    await page.getByRole("link", { name: "Alle Spender ansehen" }).click();
    await expect(page).toHaveURL(new RegExp(`/finanzen/spenden/spender\\?jahr=${YEAR}$`));
    await expect(
      page
        .getByRole("navigation", { name: "Welche Spender" })
        .getByRole("link", { name: `Mit Spenden in ${YEAR}` }),
    ).toHaveAttribute("aria-current", "page");

    const table = donorsTable(page);
    const company = table.getByRole("row").filter({ hasText: COMPANY });
    await expect(company.getByText("Firma", { exact: true })).toBeVisible();
    await expect(company).toContainText("Industriestraße 4");
    await expect(company).toContainText("33602 Bielefeld");
    await expect(company.getByText("fehlt", { exact: true })).toBeVisible();
    await expect(company).toContainText("89,90 €");
    await expect(company).toContainText("1 Spende");
    const member = table.getByRole("row").filter({ hasText: MEMBER });
    await expect(member.getByText("Mitglied", { exact: true })).toBeVisible();
    await expect(member.getByText("nicht nötig", { exact: true })).toBeVisible();
    // Die Spendendose ist kein Spender.
    await expect(table.getByRole("row").filter({ hasText: BOX })).toHaveCount(0);
    expect(await violations(page)).toEqual([]);

    // Mitglieder ändert man im Mitglied.
    await member.getByRole("button", { name: `Weitere Aktionen für ${MEMBER}` }).click();
    await expect(page.getByRole("menuitem", { name: "Im Mitglied ändern" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // Ein Spender mit Spenden lässt sich sperren, aber nicht löschen; „Spenden ansehen“ sucht seine Spenden.
    await company.getByRole("button", { name: `Weitere Aktionen für ${COMPANY}` }).click();
    await expect(page.getByRole("menuitem", { name: "Sperren" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Löschen" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Spenden ansehen" }).click();
    await expect(page).toHaveURL(/\/finanzen\/spenden\/alle\?q=Autohaus/);
    await expect(donationsTable(page).getByRole("row")).toHaveCount(2);
    await expect(donationsTable(page)).toContainText(COMPANY);

    // „Alle Spender“ zeigt auch Spender ohne Spenden in diesem Jahr.
    await open(page, "/finanzen/spenden/spender");
    await page
      .getByRole("navigation", { name: "Welche Spender" })
      .getByRole("link", { name: "Alle Spender" })
      .click();
    await expect(page).toHaveURL(/[?&]alle=1/);
    await expect(donorsTable(page)).toContainText(COMPANY);
  });

  test("Kassenbuch: eine gebuchte Spende ohne Spender über „⋯“ → „Als Spende kennzeichnen“ zuordnen, danach die Anschrift eintragen", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, USERS.vorstand);
    await ensureLedger(page);

    // Im Kassenbuch als Einnahme der Kategorie „Spenden“ gebucht – mit Gegenüber, aber noch ohne Spender.
    const entryDialog = page.getByRole("dialog", { name: "Neue Buchung" });
    await expect(async () => {
      if (!(await entryDialog.isVisible()))
        await page.getByRole("button", { name: "Neue Buchung" }).click();
      await expect(entryDialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await entryDialog.getByText("Einnahme", { exact: true }).click();
    await entryDialog.getByLabel("Betrag in €").fill("50,00");
    await entryDialog.getByLabel("Beschreibung").fill(LATE_TEXT);
    await entryDialog.getByLabel("Von wem?").fill(LATE_DONOR);
    await entryDialog.getByLabel("Kategorie").selectOption({ label: "Spenden" });
    await entryDialog.getByRole("button", { name: "Einnahme buchen" }).click();
    await expect(entryDialog).toHaveCount(0);
    const entry = page.getByRole("row").filter({ hasText: LATE_TEXT });
    await expect(entry).toContainText("Spende – Spender fehlt");

    // Die Spenden-Seiten zählen sie mit – als „Spender fehlt“.
    await open(page, "/finanzen/spenden");
    await expect(page.getByText(/^\d+ Spenden? ohne Spender$/)).toBeVisible();
    await open(page, "/finanzen/spenden/alle?bestaetigung=ohne-spender");
    const unassigned = donationsTable(page).getByRole("row").filter({ hasText: LATE_DONOR });
    await expect(unassigned).toContainText("aus dem Kassenbuch");
    await expect(unassigned.getByText("Spender fehlt", { exact: true })).toBeVisible();
    await expect(unassigned).toContainText("50,00 €");

    // „⋯“ → „Als Spende kennzeichnen“: vorbelegt mit dem Gegenüber der Buchung als neuer Spender.
    await open(page, "/finanzen/kassenbuch");
    await entry.getByRole("button", { name: /^Weitere Aktionen für Buchung \d{4}-\d{4}$/ }).click();
    await page.getByRole("menuitem", { name: "Als Spende kennzeichnen" }).click();
    const assign = page.getByRole("dialog", { name: "Als Spende kennzeichnen" });
    await expect(assign).toContainText(`„${LATE_TEXT}“ – trage ein, von wem das Geld kam.`);
    await expect(assign).toContainText(`Von wem laut Buchung: ${LATE_DONOR}`);
    await expect(assign.getByRole("radio", { name: /^Andere Person oder Firma/ })).toBeChecked();
    await expect(assign.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(
      LATE_DONOR,
    );
    await expect(assign.getByRole("radio", { name: /^Überweisung/ })).toBeChecked();
    // Überweisung bis 300 € – die Spenderin möchte trotzdem eine Bestätigung; ohne Anschrift geht das nicht.
    await assign.getByRole("radio", { name: /^Spender möchte eine/ }).check();
    await expect(assign.getByText(/^Zuwendungsbestätigung: Adresse fehlt –/)).toBeVisible();
    await assign.getByRole("button", { name: "Als Spende kennzeichnen" }).click();
    await expect(assign).toHaveCount(0);
    await expect(
      page.getByText(/^Buchung \d{4}-\d{4} ist jetzt als Spende eingetragen\.$/),
    ).toBeVisible();
    await expect(entry).not.toContainText("Spender fehlt");

    // Der Link „Spende“ an der Buchung führt zu ihr in „Alle Spenden“.
    await entry.getByRole("link", { name: /^Spende zu Buchung \d{4}-\d{4} ansehen$/ }).click();
    await expect(page).toHaveURL(/\/finanzen\/spenden\/alle\?jahr=\d{4}&q=\d{4}-\d{4}$/);
    const donation = donationsTable(page).getByRole("row").filter({ hasText: LATE_DONOR });
    await expect(donation.getByText("Privatperson", { exact: true })).toBeVisible();
    await expect(donation.getByText("Adresse fehlt", { exact: true })).toBeVisible();
    await expect(donationsTable(page).getByRole("row")).toHaveCount(2);

    // Unter „Spender“ steht sie mit „Adresse fehlt“; „Adresse eintragen“ öffnet gleich das Fenster „Spender ändern“.
    await open(page, "/finanzen/spenden/spender");
    const donor = donorsTable(page).getByRole("row").filter({ hasText: LATE_DONOR });
    await expect(donor).toContainText("Adresse fehlt");
    await expect(donor).toContainText("50,00 €");
    const edit = page.getByRole("dialog", { name: "Spender ändern" });
    await donor.getByRole("button", { name: `Adresse eintragen für ${LATE_DONOR}` }).click();
    await expect(edit.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(LATE_DONOR);
    // Der Cursor steht gleich in der Straße (der Name bleibt unberührt).
    await expect(edit.getByRole("textbox", { name: "Straße und Hausnummer" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);

    // `?bearbeiten=<id>` (Ziel von „Adresse eintragen“ im Cockpit) öffnet das Fenster direkt und holt sie nach oben;
    // geschlossen steht der Fokus auf ihrem „⋯“. (Solange das Fenster offen ist, ist die Tabelle für Screenreader verdeckt.)
    const donorId = (await donor.getAttribute("id"))?.replace(/^spender-/, "");
    expect(donorId).toBeTruthy();
    await open(page, `/finanzen/spenden/spender?bearbeiten=${donorId}`);
    await expect(edit.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(LATE_DONOR);
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);
    await expect(donorsTable(page).getByRole("row").nth(1)).toContainText(LATE_DONOR);
    const menu = donor.getByRole("button", { name: `Weitere Aktionen für ${LATE_DONOR}` });
    await expect(menu).toBeFocused();

    // „⋯“ → „Anschrift ändern“: Anschrift eintragen – danach ist die Bestätigung „nötig“ statt „Adresse fehlt“.
    await menu.click();
    await page.getByRole("menuitem", { name: "Anschrift ändern" }).click();
    await edit.getByRole("textbox", { name: "Straße und Hausnummer" }).fill("Lindenweg 7");
    // Erst der Ort, dann die Postleitzahl – die App ergänzt den Ort sonst selbst (hier derselbe).
    await edit.getByRole("textbox", { name: "Ort", exact: true }).fill("Bielefeld");
    await edit.getByRole("textbox", { name: "PLZ" }).fill("33602");
    await edit.getByRole("button", { name: "Speichern" }).click();
    await expect(edit).toHaveCount(0);
    await expect(page.getByText("Spender gespeichert.")).toBeVisible();
    await expect(donor).toContainText("Lindenweg 7");
    await expect(donor).toContainText("33602 Bielefeld");
    await expect(donor).not.toContainText("Adresse fehlt");
    await open(page, `/finanzen/spenden/alle?q=${encodeURIComponent(LATE_DONOR)}`);
    const receipt = donationsTable(page).getByRole("row").filter({ hasText: LATE_DONOR });
    await expect(receipt.getByText("nötig", { exact: true })).toBeVisible();
    await expect(receipt.getByText("Adresse fehlt", { exact: true })).toHaveCount(0);
  });

  test("Alle Spenden: Nachweise einer Sachspende anhängen, herunterladen und entfernen – storniert nur noch ansehen", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, USERS.vorstand);
    const search = encodeURIComponent(`Brinkmann ${suffix}`);
    await open(page, `/finanzen/spenden/alle?q=${search}`);
    const row = donationsTable(page).getByRole("row").filter({ hasText: COMPANY });
    const more = row.getByRole("button", {
      name: `Weitere Aktionen: Sachspende von ${COMPANY} über 89,90 €`,
    });

    // „⋯“ einer Sachspende: ändern, Nachweise, stornieren – keine Kennzeichnung (die gibt es nur bei Geld).
    await more.click();
    await expect(page.getByRole("menuitem", { name: "Ändern" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Stornieren" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Kennzeichnung zurücknehmen" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Nachweise", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nachweise zur Spende" });
    await expect(dialog.getByText("Noch kein Nachweis angehängt.")).toBeVisible();

    // Eine Datei: liegt danach als Dokument „Nur Finanzen“ an der Spende und lässt sich herunterladen.
    await dialog.locator('input[type="file"]').setInputFiles({
      name: EVIDENCE_FILE,
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.4\n% Lieferschein\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
      ),
    });
    await expect(page.getByText(`„${EVIDENCE_FILE}“ angehängt.`)).toBeVisible();
    const list = dialog.getByRole("list", { name: "Angehängte Nachweise" });
    const download = list.getByRole("link", { name: `Nachweis herunterladen: ${EVIDENCE_FILE}` });
    await expect(download).toBeVisible();
    const file = await page.request.get((await download.getAttribute("href"))!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toContain("attachment");

    // Ein Vermerk statt Datei – und wieder entfernt (erst nach Rückfrage am selben Knopf).
    await dialog.getByRole("textbox", { name: "Oder ein Vermerk" }).fill(EVIDENCE_NOTE);
    await dialog.getByRole("button", { name: "Vermerk speichern" }).click();
    await expect(page.getByText("Vermerk gespeichert.")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).toContainText(`Vermerk: ${EVIDENCE_NOTE}`);
    expect(await violations(page)).toEqual([]);
    await list.getByRole("button", { name: "Vermerk entfernen" }).click();
    await list.getByRole("button", { name: /^Wirklich entfernen\?/ }).click();
    await expect(page.getByText("Vermerk entfernt.")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();

    // Stornieren: Die Spende zählt nirgends mehr und steht nur noch unter „Storniert“ – die Nachweise bleiben, aber nur
    // zum Ansehen.
    await more.click();
    await page.getByRole("menuitem", { name: "Stornieren" }).click();
    const voidDialog = page.getByRole("dialog", { name: "Sachspende stornieren?" });
    await voidDialog.getByRole("textbox", { name: "Grund" }).fill("doppelt erfasst");
    await voidDialog.getByRole("button", { name: "Stornieren" }).click();
    await expect(voidDialog).toHaveCount(0);
    await expect(page.getByText("Spende storniert.")).toBeVisible();
    await expect(row).toHaveCount(0);

    await open(page, `/finanzen/spenden/alle?bestaetigung=storniert&q=${search}`);
    await expect(row.getByText("storniert", { exact: true })).toBeVisible();
    await more.click();
    await expect(page.getByRole("menuitem", { name: "Ändern" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Stornieren" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Nachweise ansehen" }).click();
    await expect(
      dialog.getByRole("link", { name: `Nachweis herunterladen: ${EVIDENCE_FILE}` }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: /entfernen/ })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Vermerk speichern" })).toHaveCount(0);
    await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  });
});

test.describe("Spenden – Rechte", () => {
  test("Ein Mitglied ohne finance:read sieht weder den Bereich noch Spenden oder Spender", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, USERS.mitglied);
    await expect(
      page
        .getByRole("navigation", { name: "Hauptnavigation" })
        .first()
        .getByRole("link", { name: "Finanzen" }),
    ).toHaveCount(0);
    for (const path of [
      "/finanzen/spenden",
      "/finanzen/spenden/alle",
      "/finanzen/spenden/spender",
      "/finanzen/spenden/beleg",
    ]) {
      await open(page, path);
      await expect(page.getByText("Kein Zugriff")).toBeVisible();
      await expect(page.getByText("Für die Finanzen fehlt dir die Berechtigung.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Spende erfassen" })).toHaveCount(0);
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.getByText(COMPANY)).toHaveCount(0);
    }
  });
});
