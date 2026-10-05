import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open, outboxMailsTo, setUpJoinLink } from "./helpers";

/**
 * Mitglied werden per QR-Code: Der Verein richtet einen Link ein, eine Person OHNE Konto stellt darüber einen Antrag,
 * der Vorstand nimmt an – erst dann entsteht das Mitglied und die Einladung geht per E-Mail raus. Ein neuer Code macht
 * alte Aushänge ungültig. Die öffentliche Seite wird in einem eigenen, nicht angemeldeten Browser-Kontext geöffnet.
 */

const INVALID =
  "Dieser Link ist nicht (mehr) gültig. Bitte frag im Verein nach dem aktuellen QR-Code.";

async function fillApplication(page: Page, person: { first: string; last: string; email: string }) {
  await page.getByLabel("Vorname").fill(person.first);
  await page.getByLabel("Nachname").fill(person.last);
  await page.getByLabel("E-Mail-Adresse").fill(person.email);
  await page.getByLabel("Telefon").fill("0171 2223334");
  await page.getByLabel("Geburtsdatum").fill("1999-07-01");
  await page.getByLabel("Abteilung").selectOption({ label: "Tischtennis" });
  await page.getByLabel("Nachricht an den Verein").fill("Ich spiele gern Tischtennis.");
  await page.getByLabel(/Ich bin einverstanden, dass der Verein meine Angaben speichert/).check();
}

test.describe("Beitritt per QR-Code", () => {
  test("Admin richtet den QR-Code ein, eine Person ohne Konto beantragt den Beitritt, der Admin nimmt an", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const stamp = Date.now() % 1_000_000;
    const person = { first: "Bea", last: `Beitritt${stamp}`, email: `bea.${stamp}@example.org` };

    await login(page, USERS.admin);
    const link = await setUpJoinLink(page);
    expect(link).toMatch(/^http:\/\/localhost:3100\/beitreten\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByRole("img", { name: "QR-Code zum Beitrittsformular" })).toBeVisible();

    // Öffentliche Seite in einem Kontext ohne Anmeldung – wie das Handy, das den QR-Code scannt.
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(link);
    await guest.waitForLoadState("networkidle");
    await expect(guest).toHaveURL(link); // keine Umleitung zur Anmeldung
    await expect(guest.getByRole("heading", { level: 1, name: "Mitglied werden" })).toBeVisible();
    await expect(guest.getByText("TSV Musterstadt 1898 e.V.")).toBeVisible();
    await expect(
      guest.getByText(
        "Fülle das Formular aus – der Vorstand prüft deinen Antrag und schickt dir dann eine Einladung per E-Mail.",
      ),
    ).toBeVisible();
    await expect(guest.getByRole("link", { name: "Datenschutzerklärung" })).toHaveAttribute(
      "href",
      "/datenschutzerklaerung",
    );
    for (const colorScheme of ["light", "dark"] as const) {
      await guest.emulateMedia({ colorScheme });
      expect(await violations(guest), colorScheme).toEqual([]);
    }
    await guest.emulateMedia({ colorScheme: "light" });

    // Das Einwilligungs-Kästchen ist als Pflicht gekennzeichnet (Stern wie bei den Textfeldern) …
    const consent = guest.getByRole("checkbox", { name: /Ich bin einverstanden/ });
    await expect(consent).toHaveAttribute("aria-required", "true");
    await expect(
      guest.locator("label", { has: guest.getByText(/Ich bin einverstanden/) }),
    ).toContainText(/Datenschutzerklärung\.\s*\*$/);
    // … ohne Einwilligung geht es nicht – der Fehler steht am Kästchen.
    await guest.getByRole("button", { name: "Antrag senden" }).click();
    await expect(guest.getByText("Bitte gib deinen Vornamen ein.")).toBeVisible();
    await expect(guest.getByText(/Bitte stimme zu/)).toBeVisible();

    await fillApplication(guest, person);
    await guest.getByRole("button", { name: "Antrag senden" }).click();
    await expect(guest.getByText("Danke, dein Antrag ist beim Verein angekommen.")).toBeVisible();
    await expect(
      guest.getByText(
        "Sobald der Vorstand ihn bestätigt, bekommst du eine E-Mail mit deiner Einladung.",
      ),
    ).toBeVisible();
    expect(await violations(guest)).toEqual([]);
    // Noch kein Mitglied, noch keine Einladung.
    expect(outboxMailsTo(person.email)).toEqual([]);

    // Der Admin sieht den Antrag über den Knopf in der Mitgliederliste.
    await open(page, "/mitglieder");
    const applications = page.getByRole("link", { name: /^Anträge \(\d+\)$/ });
    await expect(applications).toBeVisible();
    await applications.click();
    await expect(page).toHaveURL(/\/mitglieder\/antraege$/);
    await page.waitForLoadState("networkidle");
    const card = page
      .getByRole("heading", { level: 3, name: `${person.first} ${person.last}` })
      .locator("xpath=ancestor::div[@data-slot='card'][1]");
    await expect(card.getByText(person.email)).toBeVisible();
    await expect(card.getByText("0171 2223334")).toBeVisible();
    await expect(card.getByText("01.07.1999")).toBeVisible();
    await expect(card.getByText("Tischtennis", { exact: true })).toBeVisible();
    await expect(card.getByText("Ich spiele gern Tischtennis.")).toBeVisible();

    await card.getByRole("button", { name: "Annehmen" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: `${person.first} ${person.last} annehmen?`,
    });
    await expect(confirm).toContainText(
      "wird als Mitglied angelegt und bekommt eine Einladung per E-Mail.",
    );
    await confirm.getByRole("button", { name: "Annehmen" }).click();
    await expect(
      page.getByText(
        `${person.first} ${person.last} ist jetzt Mitglied und bekommt eine Einladung per E-Mail.`,
      ),
    ).toBeVisible();
    const decided = page
      .getByRole("region", { name: "Zuletzt entschieden" })
      .getByRole("listitem")
      .filter({ hasText: `${person.first} ${person.last}` });
    await expect(decided).toContainText(/Angenommen am \d{2}\.\d{2}\.\d{4} von Anna Admin/);
    await expect(
      decided.getByRole("link", { name: `Zum Mitglied ${person.first} ${person.last}` }),
    ).toBeVisible();

    // Das Mitglied steht in der Liste …
    await open(page, `/mitglieder?q=${person.last}`);
    await expect(page.getByRole("link", { name: `${person.last}, ${person.first}` })).toBeVisible();

    // … und die Einladung liegt im Postausgang – mit einem Link, der zur Kontoanlage führt.
    await expect.poll(() => outboxMailsTo(person.email).length, { timeout: 15_000 }).toBe(1);
    const invitation = outboxMailsTo(person.email)[0]!;
    expect(invitation.subject).toBe("Einladung zu TSV Musterstadt 1898 e.V.");
    expect(invitation.text).toContain("(Rolle: Mitglied)");
    const invitationUrl = /http:\/\/localhost:3100\/einladung\/[A-Za-z0-9_-]{43}/.exec(
      invitation.text,
    )?.[0];
    expect(invitationUrl).toBeTruthy();
    await guest.goto(invitationUrl!);
    await expect(guest.getByRole("heading", { name: "Konto anlegen und beitreten" })).toBeVisible();

    // Solange die Person kein Konto hat, lässt sich die Einladung unter „Zuletzt entschieden“ erneut senden (z. B. wenn
    // sie abgelaufen ist) – dieselbe Berechtigung wie das Annehmen.
    await open(page, "/mitglieder/antraege");
    const row = page
      .getByRole("region", { name: "Zuletzt entschieden" })
      .getByRole("listitem")
      .filter({ hasText: `${person.first} ${person.last}` });
    await expect(row).toContainText(/Noch kein Konto – Einladung gültig bis \d{2}\.\d{2}\.\d{4}/);
    await row.getByRole("button", { name: /^Einladung erneut senden/ }).click();
    await expect(page.getByText(`Einladung an ${person.email} verschickt.`)).toBeVisible();
    await expect.poll(() => outboxMailsTo(person.email).length, { timeout: 15_000 }).toBe(2);
    await guestContext.close();
  });

  test("ein neuer Code macht den alten Link ungültig, „Beitritt schließen“ stoppt neue Anträge", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await login(page, USERS.admin);
    const oldLink = await setUpJoinLink(page);

    // Jemand hat das Formular mit dem alten Code schon geöffnet …
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(oldLink);
    await guest.waitForLoadState("networkidle");
    await fillApplication(guest, {
      first: "Otto",
      last: "Altcode",
      email: `otto.${Date.now() % 1_000_000}@example.org`,
    });

    // … dann erzeugt der Verein einen neuen.
    await page.getByRole("button", { name: "Neuen Code erzeugen" }).click();
    const confirm = page.getByRole("dialog", { name: "Neuen QR-Code erzeugen?" });
    await expect(confirm).toContainText(
      "Der alte QR-Code funktioniert danach nicht mehr – bereits gedruckte Aushänge musst du ersetzen.",
    );
    // Die Anzahl ist vorbelegt (die bisherige), der neue Code beginnt wieder bei 0
    await expect(confirm.locator('input[name="limit"]')).not.toHaveValue("");
    await confirm.getByRole("button", { name: "Neuen Code erzeugen" }).click();
    await expect(page.getByText(/^0 von \d+ Anmeldung(en)? genutzt$/)).toBeVisible();
    const linkField = page.getByLabel("Link zum Antragsformular");
    await expect(linkField).not.toHaveValue(oldLink);
    const newLink = await linkField.inputValue();

    // Das offene Formular mit dem alten Code wird abgewiesen, die Seite zum alten Code nennt keinen Verein mehr.
    await guest.getByRole("button", { name: "Antrag senden" }).click();
    await expect(guest.getByRole("alert").filter({ hasText: INVALID })).toBeVisible();
    await guest.goto(oldLink);
    await expect(guest.getByText(INVALID)).toBeVisible();
    await expect(guest.getByText("TSV Musterstadt 1898 e.V.")).toHaveCount(0);
    expect(await violations(guest)).toEqual([]);
    await guest.goto(newLink);
    await expect(guest.getByRole("heading", { level: 1, name: "Mitglied werden" })).toBeVisible();

    // Beitritt schließen: auch der neue Link gilt nicht mehr, die Karte bietet wieder „QR-Code einrichten“ an.
    await page.getByRole("button", { name: "Beitritt schließen" }).click();
    await page
      .getByRole("alertdialog", { name: "Beitritt per QR-Code schließen?" })
      .getByRole("button", { name: "Beitritt schließen" })
      .click();
    await expect(page.getByRole("button", { name: "QR-Code einrichten" })).toBeVisible();
    await guest.goto(newLink);
    await expect(guest.getByText(INVALID)).toBeVisible();
    await guestContext.close();
  });

  test("begrenzte Plätze: Ist die Anzahl erreicht, nimmt der QR-Code keine Anträge mehr an – Ablehnen gibt den Platz zurück", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await login(page, USERS.admin);
    const link = await setUpJoinLink(page);
    const usage = page.getByText(/^\d+ von \d+ Anmeldung(en)? genutzt$/);
    const used = Number(/^(\d+)/.exec((await usage.textContent()) ?? "")?.[1]);

    /** Anzahl ändern (ohne neuen Code). */
    const setLimit = async (limit: number) => {
      await page.getByRole("button", { name: "Anzahl ändern" }).click();
      const dialog = page.getByRole("dialog", { name: "Anzahl der Anmeldungen ändern" });
      await dialog.locator('input[name="limit"]').fill(String(limit));
      await dialog.getByRole("button", { name: "Speichern" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByText(new RegExp(`^\\d+ von ${limit} Anmeldung(en)? genutzt$`)),
      ).toBeVisible();
    };
    // Nur noch ein Platz frei
    await setLimit(used + 1);
    await expect(page.getByText("– noch 1 Platz frei.")).toBeVisible();

    const person = {
      first: "Lotte",
      last: "Letzterplatz",
      email: `lotte.${Date.now() % 1_000_000}@example.org`,
    };
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(link);
    await fillApplication(guest, person);
    await guest.getByRole("button", { name: "Antrag senden" }).click();
    await expect(guest.getByText("Danke, dein Antrag ist beim Verein angekommen.")).toBeVisible();

    // Wer jetzt scannt, kann keinen Antrag mehr stellen
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: "Alle Plätze vergeben" })).toBeVisible();
    await expect(guest.getByRole("button", { name: "Antrag senden" })).toHaveCount(0);
    expect(await violations(guest)).toEqual([]);

    // Die Verwaltung sieht den Hinweis; Ablehnen gibt den Platz zurück
    await open(page, "/mitglieder/antraege");
    await expect(
      page.getByText(
        used === 0 ? "Der einzige Platz ist vergeben." : `Alle ${used + 1} Plätze sind vergeben.`,
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    expect(await violations(page)).toEqual([]);
    const card = page
      .getByRole("heading", { level: 3, name: `${person.first} ${person.last}` })
      .locator("xpath=ancestor::div[@data-slot='card'][1]");
    await card.getByRole("button", { name: "Ablehnen" }).click();
    await page
      .getByRole("alertdialog", { name: `Antrag von ${person.first} ${person.last} ablehnen?` })
      .getByRole("button", { name: "Ablehnen" })
      .click();
    await expect(
      page.getByText(new RegExp(`^${used} von ${used + 1} Anmeldung(en)? genutzt$`)),
    ).toBeVisible();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { level: 1, name: "Mitglied werden" })).toBeVisible();

    // Wieder reichlich Plätze für die übrigen Tests
    await setLimit(1000);
    await guestContext.close();
  });

  test("Aushang: großer QR-Code mit Link und Schritten; beim Drucken bleibt nur das Blatt", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const link = await setUpJoinLink(page);
    await expect(page.getByRole("link", { name: "Aushang drucken" })).toHaveAttribute(
      "href",
      "/mitglieder/antraege/aushang",
    );
    // Neu laden statt klicken: Eine Erfolgsmeldung vom Einrichten stünde sonst noch halb eingeblendet über der Seite.
    await open(page, "/mitglieder/antraege/aushang");
    await expect(page.getByRole("heading", { level: 1, name: "Aushang drucken" })).toBeVisible();
    const poster = page.locator("#aushang");
    await expect(poster.getByRole("heading", { name: "Mitglied werden" })).toBeVisible();
    await expect(poster.getByRole("img", { name: "QR-Code zum Beitrittsformular" })).toBeVisible();
    await expect(poster.getByText(link, { exact: true })).toBeVisible();
    await expect(poster.getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Aushang drucken" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      expect(await violations(page), colorScheme).toEqual([]);
    }
    expect(await page.locator("#aushang-seitenstil").textContent()).toContain("size: A4 portrait;");

    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await expect(page.getByRole("button", { name: "Aushang drucken" })).toBeHidden();
    await expect(page.getByRole("link", { name: "Beitrittsanträge" })).toBeHidden();
    await expect(poster.getByRole("img", { name: "QR-Code zum Beitrittsformular" })).toBeVisible();
    await expect(poster.getByRole("button")).toHaveCount(0);
  });

  test("nur Vereinsadministrator und Vorstand: Abteilungsleitung und Mitglieder sehen weder Knopf noch Seite", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    await open(page, "/mitglieder");
    await expect(page.getByRole("link", { name: /^Anträge/ })).toBeVisible();

    await page.context().clearCookies();
    await login(page, USERS.abteilung);
    await open(page, "/mitglieder");
    await expect(page.getByRole("heading", { level: 1, name: "Mitglieder" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Anträge/ })).toHaveCount(0);
    for (const path of ["/mitglieder/antraege", "/mitglieder/antraege/aushang"]) {
      await open(page, path);
      await expect(page.getByRole("heading", { name: "Kein Zugriff" })).toBeVisible();
      await expect(page.getByRole("img", { name: "QR-Code zum Beitrittsformular" })).toHaveCount(0);
    }

    await page.context().clearCookies();
    await login(page, USERS.mitglied);
    await open(page, "/mitglieder/antraege");
    await expect(page.getByRole("heading", { name: "Kein Zugriff" })).toBeVisible();
  });
});
