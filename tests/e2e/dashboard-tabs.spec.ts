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
 * Große Fassung der Kennzahlen (Stil „Analytics“, `StudioFrame`): das Paar aus Mitglieder-Kachel und Aufgaben-Ring und die
 * übrigen Kennzahlen (Spalte rechts bzw. Raster darunter). `exact`, weil „Kennzahlen“ sonst auch „Weitere Kennzahlen“ träfe.
 */
const kpiPair = (page: Page) => page.getByRole("group", { name: "Kennzahlen", exact: true });
const kpiSide = (page: Page) =>
  page.getByRole("group", { name: "Weitere Kennzahlen", exact: true });

type Box = { x: number; y: number; width: number; height: number };
/** Lage und Größe aller Treffer, in der Reihenfolge des Codes. */
const boxes = (locator: Locator): Promise<Box[]> =>
  locator.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );

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

  test("Kennzahlen am Desktop (1280 px): Mitglieder und Aufgaben-Ring nebeneinander, rechts daneben „Weitere Kennzahlen“ als schmale Spalte – Termine, Helferstunden, freie Plätze und Zahlungen untereinander; kein Karussell, nichts abgeschnitten", async ({
    page,
  }) => {
    // Ohne Einblenden: Die Karten gleiten beim ersten Aufruf sonst 8 px von unten herein – gemessen würde mitten in der Bewegung.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, USERS.admin);
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-layout="studio"]')).toHaveAttribute("data-size", "m");
    await expect(page.locator('[data-layout="grid"]')).toHaveCount(0); // nicht das einfache Raster
    const pair = kpiPair(page).locator('[data-slot="card"]');
    const side = kpiSide(page).locator('[data-slot="card"]');
    await expect(pair).toHaveCount(2);
    await expect(side).toHaveCount(4); // mit Finanzrecht: die Offenen Zahlungen als vierte Karte
    // Reihenfolge im Code (Tastatur, Screenreader): Mitglieder, Ring – dann Termine, Helferstunden, freie Plätze, Zahlungen
    await expect(pair.nth(0).getByRole("link", { name: /^Mitglieder\s*\d/ })).toBeVisible();
    await expect(
      pair.nth(1).getByRole("link", { name: /^Aufgaben im Verein\s*\d+\s*offen/ }),
    ).toHaveAttribute("href", "/aufgaben");
    await expect(side.nth(0).getByRole("link", { name: /^Termine in 30 Tagen/ })).toBeVisible();
    await expect(side.nth(1).getByRole("link", { name: /^Helferstunden \d{4}/ })).toBeVisible();
    await expect(side.nth(2).getByRole("link", { name: /^Freie Helferplätze/ })).toBeVisible();
    await expect(side.nth(3)).toHaveAttribute("aria-labelledby", "w-offene-zahlungen-kachel");
    // Die Zahlungen stehen nur in den Kennzahlen, nicht noch einmal als eigene Karte darunter
    await expect(page.getByRole("region", { name: "Offene Zahlungen", exact: true })).toHaveCount(
      1,
    );
    await expect(page.locator('[aria-roledescription="Karussell"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Kennzahl \d von/ })).toHaveCount(0);

    const [members, tasks] = (await boxes(pair)) as [Box, Box];
    const cards = await boxes(side);
    const [events] = cards as [Box];
    // Das Paar: Mitglieder links, der Ring rechts daneben, oben und unten bündig
    expect(tasks.x).toBeGreaterThan(members.x + members.width);
    expect(Math.abs(tasks.y - members.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(tasks.y + tasks.height - (members.y + members.height))).toBeLessThanOrEqual(2);
    // Neben der schmalen Symbolleiste ist der Inhalt bei 1280 px schon breiter als 58 rem: Die übrigen Kennzahlen stehen als
    // Spalte rechts neben dem Paar – oben bündig (mit „Erste Schritte“ davor beginnt sie schon darüber), alle gleich breit und
    // untereinander in der Reihenfolge des Codes
    expect(events.y).toBeLessThanOrEqual(members.y + 1);
    for (const [index, card] of cards.entries()) {
      expect(card.x).toBeGreaterThan(tasks.x + tasks.width);
      expect(Math.abs(card.x - events.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(card.width - events.width)).toBeLessThanOrEqual(1);
      if (index > 0) expect(card.y).toBeGreaterThan(cards[index - 1]!.y + cards[index - 1]!.height);
    }
    expect(events.width).toBeLessThan(tasks.x + tasks.width - members.x); // schmaler als das Paar

    const width = page.viewportSize()!.width;
    for (const box of [members, tasks, ...cards]) {
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1); // kein seitliches Scrollen
  });

  test("Kennzahlen nach Inhaltsbreite: unter 58 rem (1024 und 1100 px) „Weitere Kennzahlen“ in zwei Spalten unter dem Paar – Termine, freie Plätze und Zahlungen links, Helferstunden rechts über alle drei –, ab 58 rem (1280 und 1470 px) als schmale Spalte rechts daneben; „Meine Aufgaben“ so breit wie das Paar", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" }); // kein erneutes Einblenden beim Umbau nach der Breite
    await login(page, USERS.admin);
    const pair = kpiPair(page);
    const side = kpiSide(page);
    const myTasks = page.getByRole("region", { name: "Meine Aufgaben", exact: true });
    const arrangement = (group: Locator) =>
      group.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          display: style.display,
          direction: style.flexDirection,
          columns: style.display === "grid" ? style.gridTemplateColumns.split(" ").length : 0,
        };
      });
    const rect = async (locator: Locator) => (await locator.boundingBox())!;

    // Neben der schmalen Symbolleiste (Standard ab 1024 px) bleibt der Inhalt bis etwa 1150 px Fensterbreite unter 58 rem
    for (const width of [1024, 1100]) {
      const at = `${width} px`;
      await page.setViewportSize({ width, height: 800 });
      await expect.poll(async () => (await arrangement(side)).columns, { message: at }).toBe(2);
      expect((await arrangement(pair)).columns, at).toBe(2); // Mitglieder | Ring
      const [top, below, list] = [await rect(pair), await rect(side), await rect(myTasks)];
      expect(below.y, at).toBeGreaterThan(top.y + top.height); // unter dem Paar …
      expect(Math.abs(below.x - top.x), at).toBeLessThanOrEqual(1); // … in derselben Breite
      expect(Math.abs(below.width - top.width), at).toBeLessThanOrEqual(1);
      expect(list.y, at).toBeGreaterThan(below.y + below.height); // „Meine Aufgaben“ danach, über die volle Breite
      expect(Math.abs(list.width - top.width), at).toBeLessThanOrEqual(1);
      const [events, hours, free, payments] = (await boxes(side.locator('[data-slot="card"]'))) as [
        Box,
        Box,
        Box,
        Box,
      ];
      // Links untereinander Termine, freie Plätze, Zahlungen …
      expect(Math.abs(free.x - events.x), at).toBeLessThanOrEqual(1);
      expect(Math.abs(payments.x - events.x), at).toBeLessThanOrEqual(1);
      expect(free.y, at).toBeGreaterThan(events.y + events.height);
      expect(payments.y, at).toBeGreaterThan(free.y + free.height);
      // … rechts die Helferstunden, gleich breit, über die Höhe aller drei (oben bündig mit den Terminen, unten mit den Zahlungen)
      expect(hours.x, at).toBeGreaterThan(events.x + events.width);
      expect(Math.abs(hours.width - events.width), at).toBeLessThanOrEqual(1);
      expect(Math.abs(hours.y - events.y), at).toBeLessThanOrEqual(1);
      expect(
        Math.abs(hours.y + hours.height - (payments.y + payments.height)),
        at,
      ).toBeLessThanOrEqual(1);
    }

    // Ab 58 rem Inhaltsbreite: Spalte rechts, Karten untereinander
    for (const [width, height] of [
      [1280, 800],
      [1470, 900],
    ] as const) {
      const at = `${width} px`;
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await arrangement(side)).display, { message: at })
        .toBe("flex");
      expect((await arrangement(side)).direction, at).toBe("column");
      expect((await arrangement(pair)).columns, at).toBe(2); // das Paar bleibt nebeneinander
      const [left, right, list] = [await rect(pair), await rect(side), await rect(myTasks)];
      expect(right.x, at).toBeGreaterThan(left.x + left.width); // rechts neben dem Paar …
      expect(right.width, at).toBeLessThan(left.width); // … schmaler als das Paar …
      expect(right.y, at).toBeLessThanOrEqual(left.y + 1); // … und oben bündig (mit „Erste Schritte“ davor beginnt sie schon darüber)
      const cards = await boxes(side.locator('[data-slot="card"]'));
      expect(cards).toHaveLength(4);
      for (const [index, card] of cards.entries()) {
        expect(Math.abs(card.x - right.x), at).toBeLessThanOrEqual(1); // alle in der Spalte …
        if (index > 0)
          expect(card.y, at).toBeGreaterThan(cards[index - 1]!.y + cards[index - 1]!.height); // … in der Reihenfolge des Codes
      }
      // „Meine Aufgaben“ steht links unter dem Paar, so breit wie das Paar und neben der Spalte
      expect(list.y, at).toBeGreaterThan(left.y + left.height);
      expect(Math.abs(list.x - left.x), at).toBeLessThanOrEqual(1);
      expect(Math.abs(list.width - left.width), at).toBeLessThanOrEqual(1);
      expect(list.x + list.width, at).toBeLessThan(right.x);
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
