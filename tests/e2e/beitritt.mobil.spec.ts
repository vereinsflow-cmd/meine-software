import { devices, expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, setUpJoinLink } from "./helpers";

/**
 * „Mitglied werden“ am Handy (Pixel 7, 412 px): Die Seite wird meist über den QR-Code geöffnet – sie darf nicht seitlich
 * überlaufen, die Felder haben 16-px-Schrift (sonst zoomt iOS beim Antippen) und passende Tastaturen, der Knopf ist gut
 * treffbar. Läuft nur im Projekt „mobil“.
 */
const INVALID =
  "Dieser Link ist nicht (mehr) gültig. Bitte frag im Verein nach dem aktuellen QR-Code.";

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("Antragsformular am Handy: passt auf den Bildschirm, 16-px-Felder, Absenden klappt", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await login(page, USERS.admin);
  const link = await setUpJoinLink(page);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("img", { name: "QR-Code zum Beitrittsformular" })).toBeVisible();

  // Nicht angemeldet, wie ein fremdes Handy nach dem Scannen.
  const guestContext = await browser.newContext({ ...devices["Pixel 7"], locale: "de-DE" });
  const guest = await guestContext.newPage();
  await guest.goto(link);
  await guest.waitForLoadState("networkidle");
  await expect(guest.getByRole("heading", { level: 1, name: "Mitglied werden" })).toBeVisible();
  expect(await overflow(guest)).toBeLessThanOrEqual(1);
  expect(await violations(guest)).toEqual([]);

  // Schriftgröße der Felder mindestens 16 px, passende Tastaturen.
  const fontSizes = await guest
    .locator("form input:not([type=checkbox]):not([tabindex='-1']), form select, form textarea")
    .evaluateAll((elements) => elements.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(fontSizes.length).toBeGreaterThanOrEqual(6);
  for (const size of fontSizes) expect(size).toBeGreaterThanOrEqual(16);
  await expect(guest.getByLabel("E-Mail-Adresse")).toHaveAttribute("type", "email");
  await expect(guest.getByLabel("Telefon")).toHaveAttribute("type", "tel");
  await expect(guest.getByLabel("Geburtsdatum")).toHaveAttribute("type", "date");

  // Der Honigtopf ist für Menschen nicht zu sehen und nicht per Tabulator erreichbar.
  const trap = guest.locator("input[name=website]");
  await expect(trap).toHaveAttribute("tabindex", "-1");
  expect(await trap.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);

  const submit = guest.getByRole("button", { name: "Antrag senden" });
  const box = (await submit.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(36);
  expect(box.width).toBeGreaterThan(guest.viewportSize()!.width * 0.7); // volle Breite

  // Fehlertexte stehen direkt am Feld.
  await submit.click();
  await expect(guest.getByText("Bitte gib deine E-Mail-Adresse ein.")).toBeVisible();
  expect(await overflow(guest)).toBeLessThanOrEqual(1);

  const stamp = Date.now() % 1_000_000;
  const fill = async () => {
    await guest.getByLabel("Vorname").fill("Mia");
    await guest.getByLabel("Nachname").fill(`Mobil${stamp}`);
    await guest.getByLabel("E-Mail-Adresse").fill(`mia.${stamp}@example.org`);
    await guest.getByLabel(/Ich bin einverstanden/).check();
  };
  await fill();

  // Der Verein erzeugt währenddessen einen neuen Code: Die Meldung vom Server steht direkt über dem Knopf – im Bild, nicht
  // oben außerhalb des Bildschirms (das Formular ist am Handy höher als der Bildschirm).
  await page.getByRole("button", { name: "Neuen Code erzeugen" }).click();
  await page
    .getByRole("dialog", { name: "Neuen QR-Code erzeugen?" })
    .getByRole("button", { name: "Neuen Code erzeugen" })
    .click();
  const linkField = page.getByLabel("Link zum Antragsformular");
  await expect(linkField).not.toHaveValue(link);
  const newLink = await linkField.inputValue();
  await submit.click();
  const error = guest.getByRole("alert").filter({ hasText: INVALID });
  await expect(error).toBeVisible();
  await expect(error).toBeInViewport();

  await guest.goto(newLink);
  await guest.waitForLoadState("networkidle");
  await fill();
  await submit.click();
  await expect(guest.getByText("Danke! Dein Antrag ist beim Verein angekommen.")).toBeVisible();
  expect(await overflow(guest)).toBeLessThanOrEqual(1);
  await guestContext.close();
});
