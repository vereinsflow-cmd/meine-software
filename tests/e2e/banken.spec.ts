import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { violations } from "./axe";
import { USERS, ensureLedger, login, open } from "./helpers";

/**
 * Feld „Bank“ mit Vorschlägen aller deutschen Banken (Bankleitzahlendatei der Bundesbank): beim Tippen erscheint eine
 * Liste („sparkasse vest“ → „Sparkasse Vest Recklinghausen“), ein Vorschlag füllt das Feld nur – Freitext bleibt erlaubt.
 * Geprüft im Fenster „Konto hinzufügen“ bzw. „Konto bearbeiten“; die Einrichtung des Kassenbuchs (Freitext
 * „Sparkasse Musterstadt“) deckt `ensureLedger` ab. Am Handy: banken.mobil.spec.ts.
 */

const VEST = "Sparkasse Vest Recklinghausen";

/** Eindeutiger Kontoname – Kontonamen sind je Verein eindeutig, und Tests können wiederholt laufen. */
const uniqueName = (prefix: string) => `E2E ${prefix} ${Date.now().toString(36)}`;

/** Antwort der Bankensuche auf genau diesen Suchtext. */
function answer(page: Page, q: string): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/banken" && url.searchParams.get("q") === q;
  });
}

const suggestions = (page: Page) => page.getByRole("listbox", { name: "Vorschläge" });
const bankField = (dialog: Locator) =>
  dialog.getByRole("combobox", { name: "Bank oder Beschreibung" });

/** Angemeldet als Kassenwart, Kassenbuch eingerichtet, Fenster „Konto hinzufügen“ offen. */
async function openAddAccount(page: Page): Promise<Locator> {
  await login(page, USERS.vorstand);
  await ensureLedger(page);
  await open(page, "/finanzen/einstellungen");
  await page.getByRole("button", { name: "Konto hinzufügen" }).click();
  const dialog = page.getByRole("dialog", { name: "Konto hinzufügen" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Erfundene Antwort der Schnittstelle (für Reihenfolge, Fehler und Extremfälle). */
function stubBody(names: readonly string[], detail = "Teststadt · BLZ 100 000 00") {
  return {
    ok: true,
    data: {
      banks: names.map((name, index) => ({
        id: `stub-${index}`,
        name,
        place: "Teststadt",
        detail,
        value: name.slice(0, 60),
      })),
    },
  };
}

const isBankSearch = (url: URL) => url.pathname === "/api/banken";

/** Liegt der Vorschlag ganz im sichtbaren Teil der Liste (nicht weggescrollt)? */
const insideList = (option: Locator) =>
  option.evaluate((element) => {
    const list = element.closest("[role=listbox]")!.getBoundingClientRect();
    const own = element.getBoundingClientRect();
    return own.top >= list.top - 0.5 && own.bottom <= list.bottom + 0.5;
  });

test.describe("Bankvorschläge – Schnittstelle", () => {
  test("Suche nach Name, Grenzen und Zwischenspeicher", async ({ request }) => {
    const vest = await request.get("/api/banken?q=sparkasse%20vest");
    expect(vest.status()).toBe(200);
    const body = (await vest.json()) as { ok: boolean; data: { banks: { name: string }[] } };
    expect(body.ok).toBe(true);
    expect(body.data.banks[0]?.name).toBe(VEST);
    expect(vest.headers()["cache-control"]).toContain("max-age");

    // Breite Suche: höchstens 8 Vorschläge
    const broad = (await (await request.get("/api/banken?q=sparkasse")).json()) as typeof body;
    expect(broad.data.banks.length).toBeGreaterThan(0);
    expect(broad.data.banks.length).toBeLessThanOrEqual(8);

    // Ein Zeichen: noch keine Suche; Freitext ohne Bank: leer, kein Fehler
    expect(await (await request.get("/api/banken?q=a")).json()).toEqual({
      ok: true,
      data: { banks: [] },
    });
    expect(await (await request.get("/api/banken?q=Vereinsheim")).json()).toEqual({
      ok: true,
      data: { banks: [] },
    });

    // Länger als das Feld (60 Zeichen): abgelehnt
    expect((await request.get(`/api/banken?q=${"x".repeat(61)}`)).status()).toBe(422);

    // Eine IBAN in der Adresse wird nicht zwischengespeichert (enthielte die Kontonummer) – auch mit Text davor
    for (const q of ["DE12426501500000000000", "IBAN: DE12 4265 0150 0000 0000 00"]) {
      const iban = await request.get(`/api/banken?q=${encodeURIComponent(q)}`);
      expect(((await iban.json()) as typeof body).data.banks[0]?.name, q).toBe(VEST);
      expect(iban.headers()["cache-control"], q).toContain("no-store");
    }
  });
});

test.describe("Bankvorschläge – Konten", () => {
  test("Konto hinzufügen: Vorschläge beim Tippen, Auswahl mit der Tastatur, Escape schließt erst die Liste", async ({
    page,
  }) => {
    const dialog = await openAddAccount(page);
    // Gespeichert wird per Server-Aktion (POST) – Enter auf einem markierten Vorschlag darf das nicht auslösen.
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(uniqueName("Tastatur"));
    const bank = bankField(dialog);
    await expect(bank).toHaveAttribute("aria-expanded", "false");

    const answered = answer(page, "sparkasse vest");
    await bank.pressSequentially("sparkasse vest");
    await answered;
    const list = suggestions(page);
    const vest = list.getByRole("option", { name: new RegExp(VEST) });
    await expect(list.getByRole("option").first()).toContainText(VEST);
    await expect(bank).toHaveAttribute("aria-expanded", "true");
    await expect(bank).toHaveAttribute("aria-controls", (await list.getAttribute("id"))!);
    await expect(bank).not.toHaveAttribute("aria-activedescendant");
    await expect(bank).toBeFocused();
    // Die Bundesbank verlangt die Quellenangabe – klein unter den Vorschlägen.
    await expect(page.locator("[data-slot=popover-content]")).toContainText(
      "Quelle: Deutsche Bundesbank",
    );
    expect(await violations(page)).toEqual([]);

    // ↓ markiert den ersten Vorschlag, ↑ wieder keinen (dann gehört Enter dem Formular), ↓ + Enter übernimmt
    await bank.press("ArrowDown");
    await expect(bank).toHaveAttribute("aria-activedescendant", (await vest.getAttribute("id"))!);
    await expect(vest).toHaveAttribute("aria-selected", "true");
    await bank.press("ArrowUp");
    await expect(bank).not.toHaveAttribute("aria-activedescendant");
    await expect(vest).toHaveAttribute("aria-selected", "false");
    await bank.press("ArrowDown");
    await bank.press("Enter");
    await expect(bank).toHaveValue(VEST);
    await expect(bank).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await expect(bank).toBeFocused();
    await expect(dialog.getByRole("status").filter({ hasText: "Übernommen" })).toHaveText(
      `Übernommen: ${VEST}`,
    );

    // ↓ im geschlossenen Feld sucht ausdrücklich (auch für den übernommenen Wert); Escape schließt erst nur die Liste …
    const again = answer(page, VEST);
    await bank.press("ArrowDown");
    await again;
    await expect(vest).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(bank).toHaveAttribute("aria-expanded", "false");
    await expect(dialog).toHaveAttribute("data-state", "open");
    await expect(bank).toHaveValue(VEST);
    await expect(bank).toBeFocused();
    // … das zweite Escape das Fenster
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(posts).toEqual([]);
  });

  test("Konto hinzufügen und bearbeiten: Freitext bleibt, Barkasse ohne Vorschläge, Auswahl per Klick", async ({
    page,
  }) => {
    const searched: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (isBankSearch(url)) searched.push(url.searchParams.get("q") ?? "");
    });
    const dialog = await openAddAccount(page);
    const name = uniqueName("Freitext");
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    const bank = bankField(dialog);
    const list = suggestions(page);

    // Einmal gesucht – der Browser merkt sich die Vorschläge für die Sitzung.
    const answered = answer(page, "sparkasse vest");
    await bank.fill("sparkasse vest");
    await answered;
    await expect(list).toBeVisible();

    // Die Maus markiert wie ↓/↑ (nur ein Vorschlag ist hervorgehoben) – Enter übernimmt ihn, statt zu speichern.
    const first = list.getByRole("option").first();
    await first.hover();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(bank).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id"))!);
    await bank.press("Enter");
    await expect(bank).toHaveValue(VEST);
    await expect(dialog).toBeVisible();

    // Barkasse: ein normales Textfeld ohne Liste – auch für einen Suchtext, dessen Vorschläge schon da wären.
    await dialog.getByLabel("Art").selectOption("CASH");
    await expect(list).toBeHidden();
    const plain = dialog.getByRole("textbox", { name: "Bank oder Beschreibung" });
    await expect(plain).not.toHaveAttribute("aria-expanded");
    await plain.fill("");
    await plain.fill("sparkasse vest");
    await expect(list).toBeHidden();

    // Bankkonto mit eigenem Text: keine passende Bank – die Liste bleibt zu, Enter speichert den Text unverändert.
    await dialog.getByLabel("Art").selectOption("BANK");
    const none = answer(page, "Vereinsheim");
    await bank.fill("Vereinsheim");
    await none;
    await expect(dialog.getByRole("status").filter({ hasText: "Keine passende Bank" })).toHaveText(
      "Keine passende Bank gefunden – du kannst den Namen trotzdem eintragen.",
    );
    await expect(list).toBeHidden();
    await expect(bank).toHaveAttribute("aria-expanded", "false");
    await bank.press("Enter");
    await expect(dialog).toBeHidden();
    const account = page.getByRole("row").filter({ hasText: name });
    await expect(account).toContainText("Vereinsheim");

    // Bearbeiten: keine Suche für den schon eingetragenen Wert; Vorschlag per Klick übernehmen und speichern. Neu geladen,
    // damit der Vorschlags-Speicher des Browsers leer ist – eine Suche beim Öffnen fiele sonst nicht auf („Vereinsheim“
    // stünde schon darin, ohne Anfrage).
    await open(page, "/finanzen/einstellungen");
    await page.getByRole("button", { name: `Konto ${name} bearbeiten` }).click();
    const edit = page.getByRole("dialog", { name: "Konto bearbeiten" });
    const editBank = bankField(edit);
    await expect(editBank).toHaveValue("Vereinsheim");
    await expect(editBank).toHaveAttribute("aria-expanded", "false");
    // Bewusst gewartet (Prüfung, dass nichts kommt): Eine Suche beim Öffnen hätte nach 150 ms begonnen.
    await page.waitForTimeout(400);
    const picked = answer(page, "vest recklinghausen");
    await editBank.fill("vest recklinghausen");
    await picked;
    await list.getByRole("option", { name: new RegExp(VEST) }).click();
    await expect(editBank).toHaveValue(VEST);
    await expect(editBank).toBeFocused();
    await expect(list).toBeHidden();
    await expect(edit).toHaveAttribute("data-state", "open");
    await edit.getByRole("button", { name: "Speichern" }).click();
    await expect(edit).toBeHidden();
    await expect(account).toContainText(VEST);

    expect(searched).toEqual(["sparkasse vest", "Vereinsheim", "vest recklinghausen"]);
  });

  test("Reihenfolge: eine ältere Suche wird abgebrochen – ihre Antwort kann die Liste nicht mehr ändern", async ({
    page,
  }) => {
    const dialog = await openAddAccount(page);
    const isOlder = (request: Request) => {
      const url = new URL(request.url());
      return isBankSearch(url) && url.searchParams.get("q") === "sparkasse";
    };
    await page.route(isBankSearch, (route) => {
      // Ältere Suche: bleibt ohne Antwort, bis die Seite sie abbricht.
      if (isOlder(route.request())) return;
      return route.fulfill({ json: stubBody(["Aktuell Eins", "Aktuell Zwei"]) });
    });
    const bank = bankField(dialog);
    const first = page.waitForRequest(isOlder);
    const aborted = page.waitForEvent("requestfailed", isOlder);
    await bank.fill("sparkasse");
    await first;
    const later = answer(page, "sparkasse vest");
    await bank.fill("sparkasse vest");
    await later;
    // Ein sicheres Zeichen statt Warten auf eine späte Antwort: Die Seite hat die ältere Anfrage selbst abgebrochen.
    expect((await aborted).failure()?.errorText).toBe("net::ERR_ABORTED");
    await expect(suggestions(page).getByRole("option")).toHaveText([
      /Aktuell Eins/,
      /Aktuell Zwei/,
    ]);
    await expect(bank).toHaveValue("sparkasse vest");
  });

  test("Fehler der Schnittstelle: keine Liste, das Feld nimmt weiter Text", async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    const dialog = await openAddAccount(page);
    await page.route(isBankSearch, (route) => route.fulfill({ status: 500, json: { ok: false } }));
    const bank = bankField(dialog);
    const failed = answer(page, "sparkasse vest");
    await bank.fill("sparkasse vest");
    expect((await failed).status()).toBe(500);
    await expect(suggestions(page)).toBeHidden();
    await expect(bank).toHaveAttribute("aria-expanded", "false");
    const failedAgain = answer(page, "sparkasse vest r");
    await bank.pressSequentially(" r");
    expect((await failedAgain).status()).toBe(500);
    await expect(bank).toHaveValue("sparkasse vest r");

    // Wieder erreichbar – Fehler werden nicht gemerkt: ↓ versucht denselben Text noch einmal …
    await page.unroute(isBankSearch);
    const options = suggestions(page).getByRole("option");
    const retried = answer(page, "sparkasse vest r");
    await bank.press("ArrowDown");
    await retried;
    await expect(options.first()).toContainText(VEST);
    // … und ein Text, der vorhin scheiterte, wird neu gesucht (nicht als „keine Treffer“ gemerkt).
    const again = answer(page, "sparkasse vest");
    await bank.fill("sparkasse vest");
    await again;
    await expect(options.first()).toContainText(VEST);
    expect(errors).toEqual([]);
  });

  test("IBAN im Feld: an den Server geht nur die Bankleitzahl, nie die Kontonummer", async ({
    page,
  }) => {
    const sent: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (isBankSearch(url)) sent.push(url.searchParams.get("q") ?? "");
    });
    const dialog = await openAddAccount(page);
    const bank = bankField(dialog);
    const answered = answer(page, "42650150");
    // So steht sie auf Briefbögen und Rechnungen – mit „IBAN“ davor.
    await bank.pressSequentially("IBAN DE12 4265 0150 0000 0000 00");
    await answered;
    await expect(suggestions(page).getByRole("option").first()).toContainText(VEST);
    expect(sent).toContain("42650150");
    for (const q of sent) expect(q.replace(/\s+/g, ""), q).not.toMatch(/\d{9,}/);
  });

  test("Extremfall: lange Namen am schmalen Bildschirm brechen um, nichts läuft seitlich über", async ({
    page,
  }) => {
    const alerts: string[] = [];
    page.on("dialog", (alert) => {
      alerts.push(alert.message());
      void alert.dismiss();
    });
    await page.setViewportSize({ width: 375, height: 667 });
    const dialog = await openAddAccount(page);
    // Höchstlänge der Bundesbank-Bezeichnungen: 58 Zeichen – mit Umlauten, ohne Leerzeichen und mit Markup als Text.
    const names = [
      "Raiffeisenbank Weißenburg-Gunzenhausen Höchstädt-Überlingen",
      "<script>alert(1)</script> Volksbank Köln Bonn Süd-Östliche",
      "Sparkassenzweckverbandsgirozentralenüberweisungsabteilungen",
      "Spar- und Darlehnskasse Börde Bramsche Ölbrück Hückeswagen",
      "Landesbank Hessen-Thüringen Girozentrale Düsseldorf-Öhringen",
      "Vereinigte Volksbank Märkisch-Oderland Fürstenwalde-Müncheberg",
      "Kreissparkasse Weißenfels an der Saale Jößnitz-Königswartha",
      "Genossenschaftsbank Süßenbrunn Großröhrsdorf Bärwalde Öhrli",
    ].map((name) => name.slice(0, 58));
    await page.route(isBankSearch, (route) =>
      route.fulfill({
        json: stubBody(names, "Weißenfels an der Saale-Königswartha · BLZ 860 555 92"),
      }),
    );
    const bank = bankField(dialog);
    const answered = answer(page, "lange namen");
    await bank.fill("lange namen");
    await answered;
    const list = suggestions(page);
    const options = list.getByRole("option");
    await expect(options).toHaveCount(8);
    await expect(options.nth(1)).toContainText("<script>alert(1)</script>"); // als Text, nicht ausgeführt

    // Nichts läuft seitlich über – weder in der Liste noch auf der Seite.
    const sideways = (locator: Locator) =>
      locator.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(await sideways(list)).toBeLessThanOrEqual(0);
    for (let index = 0; index < 8; index++)
      expect(await sideways(options.nth(index))).toBeLessThanOrEqual(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    // Lange Namen brechen um (mehrzeilig) statt abgeschnitten zu werden.
    const lines = await options
      .nth(2)
      .locator("span")
      .first()
      .evaluate(
        (element) =>
          element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight),
      );
    expect(lines).toBeGreaterThanOrEqual(2);

    // Die Liste liegt ganz im Bildschirm.
    const box = (await page.locator("[data-slot=popover-content]").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(667);

    // Acht lange Zeilen passen hier nicht ganz: Die Liste scrollt in sich – auch im Fenster, das das Scrollen außerhalb
    // sperrt. So ist auch der letzte Vorschlag erreichbar.
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    const listBox = (await list.boundingBox())!;
    await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
    await page.mouse.wheel(0, 2000);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => insideList(options.last())).toBe(true);
    await list.evaluate((element) => (element.scrollTop = 0));
    // Mit der Tastatur: ↑ springt zum letzten Vorschlag und holt ihn in die Liste (die Maus erst aus der Liste – sie
    // markiert sonst selbst einen Vorschlag).
    await page.mouse.move(0, 0);
    await bank.press("ArrowUp");
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => insideList(options.last())).toBe(true);
    expect(alerts).toEqual([]);
  });
});
