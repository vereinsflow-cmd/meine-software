import { describe, expect, it } from "vitest";
import { assertSameOrigin, jsonError, jsonOk } from "@/server/api";
import { forbidden, rateLimited } from "@/server/errors";

const request = (method: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/x", { method, headers });

describe("CSRF-Schutz für Route Handler (assertSameOrigin)", () => {
  it("erlaubt lesende Methoden ohne Prüfung", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(() =>
        assertSameOrigin(request(method, { origin: "https://evil.example" })),
      ).not.toThrow();
    }
  });

  it("erlaubt Änderungen von der eigenen Seite", () => {
    expect(() =>
      assertSameOrigin(request("POST", { origin: "http://localhost:3000" })),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        request("DELETE", { origin: "http://localhost:3000", host: "localhost:3000" }),
      ),
    ).not.toThrow();
  });

  it("blockiert Änderungen von fremden Seiten", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(() =>
        assertSameOrigin(request(method, { origin: "https://evil.example" })),
      ).toThrowError(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
    }
  });

  it("blockiert einen Origin, der nur ähnlich klingt", () => {
    expect(() =>
      assertSameOrigin(request("POST", { origin: "http://localhost:3000.evil.example" })),
    ).toThrow();
    expect(() =>
      assertSameOrigin(request("POST", { origin: "http://evil.example/localhost:3000" })),
    ).toThrow();
  });

  it("blockiert einen kaputten Origin-Header", () => {
    expect(() => assertSameOrigin(request("POST", { origin: "das-ist-keine-url" }))).toThrow();
  });

  it("nutzt ohne Origin den Header Sec-Fetch-Site", () => {
    expect(() =>
      assertSameOrigin(request("POST", { "sec-fetch-site": "same-origin" })),
    ).not.toThrow();
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "cross-site" }))).toThrow();
    expect(() => assertSameOrigin(request("POST", { "sec-fetch-site": "same-site" }))).toThrow();
  });
});

describe("JSON-Antworten", () => {
  it("jsonOk liefert { ok: true, data } mit Status 200", async () => {
    const response = jsonOk({ id: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { id: 1 } });
  });

  it("jsonError verwendet passende HTTP-Statuscodes", async () => {
    const forbiddenResponse = jsonError(forbidden());
    expect(forbiddenResponse.status).toBe(403);
    expect((await forbiddenResponse.json()).error.code).toBe("FORBIDDEN");

    const limited = jsonError(rateLimited(42));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("42");
  });

  it("jsonError verrät bei unerwarteten Fehlern nichts und liefert 500", async () => {
    const response = jsonError(new Error("Datenbank-Passwort ist hunter2"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("hunter2");
  });
});
