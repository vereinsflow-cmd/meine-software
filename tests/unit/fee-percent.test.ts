import { describe, expect, it } from "vitest";
import { assignmentSchema, parsePercentToBp } from "@/modules/fees/schemas";

describe("Ermäßigung in Prozent", () => {
  it.each([
    ["50", 5000],
    ["100", 10_000],
    ["12,5", 1250],
    ["12.5", 1250],
    ["0,01", 1],
    ["33,33", 3333],
    [" 7 ", 700],
  ])("„%s“ → %i Basispunkte", (text, bp) => {
    expect(parsePercentToBp(text)).toBe(bp);
  });

  it.each(["", "0", "0,00", "0,001", "100,01", "101", "1e1", "0x10", "-5", "5%", "1.000", "12,", ",5", "Infinity"])(
    "„%s“ ist ungültig",
    (text) => {
      expect(parsePercentToBp(text)).toBeNull();
    },
  );

  it("Schema meldet ungültige Prozente in einfachem Deutsch", () => {
    const base = {
      memberId: "cm0000000000000000000000",
      kind: "DISCOUNT_PERCENT" as const,
      validFrom: "2026-10-01",
    };
    const bad = assignmentSchema.safeParse({ ...base, percent: "1e1" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.find((i) => i.path[0] === "percent")?.message).toContain(
      "Bitte gib die Ermäßigung in Prozent",
    );
  });
});
