import { expect, test, type Locator, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, chooseTab, loginSettled as login } from "./helpers";

/**
 * Dashboard-Reiter auf Smartphone (Pixel 7, 412 px) und Tablet-Breite: gut treffbar, seitlich wischbar, der gewählte Reiter
 * kommt ins Bild, und keine Ansicht läuft seitlich über den Bildschirm. Läuft nur im Projekt "mobil".
 */
const tabBar = (page: Page) => page.getByRole("tablist", { name: "Bereiche des Dashboards" });
const NAMES = ["Übersicht", "Termine & Helfer", "Mitglieder", "Aufgaben & Aktivität"];

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function select(page: Page, name: string) {
  await chooseTab(page, name);
  if (name !== "Übersicht") {
    await expect(page.getByRole("button", { name: /Einklappen Auswertungen/ })).toBeVisible(); // Diagramme geladen
  }
}

test.describe("Dashboard-Reiter – mobil", () => {
  test("Smartphone: Reiter sind groß genug, die Leiste ist wischbar, der gewählte Reiter kommt ins Bild", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const tabs = tabBar(page).getByRole("tab");
    await expect(tabs).toHaveText(NAMES);

    // Zielgröße: mindestens 44 px hoch (Empfehlung für Berührung)
    for (const tab of await tabs.all()) {
      const box = (await tab.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // Die Leiste ist breiter als der Bildschirm und scrollt für sich – die Seite selbst nicht
    const bar = await tabBar(page).evaluate((element) => {
      const scroller = element.parentElement!;
      return { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth };
    });
    expect(bar.scrollWidth).toBeGreaterThan(bar.clientWidth);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    // Sichtbarer Hinweis, dass es weitergeht: Die Leiste blendet am rechten Rand aus (am Anfang links nicht). Das hängt –
    // anders als ein zufällig angeschnittener letzter Reiter – nicht von Schrift und Bildschirmbreite ab.
    const scroller = tabBar(page).locator("xpath=..");
    await expect(scroller).toHaveAttribute("data-fade", "end");
    expect(await scroller.evaluate((element) => getComputedStyle(element).maskImage)).toContain(
      "linear-gradient",
    );

    // Den letzten Reiter antippen: Er wird vollständig ins Bild geholt, der Inhalt wechselt
    await select(page, "Aufgaben & Aktivität");
    await expect(page.getByRole("tab", { name: "Aufgaben & Aktivität" })).toBeInViewport({
      ratio: 0.98,
    });
    await expect(page.getByRole("region", { name: "Auswertungen" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\?tab=aktivitaet$/);
    // Erst prüfen, wenn in der Leiste nichts mehr gleitet oder einblendet: Ein Zwischenstand sähe richtig aus, obwohl die
    // Leiste am Ende ein paar Pixel vor dem Rand stehen bleibt (so geschehen, als die fette Schrift noch einblendete).
    await expect
      .poll(() => tabBar(page).evaluate((list) => list.getAnimations({ subtree: true }).length))
      .toBe(0);
    await expect(scroller).toHaveAttribute("data-fade", "start"); // am Ende: Verlauf nur noch links
    // …und zurück: Jetzt ist wieder der erste Reiter sichtbar
    await select(page, "Übersicht");
    await expect(page.getByRole("tab", { name: "Übersicht" })).toBeInViewport({ ratio: 0.98 });
    await expect(scroller).toHaveAttribute("data-fade", "end");
  });

  test("Smartphone: jeder Reiter läuft nicht seitlich über den Bildschirm; die Menüleiste hat weiter nur „Dashboard“", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    for (const name of NAMES) {
      await select(page, name);
      expect(await overflow(page), `Reiter „${name}“`).toBeLessThanOrEqual(1);
    }
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(1);
    // Kein Reiter als Menüpunkt: Namen, die es sonst nicht gibt, fehlen, und kein Ziel enthält `tab=`
    // („Mitglieder“ ist zugleich ein echter Bereich der Anwendung und zeigt auf die Mitgliederliste).
    for (const name of ["Übersicht", "Termine & Helfer", "Aufgaben & Aktivität"]) {
      await expect(menu.getByText(name, { exact: true })).toHaveCount(0);
    }
    const hrefs = await menu
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs.some((href) => href?.includes("tab="))).toBe(false);
  });

  test("Tippen wechselt den Reiter ohne Neuladen", async ({ page }) => {
    await login(page, USERS.admin);
    await page.evaluate(() => {
      (window as unknown as { __marke: number }).__marke = 7;
    });
    await select(page, "Mitglieder");
    await select(page, "Termine & Helfer");
    expect(await page.evaluate(() => (window as unknown as { __marke?: number }).__marke)).toBe(7);
  });

  test("Leiste bleibt beim Scrollen oben stehen – von dort lässt sich der Bereich wechseln", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await select(page, "Termine & Helfer");
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await expect(tabBar(page)).toBeInViewport();
    const box = (await tabBar(page).boundingBox())!;
    expect(box.y).toBeLessThan(120); // dicht unter der Kopfzeile, nicht mit dem Inhalt weggescrollt
    await select(page, "Mitglieder");
    await expect(page.getByRole("tab", { name: "Mitglieder", selected: true })).toBeVisible();
  });

  test("Tablet-Breite (820 px): alle vier Reiter passen, nichts läuft über", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await login(page, USERS.admin);
    const tabs = tabBar(page).getByRole("tab");
    await expect(tabs).toHaveText(NAMES);
    const scroller = await tabBar(page).evaluate((element) => {
      const parent = element.parentElement!;
      return { scrollWidth: parent.scrollWidth, clientWidth: parent.clientWidth };
    });
    expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth + 1); // alles sichtbar, kein Wischen nötig
    await expect(tabBar(page).locator("xpath=..")).not.toHaveAttribute("data-fade", /./); // kein Verlauf
    for (const name of NAMES) {
      await select(page, name);
      expect(await overflow(page), `Reiter „${name}“`).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * Wischen wie mit dem Finger: echte Touch-Ereignisse über das Chrome-DevTools-Protokoll (der Browser macht daraus Zeiger-
 * Ereignisse mit `pointerType: "touch"`), in mehreren Schritten und zügig – so wie eine Wischgeste abläuft.
 */
async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 6,
) {
  const cdp = await page.context().newCDPSession(page);
  const send = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: { x: number; y: number }[],
  ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await send("touchStart", [from]);
  for (let step = 1; step <= steps; step++) {
    await send("touchMove", [
      {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      },
    ]);
  }
  await send("touchEnd", []);
  await cdp.detach();
}

/** Eine freie Stelle im Inhalt (Überschrift einer Gruppe): weder Diagramm noch waagerecht scrollende Fläche. */
async function freeSpot(page: Page, heading: string) {
  const title = page.getByRole("heading", { name: heading, exact: true });
  await title.scrollIntoViewIfNeeded();
  const box = (await title.boundingBox())!;
  return { x: box.x + 40, y: box.y + box.height / 2 };
}

/** Der gewählte Reiter der Dashboard-Leiste (die Auswertungen haben eigene Reiter darunter). */
const selected = (page: Page) => tabBar(page).getByRole("tab", { selected: true });

test.describe("Dashboard-Folien – Wischen (Touch)", () => {
  test("Nach links wischen = nächster Bereich, nach rechts = voriger; Adresse und Leiste folgen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await expect(selected(page)).toHaveText("Übersicht");
    const spot = await freeSpot(page, "Für dich");
    await swipe(page, spot, { x: spot.x - 220, y: spot.y + 6 });
    await expect(selected(page)).toHaveText("Termine & Helfer");
    await expect(page).toHaveURL(/\/dashboard\?tab=termine$/);
    // Der neue Bereich beginnt oben, die Leiste zeigt den gewählten Reiter
    await expect(page.getByRole("tab", { name: "Termine & Helfer" })).toBeInViewport();

    const again = await freeSpot(page, "Anstehend");
    await swipe(page, { x: again.x + 10, y: again.y }, { x: again.x + 230, y: again.y - 4 });
    await expect(selected(page)).toHaveText("Übersicht");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("Kein Wischen bei kurzer Strecke oder überwiegend senkrechter Bewegung (das ist Scrollen)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const spot = await freeSpot(page, "Für dich");
    await swipe(page, spot, { x: spot.x - 30, y: spot.y }); // zu kurz
    await swipe(page, spot, { x: spot.x - 90, y: spot.y + 260 }); // eher senkrecht
    await expect(selected(page)).toHaveText("Übersicht");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("An den Enden passiert nichts: vor dem ersten und hinter dem letzten Bereich", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const first = await freeSpot(page, "Für dich");
    await swipe(page, first, { x: first.x + 220, y: first.y }); // nach rechts – davor gibt es nichts
    await expect(selected(page)).toHaveText("Übersicht");

    await select(page, "Aufgaben & Aktivität");
    const last = await freeSpot(page, "Aktivität");
    await swipe(page, last, { x: last.x - 220, y: last.y }); // nach links – danach gibt es nichts
    await expect(selected(page)).toHaveText("Aufgaben & Aktivität");
  });

  // Das Karussell der Kennzahlen gibt es nur im einfachen Raster (Rollen ohne Mitgliederzahlen, z. B. Helfer: „Ungelesen“,
  // Termine, freie Plätze, eigene Stunden); Vorstand und Vereinsadministrator sehen die große Fassung ohne Karussell (unten).
  test("Auf der Kennzahlen-Reihe gehört das Wischen dem Karussell und blättert nicht den Bereich", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    const scroller = page.getByRole("group", { name: "Kennzahlen", exact: true });
    await expect(scroller).toHaveAttribute("aria-roledescription", "Karussell");
    await scroller.scrollIntoViewIfNeeded();
    const box = (await scroller.boundingBox())!;
    const from = { x: box.x + box.width - 60, y: box.y + box.height / 2 };
    await swipe(page, from, { x: from.x - 240, y: from.y });
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(100);
    await expect(selected(page)).toHaveText("Übersicht");
  });

  test("Auch auf dem Kursverlauf einer Kennzahl gehört das Wischen dem Karussell", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    const scroller = page.getByRole("group", { name: "Kennzahlen", exact: true });
    await scroller.scrollIntoViewIfNeeded();
    // Der erste Kurs steht auf der zweiten Karte („Ungelesen“ hat keinen), die nur zum Teil ins Bild ragt: im sichtbaren
    // Stück ansetzen.
    const chart = scroller.locator('[data-slot="quote-chart"]').first();
    const box = (await chart.boundingBox())!;
    const right = Math.min(box.x + box.width, page.viewportSize()!.width);
    const from = { x: right - 40, y: box.y + box.height / 2 };
    expect(from.x).toBeGreaterThan(box.x);
    await swipe(page, from, { x: from.x - 240, y: from.y });
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(100);
    await expect(selected(page)).toHaveText("Übersicht");
  });

  test("Große Fassung (ohne Karussell): Wischen auf einer Kennzahl blättert den Bereich, auf dem Kursverlauf nicht", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    const pair = page.getByRole("group", { name: "Kennzahlen", exact: true });

    // Der Kurs der Mitglieder-Kachel gehört sich selbst (Infofeld mit dem Finger) – kein Reiterwechsel
    const chart = pair.locator('[data-slot="quote-chart"]');
    await expect(chart).toHaveCount(1);
    await chart.scrollIntoViewIfNeeded();
    const box = (await chart.boundingBox())!;
    const from = { x: box.x + box.width - 40, y: box.y + box.height / 2 };
    await swipe(page, from, { x: from.x - 240, y: from.y });
    await expect(selected(page)).toHaveText("Übersicht");
    await expect(page).toHaveURL(/\/dashboard$/);

    // Die Karten selbst scrollen nicht seitlich: Auf dem Aufgaben-Ring blättert Wischen wie überall sonst den Bereich
    // (und öffnet nicht etwa den Link der Karte).
    const ring = pair
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("link", { name: /^Aufgaben im Verein/ }) });
    await ring.scrollIntoViewIfNeeded();
    const card = (await ring.boundingBox())!;
    const start = { x: card.x + card.width - 40, y: card.y + card.height / 2 };
    await swipe(page, start, { x: start.x - 220, y: start.y + 6 });
    await expect(selected(page)).toHaveText("Termine & Helfer");
    await expect(page).toHaveURL(/\/dashboard\?tab=termine$/);
  });

  test("Ohne Wischen geht alles auch: Zurück/Weiter-Knöpfe bleiben bedienbar", async ({ page }) => {
    await login(page, USERS.admin);
    const pager = page.getByRole("navigation", { name: "Bereich wechseln" });
    await pager.scrollIntoViewIfNeeded();
    const weiter = pager.getByRole("button", { name: "Weiter: Termine & Helfer" });
    expect((await weiter.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await weiter.click();
    await expect(selected(page)).toHaveText("Termine & Helfer");
  });
});

/**
 * Kennzahlen im einfachen Raster (Rollen ohne Mitgliederzahlen, hier der Helfer mit „Ungelesen“, Terminen, freien Plätzen und
 * den eigenen Stunden): am Smartphone ein Karussell mit Punkten, ab Tablet-Breite ein Raster.
 */
test.describe("Dashboard – Kennzahlen als Karussell", () => {
  test("Smartphone: vier Karten nebeneinander, die nächste ragt ins Bild; Punkte zeigen den Stand und springen", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await expect(page.locator('[data-layout="grid"]')).toHaveCount(1);
    await expect(page.locator('[data-layout="studio"]')).toHaveCount(0);
    const scroller = page.getByRole("group", { name: "Kennzahlen", exact: true });
    const cards = scroller.getByRole("link");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toHaveAccessibleName(/^Ungelesen/);
    const view = page.viewportSize()!;
    const metrics = await scroller.evaluate((element) => ({
      scrollable: element.scrollWidth > element.clientWidth,
      snap: getComputedStyle(element).scrollSnapType,
    }));
    expect(metrics.scrollable).toBe(true);
    expect(metrics.snap).toContain("x");
    // Nebeneinander statt untereinander; die zweite ragt am Rand ins Bild (Hinweis „geht weiter“)
    const one = (await cards.nth(0).boundingBox())!;
    const two = (await cards.nth(1).boundingBox())!;
    expect(Math.abs(one.y - two.y)).toBeLessThan(2);
    expect(two.x).toBeLessThan(view.width);
    expect(two.x + two.width).toBeGreaterThan(view.width);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Punkte: einer je Karte, der erste ist aktuell; Zielgröße mindestens 24 px
    const dots = page.getByRole("button", { name: /^Kennzahl \d von 4$/ });
    await expect(dots).toHaveCount(4);
    await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
    for (const dot of await dots.all()) {
      const size = (await dot.boundingBox())!;
      expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(24);
    }
    await dots.nth(2).click();
    await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");
    await expect(dots.nth(0)).not.toHaveAttribute("aria-current", "true");
    await expect(cards.nth(2)).toBeInViewport({ ratio: 0.95 });
    await dots.nth(0).click();
    await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
  });

  test("Karten bleiben Links mit Zahl und Hinweis – mit der Tastatur erreichbar, ein fokussierter Link kommt ins Bild", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    const scroller = page.getByRole("group", { name: "Kennzahlen", exact: true });
    const last = scroller.getByRole("link").nth(3);
    await expect(last).toHaveAccessibleName(/^Meine Helferstunden \d{4}/);
    await last.focus();
    await expect(last).toBeInViewport({ ratio: 0.95 });
    await expect(page.getByRole("button", { name: "Kennzahl 4 von 4" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("Ab Tablet-Breite (820 px) ein Raster aus zwei Spalten: kein Karussell, keine Punkte, noch keine Reihe aus vier", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await login(page, USERS.helfer);
    const scroller = page.getByRole("group", { name: "Kennzahlen", exact: true });
    const kpiLinks = scroller.locator('[data-slot="kpi-link"]');
    await expect(kpiLinks).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);
    const scrollable = await scroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(scrollable).toBe(false);
    const one = (await kpiLinks.nth(0).boundingBox())!;
    const two = (await kpiLinks.nth(1).boundingBox())!;
    expect(Math.abs(one.y - two.y)).toBeLessThan(2);
    // genau zwei Spalten (vier nebeneinander erst ab 58 rem Inhaltsbreite)
    expect(
      await scroller.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(2);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});

/** Lage der Karten einer Gruppe – je Karte ihre Hülle (die unmittelbaren Kinder der Gruppe), in der Reihenfolge im Code. */
const cardBoxes = (group: Locator) =>
  group.evaluate((element) =>
    [...element.children].map((child) => {
      const { x, y, width, height } = child.getBoundingClientRect();
      return { x, y, width, height, bottom: y + height, right: x + width };
    }),
  );

/**
 * Große Fassung der Kennzahlen (Vorstand, Vereinsadministrator – Mitglieder, Termine und Schichten sind da): oben das Paar aus
 * Mitglieder-Kachel und Aufgaben-Ring („Kennzahlen“), dazu die Spalte „Weitere Kennzahlen“ (Termine, Helferstunden, freie
 * Plätze, Offene Zahlungen). Am Smartphone steht alles untereinander – ohne Karussell –, auf dem Tablet das Paar nebeneinander
 * und die Spalte als Raster aus zwei Spalten darunter. Gemessen wird ohne Einblenden („Bewegung reduzieren“): sonst stünden
 * die Karten in den ersten Augenblicken noch ein paar Pixel tiefer.
 */
test.describe("Dashboard – große Fassung der Kennzahlen", () => {
  const pairOf = (page: Page) => page.getByRole("group", { name: "Kennzahlen", exact: true });
  const sideOf = (page: Page) =>
    page.getByRole("group", { name: "Weitere Kennzahlen", exact: true });

  test("Smartphone: kein Karussell und keine Punkte – Ring unter der Mitglieder-Kachel, die übrigen Karten gleich breit darunter", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    const frame = page.locator('[data-layout="studio"]');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("data-size", "m");
    await expect(page.locator('[data-layout="grid"]')).toHaveCount(0);
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);

    const pair = pairOf(page);
    const side = sideOf(page);
    await expect(pair.getByRole("link", { name: /^Mitglieder\s*\d/ })).toBeVisible();
    await expect(
      pair.getByRole("link", { name: /^Aufgaben im Verein\s*\d+\s*offen/ }),
    ).toHaveAttribute("href", "/aufgaben");
    // Spalte in der Reihenfolge im Code: Termine, Helferstunden, freie Plätze, Offene Zahlungen
    const sideCards = side.locator("xpath=./*");
    await expect(sideCards).toHaveCount(4);
    await expect(
      sideCards.nth(0).getByRole("link", { name: /^Termine in 30 Tagen/ }),
    ).toBeVisible();
    await expect(
      sideCards.nth(1).getByRole("link", { name: /^Helferstunden \d{4}/ }),
    ).toBeVisible();
    await expect(sideCards.nth(2).getByRole("link", { name: /^Freie Helferplätze/ })).toBeVisible();
    await expect(
      sideCards.nth(3).getByRole("region", { name: "Offene Zahlungen", exact: true }),
    ).toBeVisible();
    // Die Zahlungen stehen nur einmal da – in der Spalte, nicht noch einmal als eigene Karte weiter unten
    await expect(page.getByRole("region", { name: "Offene Zahlungen", exact: true })).toHaveCount(
      1,
    );

    const [hero, ring] = await cardBoxes(pair);
    const cards = await cardBoxes(side);
    const view = page.viewportSize()!;
    // Untereinander: der Ring unter der Mitglieder-Kachel, die Spalte unter dem Ring, jede Karte unter der vorigen …
    expect(ring!.y).toBeGreaterThanOrEqual(hero!.bottom - 1);
    expect(cards[0]!.y).toBeGreaterThanOrEqual(ring!.bottom - 1);
    for (let index = 1; index < cards.length; index++) {
      expect(cards[index]!.y, `Karte ${index + 1} der Spalte`).toBeGreaterThanOrEqual(
        cards[index - 1]!.bottom - 1,
      );
    }
    // … alle an derselben Stelle, gleich breit und vollständig im Bild
    for (const card of [ring!, ...cards]) {
      expect(Math.abs(card.x - hero!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(card.width - hero!.width)).toBeLessThanOrEqual(1);
    }
    expect(hero!.x).toBeGreaterThanOrEqual(0);
    expect(hero!.right).toBeLessThanOrEqual(view.width + 1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("Tablet-Breite (820 px): Mitglieder-Kachel und Ring nebeneinander, darunter die Spalte in zwei Spalten – Helferstunden rechts neben den Terminen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    const pair = pairOf(page);
    const side = sideOf(page);
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);
    // Paar: Mitglieder-Kachel und Ring; Spalte: Termine, Helferstunden, freie Plätze – und die Kachel „Offene Zahlungen“
    await expect(pair.locator('[data-slot="kpi-link"]')).toHaveCount(2);
    await expect(side.locator('[data-slot="kpi-link"]')).toHaveCount(3);
    await expect(side.getByRole("region", { name: "Offene Zahlungen", exact: true })).toBeVisible();
    expect(await pair.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(
      false,
    );

    // Das Paar nebeneinander (ab 34 rem Breite), oben bündig
    const [hero, ring] = await cardBoxes(pair);
    expect(Math.abs(ring!.y - hero!.y)).toBeLessThanOrEqual(1);
    expect(ring!.x).toBeGreaterThanOrEqual(hero!.right - 1);

    // Die Spalte steht unter dem Paar (neben ihm erst ab 58 rem Inhaltsbreite), als Raster aus zwei Spalten
    expect(
      await side.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(2);
    const [termine, stunden, plaetze, zahlungen] = await cardBoxes(side);
    expect(termine!.y).toBeGreaterThanOrEqual(Math.max(hero!.bottom, ring!.bottom) - 1);
    // Helferstunden rechts neben den Terminen, oben bündig, über die Höhe der drei Karten links
    expect(stunden!.x).toBeGreaterThanOrEqual(termine!.right - 1);
    expect(Math.abs(stunden!.y - termine!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(stunden!.bottom - zahlungen!.bottom)).toBeLessThanOrEqual(1);
    // Links untereinander: Termine, freie Plätze, Offene Zahlungen
    for (const [above, below] of [
      [termine!, plaetze!],
      [plaetze!, zahlungen!],
    ] as const) {
      expect(Math.abs(below.x - termine!.x)).toBeLessThanOrEqual(1);
      expect(below.y).toBeGreaterThanOrEqual(above.bottom - 1);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("Dashboard mobil – Barrierefreiheit (axe)", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: Übersicht in großer Fassung (ohne Karussell) und Reiterleiste ohne Verstöße`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await login(page, USERS.admin);
      await expect(page.locator('[data-layout="studio"]')).toHaveCount(1);
      expect(await violations(page)).toEqual([]);
      await select(page, "Termine & Helfer");
      expect(await violations(page)).toEqual([]);
    });

    // Das Karussell samt Punkten gibt es nur noch im einfachen Raster – geprüft mit dem Helfer.
    test(`${scheme}: Übersicht mit Kennzahlen-Karussell und Punkten (Helfer) ohne Verstöße`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await login(page, USERS.helfer);
      await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(1);
      await expect(page.getByRole("button", { name: /^Kennzahl \d von 4$/ })).toHaveCount(4);
      expect(await violations(page)).toEqual([]);
    });
  }
});
