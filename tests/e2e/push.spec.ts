import { expect, test, type Page } from "@playwright/test";
import { violations } from "./axe";
import { USERS, login, open } from "./helpers";

/**
 * Push-Benachrichtigungen im Profil (Abschnitt „Benachrichtigungen“). Der E2E-Server läuft mit einem Beispiel-Schlüsselpaar
 * (playwright.config.ts). Das eigentliche Abo beim Push-Dienst von Google/Apple/Mozilla braucht Internet und ein echtes Gerät –
 * hier ersetzt ein Testabo `PushManager.subscribe`; alles andere ist echt: Service Worker, Erlaubnisabfrage, Schnittstellen
 * unter /api/push/… und Datenbank. Die Zustellung selbst prüfen tests/integration/push.test.ts und tests/unit/service-worker.test.ts.
 */
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/e2e-test-geraet:APA91bBeispiel";
const KEYS = { p256dh: `B${"A".repeat(86)}`, auth: "a".repeat(22) };
const LABEL = "Push-Benachrichtigungen auf diesem Gerät";

/**
 * Erlaubnis des Browsers für Benachrichtigungen:
 *  - `state`: Anfangszustand (`Notification.permission`),
 *  - `answer`: was die Abfrage nach einem Klick ergibt.
 * Das kopflose Chromium meldet immer „denied“, auch nach `context.grantPermissions` – deshalb wird die Erlaubnis hier nachgebaut.
 */
interface Permission {
  state: "default" | "granted" | "denied";
  answer?: "granted" | "denied";
}

/** Ersetzt Erlaubnis und Abo beim Push-Dienst durch Testversionen mit einer Adresse, die der Server akzeptiert. */
async function fakePushService(
  page: Page,
  permission: Permission = { state: "default", answer: "granted" },
  endpoint = ENDPOINT,
): Promise<void> {
  await page.addInitScript(
    ({ endpoint, keys, permission }) => {
      // Erlaubnis und Abo überleben das Neuladen der Seite wie im echten Browser.
      const stored = () => sessionStorage.getItem("e2e-permission") ?? permission.state;
      Object.defineProperty(Notification, "permission", { get: stored, configurable: true });
      Notification.requestPermission = async () => {
        (window as unknown as { __asked: number }).__asked =
          ((window as unknown as { __asked?: number }).__asked ?? 0) + 1;
        const answer = permission.answer ?? "denied";
        sessionStorage.setItem("e2e-permission", answer);
        return answer;
      };

      const remember = (on: boolean) => sessionStorage.setItem("e2e-push", on ? "1" : "");
      const subscription = {
        endpoint,
        toJSON: () => ({ endpoint, expirationTime: null, keys }),
        unsubscribe: async () => {
          remember(false);
          return true;
        },
      };
      PushManager.prototype.getSubscription = async () =>
        sessionStorage.getItem("e2e-push") ? (subscription as unknown as PushSubscription) : null;
      PushManager.prototype.subscribe = async () => {
        remember(true);
        return subscription as unknown as PushSubscription;
      };
    },
    { endpoint, keys: KEYS, permission },
  );
}

const asked = (page: Page) =>
  page.evaluate(() => (window as unknown as { __asked?: number }).__asked ?? 0);

const pushSwitch = (page: Page) => page.getByRole("switch", { name: LABEL });
const status = (page: Page, endpoint = ENDPOINT) =>
  page.request
    .post("/api/push/status", { data: { endpoint } })
    .then(
      (response) => response.json() as Promise<{ ok: boolean; data?: { subscribed: boolean } }>,
    );

/** Räumt das Testabo weg (idempotent) – ein früher abgebrochener Lauf soll die nächsten nicht verfälschen. */
async function forget(page: Page): Promise<void> {
  await page.request.delete("/api/push/subscription", { data: { endpoint: ENDPOINT } });
}

test.describe("Push-Benachrichtigungen: Zustände im Profil", () => {
  test("Standard: aus – mit Erklärung; die Erlaubnisabfrage kommt erst nach einem Klick", async ({
    page,
  }) => {
    await fakePushService(page, { state: "default", answer: "granted" });
    await login(page, USERS.helfer);
    await open(page, "/profil");

    const toggle = pushSwitch(page);
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeEnabled();
    await expect(
      page.getByText("Aus – auf diesem Gerät kommen keine Push-Benachrichtigungen an."),
    ).toBeVisible();
    // Der Hinweis nennt die Datenschutz-Zusage der Meldungen.
    await expect(page.getByText(/nennt nie Namen oder Nachrichtentext/)).toBeVisible();
    // Beim Öffnen der Seite darf der Browser nicht nach der Erlaubnis fragen – erst der Klick löst die Abfrage aus.
    expect(await asked(page)).toBe(0);
    await toggle.click();
    await expect(toggle).toBeChecked();
    expect(await asked(page)).toBe(1);
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  });

  test("Erlaubnis verweigert: Hinweis, Schalter bleibt aus (nichts wird angemeldet)", async ({
    page,
  }) => {
    await fakePushService(page, { state: "default", answer: "denied" });
    await login(page, USERS.helfer);
    await forget(page);
    await open(page, "/profil");
    await pushSwitch(page).click();
    await expect(
      page.getByText(
        "Ohne deine Erlaubnis im Browser kann VereinsFlow keine Push-Benachrichtigungen senden.",
      ),
    ).toBeVisible();
    await expect(pushSwitch(page)).not.toBeChecked();
    await expect(page.getByText(/Im Browser blockiert: Erlaube Benachrichtigungen/)).toBeVisible();
    expect((await status(page)).data?.subscribed).toBe(false);
  });

  test("im Browser blockiert: Anleitung, Schalter gesperrt", async ({ page }) => {
    await fakePushService(page, { state: "denied" });
    await login(page, USERS.helfer);
    await open(page, "/profil");
    await expect(page.getByText(/Im Browser blockiert: Erlaube Benachrichtigungen/)).toBeVisible();
    await expect(pushSwitch(page)).toBeDisabled();
    await expect(pushSwitch(page)).not.toBeChecked();
    expect(await asked(page)).toBe(0);
  });

  test("Browser ohne Push-Unterstützung: „Nicht unterstützt“, Schalter gesperrt", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // @ts-expect-error – Browser ohne PushManager nachstellen
      delete window.PushManager;
    });
    await login(page, USERS.helfer);
    await open(page, "/profil");
    await expect(
      page.getByText(/Nicht unterstützt: Dieser Browser kann keine Push-Benachrichtigungen/),
    ).toBeVisible();
    await expect(pushSwitch(page)).toBeDisabled();
  });

  test.describe("iPhone im Browser-Tab", () => {
    test.use({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    });
    test("zuerst zum Home-Bildschirm hinzufügen", async ({ page }) => {
      await login(page, USERS.helfer);
      await open(page, "/profil");
      await expect(page.getByText(/nur für Apps auf dem Home-Bildschirm/)).toBeVisible();
      await expect(page.getByText(/Zum Home-Bildschirm/)).toBeVisible();
      await expect(pushSwitch(page)).toBeDisabled();
    });
  });
});

test.describe("Push-Benachrichtigungen: ein- und ausschalten", () => {
  test("Klick schaltet ein (Server merkt das Gerät), bleibt nach dem Neuladen an, Klick schaltet wieder aus und löscht das Abo", async ({
    page,
  }) => {
    await fakePushService(page, { state: "granted" });
    await login(page, USERS.helfer);
    await forget(page);
    await open(page, "/profil");

    const toggle = pushSwitch(page);
    await expect(toggle).not.toBeChecked();
    expect((await status(page)).data?.subscribed).toBe(false);

    await toggle.click();
    await expect(
      page.getByText("Push-Benachrichtigungen sind auf diesem Gerät eingeschaltet."),
    ).toBeVisible();
    await expect(toggle).toBeChecked();
    await expect(page.getByText("An – dieses Gerät erhält Push-Benachrichtigungen.")).toBeVisible();
    expect((await status(page)).data?.subscribed).toBe(true);

    await page.reload();
    await expect(pushSwitch(page)).toBeChecked();

    await pushSwitch(page).click();
    await expect(
      page.getByText("Push-Benachrichtigungen sind auf diesem Gerät ausgeschaltet."),
    ).toBeVisible();
    await expect(pushSwitch(page)).not.toBeChecked();
    expect((await status(page)).data?.subscribed).toBe(false);
  });

  test("die Antwort der Schnittstellen enthält weder Adresse noch Schlüssel; die Seite zeigt sie nicht", async ({
    page,
  }) => {
    await fakePushService(page, { state: "granted" });
    await login(page, USERS.helfer);
    await open(page, "/profil");
    const responses: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/api/push/"))
        responses.push(await response.text().catch(() => ""));
    });
    await pushSwitch(page).click();
    await expect(pushSwitch(page)).toBeChecked();
    expect(responses.join("")).not.toContain("fcm.googleapis.com");
    expect(responses.join("")).not.toContain(KEYS.auth);
    expect(await page.content()).not.toContain("fcm.googleapis.com");
    // aufräumen
    await pushSwitch(page).click();
    await expect(pushSwitch(page)).not.toBeChecked();
  });

  test("Tastatur: Schalter ist erreichbar und mit Leertaste bedienbar; Beschreibung hängt am Schalter", async ({
    page,
  }) => {
    await fakePushService(page, { state: "granted" });
    await login(page, USERS.helfer);
    await open(page, "/profil");
    const toggle = pushSwitch(page);
    await expect(toggle).toHaveAttribute("aria-describedby", /.+/);
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("Push-Schnittstellen: Schutz", () => {
  test("ohne Anmeldung: 401", async ({ request }) => {
    const subscribe = await request.post("/api/push/subscription", {
      data: { endpoint: ENDPOINT, keys: KEYS },
    });
    expect(subscribe.status()).toBe(401);
    expect(
      (await request.delete("/api/push/subscription", { data: { endpoint: ENDPOINT } })).status(),
    ).toBe(401);
    expect(
      (await request.post("/api/push/status", { data: { endpoint: ENDPOINT } })).status(),
    ).toBe(401);
  });

  test("fremde Herkunft: 403; ungültige Eingaben und fremde Adressen: 422 bzw. 400", async ({
    page,
  }) => {
    await login(page, USERS.helfer);
    await forget(page);
    const foreign = await page.request.post("/api/push/subscription", {
      data: { endpoint: ENDPOINT, keys: KEYS },
      headers: { Origin: "https://boese.example" },
    });
    expect(foreign.status()).toBe(403);

    // SSRF: keine Adresse außerhalb der bekannten Push-Dienste
    for (const endpoint of [
      "https://intern.example/hook",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data/",
    ]) {
      const response = await page.request.post("/api/push/subscription", {
        data: { endpoint, keys: KEYS },
      });
      expect([400, 422], endpoint).toContain(response.status());
    }
    const noKeys = await page.request.post("/api/push/subscription", {
      data: { endpoint: ENDPOINT },
    });
    expect([400, 422]).toContain(noKeys.status());
    const broken = await page.request.post("/api/push/subscription", {
      data: "kein json",
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 422]).toContain(broken.status());
    expect((await status(page)).data?.subscribed).toBe(false);
  });

  test("ein Abo gehört nur der Person, die es angelegt hat: andere sehen „nein“ und können es nicht löschen", async ({
    page,
    browser,
  }) => {
    await login(page, USERS.helfer);
    await forget(page);
    const created = await page.request.post("/api/push/subscription", {
      data: { endpoint: ENDPOINT, keys: KEYS },
    });
    expect(created.status()).toBe(200);
    expect((await status(page)).data?.subscribed).toBe(true);

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await login(other, USERS.mitglied);
    expect((await status(other)).data?.subscribed).toBe(false);
    expect(
      (
        await other.request.delete("/api/push/subscription", { data: { endpoint: ENDPOINT } })
      ).status(),
    ).toBe(204);
    expect((await status(page)).data?.subscribed).toBe(true); // unberührt
    await otherContext.close();

    expect(
      (
        await page.request.delete("/api/push/subscription", { data: { endpoint: ENDPOINT } })
      ).status(),
    ).toBe(204);
    expect((await status(page)).data?.subscribed).toBe(false);
  });
});
