import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { checkRateLimit, enforceRateLimit, resetRateLimit } from "@/server/security/rate-limit";
import { unique } from "../helpers/factories";

describe("Rate-Limiting", () => {
  it("lässt Anfragen bis zum Limit zu und blockiert danach", async () => {
    const key = unique("rl");
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await checkRateLimit(key, 3, 60));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[0]?.remaining).toBe(2);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("zählt getrennte Schlüssel getrennt", async () => {
    const a = unique("rl");
    const b = unique("rl");
    await checkRateLimit(a, 1, 60);
    expect((await checkRateLimit(a, 1, 60)).allowed).toBe(false);
    expect((await checkRateLimit(b, 1, 60)).allowed).toBe(true);
  });

  it("beginnt nach Ablauf des Zeitfensters von vorn", async () => {
    const key = unique("rl");
    await checkRateLimit(key, 1, 60);
    expect((await checkRateLimit(key, 1, 60)).allowed).toBe(false);

    await prisma.rateLimitBucket.update({
      where: { key },
      data: { resetAt: new Date(Date.now() - 1000) },
    });
    expect((await checkRateLimit(key, 1, 60)).allowed).toBe(true);
  });

  it("zählt bei gleichzeitigen Anfragen exakt (atomar)", async () => {
    const key = unique("rl");
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit(key, 5, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("enforceRateLimit wirft RATE_LIMITED mit Wartezeit", async () => {
    const key = unique("rl");
    await enforceRateLimit(key, 1, 60);
    await expect(enforceRateLimit(key, 1, 60)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("resetRateLimit setzt den Zähler zurück", async () => {
    const key = unique("rl");
    await checkRateLimit(key, 1, 60);
    await resetRateLimit(key);
    expect((await checkRateLimit(key, 1, 60)).allowed).toBe(true);
  });
});
