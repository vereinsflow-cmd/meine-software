import { expect, test, type Page } from "@playwright/test";
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

test.describe("Dashboard-Reiter", () => {
  test("Seitenleiste: weiterhin genau ein Punkt „Dashboard“, die Reiter erscheinen dort nicht", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const hrefs = () =>
      nav(page)
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    await expect(nav(page).getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(1);
    // „Verein“ aufklappen, bevor die Ausgangslage gemerkt wird: So werden auch dessen Punkte geprüft, und der Vergleich
    // unten stellt sicher, dass ein Reiterwechsel die geöffnete Gruppe nicht verändert.
    await openNavGroup(nav(page), "Verein");
    const before = await hrefs();
    expect(before.some((href) => href?.includes("tab="))).toBe(false); // kein Reiter als Menüpunkt

    // Reiter, die es sonst nirgends in der Seitenleiste gibt, erscheinen dort nicht
    for (const name of ["Übersicht", "Termine & Helfer", "Aufgaben & Aktivität"]) {
      await expect(nav(page).getByText(name, { exact: true })).toHaveCount(0);
    }
    // „Mitglieder“ ist zugleich ein echter Bereich der Anwendung (Mitgliederliste) – genau einmal, mit eigenem Ziel
    await expect(nav(page).getByRole("link", { name: "Mitglieder", exact: true })).toHaveAttribute(
      "href",
      "/mitglieder",
    );

    // Reiterwechsel ändert die Seitenleiste nicht: gleiche Punkte, „Dashboard“ bleibt der aktive
    for (const name of NAMES) {
      await chooseTab(page, name);
      expect(await hrefs()).toEqual(before);
      await expect(nav(page).getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(1);
      await expect(nav(page).getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("Leiste: vier Reiter, der aktive ist eindeutig erkennbar (Auswahl, Farbe, Schrift, Strich)", async ({
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

    // Der Strich unter dem aktiven Reiter (3 px, Hauptfarbe) liegt genau unter ihm …
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
    expect(await under(first)).toMatchObject({ height: 3 });
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

  test("Strich gleitet weich (300 ms); bei „Bewegung reduzieren“ springt er ohne Übergang", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const line = page.locator('[data-slot="tab-indicator"]');
    const transition = () =>
      line.evaluate((el) => {
        const style = getComputedStyle(el);
        return { property: style.transitionProperty, duration: style.transitionDuration };
      });
    await expect.poll(transition).toEqual({ property: "transform, width", duration: "0.3s" });
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

  test("Kennzahlen am Desktop: vier Karten in einer Reihe wie bisher – kein Karussell, keine Punkte, nichts wird abgeschnitten", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const cards = page.getByRole("group", { name: "Kennzahlen" }).getByRole("link");
    await expect(cards).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);
    const boxes = await cards.evaluateAll((links) =>
      links.map((link) => {
        const { x, y, width } = link.getBoundingClientRect();
        return { x, y, width };
      }),
    );
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1); // eine Reihe
    const width = page.viewportSize()!.width;
    for (const box of boxes) expect(box.x + box.width).toBeLessThanOrEqual(width);
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
