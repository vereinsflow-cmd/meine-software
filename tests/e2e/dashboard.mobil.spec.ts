import { expect, test, type Page } from "@playwright/test";
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
    // Der letzte Reiter ragt am Rand ins Bild: ein sichtbarer Hinweis, dass es weitergeht
    const last = (await tabs.last().boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(last.x).toBeLessThan(viewport.width);
    expect(last.x + last.width).toBeGreaterThan(viewport.width);

    // Den letzten Reiter antippen: Er wird vollständig ins Bild geholt, der Inhalt wechselt
    await select(page, "Aufgaben & Aktivität");
    await expect(page.getByRole("tab", { name: "Aufgaben & Aktivität" })).toBeInViewport({
      ratio: 0.98,
    });
    await expect(page.getByRole("region", { name: "Auswertungen" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\?tab=aktivitaet$/);
    // …und zurück: Jetzt ist wieder der erste Reiter sichtbar
    await select(page, "Übersicht");
    await expect(page.getByRole("tab", { name: "Übersicht" })).toBeInViewport({ ratio: 0.98 });
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

  test("Auf der Kennzahlen-Reihe gehört das Wischen dem Karussell und blättert nicht den Bereich", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const scroller = page.getByRole("group", { name: "Kennzahlen" });
    await scroller.scrollIntoViewIfNeeded();
    const box = (await scroller.boundingBox())!;
    const from = { x: box.x + box.width - 60, y: box.y + box.height / 2 };
    await swipe(page, from, { x: from.x - 240, y: from.y });
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(100);
    await expect(selected(page)).toHaveText("Übersicht");
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

test.describe("Dashboard – Kennzahlen als Karussell", () => {
  test("Smartphone: vier Karten nebeneinander, die nächste ragt ins Bild; Punkte zeigen den Stand und springen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const scroller = page.getByRole("group", { name: "Kennzahlen" });
    const cards = scroller.getByRole("link");
    await expect(cards).toHaveCount(4);
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
    await login(page, USERS.admin);
    const scroller = page.getByRole("group", { name: "Kennzahlen" });
    const last = scroller.getByRole("link").nth(3);
    await last.focus();
    await expect(last).toBeInViewport({ ratio: 0.95 });
    await expect(page.getByRole("button", { name: "Kennzahl 4 von 4" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("Ab Tablet-Breite (820 px) ein Raster wie bisher: kein Karussell, keine Punkte", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await login(page, USERS.admin);
    const scroller = page.getByRole("group", { name: "Kennzahlen" });
    await expect(scroller.getByRole("link")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);
    const scrollable = await scroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(scrollable).toBe(false);
    const one = (await scroller.getByRole("link").nth(0).boundingBox())!;
    const two = (await scroller.getByRole("link").nth(1).boundingBox())!;
    expect(Math.abs(one.y - two.y)).toBeLessThan(2); // zwei Spalten
  });
});

test.describe("Dashboard mobil – Barrierefreiheit (axe)", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: Übersicht mit Karussell und Reiterleiste ohne Verstöße`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await login(page, USERS.admin);
      expect(await violations(page)).toEqual([]);
      await select(page, "Termine & Helfer");
      expect(await violations(page)).toEqual([]);
    });
  }
});
