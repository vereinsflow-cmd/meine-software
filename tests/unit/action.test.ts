import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import {
  fieldErrorsFromZod,
  mapDatabaseError,
  parseInput,
  runAction,
  toActionError,
} from "@/server/action";
import { AppError, forbidden, notFound, rateLimited } from "@/server/errors";

describe("parseInput", () => {
  const schema = z.object({
    name: z.string().min(2, "Zu kurz"),
    address: z.object({ city: z.string().min(1, "Pflichtfeld") }),
  });

  it("gibt gültige Daten typisiert zurück", () => {
    expect(parseInput(schema, { name: "Ab", address: { city: "Ulm" } })).toEqual({
      name: "Ab",
      address: { city: "Ulm" },
    });
  });

  it("wirft VALIDATION (422) mit Feldfehlern, auch für verschachtelte Felder", () => {
    try {
      parseInput(schema, { name: "A", address: { city: "" } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe("VALIDATION");
      expect(appError.status).toBe(422);
      expect(appError.fieldErrors).toEqual({ name: ["Zu kurz"], "address.city": ["Pflichtfeld"] });
    }
  });

  it("fieldErrorsFromZod fasst mehrere Fehler je Feld zusammen", () => {
    const result = z
      .object({ pw: z.string().min(5, "kurz").regex(/\d/, "Ziffer") })
      .safeParse({ pw: "ab" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrorsFromZod(result.error)).toEqual({ pw: ["kurz", "Ziffer"] });
  });
});

describe("runAction / toActionError", () => {
  it("packt Ergebnisse in { ok: true, data }", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it("übersetzt AppError in typisierte Fehler ohne Stacktrace", async () => {
    const result = await runAction(async () => {
      throw forbidden();
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Dafür fehlt dir die Berechtigung." },
    });
  });

  it("nennt bei NOT_FOUND nicht, ob der Datensatz woanders existiert", () => {
    expect(toActionError(notFound("Das Mitglied"))).toEqual({
      code: "NOT_FOUND",
      message: "Das Mitglied wurde nicht gefunden.",
    });
  });

  it("gibt bei Rate-Limit die Wartezeit mit", () => {
    expect(toActionError(rateLimited(30))).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  it("verbirgt unerwartete Fehler hinter einer generischen Meldung und protokolliert sie", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAction(async () => {
      throw new Error("SELECT * FROM users WHERE password = 'geheim123'");
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: expect.not.stringContaining("SELECT") },
    });
    expect(JSON.stringify(result)).not.toContain("geheim123");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("mapDatabaseError", () => {
  it("übersetzt die Trigger-Kürzel in verständliche Konflikte", () => {
    expect(mapDatabaseError(new Error("SHIFT_FULL: voll"))?.message).toMatch(/voll besetzt/);
    expect(mapDatabaseError(new Error("SHIFT_OVERLAP: doppelt"))?.message).toMatch(
      /anderen Schicht/,
    );
    expect(mapDatabaseError(new Error("EVENT_FULL: limit"))?.message).toMatch(/Teilnehmerlimit/);
    expect(mapDatabaseError(new Error("SHIFT_FULL"))?.code).toBe("CONFLICT");
  });

  it("übersetzt Prisma-Fehlercodes", () => {
    const make = (code: string) =>
      new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "7" });
    expect(mapDatabaseError(make("P2002"))?.code).toBe("CONFLICT");
    expect(mapDatabaseError(make("P2003"))?.code).toBe("CONFLICT");
    expect(mapDatabaseError(make("P2025"))?.code).toBe("NOT_FOUND");
    expect(mapDatabaseError(make("P2034"))?.code).toBe("CONFLICT");
  });

  it("gibt für alles andere null zurück", () => {
    expect(mapDatabaseError(new Error("irgendwas"))).toBeNull();
    expect(mapDatabaseError("text")).toBeNull();
  });
});
