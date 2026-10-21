import { expect, test, type Locator, type Page } from "@playwright/test";
import { violations } from "./axe";
import {
  USERS,
  chooseTab,
  greeting,
  heroLayout,
  loginSettled as login,
  renameSelf,
  open,
} from "./helpers";

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

/**
 * Kopf am Smartphone („Vereins-Bühne“): ein kürzeres Banner mit EINEM Foto oben (das der größten Abteilung), darunter die
 * Begrüßung auf Nacht, keine Chips (die Zahlen stehen direkt darunter in den Kennzahlkarten). Die Knöpfe stehen unter dem
 * Banner nebeneinander, „Anpassen“ oben rechts im Bild.
 */
test.describe("Dashboard-Kopf – Smartphone", () => {
  test("Ein Foto, Begrüßung darunter, Knöpfe unter dem Banner, „Anpassen“ oben rechts – nur das sichtbare Foto wird geladen", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    const hero = page.getByRole("main").locator('[data-slot="dashboard-hero"]');
    const banner = hero.locator('[data-slot="hero-banner"]');
    const frame = (await banner.boundingBox())!;
    expect(frame.height).toBeGreaterThan(230);
    expect(frame.height).toBeLessThan(300); // kürzer als am Rechner

    // Genau ein Streifen sichtbar: das Hauptfoto über die ganze Breite des Banners, oben
    const main = banner.locator('[data-hero-strip="main"]');
    await expect(main).toBeVisible();
    const photo = (await main.boundingBox())!;
    expect(Math.abs(photo.width - frame.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(photo.y - frame.y)).toBeLessThanOrEqual(1);
    const others = banner.locator('[data-hero-strip=""]');
    for (const strip of await others.all()) await expect(strip).toBeHidden();
    // Die ausgeblendeten Streifen laden ihr Foto gar nicht erst (`loading="lazy"` und nicht sichtbar)
    const loaded = await others
      .locator("img")
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).naturalWidth));
    expect(loaded.every((width) => width === 0)).toBe(true);
    await expect(main.locator("img")).toHaveJSProperty("complete", true);

    // Begrüßung unter dem Foto (nicht darauf); keine Chips
    const title = page.getByRole("heading", { level: 1, name: greeting("Anna") });
    expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(photo.y + photo.height);
    await expect(hero.getByRole("list", { name: "Auf einen Blick" })).toBeHidden();

    // Knöpfe unter dem Banner, nebeneinander, gut treffbar; der Name bleibt vollständig („Neue Veranstaltung“)
    const event = hero.getByRole("link", { name: "Neue Veranstaltung", exact: true });
    const member = hero.getByRole("link", { name: "Neues Mitglied", exact: true });
    const [a, b] = [(await event.boundingBox())!, (await member.boundingBox())!];
    expect(a.y).toBeGreaterThan(frame.y + frame.height);
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
    expect(Math.min(a.height, b.height)).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThan(a.x + a.width);
    // „Anpassen“ oben rechts im Banner
    const knob = (await hero.getByRole("button", { name: "Dashboard anpassen" }).boundingBox())!;
    expect(knob.y).toBeLessThan(frame.y + 40);
    expect(frame.x + frame.width - (knob.x + knob.width)).toBeLessThan(24);
    expect(knob.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    // Rolle, darunter das Datum – sichtbar in derselben Reihenfolge, wie es vorgelesen wird
    expect(await heroLayout(page)).toMatchObject({
      rem: expect.closeTo(17.125, 2),
      roleBeforeDate: true,
    });
  });

  test("Banner springt nicht: so hoch wie sein Ladegerüst (17,125 rem) – mit langem Vornamen, auch bei 320 px", async ({
    page,
  }) => {
    // Vorher wurde die Begrüßung bei „Guten Morgen, Sebastian“ (390 px) bzw. schon „Guten Abend, Anna“ (320 px) zweizeilig und
    // das Banner um 34 px höher.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.abteilung);
    const original = await renameSelf(page, "Maximiliane");
    try {
      await open(page, "/dashboard");
      await expect(
        page.getByRole("heading", { level: 1, name: greeting("Maximiliane") }),
      ).toBeVisible();
      for (const width of [412, 390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        const layout = await heroLayout(page);
        expect(layout, `${width} px`).toMatchObject({
          rem: expect.closeTo(17.125, 2),
          titleLines: 1,
          titleCut: false,
          outside: 0,
          roleBeforeDate: true,
        });
        expect(await overflow(page)).toBeLessThanOrEqual(1);
      }
    } finally {
      await renameSelf(page, original);
    }
  });

  test("Verein ohne Abteilungen: Banner gleich hoch wie mit Foto, die Begrüßung unten auf Nacht und Licht", async ({
    page,
  }) => {
    // Vorher war es ohne Foto nur 189 px hoch (Ladegerüst 274 px) – der Inhalt sprang beim Erscheinen um 85 px nach oben.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.otherAdmin);
    const banner = page.getByRole("main").locator('[data-slot="hero-banner"]');
    await expect(banner.locator("[data-hero-strip]")).toHaveCount(0);
    const layout = await heroLayout(page);
    expect(layout).toMatchObject({
      rem: expect.closeTo(17.125, 2),
      titleLines: 1,
      outside: 0,
      roleBeforeDate: true,
    });
    // Wie mit Foto: Begrüßung, Rolle und Datum stehen unten (Rand 1,5 rem), der Verein oben
    expect(Math.abs(layout.bottomGap - 24)).toBeLessThanOrEqual(2);
  });
});

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

  test("Große Fassung (ohne Karussell): Wischen auf einer Kennzahl blättert den Bereich", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    const kpis = page.getByRole("group", { name: "Kennzahlen", exact: true });

    // Die Karten selbst scrollen nicht seitlich: Auf der Aufgaben-Kachel blättert Wischen wie überall sonst den Bereich
    // (und öffnet nicht etwa den Link der Kachel).
    const tile = kpis
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("link", { name: /^Aufgaben im Verein/ }) });
    await tile.scrollIntoViewIfNeeded();
    const card = (await tile.boundingBox())!;
    const start = { x: card.x + card.width - 20, y: card.y + card.height / 2 };
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
 * Große Fassung der Kennzahlen (Vorstand, Vereinsadministrator – Mitglieder, Termine und Schichten sind da; Stil „Vertix“): die
 * Mitglieder-Karte, der Viererblock der Kacheln und die Helferstunden in der Gruppe „Kennzahlen“. Am Smartphone steht alles
 * untereinander – ohne Karussell –, auf dem Tablet Mitglieder und Kacheln nebeneinander und die Helferstunden darunter. Gemessen
 * wird ohne Einblenden („Bewegung reduzieren“): sonst stünden die Karten in den ersten Augenblicken noch ein paar Pixel tiefer.
 */
test.describe("Dashboard – große Fassung der Kennzahlen", () => {
  const kpisOf = (page: Page) => page.getByRole("group", { name: "Kennzahlen", exact: true });

  test("Smartphone: kein Karussell und keine Punkte – Mitglieder, Kacheln (zwei je Reihe) und Helferstunden untereinander, gleich breit", async ({
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

    const kpis = kpisOf(page);
    await expect(kpis.getByRole("link", { name: /^Mitglieder\s*\d/ })).toBeVisible();
    await expect(
      kpis.getByRole("link", { name: /^Aufgaben im Verein\s*\d+\s*offen/ }),
    ).toHaveAttribute("href", "/aufgaben");
    const tiles = kpis.locator("[data-kpi-tiles]");
    await expect(tiles.locator("[data-kpi]")).toHaveCount(4);

    const [members, block, hours] = await cardBoxes(kpis);
    const view = page.viewportSize()!;
    expect(block!.y).toBeGreaterThanOrEqual(members!.bottom - 1);
    expect(hours!.y).toBeGreaterThanOrEqual(block!.bottom - 1);
    for (const each of [block!, hours!]) {
      expect(Math.abs(each.x - members!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(each.width - members!.width)).toBeLessThanOrEqual(1);
    }
    // Im Block zwei Kacheln je Reihe
    const [first, second, third] = await cardBoxes(tiles);
    expect(Math.abs(second!.y - first!.y)).toBeLessThanOrEqual(1);
    expect(second!.x).toBeGreaterThanOrEqual(first!.right - 1);
    expect(third!.y).toBeGreaterThanOrEqual(first!.bottom - 1);
    expect(members!.x).toBeGreaterThanOrEqual(0);
    expect(members!.right).toBeLessThanOrEqual(view.width + 1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("Tablet-Breite (820 px): Mitglieder-Karte und Kacheln nebeneinander, die Helferstunden darunter über die ganze Breite", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    const kpis = kpisOf(page);
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);
    // Mitglieder, vier Kacheln, Helferstunden
    await expect(kpis.locator('[data-slot="kpi-link"]')).toHaveCount(6);
    expect(await kpis.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(
      false,
    );
    const [members, block, hours] = await cardBoxes(kpis);
    expect(Math.abs(block!.y - members!.y)).toBeLessThanOrEqual(1);
    expect(block!.x).toBeGreaterThanOrEqual(members!.right - 1);
    expect(hours!.y).toBeGreaterThanOrEqual(Math.max(members!.bottom, block!.bottom) - 1);
    expect(Math.abs(hours!.x - members!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(hours!.right - block!.right)).toBeLessThanOrEqual(1);
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
