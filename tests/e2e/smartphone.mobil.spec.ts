import { expect, test, type Locator, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open, openNavGroup } from "./helpers";

/**
 * Smartphone-Ansicht (Pixel 7, 412 px breit). Läuft nur im Projekt "mobil": `npx playwright test --project=mobil`.
 * Prüft, dass nichts seitlich aus dem Bildschirm läuft und die Bedienung ohne Sidebar funktioniert.
 */
const berlinDate = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Berlin",
  });

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Das „X“ eines Dialogs bzw. der Seitenleiste steht oben rechts – auch mit Touch: Kleine Knöpfe sind dort `relative` (für
 * die größere Tippfläche), ohne `pointer-coarse:absolute` rutschte es unter den Inhalt.
 */
async function expectCloseTopRight(dialog: Locator): Promise<void> {
  // Beides in einem Zug gemessen – auch, falls der Dialog noch hereinfährt.
  const gap = await dialog.evaluate((element) => {
    const close = [...element.querySelectorAll("button")]
      .filter((button) => button.textContent?.trim() === "Schließen")
      .at(-1)!;
    const frame = element.getBoundingClientRect();
    const box = close.getBoundingClientRect();
    return { right: frame.right - box.right, top: box.top - frame.top };
  });
  expect(gap.right).toBeLessThan(20);
  expect(gap.top).toBeLessThan(20);
}

test.describe("Smartphone", () => {
  test("Menü öffnet sich, Navigation führt zur Helferplanung, kein seitliches Scrollen", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeHidden(); // Sidebar ist auf dem Smartphone ausgeblendet
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog");
    await expectCloseTopRight(menu);
    await openNavGroup(menu, "Verein");
    await expect(menu.getByRole("link", { name: "Helferplanung", exact: true })).toBeVisible();
    await menu.getByRole("link", { name: "Helferplanung", exact: true }).click();
    await expect(page).toHaveURL(/\/helferplanung$/);
    await expect(menu).toBeHidden(); // Menü schließt sich nach der Auswahl
    await expect(page.getByRole("heading", { level: 1, name: "Helferplanung" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("Kalender: Terminliste statt Tabelle, Ansicht wechselbar", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(`/kalender?ansicht=monat&datum=${berlinDate(5)}`);
    await expect(page.getByRole("table")).toHaveCount(0); // die Monatstabelle ist ausgeblendet …
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toBeVisible(); // … die Terminliste zeigt den Termin
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page
      .getByRole("navigation", { name: "Ansicht wählen" })
      .getByRole("link", { name: "Woche" })
      .click();
    await expect(page).toHaveURL(/ansicht=woche/);
    await expect(page.getByRole("link", { name: /Vorstandssitzung/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("Helferplan: Karten und Schaltflächen sind bedienbar (Zielgröße, kein Überlauf)", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await page.goto("/helferplanung");

    // Schichten mit freien Plätzen je Veranstaltung: „Eintragen“ steht rechts neben der Schicht und ist am Handy gut
    // treffbar (44 px hoch).
    const freie = page.getByRole("list", { name: "Freie Plätze: Sommerfest 2026" });
    const quickSignUp = freie
      .getByRole("listitem")
      .filter({ hasText: "Abbau" })
      .getByRole("button", { name: "Eintragen" });
    await expect(quickSignUp).toBeVisible();
    const signUpBox = (await quickSignUp.boundingBox())!;
    expect(signUpBox.height).toBeGreaterThanOrEqual(44);
    expect(signUpBox.width).toBeGreaterThanOrEqual(64);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page
      .getByRole("link", { name: /Sommerfest 2026/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sommerfest 2026", exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const abbau = page.getByRole("listitem", { name: "Schicht Abbau" });
    const button = abbau.getByRole("button", { name: "Eintragen" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(64);
    // Die Zeitleiste fehlt am Handy – die Liste reicht.
    await expect(page.getByRole("group", { name: "Tagesablauf" })).toBeHidden();
  });

  test("Helferplanung: Kopf in einer Knopfzeile – mit „Neue Schicht“ stecken die Nebenknöpfe im Menü", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/helferplanung");
    const header = page.locator('[data-slot="page-header"]');
    const create = header.getByRole("button", { name: "Neue Schicht" });
    const more = header.getByRole("button", { name: "Weitere Aktionen" });
    await expect(create).toBeVisible();
    await expect(more).toBeVisible();
    await expect(header.getByRole("link", { name: "Helferstunden" })).toBeHidden();
    expect((await create.boundingBox())!.y).toBe((await more.boundingBox())!.y); // eine Zeile
    await more.click();
    await expect(page.getByRole("menuitem")).toHaveText(["Helferstunden", "Helferplan drucken"]);
    await page.keyboard.press("Escape");

    // Die Auswahl der Veranstaltung passt auf den Bildschirm; die Zeilen sind gut treffbar.
    await create.click();
    const picker = page.getByRole("dialog", { name: "Für welche Veranstaltung?" });
    const first = picker.getByRole("list", { name: "Veranstaltungen" }).getByRole("link").first();
    await expect(first).toBeVisible();
    expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await expectCloseTopRight(picker);
    await page.keyboard.press("Escape");

    // Ohne Recht zum Anlegen (Helfer) bleiben beide Nebenknöpfe sichtbar – ebenfalls in einer Zeile.
    await page.context().clearCookies();
    await login(page, USERS.helfer);
    await open(page, "/helferplanung");
    const hours = header.getByRole("link", { name: "Helferstunden" });
    const print = header.getByRole("link", { name: "Helferplan drucken" });
    await expect(hours).toBeVisible();
    await expect(print).toBeVisible();
    await expect(header.getByRole("button", { name: "Weitere Aktionen" })).toHaveCount(0);
    expect((await hours.boundingBox())!.y).toBe((await print.boundingBox())!.y);
  });

  test("Hauptseiten laufen nicht seitlich über den Bildschirm", async ({ page }) => {
    await login(page, USERS.admin);
    const paths = [
      "/dashboard",
      "/mitglieder",
      "/veranstaltungen",
      "/helferplanung",
      "/helferplanung/stunden",
      "/kalender",
      "/benachrichtigungen",
      "/abteilungen",
      "/benutzer",
    ];
    paths.push(
      "/aufgaben",
      "/nachrichten",
      "/nachrichten?chat=alle",
      "/nachrichten/neu",
      "/dokumente",
      "/finanzen",
      "/finanzen/kassenbuch",
      "/finanzen/rechnungen",
      "/finanzen/beitraege",
      "/finanzen/beitraege/arten",
      "/finanzen/beitraege/familien",
      "/finanzen/beitraege/lauf",
      "/finanzen/beitraege/lauf?schritt=2",
      "/finanzen/beitraege/offen",
      "/finanzen/abschluss",
      "/finanzen/einstellungen",
      "/hilfe",
      "/hilfe/meldungen",
      "/protokoll",
      "/profil",
      "/datenschutz",
    );
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(await horizontalOverflow(page), `${path} läuft seitlich über`).toBeLessThanOrEqual(1);
    }
  });

  test("Abteilungen: Bildkarten über die ganze Breite, Schrift ganz im Bild, Foto in passender Größe", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/abteilungen");
    const football = page
      .locator("article")
      .filter({ has: page.getByRole("link", { name: "Fußball", exact: true }) });
    const photo = football.locator('img[data-department-image="fussball"]');
    await expect
      .poll(() => photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
    const viewport = page.viewportSize()!;
    const box = (await football.boundingBox())!;
    // Eine Spalte mit dem üblichen Seitenrand (je 16 px).
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 12);
    expect(box.width).toBeGreaterThan(viewport.width - 48);
    // Name und „Leitung“ stehen innerhalb der Karte (nichts wird vom runden Rand abgeschnitten).
    for (const text of [
      football.getByRole("heading", { level: 2, name: "Fußball" }),
      football.getByText(/^Leitung:/),
    ]) {
      const inner = (await text.boundingBox())!;
      expect(inner.x).toBeGreaterThanOrEqual(box.x + 12);
      expect(inner.y + inner.height).toBeLessThanOrEqual(box.y + box.height - 12);
    }
    // Der Browser wählt aus dem srcset eine Datei, die für die Kartenbreite in Geräteauflösung reicht.
    const chosen = await photo.evaluate((el: HTMLImageElement) => el.currentSrc);
    const width = Number(chosen.match(/-(\d+)\.webp$/)?.[1]);
    expect(width).toBeGreaterThanOrEqual(
      box.width * Math.min(2, await page.evaluate(() => devicePixelRatio)),
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("Dokumente: kompakte Zeilen – Name, darunter Kategorie und Datum; der Upload-Dialog passt auf den Bildschirm", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const name = `Mobil-${Date.now() % 100000}.txt`;
    const created = await page.request.post("/api/dokumente", {
      multipart: {
        file: { name, mimeType: "text/plain", buffer: Buffer.from("Hallo vom Smartphone") },
        access: "ALL_MEMBERS",
        category: "Handbuch",
      },
    });
    expect(created.status()).toBe(201);

    await page.goto("/dokumente");
    const entry = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(entry.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(entry.getByText(/^Handbuch · \d{2}\.\d{2}\.\d{4}$/)).toBeVisible(); // Kategorie und Datum darunter …
    await expect(entry.getByText(/Byte/)).toBeHidden(); // … Größe und Person erst am Computer
    // Die Zeile passt in die Breite: Menü „…“ rechts im Bild.
    await expect(entry.getByRole("button", { name: `Aktionen für ${name}` })).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Dokument hochladen" }).click();
    const dialog = page.getByRole("dialog", { name: "Dokument hochladen" });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(dialog.getByRole("button", { name: "Hochladen", exact: true })).toBeInViewport();
  });

  test("Dokumente: eine lange Kategorie schiebt Suchfeld und Filterknöpfe nicht über den Kartenrand (320 und 360 px)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    // 45 Zeichen (erlaubt sind 60): Ihr Knopf passt allein nicht in die Zeile und muss mit „…“ enden.
    const stamp = String(Date.now() % 1_000_000).padStart(6, "0");
    const category = `Protokolle der Mitgliederversammlungen ${stamp}`;
    expect(category).toHaveLength(45);
    const name = `Lange-Kategorie-${stamp}.txt`;
    const created = await page.request.post("/api/dokumente", {
      multipart: {
        file: { name, mimeType: "text/plain", buffer: Buffer.from("Lange Kategorie") },
        access: "ALL_MEMBERS",
        category,
      },
    });
    expect(created.status(), await created.text()).toBe(201);

    for (const width of [320, 360]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/dokumente?q=${encodeURIComponent(name)}`);
      const card = page.getByRole("region", { name: "Dokumente, neueste zuerst" });
      await expect(card.getByRole("link", { name: `${category} 1`, exact: true })).toBeVisible();
      // Die Karte schneidet Überstehendes ab (`overflow-hidden`) – die Seite selbst läuft dabei nicht über, deshalb hier
      // die rechten Kanten statt `horizontalOverflow`.
      const right = await card.evaluate((section) => {
        const edge = (element: Element | null) => element?.getBoundingClientRect().right ?? 0;
        return {
          card: edge(section),
          search: edge(section.querySelector("form[role=search]")),
          chips: Math.max(...[...section.querySelectorAll("nav a")].map(edge)),
        };
      });
      expect(right.search, `Suchfeld bei ${width} px`).toBeLessThanOrEqual(right.card + 0.5);
      expect(right.chips, `Filterknöpfe bei ${width} px`).toBeLessThanOrEqual(right.card + 0.5);
    }
  });

  test("Dokumente: offene Rechnung – Betrag und Schild unter dem Namen, „Als bezahlt markieren“ im Menü „…“", async ({
    page,
  }) => {
    await login(page, USERS.vorstand);
    // Eigene Rechnung (die Demo-Rechnungen ändern andere Tests): offen, 12,50 €, in 5 Tagen fällig.
    const title = `Mobil-Rechnung-${Date.now() % 100000}`;
    const name = `${title}.pdf`;
    const created = await page.request.post("/api/dokumente", {
      multipart: {
        file: {
          name: "scan.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
        },
        access: "BOARD",
        isInvoice: "on",
        paymentDue: "true",
        amount: "12,50",
        dueDate: berlinDate(5),
        title,
      },
    });
    expect(created.status(), await created.text()).toBe(201);

    await page.goto(`/dokumente?q=${title}`);
    await page.waitForLoadState("networkidle");
    const entry = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(entry.getByText(/^12,50\s€$/).filter({ visible: true })).toBeVisible();
    await expect(entry.getByText("fällig in 5 Tagen").filter({ visible: true })).toBeVisible();
    // Am Handy kein grüner Knopf in der Zeile – „Bezahlt“ steckt im Menü.
    await expect(entry.getByRole("button", { name: /als bezahlt markieren/ })).toBeHidden();
    const menu = page.getByRole("menu");
    await expect(async () => {
      if (!(await menu.isVisible()))
        await entry.getByRole("button", { name: `Aktionen für ${name}` }).click();
      await expect(menu).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(15); // 16 px Abstand zum Rand wie der Seiteninhalt
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 15);
    // Nur das Menü selbst (zu `aria-hidden` außerhalb siehe `violations` in axe.ts).
    expect(await violations(page, { only: "[role=menu]" })).toEqual([]);
    await menu.getByRole("menuitem", { name: "Als bezahlt markieren" }).click();
    await expect(page.getByText(`„${name}“ ist als bezahlt markiert.`)).toBeVisible();
    await expect(entry.getByText(/^bezahlt am /).filter({ visible: true })).toBeVisible();
    // Verklickt? „Rückgängig“ – die Rechnung ist wieder offen.
    await page.getByRole("button", { name: "Rückgängig" }).click();
    await expect(page.getByText(`„${name}“ ist wieder offen.`)).toBeVisible();
    await page.reload();
    await expect(entry.getByText("fällig in 5 Tagen").filter({ visible: true })).toBeVisible();
  });

  test("„Neuer Termin“ im Kalender: Knopf erreichbar, das Fenster passt auf den Bildschirm", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/kalender?ansicht=monat&datum=2031-03-01");
    await page.waitForLoadState("networkidle");
    const dialog = page.getByRole("dialog", { name: "Neuer Termin" });
    // Ein Tipp vor der Hydration geht verloren – dann erneut.
    await expect(async () => {
      await page.getByRole("button", { name: "Neuer Termin" }).click();
      await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(dialog.getByLabel("Beginn – Datum")).toHaveValue("2031-03-01");
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1); // scrollt innen statt über den Rand
    const save = dialog.getByRole("button", { name: "Als Entwurf speichern" });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
  });

  test("Abo-Dialog passt auf den Bildschirm", async ({ page }) => {
    await login(page, USERS.helfer);
    await page.goto("/kalender");
    await page.getByRole("button", { name: "Abonnieren" }).click();
    const dialog = page.getByRole("dialog", { name: "Kalender abonnieren" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  });
  test("Mitgliederliste: nur die Liste – ein Tipp auf die Zeile öffnet die Seite des Mitglieds", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/mitglieder");
    const list = page.getByRole("region", { name: "Mitgliederliste" });
    // Kein Detailbereich daneben: Das Mitglied hat seine eigene Seite.
    await expect(page.getByRole("link", { name: "Profil öffnen" })).toBeHidden();
    // Mit der Liste als Rückweg („Alle Mitglieder“ auf der Seite des Mitglieds)
    await expect(list.getByRole("link", { name: /Hans Helfer/ })).toHaveAttribute(
      "href",
      /^\/mitglieder\/[0-9a-f-]{36}\?von=%2Fmitglieder%3Fid%3D/,
    );
    // Lange Namen brechen um statt abgeschnitten zu werden (hier gibt es keinen Detailbereich, der sie ganz zeigte).
    const longName = list.getByRole("link", { name: /Claudia Abteilungsleiterin/ });
    expect(await longName.evaluate((link) => link.scrollHeight <= link.clientHeight)).toBe(true);
    const row = list.getByRole("listitem").filter({ hasText: "Hans Helfer" });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44); // gut treffbar
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // Import, Export & Co. stecken im Menü „Weitere Aktionen“
    await page.getByRole("button", { name: "Weitere Aktionen" }).click();
    await expect(page.getByRole("menuitem", { name: "Import" })).toBeVisible();
    await page.keyboard.press("Escape");

    await row.click({ position: { x: 300, y: 20 } }); // neben den Namen: die ganze Zeile ist antippbar
    await expect(page).toHaveURL(/\/mitglieder\/[0-9a-f-]{36}\?von=/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hans Helfer");
  });

  test("Filter: am Handy nur Suche und Knopf „Filter“ – ein Tipp klappt die Felder auf; aktive Filter zählen mit", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/mitglieder");
    const toggle = page.getByRole("checkbox", { name: /^Filter/ });
    const status = page.getByRole("combobox", { name: "Nach Status filtern" });
    await expect(page.getByRole("searchbox", { name: "Mitglieder durchsuchen" })).toBeVisible();
    await expect(status).toBeHidden(); // zugeklappt: die Liste beginnt direkt unter der Suche
    expect(await violations(page)).toEqual([]);

    await page.locator("label", { hasText: /^Filter/ }).click();
    await expect(toggle).toBeChecked();
    await expect(status).toBeVisible();
    await status.selectOption("PASSIVE");
    await page.getByRole("button", { name: "Filtern" }).click();
    await expect(page).toHaveURL(/status=PASSIVE/);
    // Nach dem Laden wieder zugeklappt, der Knopf nennt die Zahl der aktiven Filter
    await expect(page.locator("label", { hasText: /^Filter/ })).toContainText("1");
    await expect(page.getByRole("combobox", { name: "Nach Status filtern" })).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await violations(page)).toEqual([]);
  });
});
