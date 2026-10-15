import { describe, expect, it, vi } from "vitest";
import { runActionAndRefresh } from "@/server/action-refresh";
import { conflict, forbidden } from "@/server/errors";

describe("runActionAndRefresh", () => {
  it("liefert das Ergebnis und lädt danach die Seiten neu – genau einmal, nach der Änderung", async () => {
    const steps: string[] = [];
    const result = await runActionAndRefresh(
      "test",
      () => steps.push("refresh"),
      async () => {
        steps.push("change");
        return { id: "e1" };
      },
    );
    expect(result).toEqual({ ok: true, data: { id: "e1" } });
    expect(steps).toEqual(["change", "refresh"]);
  });

  it("ohne Rückgabe kommt { ok: true, data: undefined } an", async () => {
    const refresh = vi.fn();
    expect(await runActionAndRefresh("test", refresh, async () => undefined)).toEqual({
      ok: true,
      data: undefined,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("schlägt die Änderung fehl, bleibt der Seiten-Cache unberührt", async () => {
    const refresh = vi.fn();
    const denied = await runActionAndRefresh("test", refresh, async () => {
      throw forbidden();
    });
    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const clash = await runActionAndRefresh("test", refresh, async () => {
      throw conflict("Schon storniert.");
    });
    expect(clash).toEqual({ ok: false, error: { code: "CONFLICT", message: "Schon storniert." } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("protokolliert unerwartete Fehler unter dem Bereich (scope)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refresh = vi.fn();
    const result = await runActionAndRefresh("finance-entry", refresh, async () => {
      throw new Error("kaputt");
    });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(spy.mock.calls[0]?.[0]).toContain("[finance-entry]");
    expect(refresh).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
