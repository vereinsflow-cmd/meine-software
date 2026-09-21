import { expect, test } from "@playwright/test";

/** Der Cron-Endpunkt ist nur mit dem geheimen Token erreichbar (CRON_SECRET aus der .env, wie beim Server). */
const secret = process.env.CRON_SECRET;
const baseURL = "http://localhost:3100";

test.describe("Cron-Endpunkt /api/cron/run", () => {
  test.skip(!secret, "CRON_SECRET ist nicht gesetzt");

  test("ohne Token 401, mit falschem Token 403 – ohne Details", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    const missing = await anonymous.post("/api/cron/run");
    expect(missing.status()).toBe(401);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });

    for (const header of [
      "Bearer falsch",
      "Bearer ",
      "Basic abc",
      secret!,
      `Bearer ${secret}x`,
      `bearer ${secret}`,
    ]) {
      const response = await anonymous.get("/api/cron/run", { headers: { Authorization: header } });
      expect([401, 403], header).toContain(response.status());
      expect(JSON.stringify(await response.json())).not.toContain(secret!);
    }
    await anonymous.dispose();
  });

  test("mit richtigem Token: Jobs laufen, Bericht enthält nur Zahlen und Namen", async ({
    playwright,
  }) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${secret}` },
    });
    const response = await api.post("/api/cron/run");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.ran).toBe(true);
    expect(body.data.reports.map((r: { name: string }) => r.name)).toEqual([
      "events",
      "reminders",
      "privacy",
      "mail",
      "cleanup",
      "retention",
    ]);
    for (const report of body.data.reports)
      expect(report).toMatchObject({ ok: true, durationMs: expect.any(Number) });
    await api.dispose();
  });

  test("Auswahl einzelner Jobs; unbekannte Namen werden abgelehnt", async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${secret}` },
    });
    const only = await api.get("/api/cron/run?jobs=cleanup,mail");
    expect(only.status()).toBe(200);
    expect((await only.json()).data.reports.map((r: { name: string }) => r.name)).toEqual([
      "mail",
      "cleanup",
    ]);

    const bogus = await api.get("/api/cron/run?jobs=cleanup,alles-loeschen");
    expect(bogus.status()).toBe(422);
    expect((await bogus.json()).error.message).toContain("Erlaubt:");
    await api.dispose();
  });
});
