import { expect, test } from "@playwright/test";

test.describe("Health-Endpunkt", () => {
  test("ist ohne Anmeldung erreichbar, meldet nur ok und wird nicht zwischengespeichert", async ({
    request,
  }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true }); // keine Version, keine Konfiguration, keine Details
  });
});
