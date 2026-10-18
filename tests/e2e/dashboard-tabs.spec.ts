import { expect, test, type Locator, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, chooseTab, loginSettled as login, open, openNavGroup } from "./helpers";

/**
 * Reiter innerhalb der Dashboard-Seite: Die Seitenleiste behält den einen Punkt „Dashboard“, der aktive Reiter ist eindeutig
 * erkennbar, der Wechsel geschieht ohne Neuladen (die Adresse wird nachgeführt), Reiter lassen sich verlinken, und alles ist
 * mit der Tastatur bedienbar.
 */
const nav = (page: Page) => page.getByRole("navigation", { name: "Hauptnavigation" });
const tabBar = (page: Page) => page.getByRole("tablist", { name: "Bereiche des Dashboards" });
const NAMES = ["Übersicht", "Termine & Helfer", "Mitglieder", "Aufgaben & Aktivität"];

/**
 * Gruppen der Seitenleiste – in der Symbolleiste (Standard ab 1024 px) je ein Knopf mit Ausklapp-Menü. „Persönlich“ trägt dort
 * das Kürzel der Person im Namen („Persönlich (AA)“).
 */
const GROUPS: (string | RegExp)[] = [
  "Verein",
  "Organisation",
  "Kommunikation",
  "Einstellungen",
  /^Persönlich/,
];
/** Schließt das Ausklapp-Menü einer Gruppe mit Escape (wie `openNavGroup`: Name exakt bzw. als regulärer Ausdruck). */
async function closeNavGroup(page: Page, group: string | RegExp): Promise<void> {
  const trigger =
    typeof group === "string"
      ? nav(page).getByRole("button", { name: group, exact: true })
      : nav(page).getByRole("button", { name: group });
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

/**
 * Große Fassung der Kennzahlen (Stil „Vertix“, `StudioFrame`): Mitglieder-Karte, Viererblock der Kacheln und Helferstunden in
 * einer Gruppe. `kpiSide`: die frühere zweite Gruppe – es darf sie nicht mehr geben.
 */
const kpiPair = (page: Page) => page.getByRole("group", { name: "Kennzahlen", exact: true });
const kpiSide = (page: Page) =>
  page.getByRole("group", { name: "Weitere Kennzahlen", exact: true });

test.describe("Dashboard-Reiter", () => {
  test("Seitenleiste: weiterhin genau ein Punkt „Dashboard“, die Reiter erscheinen dort nicht", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const hrefs = () =>
      nav(page)
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const dashboard = nav(page).getByRole("link", { name: "Dashboard", exact: true });
    await expect(dashboard).toHaveCount(1);
    await expect(dashboard).toHaveAttribute("aria-current", "page");

    // In der Symbolleiste (Standard ab 1024 px) stehen die Seiten einer Gruppe nur im geöffneten Ausklapp-Menü – deshalb jede
    // Gruppe einmal öffnen: Kein Reiter erscheint dort als Menüpunkt, und Reiter, die es sonst nirgends in der Seitenleiste
    // gibt, auch nicht als Text.
    for (const group of GROUPS) {
      await openNavGroup(nav(page), group);
      expect((await hrefs()).some((href) => href?.includes("tab="))).toBe(false);
      for (const name of ["Übersicht", "Termine & Helfer", "Aufgaben & Aktivität"]) {
        await expect(nav(page).getByText(name, { exact: true })).toHaveCount(0);
      }
      await closeNavGroup(page, group);
    }

    // „Mitglieder“ ist zugleich ein echter Bereich der Anwendung (Mitgliederliste) – im Menü „Verein“ genau einmal, mit eigenem
    // Ziel. Mit dem offenen Menü die Ausgangslage merken: Der Vergleich unten prüft so auch dessen Punkte.
    await openNavGroup(nav(page), "Verein");
    await expect(nav(page).getByRole("link", { name: "Mitglieder", exact: true })).toHaveAttribute(
      "href",
      "/mitglieder",
    );
    const before = await hrefs();
    expect(before).toContain("/dashboard");
    await closeNavGroup(page, "Verein");

    // Reiterwechsel ändert die Seitenleiste nicht: „Dashboard“ bleibt der eine aktive Punkt, „Verein“ zeigt dieselben Punkte.
    // Das offene Menü liegt über dem Anfang der Seite (auch über den Reitern) und schließt beim Klick daneben – deshalb vor
    // jedem Wechsel zu, danach wieder auf.
    for (const name of NAMES) {
      await chooseTab(page, name);
      await expect(dashboard).toHaveCount(1);
      await expect(dashboard).toHaveAttribute("aria-current", "page");
      await openNavGroup(nav(page), "Verein");
      expect(await hrefs()).toEqual(before);
      await closeNavGroup(page, "Verein");
    }
  });

  test("Leiste: vier Reiter, der aktive ist eindeutig erkennbar (Auswahl, Farbe, Schrift, helle Fläche)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const tabs = tabBar(page).getByRole("tab");
    await expect(tabs).toHaveText(NAMES);
    const first = tabs.nth(0);
    const second = tabs.nth(1);
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(second).toHaveAttribute("aria-selected", "false");

    const look = (tab: typeof first) =>
      tab.evaluate((element) => {
        const style = getComputedStyle(element);
        return { weight: Number(style.fontWeight), color: style.color };
      });
    const active = await look(first);
    const inactive = await look(second);
    expect(active.weight).toBeGreaterThan(inactive.weight); // fett gegen normal
    expect(active.color).not.toBe(inactive.color); // Hauptfarbe gegen gedämpftes Grau

    // Die helle Fläche hinter dem aktiven Reiter deckt genau ihn ab …
    const line = page.locator('[data-slot="tab-indicator"]');
    const rect = async (locator: typeof line) => (await locator.boundingBox())!;
    const under = async (tab: typeof first) => {
      const [strip, target] = [await rect(line), await rect(tab)];
      return {
        left: Math.abs(strip.x - target.x),
        width: Math.abs(strip.width - target.width),
        bottom: Math.abs(strip.y + strip.height - (target.y + target.height)),
        height: strip.height,
      };
    };
    await expect.poll(async () => (await under(first)).left).toBeLessThan(2);
    expect(Math.abs((await under(first)).height - (await rect(first)).height)).toBeLessThan(2);
    expect((await under(first)).width).toBeLessThan(2);
    expect((await under(first)).bottom).toBeLessThan(2);
    await expect(line).toHaveCSS("opacity", "1");

    // … und gleitet beim Wechsel unter den neuen Reiter; die Auszeichnung wandert mit
    await second.click();
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveAttribute("aria-selected", "false");
    await expect.poll(async () => (await under(second)).left).toBeLessThan(2);
    expect((await under(second)).width).toBeLessThan(2);
    expect((await look(second)).weight).toBeGreaterThan((await look(first)).weight);
  });

  test("Fläche gleitet weich (200 ms); bei „Bewegung reduzieren“ springt sie ohne Übergang", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const line = page.locator('[data-slot="tab-indicator"]');
    const transition = () =>
      line.evaluate((el) => {
        const style = getComputedStyle(el);
        return { property: style.transitionProperty, duration: style.transitionDuration };
      });
    // 200 ms seit dem Feinschliff vom 05.10.2026 (vorher 300 ms) – kürzer wirkt der Wechsel direkter.
    await expect.poll(transition).toEqual({ property: "transform, width", duration: "0.2s" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(async () => (await transition()).property).toBe("none");
  });

  test("Folien: der neue Bereich gleitet in Richtung der Bewegung herein – vorwärts von rechts, zurück von links", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const panel = (name: string) => page.getByRole("tabpanel", { name, exact: true });
    // Erster Aufruf der Seite: keine Animation (nichts „fährt“ beim Laden herein)
    expect(await panel("Übersicht").getAttribute("class")).not.toContain("slide-in");

    await chooseTab(page, "Termine & Helfer");
    await expect(panel("Termine & Helfer")).toHaveClass(/slide-in-from-right/);
    expect(
      await panel("Termine & Helfer").evaluate((el) => getComputedStyle(el).animationName),
    ).not.toBe("none");
    await chooseTab(page, "Mitglieder");
    await expect(panel("Mitglieder")).toHaveClass(/slide-in-from-right/);
    await chooseTab(page, "Übersicht"); // zurück (auch über mehrere Bereiche hinweg)
    await expect(panel("Übersicht")).toHaveClass(/slide-in-from-left/);
    await expect(panel("Übersicht")).not.toHaveClass(/slide-in-from-right/);
  });

  test("Folien: beim Wechsel steht nie der alte über dem neuen Bereich (der abgehende verschwindet sofort, nichts springt)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    // Zählt die Bereiche des Dashboards (nicht die der Auswertungen) in jedem Bild der ersten halben Sekunde nach dem Klick.
    const stacked = () =>
      page.evaluate(
        () =>
          new Promise<{ panels: number; height: number }>((resolve) => {
            const start = performance.now();
            let panels = 0;
            let height = 0;
            const frame = () => {
              const outer = Array.from(document.querySelectorAll('[role="tabpanel"]')).filter(
                (panel) =>
                  !(panel as HTMLElement).hidden && // Radix lässt die Hülle stehen, `hidden` sobald der Inhalt entfernt ist
                  document
                    .getElementById(panel.getAttribute("aria-labelledby") ?? "")
                    ?.closest('[role="tablist"]')
                    ?.getAttribute("aria-label") === "Bereiche des Dashboards",
              );
              panels = Math.max(panels, outer.length);
              height = Math.max(height, document.documentElement.scrollHeight);
              if (performance.now() - start < 500) requestAnimationFrame(frame);
              else resolve({ panels, height });
            };
            frame();
          }),
      );
    await chooseTab(page, "Termine & Helfer"); // Klick, dann sofort messen (die Animation dauert 300 ms)
    expect((await stacked()).panels).toBe(1);
    await page.getByRole("tab", { name: "Übersicht", exact: true }).click(); // und zurück
    expect((await stacked()).panels).toBe(1);
  });

  test("Folien: „Bewegung reduzieren“ – der Bereich erscheint sofort, ohne Gleiten", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    await chooseTab(page, "Termine & Helfer");
    const panel = page.getByRole("tabpanel", { name: "Termine & Helfer", exact: true });
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });

  test("Zurück/Weiter unter dem Inhalt: blättert wie durch Folien, an den Enden fehlt die jeweilige Richtung", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const pager = page.getByRole("navigation", { name: "Bereich wechseln" });
    // Erster Bereich: nur „Weiter“
    await expect(pager.getByRole("button", { name: /^Zurück/ })).toHaveCount(0);
    await pager.getByRole("button", { name: "Weiter: Termine & Helfer" }).click();
    await expect(page.getByRole("tab", { name: "Termine & Helfer", selected: true })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\?tab=termine$/);
    // Mittendrin: beide Richtungen, mit dem Namen des Ziels
    await expect(pager.getByRole("button", { name: "Zurück: Übersicht" })).toBeVisible();
    await pager.getByRole("button", { name: "Weiter: Mitglieder" }).click();
    await pager.getByRole("button", { name: "Weiter: Aufgaben & Aktivität" }).click();
    // Letzter Bereich: nur „Zurück“
    await expect(
      page.getByRole("tab", { name: "Aufgaben & Aktivität", selected: true }),
    ).toBeVisible();
    await expect(pager.getByRole("button", { name: /^Weiter/ })).toHaveCount(0);
    await pager.getByRole("button", { name: "Zurück: Mitglieder" }).click();
    await expect(page.getByRole("tab", { name: "Mitglieder", selected: true })).toBeVisible();
  });

  test("Zurück/Weiter holt den Anfang des Bereichs ins Bild (Seite springt nicht unten stehen)", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await chooseTab(page, "Termine & Helfer");
    await page.getByRole("navigation", { name: "Bereich wechseln" }).scrollIntoViewIfNeeded();
    await page
      .getByRole("navigation", { name: "Bereich wechseln" })
      .getByRole("button", { name: "Weiter: Mitglieder" })
      .click();
    await expect(page.getByRole("tab", { name: "Mitglieder", selected: true })).toBeVisible();
    // Die Leiste mit dem gewählten Reiter ist wieder im Bild
    await expect(tabBar(page)).toBeInViewport();
    await expect(page.getByRole("region", { name: "Geburtstage" })).toBeInViewport();
  });

  test("Kennzahlen nach Inhaltsbreite (Stil „Vertix“): Mitglieder-Karte und Kacheln immer nebeneinander, die Helferstunden bis 66 rem darunter über die ganze Breite, breiter als dritte Spalte daneben; „Meine Aufgaben“ darunter über die volle Breite; kein Karussell, nichts abgeschnitten", async ({
    page,
  }) => {
    // Ohne Einblenden: Die Karten gleiten beim ersten Aufruf sonst 8 px von unten herein – gemessen würde mitten in der Bewegung.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-layout="studio"]')).toHaveAttribute("data-size", "m");
    await expect(page.locator('[data-layout="grid"]')).toHaveCount(0); // nicht das einfache Raster
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);
    const kpis = kpiPair(page);
    const members = kpis.locator('[data-slot="card"]').filter({
      has: page.getByRole("link", { name: /^Mitglieder\s*\d/ }),
    });
    const tiles = kpis.locator("[data-kpi-tiles]");
    const hours = kpis.locator('[data-slot="card"]').filter({
      has: page.getByRole("link", { name: /^Helferstunden \d{4}/ }),
    });
    // Mit Finanzrecht vier Kacheln, die erste sind die Offenen Zahlungen
    await expect(tiles.locator("[data-kpi]")).toHaveCount(4);
    await expect(tiles.locator("[data-kpi]").first()).toHaveAttribute(
      "data-kpi",
      "Offene Zahlungen",
    );
    const myTasks = page.getByRole("region", { name: "Meine Aufgaben", exact: true });
    const rect = async (locator: Locator) => (await locator.boundingBox())!;

    for (const [width, height, three] of [
      [1024, 800, false],
      [1100, 800, false],
      [1280, 800, false],
      [1470, 900, true],
    ] as const) {
      const at = `${width} px`;
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => Math.abs((await rect(hours)).y - (await rect(members)).y) <= 1, {
          message: at,
        })
        .toBe(three);
      const [m, t, h, list] = [
        await rect(members),
        await rect(tiles),
        await rect(hours),
        await rect(myTasks),
      ];
      // Mitglieder links, die Kacheln rechts daneben, oben bündig und gleich hoch
      expect(t.x, at).toBeGreaterThan(m.x + m.width);
      expect(Math.abs(t.y - m.y), at).toBeLessThanOrEqual(1);
      expect(Math.abs(t.height - m.height), at).toBeLessThanOrEqual(2);
      if (three) {
        expect(h.x, at).toBeGreaterThan(t.x + t.width);
        expect(Math.abs(h.height - m.height), at).toBeLessThanOrEqual(2);
      } else {
        expect(h.y, at).toBeGreaterThan(m.y + m.height);
        expect(Math.abs(h.x - m.x), at).toBeLessThanOrEqual(1);
        expect(Math.abs(h.x + h.width - (t.x + t.width)), at).toBeLessThanOrEqual(1);
      }
      // „Meine Aufgaben“ unter den Kennzahlen, so breit wie sie zusammen
      const bottom = Math.max(m.y + m.height, h.y + h.height);
      expect(list.y, at).toBeGreaterThan(bottom);
      expect(Math.abs(list.x - m.x), at).toBeLessThanOrEqual(1);
      expect(
        Math.abs(list.x + list.width - Math.max(t.x + t.width, h.x + h.width)),
        at,
      ).toBeLessThanOrEqual(1);
      for (const box of [m, t, h]) expect(box.x + box.width, at).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        at,
      ).toBeLessThanOrEqual(1); // kein seitliches Scrollen
    }
  });

  test("Ohne Mitgliederzahlen (Helfer): einfaches Raster gleich großer Karten statt der großen Fassung, Zahlen auf einer Höhe, „Ungelesen“ ohne Grafik", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1470, height: 900 });
    await login(page, USERS.helfer);
    const group = page.getByRole("group", { name: "Kennzahlen", exact: true });
    await expect(page.locator('[data-layout="grid"]')).toHaveCount(1);
    await expect(page.locator('[data-layout="studio"]')).toHaveCount(0);
    await expect(kpiSide(page)).toHaveCount(0); // keine zweite Gruppe: alle Kennzahlen im einen Raster
    await expect(group).toHaveAttribute("aria-roledescription", "Karussell");
    await expect(group.locator('[data-slot="card"]')).toHaveCount(4);
    await expect
      .poll(() =>
        group.evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
        ),
      )
      .toBe(4); // ab 58 rem vier nebeneinander
    // Maus weg und ohne Bewegung: Eine überfahrene Karte hebt sich sonst um 2 px an
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(0, 0);
    const cards = await group.locator('[data-slot="card"]').evaluateAll((elements) =>
      elements.map((element) => {
        const card = element.getBoundingClientRect();
        const value = element.querySelector('[data-slot="kpi-value"]')!.getBoundingClientRect();
        const label = element.querySelector<HTMLElement>('[data-slot="kpi-label"]')!;
        return {
          top: card.top,
          height: card.height,
          valueTop: value.top,
          overflow: label.scrollWidth > label.clientWidth + 1,
        };
      }),
    );
    for (const card of cards) {
      expect(Math.abs(card.top - cards[0]!.top)).toBeLessThanOrEqual(1); // eine Reihe …
      expect(Math.abs(card.height - cards[0]!.height)).toBeLessThanOrEqual(1); // … gleich hoch …
      expect(Math.abs(card.valueTop - cards[0]!.valueTop)).toBeLessThanOrEqual(1); // … die Zahlen auf einer Höhe
      expect(card.overflow).toBe(false); // keine Beschriftung läuft aus ihrer Spalte
    }
    // „Ungelesen“ hat keinen Kursverlauf (die Zahl ändert sich nicht über die Zeit)
    await expect(
      group
        .locator('[data-slot="card"]')
        .filter({ has: page.getByRole("link", { name: /^Ungelesen/ }) })
        .locator('[data-slot="quote-chart"]'),
    ).toHaveCount(0);
  });

  test("Leiste bleibt beim Scrollen unter der Kopfzeile stehen", async ({ page }) => {
    await login(page, USERS.admin);
    await chooseTab(page, "Termine & Helfer");
    await expect(page.getByRole("button", { name: /Einklappen Auswertungen/ })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await expect(tabBar(page)).toBeInViewport();
    const box = (await tabBar(page).boundingBox())!;
    expect(box.y).toBeGreaterThan(40); // unter der Kopfzeile (nicht darunter verdeckt)
    expect(box.y).toBeLessThan(120); // …und dicht darunter, nicht mitgescrollt
    // Von dort lässt sich der Bereich wechseln, ohne zurückzuscrollen
    await page.getByRole("tab", { name: "Mitglieder" }).click();
    await expect(page.getByRole("tab", { name: "Mitglieder", selected: true })).toBeVisible();
  });

  test("Wechsel ohne Neuladen: Seitenzustand bleibt erhalten, die Adresse wird nachgeführt, kein neuer Verlaufseintrag", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard");
    // Marke im Browser: Ein Neuladen oder eine Navigation würde sie löschen.
    await page.evaluate(() => {
      (window as unknown as { __dashboardMarke: number }).__dashboardMarke = 42;
    });
    const historyBefore = await page.evaluate(() => history.length);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") requests.push(request.url());
    });

    await chooseTab(page, "Mitglieder");
    await expect(page).toHaveURL(/\/dashboard\?tab=mitglieder$/);
    await expect(page.getByRole("region", { name: "Geburtstage" })).toBeVisible();
    await chooseTab(page, "Aufgaben & Aktivität");
    await expect(page).toHaveURL(/\/dashboard\?tab=aktivitaet$/);
    await chooseTab(page, "Übersicht");
    await expect(page).toHaveURL(/\/dashboard$/); // erster Reiter: kein Parameter nötig
    await expect(page.getByRole("region", { name: "Meine Aufgaben" })).toBeVisible();

    expect(
      await page.evaluate(
        () => (window as unknown as { __dashboardMarke?: number }).__dashboardMarke,
      ),
    ).toBe(42); // nicht neu geladen
    expect(requests).toEqual([]); // kein einziges Seitendokument nachgeladen
    expect(await page.evaluate(() => history.length)).toBe(historyBefore); // „Zurück“ verlässt das Dashboard
  });

  test("Adresse: Reiter lassen sich verlinken, Neuladen bleibt im Reiter, ungültige Werte führen zur Übersicht", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await open(page, "/dashboard?tab=aktivitaet");
    await expect(
      page.getByRole("tab", { name: "Aufgaben & Aktivität", selected: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Aufgaben & Aktivität", selected: true }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Letzte Aktivitäten" })).toBeVisible();

    for (const bad of ["gibt-es-nicht", "Mitglieder", "../termine", ""]) {
      await open(page, `/dashboard?tab=${encodeURIComponent(bad)}`);
      await expect(page.getByRole("tab", { name: "Übersicht", selected: true })).toBeVisible();
    }
  });

  test("Rollen: einen nicht vorhandenen Reiter kann man auch per Adresse nicht öffnen", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await open(page, "/dashboard?tab=mitglieder"); // Helfer haben keinen Mitglieder-Reiter
    await expect(page.getByRole("tab", { name: "Übersicht", selected: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Mitglieder" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Geburtstage" })).toHaveCount(0);
  });

  test("Tastatur: Pfeiltasten wechseln den Reiter, Pos1/Ende springen; der Inhalt wechselt mit", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const tabs = tabBar(page).getByRole("tab");
    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Kommende Veranstaltungen" })).toBeVisible();
    await page.keyboard.press("End");
    await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Meine Aufgaben" })).toBeVisible();
    // Zwischen zwei Tabs gibt es genau einen Tabstopp (Tab führt in den Inhalt, nicht durch alle Reiter)
    await page.keyboard.press("Tab");
    await expect(tabs.nth(1)).not.toBeFocused();
  });

  test("Inhalt ist als Reiterbereich ausgezeichnet und mit dem Reiter verknüpft", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const panel = page.getByRole("tabpanel");
    await expect(panel).toHaveCount(1); // nur der aktive Bereich ist im Baum
    await expect(panel).toHaveAccessibleName("Übersicht");
    await chooseTab(page, "Termine & Helfer");
    // (Die Auswertung hat darin noch eigene, innere Reiter – deshalb nach dem Namen des äußeren Bereichs suchen.)
    await expect(
      page.getByRole("tabpanel", { name: "Termine & Helfer", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "Übersicht", exact: true })).toHaveCount(0);
  });

  test("Was jede Rolle im jeweiligen Reiter sieht, bleibt erhalten: Abteilungsleiterin hat vier Reiter, Aktivitäten nur mit Protokollrecht", async ({
    page,
  }) => {
    await login(page, USERS.abteilung);
    await expect(page.getByRole("tab")).toHaveText(NAMES); // Abteilungsleitung: Mitglieder der Abteilung, Aufgaben …
    await chooseTab(page, "Aufgaben & Aktivität");
    await expect(page.getByRole("region", { name: "Letzte Aktivitäten" })).toHaveCount(0); // kein Protokollrecht
    await expect(page.getByRole("region", { name: "Auswertungen" })).toBeVisible();
  });
});

test.describe("Dashboard-Reiter – Barrierefreiheit (axe)", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: jeder Reiter ohne Verstöße`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await login(page, USERS.admin);
      for (const name of NAMES) {
        await chooseTab(page, name);
        if (name !== "Übersicht") {
          // Auswertungen (laden nach) abwarten, damit auch sie geprüft werden
          await expect(page.getByRole("button", { name: /Einklappen Auswertungen/ })).toBeVisible();
        }
        expect(await violations(page), `Reiter „${name}“`).toEqual([]);
      }
    });
  }
});
