import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/banken/route";
import type { ApiResponse } from "@/lib/action-result";
import { BANK_QUERY_MAX_LENGTH, type BankSuggestionsResponse } from "@/lib/bank-suggestions";

async function call(search: string) {
  const response = await GET(
    new NextRequest(`http://localhost:3000/api/banken${search}`),
    undefined,
  );
  return {
    status: response.status,
    cache: response.headers.get("cache-control"),
    body: (await response.json()) as ApiResponse<BankSuggestionsResponse>,
  };
}

const banks = (body: ApiResponse<BankSuggestionsResponse>) => (body.ok ? body.data.banks : null);

describe("GET /api/banken", () => {
  it("liefert Vorschläge als { ok: true, data: { banks } } und darf zwischengespeichert werden", async () => {
    const { status, cache, body } = await call("?q=sparkasse%20vest");
    expect(status).toBe(200);
    expect(cache).toBe("public, max-age=86400, stale-while-revalidate=604800");
    expect(banks(body)?.[0]).toMatchObject({
      id: "42650150",
      name: "Sparkasse Vest Recklinghausen",
      value: "Sparkasse Vest Recklinghausen",
    });
  });

  it("ohne oder mit zu kurzer Eingabe: leere Liste", async () => {
    for (const search of ["", "?q=", "?q=a", "?q=%20%20a%20%20", "?x=sparkasse"]) {
      const { status, body } = await call(search);
      expect(status).toBe(200);
      expect(banks(body)).toEqual([]);
    }
  });

  it("zu lange Eingabe: 422 mit deutscher Meldung, nicht zwischengespeichert", async () => {
    const { status, cache, body } = await call(`?q=${"x".repeat(BANK_QUERY_MAX_LENGTH + 1)}`);
    expect(status).toBe(422);
    expect(cache).toBe("no-store");
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(body.error.code).toBe("VALIDATION");
      expect(body.error.fieldErrors?.q?.[0]).toBe("Bitte gib höchstens 60 Zeichen ein.");
    }
    // Leerzeichen am Rand und doppelte Leerzeichen zählen nicht mit
    const padded = await call(`?q=${encodeURIComponent(`   ${"x ".repeat(30)}   `)}`);
    expect(padded.status).toBe(200);
  });

  it("andere Angaben werden ignoriert – höchstens 8 Vorschläge", async () => {
    const { body } = await call("?q=sparkasse&limit=1000&q=vest");
    expect(banks(body)?.length).toBe(8);
  });

  it("eine IBAN sucht nur die Bankleitzahl und wird nicht zwischengespeichert", async () => {
    const { status, cache, body } = await call(
      `?q=${encodeURIComponent("DE12 4265 0150 0000 0000 00")}`,
    );
    expect(status).toBe(200);
    expect(cache).toBe("private, no-store");
    expect(banks(body)?.map((bank) => bank.name)).toEqual(["Sparkasse Vest Recklinghausen"]);
  });

  it("Sonderzeichen sind harmlos", async () => {
    for (const q of ["<script>alert(1)</script>", "%", "_", "' OR 1=1 --", "🏦🏦"]) {
      const { status, body } = await call(`?q=${encodeURIComponent(q)}`);
      expect(status).toBe(200);
      expect(banks(body)).toEqual([]);
    }
  });
});
