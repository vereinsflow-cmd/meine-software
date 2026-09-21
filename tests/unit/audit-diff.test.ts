import { describe, expect, it } from "vitest";
import { diffChanges } from "@/server/audit/audit";

describe("diffChanges (Audit-Vergleich)", () => {
  it("liefert null, wenn sich nichts geändert hat", () => {
    expect(diffChanges({ a: 1, b: "x" }, { a: 1, b: "x" })).toBeNull();
  });

  it("liefert nur die geänderten Felder mit alt und neu", () => {
    expect(
      diffChanges({ status: "ACTIVE", city: "Ulm" }, { status: "PASSIVE", city: "Ulm" }),
    ).toEqual({
      status: { from: "ACTIVE", to: "PASSIVE" },
    });
  });

  it("vergleicht Datumswerte nach Zeitpunkt und serialisiert sie als ISO-Text", () => {
    const a = new Date("2026-01-01T10:00:00Z");
    expect(diffChanges({ at: a }, { at: new Date(a.getTime()) })).toBeNull();
    expect(diffChanges({ at: a }, { at: new Date("2026-02-01T10:00:00Z") })).toEqual({
      at: { from: "2026-01-01T10:00:00.000Z", to: "2026-02-01T10:00:00.000Z" },
    });
  });

  it("vermerkt bei maskierten Feldern nur DASS sie sich geändert haben (Datensparsamkeit)", () => {
    const result = diffChanges(
      { phone: "0123", internalNotes: "alt", status: "ACTIVE" },
      { phone: "0456", internalNotes: "neu", status: "ACTIVE" },
      { masked: ["phone", "internalNotes"] },
    );
    expect(result).toEqual({ phone: { changed: true }, internalNotes: { changed: true } });
    expect(JSON.stringify(result)).not.toContain("0123");
    expect(JSON.stringify(result)).not.toContain("alt");
  });

  it("beschränkt sich auf die angegebenen Felder", () => {
    expect(diffChanges({ a: 1, b: 1 }, { a: 2, b: 2 }, { fields: ["a"] })).toEqual({
      a: { from: 1, to: 2 },
    });
  });

  it("maskiert Geheimnisse anhand des Feldnamens", () => {
    const result = diffChanges(
      {},
      { passwordHash: "geheim", note: { apiToken: "geheim2", ok: 1 } },
    );
    expect(JSON.stringify(result)).not.toContain("geheim");
  });
});
