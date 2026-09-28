import { describe, expect, it } from "vitest";
import { phoneHref } from "@/lib/phone";

describe("phoneHref", () => {
  it("lässt nur Ziffern und „+“ stehen", () => {
    expect(phoneHref("0170 636 94 16")).toBe("tel:01706369416");
    expect(phoneHref("0 61 51 / 12-34")).toBe("tel:061511234");
    expect(phoneHref("+49 170 1234567")).toBe("tel:+491701234567");
  });

  it("entfernt die „(0)“ nach der Ländervorwahl", () => {
    expect(phoneHref("+49 (0)170 1234567")).toBe("tel:+491701234567");
    expect(phoneHref("+49 (0) 6151 12 34")).toBe("tel:+4961511234");
  });
});
