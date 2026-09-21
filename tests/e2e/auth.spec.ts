import { expect, test } from "@playwright/test";
import { USERS, login, logout } from "./helpers";

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
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Willkommen, Anna");
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
