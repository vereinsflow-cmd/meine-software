import { expect, test } from "@playwright/test";
import { violations } from "./axe";
import { USERS, loginSettled, open } from "./helpers";

/** „Ort automatisch ergänzen“ zur Postleitzahl – im Mitgliedsformular und in den Vereinsdaten. */

test("Mitglied anlegen: Ort zur Postleitzahl ergänzen, Auswahl bei mehreren Orten, nichts überschreiben", async ({
  page,
}) => {
  await loginSettled(page, USERS.admin);
  await open(page, "/mitglieder/neu");
  const plz = page.getByLabel("PLZ");
  const city = page.getByRole("textbox", { name: "Ort", exact: true });
  /** Postleitzahl eintippen und warten, bis die Orte da sind (sonst käme die Antwort erst beim nächsten Schritt an). */
  const typePostalCode = async (code: string) => {
    const answered = page.waitForResponse((r) => r.url().endsWith(`/api/postleitzahlen/${code}`));
    await plz.fill(code);
    await answered;
  };

  // Genau ein Ort: wird eingetragen – und beim Ändern der Postleitzahl ersetzt, solange ihn die App eingetragen hat
  await typePostalCode("79379");
  await expect(city).toHaveValue("Müllheim");
  await typePostalCode("80331");
  await expect(city).toHaveValue("München");

  // Selbst Geschriebenes bleibt stehen
  await city.fill("Eigenort");
  await typePostalCode("10115");
  await expect(city).toHaveValue("Eigenort");

  // Mehrere Orte: Auswahl (die ersten acht, der Rest auf Wunsch)
  await city.fill("");
  await typePostalCode("54649");
  const choices = page.getByRole("group", { name: "Orte zur Postleitzahl 54649" });
  await expect(choices).toBeVisible();
  await expect(city).toHaveValue("");
  await expect(choices.getByRole("button").first()).toHaveText("Waxweiler"); // Hauptort zuerst
  await choices.getByRole("button", { name: "3 weitere anzeigen" }).click();
  await expect(choices.getByRole("button").nth(8)).toBeFocused(); // erster neu sichtbarer Ort
  await expect(choices.getByRole("button", { name: "Pintesfeld" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await violations(page)).toEqual([]);
  await choices.getByRole("button", { name: "Pintesfeld" }).click();
  await expect(city).toHaveValue("Pintesfeld");
  await expect(choices).toBeHidden();
  await expect(city).toBeFocused(); // nach der Auswahl zurück im Feld „Ort“

  // Ein eingetragener Ort, der nicht mehr passt, verschwindet wieder: neue Postleitzahl mit mehreren Orten …
  // (jede Postleitzahl nur einmal: der Browser merkt sich die Antwort, eine zweite Anfrage gibt es nicht)
  await typePostalCode("70173");
  await expect(city).toHaveValue("Stuttgart");
  await typePostalCode("16259");
  await expect(city).toHaveValue("");
  await expect(page.getByRole("group", { name: "Orte zur Postleitzahl 16259" })).toBeVisible();

  // … oder ein anderes Land (dort gibt es keine deutschen Postleitzahlen – auch nichts ergänzen)
  await typePostalCode("50667");
  await expect(city).toHaveValue("Köln");
  await page.getByLabel("Land").selectOption("AT");
  await expect(city).toHaveValue("");
  await plz.fill("10115");
  await page.waitForTimeout(500);
  await expect(city).toHaveValue("");
});

test("Vereinsdaten: Ort zur Postleitzahl ergänzen", async ({ page }) => {
  await loginSettled(page, USERS.admin);
  await open(page, "/einstellungen");
  const city = page.getByRole("textbox", { name: "Ort", exact: true });
  await city.fill("");
  await page.getByLabel("PLZ").fill("20095");
  await expect(city).toHaveValue("Hamburg", { timeout: 15_000 });
});

test("Schnittstelle: Orte zu einer Postleitzahl", async ({ request }) => {
  const berlin = await request.get("/api/postleitzahlen/10115");
  expect(berlin.status()).toBe(200);
  expect(await berlin.json()).toEqual({ ok: true, data: { places: ["Berlin"] } });
  expect(berlin.headers()["cache-control"]).toContain("max-age");

  const unknown = await request.get("/api/postleitzahlen/71029"); // nur Großkunden (Böblingen)
  expect(await unknown.json()).toEqual({ ok: true, data: { places: [] } });

  expect((await request.get("/api/postleitzahlen/abc")).status()).toBe(422);
});
