import { expect, test } from "@playwright/test";
import { USERS, login, open, openNavGroup } from "./helpers";

test.describe("Finanzen (Platzhalter)", () => {
  test("Vereinsadmin sieht ehrlich, dass das Modul noch nicht verfügbar ist – ohne vorgetäuschte Funktionen", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).first();
    await openNavGroup(nav, "Einstellungen");
    await nav.getByRole("link", { name: "Finanzen" }).click();
    await expect(page).toHaveURL(/\/finanzen$/);
    await expect(page.getByRole("heading", { level: 1, name: "Finanzen" })).toBeVisible();
    await expect(page.getByText("In Vorbereitung")).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Dieses Modul ist noch nicht verfügbar" }),
    ).toBeVisible();
    for (const topic of ["Mitgliedsbeiträge", "Kassenbuch", "Spenden", "Auswertungen und Export"]) {
      await expect(page.getByRole("heading", { level: 3, name: topic })).toBeVisible();
    }
    // Keine Schaltflächen oder Formulare, die etwas versprechen, das es nicht gibt.
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  });

  test("Vorstand und Mitglieder haben weder Menüpunkt noch Zugriff", async ({ page }) => {
    for (const email of [USERS.vorstand, USERS.mitglied]) {
      await login(page, email);
      await expect(
        page
          .getByRole("navigation", { name: "Hauptnavigation" })
          .first()
          .getByRole("link", { name: "Finanzen" }),
      ).toHaveCount(0);
      await open(page, "/finanzen");
      await expect(page.getByText("Kein Zugriff")).toBeVisible();
      await expect(page.getByText("Dieses Modul ist noch nicht verfügbar")).toHaveCount(0);
      await page.context().clearCookies();
    }
  });
});
