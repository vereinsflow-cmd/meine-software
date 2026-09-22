import { describe, expect, it } from "vitest";
import { paramList } from "@/lib/search-params";

describe("paramList", () => {
  it("fehlt der Parameter, ist das Ergebnis leer", () => {
    expect(paramList({}, "event")).toEqual([]);
  });

  it("ein einzelner Wert wird zur Liste mit einem Eintrag", () => {
    expect(paramList({ event: "a" }, "event")).toEqual(["a"]);
  });

  it("mehrere gleichnamige Parameter (angehakte Kästchen) ergeben alle Werte in Reihenfolge", () => {
    expect(paramList({ event: ["a", "b", "c"] }, "event")).toEqual(["a", "b", "c"]);
  });

  it("leere Werte werden herausgefiltert", () => {
    expect(paramList({ event: ["a", "", "b"] }, "event")).toEqual(["a", "b"]);
    expect(paramList({ event: "" }, "event")).toEqual([]);
  });

  it("andere Parameter bleiben unberührt", () => {
    expect(paramList({ event: ["a"], von: "2026-01-01" }, "von")).toEqual(["2026-01-01"]);
  });
});
