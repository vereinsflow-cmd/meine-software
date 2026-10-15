import { randomBytes } from "node:crypto";
import { devices, expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, inviteNewPerson, login, open, waitForHydratedForm } from "./helpers";
import { TestAuthenticator } from "./totp";

/**
 * Zwei-Faktor-Anmeldung am Smartphone (Pixel 7): Einrichten im Profil (QR-Code, Schlüssel zum Abtippen,
 * Wiederherstellungscodes) und der zweite Schritt der Anmeldung passen ins Bild, der Umschalter zum Wiederherstellungscode
 * ist mit dem Finger gut zu treffen. Läuft nur im Projekt „mobil“ – mit einer eigenen, frisch eingeladenen Person.
 */
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const id = randomBytes(3).toString("hex");
const PHONE = { ...devices["Pixel 7"], locale: "de-DE", timezoneId: "Europe/Berlin" };
const PERSON = {
  email: `zwei-faktor-mobil-${id}@e2e.test`,
  firstName: "Mira",
  lastName: `Handy${id}`,
  password: "Mit dem Handy sicher angemeldet",
};

test("Smartphone: Einrichten und zweiter Schritt der Anmeldung passen ins Bild", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await login(page, USERS.admin);
  const person = await inviteNewPerson(page, browser, PERSON, PHONE);
  const viewport = person.viewportSize()!;

  await open(person, "/profil");
  const section = person.getByRole("region", { name: "Zwei-Faktor-Anmeldung", exact: true });
  await section.getByRole("button", { name: "Zwei-Faktor-Anmeldung einrichten" }).click();
  const qr = section.getByRole("img", { name: "QR-Code für die Authenticator-App" });
  await expect(qr).toBeVisible();
  const qrBox = (await qr.boundingBox())!;
  expect(qrBox.x + qrBox.width).toBeLessThanOrEqual(viewport.width);
  const key = section.locator("code");
  const keyBox = (await key.boundingBox())!;
  expect(keyBox.x + keyBox.width).toBeLessThanOrEqual(viewport.width); // der lange Schlüssel bricht um
  expect(await overflow(person)).toBeLessThanOrEqual(1);

  const app = new TestAuthenticator((await key.textContent())!.replace(/\s/g, ""));
  await waitForHydratedForm(person);
  await section.getByLabel("Passwort").fill(PERSON.password);
  await section.getByLabel("Code aus der App").fill(await app.freshCode());
  await section.getByRole("button", { name: "Einschalten" }).click();
  const codes = section.getByRole("list", { name: "Wiederherstellungscodes" });
  await expect(codes.getByRole("listitem")).toHaveCount(10);
  expect(await overflow(person)).toBeLessThanOrEqual(1);
  expect(await violations(person)).toEqual([]);
  await section.getByRole("button", { name: "Ich habe sie gespeichert" }).click();
  await expect(section.getByText("Eingeschaltet")).toBeVisible();
  await person.context().close();

  // Zweiter Schritt der Anmeldung auf einem anderen Handy
  const phone = await (await browser.newContext(PHONE)).newPage();
  await phone.goto("/anmelden");
  await waitForHydratedForm(phone);
  await phone.getByLabel("E-Mail-Adresse").fill(PERSON.email);
  await phone.getByLabel("Passwort").fill(PERSON.password);
  await phone.getByRole("button", { name: "Anmelden" }).click();
  await expect(phone).toHaveURL(/\/anmelden\/bestaetigen$/);
  await expect(phone.getByRole("heading", { name: "Anmeldung bestätigen" })).toBeVisible();
  await waitForHydratedForm(phone);
  expect(await overflow(phone)).toBeLessThanOrEqual(1);
  const toggle = phone.getByRole("button", { name: /Wiederherstellungscode verwenden/ });
  const toggleBox = (await toggle.boundingBox())!;
  expect(toggleBox.height).toBeGreaterThanOrEqual(44);
  expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(viewport.width);
  // Am Handy die Zifferntastatur für den Code aus der App
  await expect(phone.getByLabel("Code aus der App")).toHaveAttribute("inputmode", "numeric");
  expect(await violations(phone)).toEqual([]);

  await phone.getByLabel("Code aus der App").fill(await app.freshCode());
  await phone.getByRole("button", { name: "Bestätigen" }).click();
  await expect(phone).toHaveURL(/\/dashboard$/);
  await phone.context().close();
});
