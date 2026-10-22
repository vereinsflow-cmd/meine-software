import { expect, test } from "@playwright/test";
import { USERS, greeting, login, logout, open, ringTurns, stageState } from "./helpers";

test.describe("Anmeldung und Zugriffsschutz", () => {
  test("nicht angemeldete Besucher werden zur Anmeldung geleitet und kehren danach zurück", async ({
    page,
  }) => {
    await page.goto("/veranstaltungen");
    await expect(page).toHaveURL(/\/anmelden\?next=%2Fveranstaltungen/);

    await page.getByLabel("E-Mail-Adresse").fill(USERS.admin);
    await page.getByLabel("Passwort").fill(process.env.SEED_PASSWORD ?? "Vereinsflow-Demo-2026!");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/veranstaltungen/);
  });

  test("falsche Zugangsdaten zeigen eine verständliche Meldung ohne Details", async ({ page }) => {
    await page.goto("/anmelden");
    await page.getByLabel("E-Mail-Adresse").fill(USERS.admin);
    await page.getByLabel("Passwort").fill("völlig-falsches-passwort");
    await page.getByRole("button", { name: "Anmelden" }).click();

    // (Next.js hat selbst ein role="alert"-Element für Seitenwechsel – daher gezielt nach dem Text filtern.)
    await expect(
      page.getByRole("alert").filter({ hasText: "E-Mail-Adresse oder Passwort ist falsch." }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/anmelden/);
  });

  test("Formularfehler werden am Feld angezeigt", async ({ page }) => {
    await page.goto("/anmelden");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(
      page
        .getByText("Bitte gib eine gültige E-Mail-Adresse ein.")
        .or(page.getByText("Bitte gib deine E-Mail-Adresse ein.")),
    ).toBeVisible();
    await expect(page.getByText("Bitte gib dein Passwort ein.")).toBeVisible();
  });

  test("Anmelden, Dashboard sehen, Abmelden – danach ist der Bereich wieder gesperrt", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(greeting("Anna"));
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();

    await logout(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/anmelden/);
  });

  test("Passwort vergessen antwortet immer gleich (keine Konto-Enumeration)", async ({ page }) => {
    for (const email of [USERS.helfer, "gibt-es-nicht@example.test"]) {
      await page.goto("/passwort-vergessen");
      await page.getByLabel("E-Mail-Adresse").fill(email);
      await page.getByRole("button", { name: "Link anfordern" }).click();
      await expect(
        page.getByText("Falls für diese E-Mail-Adresse ein Konto existiert"),
      ).toBeVisible();
    }
  });

  test("ungültige Einladungs- und Reset-Links zeigen Hinweisseiten", async ({ page }) => {
    await page.goto("/einladung/ungueltiges-token-123456");
    await expect(page.getByText("Einladung nicht mehr gültig")).toBeVisible();

    await page.goto("/passwort-zuruecksetzen?token=ungueltig-ungueltig");
    await expect(page.getByText("Link ungültig oder abgelaufen")).toBeVisible();
  });

  test("vor dem Laden abgeschickt (ohne JavaScript): das Passwort landet nie in der Adresse", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/anmelden");
    await page.getByLabel("E-Mail-Adresse").fill("niemand@example.org");
    await page.locator('input[name="password"]').fill("Geheim-und-lang-genug-2026");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForLoadState("load");
    expect(page.url()).not.toContain("Geheim");
    expect(page.url()).not.toContain("password");
    await context.close();
  });

  test("Impressum und Datenschutzerklärung sind ohne Anmeldung erreichbar", async ({ page }) => {
    await page.goto("/impressum");
    await expect(page.getByRole("heading", { name: "Impressum" })).toBeVisible();
    await page.goto("/datenschutzerklaerung");
    await expect(page.getByRole("heading", { name: "Datenschutzerklärung" })).toBeVisible();
  });

  test("Sicherheits-Header sind gesetzt", async ({ request }) => {
    const response = await request.get("/anmelden");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("script-src 'self' 'nonce-");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe("Sitzungs-Cookie", () => {
  test("ist HttpOnly und SameSite=Lax", async ({ page, context }) => {
    await login(page, USERS.helfer);
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name.endsWith("vf_session"));
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
    expect(session?.path).toBe("/");
    // Das Token ist für JavaScript auf der Seite nicht lesbar.
    expect(await page.evaluate(() => document.cookie)).not.toContain("vf_session");
  });
});

/**
 * Anmeldeseite als Kinobühne („3D-Fotokarussell“, `LoginStage`): Das Formular bleibt das echte LoginForm, der Ring dahinter ist
 * reine Schmuckszene – mit Knopf zum Anhalten (WCAG 2.2.2), Standbild bei „Bewegung reduzieren“, ohne Fallen für Tastatur
 * und Eingabe. Dieselbe Bühne tragen Passwort vergessen, neues Passwort und der zweite Schritt (Code).
 */
test.describe("Anmeldeseite als Kinobühne", () => {
  test("Formular zuerst: Szene schmückend und nicht fokussierbar, Tab-Reihenfolge Sprunglink → Logo → Bewegung → Formular", async ({
    page,
  }) => {
    await open(page, "/anmelden");
    const stage = page.locator('[data-slot="login-stage"]');
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anmelden");
    // Die Szene (Ring, 16 Plakate mit Spiegelbild, Licht) ist ausgeblendet und enthält nichts Bedienbares.
    const scene = stage.locator(':scope > [aria-hidden="true"]').first();
    await expect(scene.locator('[data-stage="panel"]')).toHaveCount(16);
    await expect(scene.locator("img:not([alt=''])")).toHaveCount(0);
    await expect(scene.locator("a, button, input, [tabindex]")).toHaveCount(0);
    // Die große Zeile mit ihren Nachbildern und „Im Fokus“ sind ausgeblendet; vorgelesen wird der Satz einmal (sr-only).
    await expect(page.locator('[aria-hidden="true"] [data-stage="swing"]')).toHaveCount(1);
    await expect(page.locator('[aria-hidden="true"] [data-stage="ghost"]')).toHaveCount(3);
    await expect(page.locator('[aria-hidden="true"] [data-stage="focus"]')).toHaveCount(8);

    for (const target of [
      page.getByRole("link", { name: "Zum Inhalt springen" }),
      page.getByRole("link", { name: "VereinsFlow – Startseite" }),
      page.getByRole("button", { name: "Bewegung anhalten" }),
      page.getByLabel("E-Mail-Adresse"),
      page.getByLabel("Passwort"),
      page.getByRole("button", { name: "Anmelden" }),
    ]) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
    }
    // Sichtbarer Fokussaum auf „Anmelden“ (WCAG 2.4.7): Der Stil der Bühne ersetzt den Ring des Knopfes durch eine weiße Linie.
    const submit = page.getByRole("button", { name: "Anmelden" });
    expect(await submit.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(submit).toHaveCSS("outline-style", "solid");
    await expect(submit).toHaveCSS("outline-width", "2px");
    await expect(submit).toHaveCSS("outline-color", "rgb(255, 255, 255)");
    // Der Sprunglink führt direkt ins Formular.
    await open(page, "/anmelden");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("E-Mail-Adresse")).toBeFocused();
  });

  test("„Bewegung anhalten“ hält den Ring an, bleibt nach dem Neuladen gemerkt; „Bewegung fortsetzen“ dreht wieder", async ({
    page,
  }) => {
    await open(page, "/anmelden");
    expect((await stageState(page)).motion).toBe("running");
    await expect.poll(() => ringTurns(page)).toBe(true);

    await page.getByRole("button", { name: "Bewegung anhalten" }).click();
    const resume = page.getByRole("button", { name: "Bewegung fortsetzen" });
    await expect(resume).toBeVisible();
    expect((await stageState(page)).motion).toBe("paused");
    // Läuft in gut einer Sekunde aus und steht dann.
    await expect.poll(() => ringTurns(page), { timeout: 5000 }).toBe(false);

    await page.reload();
    await expect(resume).toBeVisible();
    expect((await stageState(page)).motion).toBe("paused");
    expect(await ringTurns(page)).toBe(false);

    await resume.click();
    await expect(page.getByRole("button", { name: "Bewegung anhalten" })).toBeVisible();
    expect((await stageState(page)).motion).toBe("running");
    await expect.poll(() => ringTurns(page)).toBe(true);
  });

  test("„Bewegung reduzieren“: fertiges Standbild ohne Auftritt und ohne Schleife, kein Knopf zum Anhalten", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/anmelden");
    expect((await stageState(page)).motion).toBe("reduced");
    await expect(page.getByRole("button", { name: /^Bewegung/ })).toBeHidden();
    // Das Standbild zeichnet allein das CSS: keine Werte der Schleife am Ring, Szene sofort ganz sichtbar, Dart vorn.
    await expect(page.locator('[data-stage="ring"]')).not.toHaveAttribute("style", /.+/);
    await expect(page.locator('[data-stage="entrance"]')).toHaveCSS("opacity", "1");
    await expect(page.locator('[data-stage="glow"][data-still="true"]')).toHaveCSS(
      "opacity",
      "0.9",
    );
    await expect(page.locator('[data-stage="focus"][data-state="active"]')).toHaveText("04Dart");
    expect(await ringTurns(page)).toBe(false);
    // Ziehen dreht nichts.
    await page.mouse.move(250, 400);
    await page.mouse.down();
    await page.mouse.move(450, 400, { steps: 8 });
    await page.mouse.up();
    expect(await ringTurns(page)).toBe(false);
    // Das Formular funktioniert wie immer.
    await page.getByLabel("E-Mail-Adresse").fill(USERS.admin);
    await page.getByLabel("Passwort").fill(process.env.SEED_PASSWORD ?? "Vereinsflow-Demo-2026!");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Ziehen dreht den Ring 1 : 1 mit, ohne Fokus oder Eingabe im Formular zu stören; Ziehen im Feld dreht nicht", async ({
    page,
  }) => {
    await open(page, "/anmelden");
    // Angehalten, damit nur das Ziehen dreht.
    await page.getByRole("button", { name: "Bewegung anhalten" }).click();
    await expect.poll(() => ringTurns(page), { timeout: 5000 }).toBe(false);
    const email = page.getByLabel("E-Mail-Adresse");
    await email.fill("niemand@example.org");
    await email.focus();

    const before = (await stageState(page)).ring;
    await page.mouse.move(250, 420);
    await page.mouse.down();
    await page.mouse.move(470, 420, { steps: 12 });
    expect((await stageState(page)).ring).not.toBe(before);
    await page.mouse.up();
    await expect(email).toBeFocused();
    await expect(email).toHaveValue("niemand@example.org");
    expect(await page.evaluate(() => String(window.getSelection()))).toBe("");
    await expect.poll(() => ringTurns(page), { timeout: 8000 }).toBe(false);

    // Text im Feld markieren (Ziehen im Formular) dreht nichts.
    const still = (await stageState(page)).ring;
    const box = (await email.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    expect((await stageState(page)).ring).toBe(still);
    await page.keyboard.type("x");
    await expect(email).toHaveValue("x"); // der markierte Text wurde ersetzt
  });

  test("verborgener Tab: die Schleife ruht", async ({ page }) => {
    await open(page, "/anmelden");
    await expect.poll(() => ringTurns(page)).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await ringTurns(page)).toBe(false);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => ringTurns(page)).toBe(true);
  });

  test("angemeldete Personen sehen die Bühne nicht, sondern landen am sicheren Rücksprungziel", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await page.goto("/anmelden");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/anmelden?next=%2Fkalender");
    await expect(page).toHaveURL(/\/kalender$/);
    await page.goto("/anmelden?next=https%3A%2F%2Fexample.org%2F");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/anmelden/bestaetigen");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("Hinweise nach Abmeldung, neuem Passwort und abgebrochenem Code stehen auf dem Glas", async ({
    page,
  }) => {
    const glass = page.locator('[data-stage="glass"]');
    await page.goto("/anmelden?expired=1");
    await expect(glass.getByText("Du wurdest aus Sicherheitsgründen abgemeldet")).toBeVisible();
    await page.goto("/anmelden?reset=1");
    await expect(glass.getByText("Dein Passwort wurde geändert.")).toBeVisible();
    await page.goto("/anmelden?abgelaufen=1");
    await expect(glass.getByText("Die Anmeldung wurde nicht abgeschlossen")).toBeVisible();
    await expect(glass.getByRole("link", { name: "Einladung deines Vereins" })).toHaveAttribute(
      "href",
      "/registrieren",
    );
  });

  test("Passwort vergessen und zurück: dieselbe Bühne dreht weiter, die Seite lädt nicht neu", async ({
    page,
  }) => {
    await open(page, "/anmelden");
    await page.evaluate(() => ((window as unknown as { __buehne: number }).__buehne = 1));
    await page.getByRole("link", { name: "Passwort vergessen?" }).click();
    await expect(page).toHaveURL(/\/passwort-vergessen$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Passwort vergessen");
    expect(await page.evaluate(() => (window as unknown as { __buehne?: number }).__buehne)).toBe(
      1,
    );
    expect(await ringTurns(page)).toBe(true);
    await page.getByRole("link", { name: "Zurück zur Anmeldung" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anmelden");
    expect(await page.evaluate(() => (window as unknown as { __buehne?: number }).__buehne)).toBe(
      1,
    );
    // Neues Passwort mit ungültigem Link: ebenfalls auf der Bühne
    await page.goto("/passwort-zuruecksetzen?token=ungueltig-ungueltig");
    await expect(page.locator('[data-slot="login-stage"]')).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Link ungültig oder abgelaufen",
    );
  });

  test("Fotos nur in passender Größe und je einmal; keine Verstöße gegen die Sicherheitsrichtlinie, keine Konsolenfehler", async ({
    page,
  }) => {
    const photos = new Set<string>();
    const errors: string[] = [];
    page.on("request", (request) => {
      const match = /\/bilder\/abteilungen\/([a-z]+-\d+)\.webp$/.exec(request.url());
      if (match) photos.add(match[1]);
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const list = ((window as unknown as { __csp?: string[] }).__csp ??= []);
        list.push(`${event.violatedDirective}: ${event.blockedURI || "inline"}`);
      });
    });
    await open(page, "/anmelden");
    await page.waitForTimeout(3000); // Auftritt ganz
    await page.mouse.move(250, 420);
    await page.mouse.down();
    await page.mouse.move(450, 420, { steps: 8 });
    await page.mouse.up();
    // 1280 px bei einfacher Pixeldichte: Fotos werden ≈ 486 px breit gezeichnet → die 800er Fassung, acht Fotos für 16 Plakate
    expect([...photos].sort()).toEqual(
      [
        "badminton",
        "basketball",
        "dart",
        "fussball",
        "handball",
        "tennis",
        "tischtennis",
        "volleyball",
      ].map((sport) => `${sport}-800`),
    );
    expect(
      await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
});
