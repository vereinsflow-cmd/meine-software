import { describe, expect, it } from "vitest";
import { uploadMetaSchema } from "@/modules/documents/schemas";
import { invoiceTitleBase, nextInvoiceName } from "@/modules/finance/invoice-format";
import { toInvoicePrefill, type ExtractedInvoice } from "@/modules/finance/invoice-prefill";

const telekom: ExtractedInvoice = {
  isInvoice: true,
  vendor: "Telekom Deutschland GmbH",
  description: "Internet Oktober 2026",
  totalCents: 4995,
  currency: "EUR",
  invoiceDate: "2026-10-02",
  dueDate: "2026-10-16",
  alreadyPaid: false,
};

describe("Rechnung auslesen → Vorschläge fürs Hochladen", () => {
  it("füllt Name, Betrag und Fälligkeit", () => {
    expect(toInvoicePrefill(telekom)).toEqual({
      title: "Telekom Deutschland GmbH – Internet Oktober 2026",
      amount: "49,95",
      dueDate: "2026-10-16",
      paid: false,
      note: null,
    });
  });

  it("doppelt die Firma nicht und nimmt notfalls nur eins von beiden", () => {
    expect(toInvoicePrefill({ ...telekom, description: "Telekom Internet" }).title).toBe(
      "Telekom Internet",
    );
    expect(
      toInvoicePrefill({ ...telekom, vendor: "Telekom", description: "telekom Rechnung" }).title,
    ).toBe("telekom Rechnung");
    expect(toInvoicePrefill({ ...telekom, description: null }).title).toBe(
      "Telekom Deutschland GmbH",
    );
    expect(toInvoicePrefill({ ...telekom, vendor: null, description: null }).title).toBe("");
  });

  it("räumt den Namen auf und kürzt ihn", () => {
    expect(
      toInvoicePrefill({ ...telekom, vendor: "Strom/Gas\nWerke", description: null }).title,
    ).toBe("Strom Gas Werke");
    const long = toInvoicePrefill({ ...telekom, vendor: null, description: "x".repeat(300) }).title;
    expect(long.length).toBe(100);
    expect(long.endsWith("…")).toBe(true);
  });

  it("lässt unklare Beträge und Daten leer", () => {
    for (const totalCents of [null, 0, -500, 2_000_000_000])
      expect(toInvoicePrefill({ ...telekom, totalCents }).amount, String(totalCents)).toBe("");
    for (const dueDate of [null, "16.10.2026", "2026-02-30", "bald"])
      expect(toInvoicePrefill({ ...telekom, dueDate }).dueDate, String(dueDate)).toBe("");
  });

  it("fremde Währung: kein Betrag, dafür ein Hinweis", () => {
    const prefill = toInvoicePrefill({ ...telekom, currency: "usd" });
    expect(prefill.amount).toBe("");
    expect(prefill.note).toContain("USD");
    expect(toInvoicePrefill({ ...telekom, currency: null }).amount).toBe("49,95");
  });

  it("meldet schon Bezahltes und Nicht-Rechnungen", () => {
    expect(toInvoicePrefill({ ...telekom, alreadyPaid: true }).paid).toBe(true);
    expect(toInvoicePrefill({ ...telekom, isInvoice: false }).note).toContain(
      "nicht nach einer Rechnung",
    );
  });
});

describe("Name einer Rechnung", () => {
  it("nimmt den angegebenen Namen als Grundnamen", () => {
    expect(invoiceTitleBase("Telekom – Internet Oktober 2026")).toBe(
      "Telekom – Internet Oktober 2026",
    );
    expect(invoiceTitleBase("Strom/Gas")).toBe("Strom-Gas");
    expect(invoiceTitleBase("Rechnung.pdf")).toBe("Rechnung");
    expect(invoiceTitleBase("  ")).toBeNull();
    expect(invoiceTitleBase(undefined)).toBeNull();
    expect(invoiceTitleBase("...")).toBeNull();
  });

  it("zählt gleichnamige Rechnungen hoch", () => {
    const base = invoiceTitleBase("Telekom – Internet")!;
    expect(nextInvoiceName(base, "pdf", [])).toBe("Telekom – Internet.pdf");
    expect(nextInvoiceName(base, "pdf", ["Telekom – Internet.pdf"])).toBe(
      "Telekom – Internet (2).pdf",
    );
  });

  it("kommt beim Hochladen mit", () => {
    const meta = uploadMetaSchema.parse({
      access: "BOARD",
      isInvoice: "on",
      paymentDue: "true",
      amount: "49,95",
      title: "  Telekom – Internet  ",
    });
    expect(meta.invoice).toEqual({
      status: "OPEN",
      amountCents: 4995,
      dueDate: undefined,
      title: "Telekom – Internet",
    });
    expect(
      uploadMetaSchema.safeParse({ access: "BOARD", isInvoice: "on", title: "x".repeat(101) })
        .success,
    ).toBe(false);
  });
});
