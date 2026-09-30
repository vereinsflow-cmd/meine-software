import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open, outboxMailsTo } from "./helpers";

/**
 * Ein neuer Verein von Anfang an: Die Plattformverwaltung legt ihn an, der erste Administrator nimmt die Einladung an
 * und wird mit dem Hinweis „Einrichtung fortsetzen“ durch den Assistenten „Verein einrichten“ geführt.
 */
test("neuer Verein: Einladung annehmen und Schritt für Schritt einrichten", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const id = randomBytes(3).toString("hex");
  const clubName = `Neuverein ${id}`;
  const adminEmail = `neu-${id}@e2e.test`;

  await login(page, USERS.superadmin);
  await open(page, "/system");
  await page.getByRole("button", { name: "Verein anlegen" }).click();
  const create = page.getByRole("dialog", { name: "Neuen Verein anlegen" });
  await create.getByLabel("Vereinsname").fill(clubName);
  await create.getByLabel("Kürzel").fill(`neuverein-${id}`);
  await create.getByLabel("E-Mail-Adresse des ersten Administrators").fill(adminEmail);
  await create.getByRole("button", { name: "Verein anlegen" }).click();
  await expect(create).toBeHidden();

  await expect.poll(() => outboxMailsTo(adminEmail).length, { timeout: 15_000 }).toBe(1);
  const invitationUrl = /http:\/\/localhost:3100\/einladung\/[A-Za-z0-9_-]{43}/.exec(
    outboxMailsTo(adminEmail)[0]!.text,
  )?.[0];
  expect(invitationUrl).toBeTruthy();

  const context = await browser.newContext();
  const admin = await context.newPage();
  await admin.goto(invitationUrl!);
  await admin.getByLabel("Vorname").fill("Nora");
  await admin.getByLabel("Nachname").fill("Neu");
  await admin.locator('input[name="password"]').fill("Unser neuer Verein legt heute los");
  await admin.locator('input[name="passwordRepeat"]').fill("Unser neuer Verein legt heute los");
  await admin.getByRole("checkbox", { name: /Datenschutzerklärung/ }).check();
  await admin.getByRole("button", { name: "Konto anlegen und beitreten" }).click();
  await expect(admin).toHaveURL(/\/dashboard/);

  // Der Hinweis führt zum Assistenten – der beginnt beim ersten offenen Schritt
  const banner = admin.getByRole("complementary", { name: "Einrichtung des Vereins" });
  await expect(banner).toContainText("Dein Verein ist noch nicht fertig eingerichtet.");
  await banner.getByRole("link", { name: "Einrichtung fortsetzen" }).click();
  await expect(admin.locator("#schritt-titel")).toHaveText("Vereinsdaten");
  await expect(admin.getByText("Schritt 1 von 6")).toBeVisible();
  await expect(banner).toBeHidden();
  await admin.waitForLoadState("networkidle");
  expect(await violations(admin)).toEqual([]);

  // 1. Vereinsdaten
  await admin.getByLabel("Kontakt-E-Mail").fill(`kontakt-${id}@e2e.test`);
  await admin.getByLabel("Straße und Hausnummer").fill("Am Sportplatz 1");
  await admin.getByLabel("PLZ").fill("12345");
  await admin.getByLabel("Ort").fill("Musterstadt");
  await admin.getByRole("button", { name: "Einstellungen speichern" }).click();
  await expect(admin.getByText("Einstellungen gespeichert.")).toBeVisible();
  const steps = admin.getByRole("navigation", { name: "Schritte der Einrichtung" });
  await expect(steps.getByRole("link", { name: /Vereinsdaten \(erledigt\)/ })).toBeVisible();

  // 2. Logo überspringen, 3. Abteilung anlegen
  await admin.getByRole("link", { name: "Weiter: Logo" }).click();
  await expect(admin.locator("#schritt-titel")).toHaveText("Logo");
  await admin.getByRole("link", { name: "Weiter: Abteilungen" }).click();
  await expect(admin.locator("#schritt-titel")).toHaveText("Abteilungen");
  await admin.getByRole("button", { name: "Neue Abteilung" }).click();
  const department = admin.getByRole("dialog", { name: "Neue Abteilung" });
  await department.locator('input[name="name"]').fill("Fußball");
  await department.getByRole("button", { name: "Abteilung anlegen" }).click();
  await expect(department).toBeHidden();
  await expect(admin.getByRole("listitem").filter({ hasText: "Fußball" })).toBeVisible();

  // 4./5. Wege zu Mitgliedern und Zugängen; zuletzt abschließen
  await admin.getByRole("link", { name: "Weiter: Mitglieder" }).click();
  await expect(admin.getByRole("link", { name: /Liste importieren/ })).toBeVisible();
  await admin.getByRole("link", { name: "Weiter: Vorstand & Zugänge" }).click();
  await expect(admin.getByText("Nora Neu (du)")).toBeVisible();
  await admin.getByRole("link", { name: "Weiter: Abschluss" }).click();
  await expect(admin.getByText("Noch offen – geht auch später")).toHaveCount(3);
  await admin.getByRole("button", { name: "Einrichtung abschließen" }).click();
  await expect(admin).toHaveURL(/\/dashboard/);
  await expect(banner).toBeHidden();

  await context.close();
});
