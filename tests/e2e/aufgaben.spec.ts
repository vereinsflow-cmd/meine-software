import { expect, test } from "@playwright/test";
import { USERS, login, open } from "./helpers";

/** Aufgaben und Checklisten im Browser. Alle Änderungen werden am Ende der Tests wieder zurückgenommen bzw. sind eindeutig benannt. */
const uniqueTitle = (prefix: string) => `${prefix} ${Date.now() % 100000}`;

test.describe("Aufgaben – Verwaltung", () => {
  test("Liste zeigt offene Aufgaben mit Status, Priorität und Frist; Erledigtes ist über die Ansicht erreichbar", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/aufgaben");
    await expect(page.getByRole("heading", { level: 1, name: "Aufgaben" })).toBeVisible();

    const ordnungsamt = page.getByRole("listitem", {
      name: "Aufgabe Genehmigung beim Ordnungsamt einreichen",
    });
    await expect(ordnungsamt).toBeVisible();
    await expect(ordnungsamt.getByText("In Bearbeitung").first()).toBeVisible();
    await expect(ordnungsamt.getByText("Hoch")).toBeVisible();
    await expect(ordnungsamt).toContainText("Bernd Vorstand");
    await expect(
      page
        .getByRole("listitem", { name: "Aufgabe Getränke bestellen" })
        .getByText("Dringend")
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("listitem", { name: "Aufgabe Bierzeltgarnituren mieten" })
        .getByText("Blockiert")
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "Aufgabe Bierzeltgarnituren mieten" }),
    ).toContainText("Intern: Wartet auf Rückmeldung"); // Notizen sehen Verwalter

    // Erledigtes ist in der Standardansicht ausgeblendet …
    await expect(
      page.getByRole("listitem", { name: "Aufgabe Plakate drucken und aufhängen" }),
    ).toHaveCount(0);
    await page.getByLabel("Ansicht wählen").selectOption("erledigt");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/ansicht=erledigt/);
    await expect(
      page.getByRole("listitem", { name: "Aufgabe Plakate drucken und aufhängen" }),
    ).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Aufgabe Getränke bestellen" })).toHaveCount(0);
  });

  test("Aufgabe anlegen, Zuständige werden benachrichtigt, Status ändern, bearbeiten, löschen", async ({
    page,
    browser,
  }) => {
    const title = uniqueTitle("E2E Aufgabe");
    await login(page, USERS.admin);
    await open(page, "/aufgaben");

    await page.getByRole("button", { name: "Neue Aufgabe" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
    await dialog.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(dialog.getByText("Bitte gib einen Titel ein.")).toBeVisible(); // Validierung

    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Beschreibung").fill("Im automatisierten Test angelegt.");
    await dialog.getByLabel("Zuständig").selectOption({ label: "Helfer, Hans" });
    await dialog.getByLabel("Fällig am").fill("2031-05-17");
    await dialog.getByLabel("Priorität").selectOption("URGENT");
    await dialog.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(page.getByText("Aufgabe angelegt.")).toBeVisible();

    const row = page.getByRole("listitem", { name: `Aufgabe ${title}` });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Hans Helfer");
    await expect(row).toContainText("Fällig: 17.05.2031");
    await expect(row.getByText("Dringend").first()).toBeVisible();

    // Hans sieht die Aufgabe (nur seine) und wurde benachrichtigt.
    const hansContext = await browser.newContext();
    const hans = await hansContext.newPage();
    await login(hans, USERS.helfer);
    await open(hans, "/aufgaben");
    await expect(hans.getByRole("listitem", { name: `Aufgabe ${title}` })).toBeVisible();
    await expect(hans.getByRole("button", { name: "Neue Aufgabe" })).toHaveCount(0); // keine Verwaltung
    await expect(
      hans
        .getByRole("listitem", { name: `Aufgabe ${title}` })
        .getByRole("button", { name: /Bearbeiten|Löschen/ }),
    ).toHaveCount(0);
    await hans.goto("/benachrichtigungen");
    await expect(hans.getByText(`Neue Aufgabe: ${title}`)).toBeVisible();

    // … und darf den Status selbst ändern.
    await open(hans, "/aufgaben");
    await hans.getByLabel(`Status von ${title}`).selectOption("IN_PROGRESS");
    await expect(
      hans
        .getByRole("listitem", { name: `Aufgabe ${title}` })
        .getByText("In Bearbeitung")
        .first(),
    ).toBeVisible();
    await hansContext.close();

    // Bearbeiten
    await page.reload();
    await page
      .getByRole("listitem", { name: `Aufgabe ${title}` })
      .getByRole("button", { name: "Bearbeiten" })
      .click();
    const edit = page.getByRole("dialog", { name: "Aufgabe bearbeiten" });
    await expect(edit.getByLabel("Titel")).toHaveValue(title);
    await edit.getByLabel("Titel").fill(`${title} (geändert)`);
    await edit.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Aufgabe gespeichert.")).toBeVisible();
    const renamed = page.getByRole("listitem", { name: `Aufgabe ${title} (geändert)` });
    await expect(renamed).toBeVisible();

    // Status auf "Erledigt": verschwindet aus den offenen Aufgaben
    await renamed.getByLabel(`Status von ${title} (geändert)`).selectOption("DONE");
    await expect(renamed).toHaveCount(0);

    // Löschen (in der Ansicht "Alle")
    await page.goto("/aufgaben?ansicht=alle");
    const done = page.getByRole("listitem", { name: `Aufgabe ${title} (geändert)` });
    await expect(done).toBeVisible();
    await done.getByRole("button", { name: "Löschen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
    await expect(page.getByText("Aufgabe gelöscht.")).toBeVisible();
    await expect(done).toHaveCount(0);
  });

  test("Filter: Zuständigkeit 'Mir zugewiesen', Priorität und Suche", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/aufgaben");
    await page.getByLabel("Nach Zuständigkeit filtern").selectOption("me");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/zustaendig=me/);
    await expect(page.getByRole("listitem", { name: "Aufgabe Helfer einteilen" })).toBeVisible(); // Anna
    await expect(page.getByRole("listitem", { name: "Aufgabe Getränke bestellen" })).toHaveCount(0); // Claudia

    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(/\/aufgaben$/);
    // Über die Rolle suchen: Solange die neue Seite nachlädt, liegt kurz noch eine unsichtbare Kopie des Filters im Dokument.
    await page.getByRole("combobox", { name: "Nach Priorität filtern" }).selectOption("URGENT");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page.getByRole("listitem", { name: "Aufgabe Getränke bestellen" })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Aufgabe Helfer einteilen" })).toHaveCount(0);

    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(/\/aufgaben$/);
    await page.getByRole("searchbox", { name: "Aufgaben durchsuchen" }).fill("beiträge");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(
      page.getByRole("listitem", { name: "Aufgabe Mitgliedsbeiträge für 2027 planen" }),
    ).toBeVisible();
    await expect(page.getByRole("listitem", { name: /^Aufgabe / })).toHaveCount(1);
  });
});

test.describe("Aufgaben – Sichtbarkeit nach Rolle", () => {
  test("Abteilungsleiterin sieht ihre Aufgaben und verwaltet nur solche ihrer Abteilung", async ({
    page,
  }) => {
    await login(page, USERS.abteilung);
    await open(page, "/aufgaben");
    await expect(page.getByRole("listitem", { name: "Aufgabe Getränke bestellen" })).toBeVisible(); // ihr zugewiesen
    await expect(
      page.getByRole("listitem", { name: "Aufgabe Mitgliedsbeiträge für 2027 planen" }),
    ).toHaveCount(0); // vereinsweit, fremd
    await expect(page.getByRole("button", { name: "Neue Aufgabe" }).first()).toBeVisible();
  });

  test("Mitglied ohne Aufgabenrecht: kein Menüpunkt, Seite verweigert den Zugriff", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await expect(
      page
        .getByRole("navigation", { name: "Hauptnavigation" })
        .first()
        .getByRole("link", { name: "Aufgaben" }),
    ).toHaveCount(0);
    await open(page, "/aufgaben");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    await expect(page.getByRole("listitem", { name: /Aufgabe / })).toHaveCount(0);
  });

  test("Anderer Verein sieht keine Aufgaben des TSV", async ({ page }) => {
    await login(page, USERS.otherAdmin);
    await open(page, "/aufgaben");
    await expect(page.getByRole("heading", { level: 1, name: "Aufgaben" })).toBeVisible();
    await expect(page.getByText("Getränke bestellen")).toHaveCount(0);
    await expect(page.getByText("Vorbereitung Sommerfest")).toHaveCount(0);
  });

  test("Dashboard zeigt 'Meine Aufgaben'", async ({ page }) => {
    await login(page, USERS.abteilung);
    const widget = page.getByRole("region", { name: "Meine Aufgaben" });
    await expect(widget.getByRole("link", { name: "Getränke bestellen" })).toBeVisible();
    await expect(widget.getByText("Dringend").first()).toBeVisible();
    await widget.getByRole("link", { name: "Alle Aufgaben" }).click();
    await expect(page).toHaveURL(/\/aufgaben$/);
  });
});

test.describe("Checklisten", () => {
  test("Sommerfest-Checkliste: abhaken, Punkt hinzufügen und entfernen – auf der Veranstaltungsseite", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/veranstaltungen");
    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    const card = page.getByRole("region", { name: "Aufgaben und Checklisten" });
    const list = card.getByRole("region", { name: "Checkliste Vorbereitung Sommerfest" });
    await expect(list).toBeVisible();
    await expect(list.getByLabel("1 von 6 erledigt")).toBeVisible(); // im Seed ist ein Punkt erledigt

    const item = list.getByRole("checkbox", { name: "Material vorbereiten" });
    await expect(item).not.toBeChecked();
    await item.click();
    await expect(item).toBeChecked();
    await expect(list.getByLabel("2 von 6 erledigt")).toBeVisible();
    await item.click(); // zurück
    await expect(item).not.toBeChecked();

    // Punkt hinzufügen und wieder entfernen
    const text = uniqueTitle("Tische reservieren");
    await list.getByLabel("Neuer Punkt").fill(text);
    await list.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(list.getByRole("checkbox", { name: text })).toBeVisible();
    await expect(list.getByLabel(/von 7 erledigt/)).toBeVisible();
    await list.getByRole("button", { name: `Punkt „${text}“ entfernen` }).click();
    await expect(list.getByRole("checkbox", { name: text })).toHaveCount(0);
    await expect(list.getByLabel("1 von 6 erledigt")).toBeVisible();

    await expect(
      card.getByRole("link", { name: "Aufgaben zu dieser Veranstaltung" }),
    ).toHaveAttribute("href", /\/aufgaben\?veranstaltung=[0-9a-f-]{36}&ansicht=alle/);
  });

  test("Neue Checkliste anlegen und löschen; auch in der Aufgabenübersicht sichtbar", async ({
    page,
  }) => {
    const title = uniqueTitle("E2E Liste");
    await login(page, USERS.admin);
    await open(page, "/aufgaben");
    await page.getByRole("button", { name: "Neue Checkliste" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Checkliste" });
    await dialog.getByLabel("Titel").fill(title);
    // Die Auswahl nennt das Datum mit („Sommerfest 2026 · Sa., 10.10.2026“); den Tag legt der Seed relativ zu heute fest.
    const eventSelect = dialog.getByLabel("Veranstaltung");
    const sommerfest = eventSelect.locator("option", {
      hasText: /^Sommerfest 2026 · [A-Z][a-z]\., \d{2}\.\d{2}\.\d{4}$/,
    });
    await expect(sommerfest).toHaveCount(1);
    await eventSelect.selectOption((await sommerfest.getAttribute("value"))!);
    await dialog.getByRole("button", { name: "Checkliste anlegen" }).click();
    await expect(page.getByText("Checkliste angelegt.")).toBeVisible();

    const list = page.getByRole("region", { name: `Checkliste ${title}` });
    await expect(list).toBeVisible();
    await expect(list.getByText("Noch keine Punkte.")).toBeVisible();
    await list.getByLabel("Neuer Punkt").fill("Erster Punkt");
    await list.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(list.getByRole("checkbox", { name: "Erster Punkt" })).toBeVisible();

    await list.getByRole("button", { name: `Checkliste ${title} löschen` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Löschen" }).click();
    await expect(page.getByText("Checkliste gelöscht.")).toBeVisible();
    await expect(list).toHaveCount(0);
  });

  test("Helfer sehen keine Checklisten (weder auf der Aufgabenseite noch bei der Veranstaltung)", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await open(page, "/aufgaben");
    await expect(page.getByRole("heading", { level: 2, name: "Checklisten" })).toHaveCount(0);
    await open(page, "/veranstaltungen");
    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Sommerfest 2026" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Aufgaben und Checklisten" })).toHaveCount(0);
  });
});
