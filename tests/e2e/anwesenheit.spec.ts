import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, createPublishedPastTraining, login, open } from "./helpers";

/**
 * Anwesenheit bei Trainings: erfassen (Gruppe laden, Personen hinzufügen, drei Knöpfe je Person, „Alle anwesend“, Speichern),
 * korrigieren, Zahlen auf der Veranstaltungsseite, Auswertung mit Filter und CSV, die eigene Anwesenheit auf der
 * Mitgliedsseite – und wer was darf. Das Training legt der Test selbst an (gestern, Fußball).
 */
const suffix = String(Date.now() % 100000);
const TITLE = `Anwesenheitstraining ${suffix}`;
let eventId = "";

/** Die drei Auswahlknöpfe einer Person (Gruppe mit ihrem Namen). */
const person = (page: Page, name: string) => page.getByRole("group", { name, exact: true });

async function choose(page: Page, name: string, status: "Anwesend" | "Entschuldigt" | "Fehlt") {
  await person(page, name).getByText(status, { exact: true }).click();
  await expect(person(page, name).getByRole("radio", { name: status })).toBeChecked();
}

test.describe.serial("Anwesenheit", () => {
  test("Vereinsadministrator: Gruppe laden, Personen hinzufügen, erfassen, speichern und korrigieren", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, USERS.admin);
    eventId = await createPublishedPastTraining(page, TITLE);

    // Veranstaltungsseite: noch nichts erfasst
    // (Die Karte steht zweimal im Code – für schmale und breite Bildschirme; zu sehen ist eine.)
    await expect(page.getByText("Noch nicht erfasst.").filter({ visible: true })).toBeVisible();
    await page.getByRole("link", { name: "Anwesenheit erfassen" }).click();
    await expect(page).toHaveURL(new RegExp(`/veranstaltungen/${eventId}/anwesenheit$`));
    await expect(page.getByRole("heading", { level: 1, name: "Anwesenheit" })).toBeVisible();
    await expect(page.getByText(new RegExp(`${TITLE} · .* · Fußball`))).toBeVisible();
    await expect(page.getByText("Noch niemand auf der Liste")).toBeVisible();
    const save = page.getByRole("button", { name: /^Speichern \(\d+\)$/ });
    await expect(save).toHaveText("Speichern (0)");
    await expect(save).toBeDisabled();
    await page.waitForLoadState("networkidle");

    // Gruppe laden und einzelne Personen dazu
    await page.getByLabel("Gruppe wählen").selectOption({ label: "1. Herrenmannschaft" });
    await page.getByRole("button", { name: "Gruppe laden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "hinzugefügt" })).toHaveText(
      "1 Person aus „1. Herrenmannschaft“ hinzugefügt.",
    );
    await page.getByLabel("Person wählen").selectOption({ label: "Mitglied, Maria" });
    await page.getByRole("button", { name: "Person hinzufügen" }).click();
    // Der Fokus springt auf „Anwesend“ der neuen Zeile – gleich weiter mit der Tastatur
    await expect(
      person(page, "Mitglied, Maria").getByRole("radio", { name: "Anwesend" }),
    ).toBeFocused();
    await page.getByLabel("Person wählen").selectOption({ label: "Abteilungsleiterin, Claudia" });
    await page.getByRole("button", { name: "Person hinzufügen" }).click();

    const list = page.getByRole("list", { name: "Anwesenheit je Person" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("listitem").first()).toContainText("Abteilungsleiterin, Claudia"); // nach Namen sortiert
    await expect(list.getByText("neu auf der Liste")).toHaveCount(3);
    expect(await violations(page)).toEqual([]);

    await choose(page, "Mitglied, Maria", "Entschuldigt");
    await choose(page, "Abteilungsleiterin, Claudia", "Fehlt");
    await page.getByRole("button", { name: "Alle anwesend" }).click(); // nur die noch offenen
    await expect(
      person(page, "Helfer, Hans").getByRole("radio", { name: "Anwesend" }),
    ).toBeChecked();
    await expect(
      person(page, "Mitglied, Maria").getByRole("radio", { name: "Entschuldigt" }),
    ).toBeChecked();
    await expect(page.getByRole("button", { name: "Alle anwesend" })).toBeDisabled();
    await expect(
      page.getByText("3 Personen · 1 anwesend · 1 entschuldigt · 1 fehlt · 0 offen"),
    ).toBeVisible();
    await expect(page.getByText("3 Änderungen noch nicht gespeichert")).toBeVisible();

    await expect(save).toHaveText("Speichern (3)");
    await save.click();
    await expect(
      page.getByText("Anwesenheit gespeichert: 1 anwesend, 1 entschuldigt, 1 gefehlt."),
    ).toBeVisible();
    await expect(save).toHaveText("Speichern (0)");

    // Nach dem Neuladen steht das Gespeicherte da; Claudia kam doch noch – korrigieren
    await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
    await expect(
      person(page, "Mitglied, Maria").getByRole("radio", { name: "Entschuldigt" }),
    ).toBeChecked();
    await expect(
      person(page, "Abteilungsleiterin, Claudia").getByRole("radio", { name: "Fehlt" }),
    ).toBeChecked();
    await choose(page, "Abteilungsleiterin, Claudia", "Anwesend");
    await expect(save).toHaveText("Speichern (1)");
    await save.click();
    await expect(
      page.getByText("Anwesenheit gespeichert: 2 anwesend, 1 entschuldigt, 0 gefehlt."),
    ).toBeVisible();

    // Veranstaltungsseite: die Zahlen
    await open(page, `/veranstaltungen/${eventId}`);
    await expect(
      page.getByText(/Anwesend:\s*2\s*von\s*3\s*· 1 entschuldigt/).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Anwesenheit erfassen" })).toBeVisible();
  });

  test("Auswertung: je Person mit Quote, Filter nach Gruppe, CSV-Export", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/veranstaltungen");
    await page.getByRole("link", { name: "Anwesenheit", exact: true }).click();
    await expect(page).toHaveURL(/\/veranstaltungen\/anwesenheit$/);
    await expect(page.getByRole("heading", { level: 1, name: "Anwesenheit" })).toBeVisible();
    await expect(
      page.getByText(/^Trainings vom \d{2}\.\d{2}\.\d{4} bis \d{2}\.\d{2}\.\d{4}$/),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ Trainings? erfasst · im Schnitt/)).toBeVisible();

    const table = page.getByRole("table", { name: "Anwesenheit je Person" });
    const hans = table.getByRole("row").filter({ hasText: "Helfer, Hans" });
    await expect(hans.getByRole("cell")).toHaveText(["Helfer, Hans", "1", "0", "0", "100 %"]);
    const maria = table.getByRole("row").filter({ hasText: "Mitglied, Maria" });
    await expect(maria.getByRole("cell")).toHaveText(["Mitglied, Maria", "0", "1", "0", "0 %"]);
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);

    // Nur die Gruppe „1. Herrenmannschaft“
    await page
      .getByLabel("Gruppe", { exact: true })
      .selectOption({ label: "1. Herrenmannschaft (Fußball)" });
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/gruppe=/);
    await expect(table.getByRole("row").filter({ hasText: "Helfer, Hans" })).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: "Mitglied, Maria" })).toHaveCount(0);
    await page.getByRole("link", { name: "Zurücksetzen" }).click();
    await expect(page).toHaveURL(/\/veranstaltungen\/anwesenheit$/);

    // CSV: eine Zeile je Person und Termin
    const download = page.getByRole("link", { name: "Export", exact: true });
    const response = await page.request.get((await download.getAttribute("href"))!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toMatch(/anwesenheit-\d{4}-\d{2}-\d{2}\.csv/);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const csv = await response.text();
    expect(csv).toContain("Datum;Beginn;Termin;Art;Abteilung;Nachname;Vorname;Status");
    expect(csv).toContain(`;18:00;${TITLE};Training;Fußball;Mitglied;Maria;Entschuldigt`);
    expect(csv).toContain(`;18:00;${TITLE};Training;Fußball;Helfer;Hans;Anwesend`);
  });

  test("ungespeicherte Änderungen: ein Link fragt nach, bevor die Seite wechselt", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
    await choose(page, "Helfer, Hans", "Fehlt");
    const save = page.getByRole("button", { name: "Speichern (1)" });
    await expect(save).toBeEnabled();
    const back = page.getByRole("link", { name: TITLE, exact: true });

    // „Abbrechen“ in der Rückfrage: Die Seite bleibt, die Änderung auch.
    const questions: string[] = [];
    page.once("dialog", (dialog) => {
      questions.push(`${dialog.type()}: ${dialog.message()}`);
      void dialog.dismiss();
    });
    await back.click();
    await expect.poll(() => questions).toEqual([expect.stringMatching(/^confirm: .*verlassen\?/)]);
    await expect(page).toHaveURL(new RegExp(`/veranstaltungen/${eventId}/anwesenheit$`));
    await expect(person(page, "Helfer, Hans").getByRole("radio", { name: "Fehlt" })).toBeChecked();
    await expect(save).toBeVisible();

    // „OK“: Die Seite wechselt (ohne zweite Rückfrage), gespeichert wurde nichts.
    page.once("dialog", (dialog) => void dialog.accept());
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/veranstaltungen/${eventId}$`));
    await expect(
      page.getByText(/Anwesend:\s*2\s*von\s*3\s*· 1 entschuldigt/).filter({ visible: true }),
    ).toBeVisible();
  });

  test("Abteilungsleiterin: Training der eigenen Abteilung, Personen nur aus ihrer Abteilung", async ({
    page,
  }) => {
    await login(page, USERS.abteilung);
    await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
    await expect(page.getByRole("heading", { level: 1, name: "Anwesenheit" })).toBeVisible();
    await expect(
      person(page, "Helfer, Hans").getByRole("radio", { name: "Anwesend" }),
    ).toBeChecked();
    // Bernd ist nur in der Handballabteilung – nicht zur Auswahl
    const candidates = page.getByLabel("Person wählen").locator("option");
    await expect(candidates.filter({ hasText: "Vorstand, Bernd" })).toHaveCount(0);

    await open(page, "/veranstaltungen/anwesenheit");
    await expect(
      page
        .getByRole("table", { name: "Anwesenheit je Person" })
        .getByRole("row")
        .filter({ hasText: "Helfer, Hans" }),
    ).toBeVisible();
  });

  test("Mitglied: sieht die eigene Anwesenheit, aber weder Listen noch Auswertung", async ({
    page,
  }) => {
    await login(page, USERS.mitglied);
    await open(page, "/datenschutz");
    await page.getByRole("link", { name: "Meine Mitgliedsdaten ansehen" }).click();
    const heading = page.getByRole("heading", { level: 2, name: "Anwesenheit", exact: true });
    await expect(heading).toBeVisible();
    await expect(
      page.getByText("So oft warst du bei Terminen, für die Anwesenheit erfasst wurde."),
    ).toBeVisible();
    const recent = page.getByRole("listitem").filter({ hasText: TITLE });
    await expect(recent).toContainText("Entschuldigt");
    await expect(recent.getByRole("link", { name: TITLE })).toBeVisible();

    await open(page, `/veranstaltungen/${eventId}`);
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByRole("link", { name: /Anwesenheit (erfassen|ansehen)/ })).toHaveCount(0);
    await open(page, `/veranstaltungen/${eventId}/anwesenheit`);
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    await open(page, "/veranstaltungen/anwesenheit");
    await expect(page.getByText("Kein Zugriff")).toBeVisible();
    const response = await page.request.get("/api/veranstaltungen/anwesenheit/export");
    expect(response.status()).toBe(403);
    await open(page, "/veranstaltungen");
    await expect(page.getByRole("link", { name: "Anwesenheit", exact: true })).toHaveCount(0);
  });

  test("künftiges Training: Erfassen erst ab einer Stunde vor Beginn", async ({ page }) => {
    await login(page, USERS.admin);
    await open(page, "/veranstaltungen");
    await page
      .getByRole("link", { name: /Fußball-Training Herren/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Fußball-Training Herren" }),
    ).toBeVisible();
    await expect(
      page
        .getByText(/^Erfassen geht ab \d{2}\.\d{2}\.\d{4},? \d{2}:\d{2} Uhr\.$/)
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Anwesenheit erfassen" })).toHaveCount(0);

    await open(page, `${new URL(page.url()).pathname}/anwesenheit`);
    await expect(
      page.getByText(/Die Anwesenheit lässt sich erst ab 60 Minuten vor Beginn erfassen\./),
    ).toBeVisible();
    await expect(page.getByText("Nichts erfasst")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Speichern/ })).toHaveCount(0);
  });
});
