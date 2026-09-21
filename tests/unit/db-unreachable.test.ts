import { describe, expect, it } from "vitest";
import { isDatabaseUnreachable } from "@/server/db/unreachable";

describe("isDatabaseUnreachable", () => {
  it("erkennt „Verbindung abgelehnt“ (Datenbank läuft nicht), wie es Prisma und pg melden", () => {
    expect(isDatabaseUnreachable({ code: "ECONNREFUSED", meta: { modelName: "Club" } })).toBe(true);
    expect(isDatabaseUnreachable({ code: "P1001" })).toBe(true); // Prisma: Can't reach database server
    expect(isDatabaseUnreachable({ errorCode: "P1001" })).toBe(true);
    expect(isDatabaseUnreachable({ code: "ETIMEDOUT" })).toBe(true);
    expect(isDatabaseUnreachable({ code: "ENOTFOUND" })).toBe(true); // falscher Hostname
  });

  it("findet den Grund auch in cause und in AggregateError (IPv4 + IPv6 fehlgeschlagen)", () => {
    expect(isDatabaseUnreachable(new Error("x", { cause: { code: "ECONNREFUSED" } }))).toBe(true);
    const aggregate = new AggregateError([{ code: "ECONNREFUSED" }, { code: "ECONNREFUSED" }]);
    expect(isDatabaseUnreachable(aggregate)).toBe(true);
    expect(isDatabaseUnreachable({ cause: { cause: { code: "P1001" } } })).toBe(true);
  });

  it("hält andere Fehler nicht für ein Verbindungsproblem", () => {
    expect(isDatabaseUnreachable(new Error("SEED_PASSWORD fehlt in der .env"))).toBe(false);
    expect(isDatabaseUnreachable({ code: "P2002" })).toBe(false); // Prisma: Unique constraint
    expect(isDatabaseUnreachable({ code: "23505" })).toBe(false); // PostgreSQL: unique_violation
    expect(isDatabaseUnreachable("ECONNREFUSED")).toBe(false); // nur Fehlerobjekte zählen
    expect(isDatabaseUnreachable(null)).toBe(false);
    expect(isDatabaseUnreachable(undefined)).toBe(false);
  });

  it("bleibt bei zyklischen Fehlerketten nicht hängen", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(isDatabaseUnreachable(loop)).toBe(false);
  });
});
