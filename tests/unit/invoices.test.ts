import { describe, expect, it } from "vitest";
import { centsToInput, parseEuroToCents } from "@/lib/money";
import { uploadMetaSchema } from "@/modules/documents/schemas";
import { dueText, invoiceBaseName, nextInvoiceName } from "@/modules/finance/invoice-format";
import { invoiceEditSchema } from "@/modules/finance/schemas";

describe("Beträge eintippen (ganze Cent, keine Kommazahlen)", () => {
  it("versteht deutsche Schreibweisen", () => {
    expect(parseEuroToCents("12")).toBe(1200);
    expect(parseEuroToCents("12,5")).toBe(1250);
    expect(parseEuroToCents("12,50")).toBe(1250);
    expect(parseEuroToCents("0,99")).toBe(99);
    expect(parseEuroToCents("1.234,56")).toBe(123456);
    expect(parseEuroToCents("1234,56")).toBe(123456);
    expect(parseEuroToCents(" 1 234,56 € ")).toBe(123456);
    expect(parseEuroToCents("€ 5")).toBe(500);
    expect(parseEuroToCents("1.234")).toBe(123400); // Tausenderpunkt
    expect(parseEuroToCents("12.50")).toBe(1250); // ein Punkt mit Nachkommastellen gilt als Komma
    expect(parseEuroToCents("1.000.000,01")).toBe(100000001);
  });

  it("lehnt Unklares ab", () => {
    for (const bad of [
      "",
      "-5",
      "12,505",
      "1,234.56",
      "12,,5",
      "abc",
      "1.2.3",
      "12,",
      ",5",
      "1.23.456",
    ])
      expect(parseEuroToCents(bad), bad).toBeNull();
  });

  it("rechnet ohne Rundungsfehler und schreibt Cent zurück ins Feld", () => {
    expect(parseEuroToCents("1,005")).toBeNull();
    expect(parseEuroToCents("0,10")).toBe(10);
    expect(centsToInput(123456)).toBe("1234,56");
    expect(centsToInput(5)).toBe("0,05");
    expect(centsToInput(null)).toBe("");
  });
});

describe("Rechnungen heißen nach dem Tag", () => {
  const day = new Date(Date.UTC(2026, 8, 27)); // @db.Date: UTC-Mitternacht
  const base = invoiceBaseName(day);

  it("„Rechnung vom 27.09.2026“ mit der echten Endung", () => {
    expect(base).toBe("Rechnung vom 27.09.2026");
    expect(nextInvoiceName(base, "pdf", [])).toBe("Rechnung vom 27.09.2026.pdf");
  });

  it("zählt am selben Tag weiter – unabhängig von der Endung und von Lücken", () => {
    expect(nextInvoiceName(base, "pdf", ["Rechnung vom 27.09.2026.pdf"])).toBe(
      "Rechnung vom 27.09.2026 (2).pdf",
    );
    expect(
      nextInvoiceName(base, "jpg", [
        "Rechnung vom 27.09.2026.pdf",
        "Rechnung vom 27.09.2026 (2).png",
      ]),
    ).toBe("Rechnung vom 27.09.2026 (3).jpg");
    expect(nextInvoiceName(base, "pdf", ["Rechnung vom 27.09.2026 (4).pdf"])).toBe(
      "Rechnung vom 27.09.2026 (5).pdf",
    );
    // Andere Namen mit gleichem Anfang zählen nicht mit.
    expect(nextInvoiceName(base, "pdf", ["Rechnung vom 27.09.2026 Getränke.pdf"])).toBe(
      "Rechnung vom 27.09.2026.pdf",
    );
  });

  it("nennt die Fälligkeit in Worten", () => {
    expect(dueText(null)).toBeNull();
    expect(dueText(0)).toBe("heute fällig");
    expect(dueText(1)).toBe("morgen fällig");
    expect(dueText(9)).toBe("fällig in 9 Tagen");
    expect(dueText(-1)).toBe("seit gestern überfällig");
    expect(dueText(-3)).toBe("seit 3 Tagen überfällig");
  });
});

describe("Hochladen als Rechnung (Formularangaben)", () => {
  const base = { access: "BOARD" };

  it("normales Dokument: keine Rechnung", () => {
    expect(uploadMetaSchema.parse(base).invoice).toBeNull();
    expect(uploadMetaSchema.parse({ ...base, amount: "12" }).invoice).toBeNull(); // Betrag ohne Rechnung zählt nicht
  });

  it("offene Rechnung verlangt einen gültigen Betrag; Fälligkeit ist freiwillig", () => {
    expect(
      uploadMetaSchema.parse({ ...base, isInvoice: "on", paymentDue: "on", amount: "149,90" })
        .invoice,
    ).toEqual({ status: "OPEN", amountCents: 14990, dueDate: undefined });
    expect(
      uploadMetaSchema.parse({
        ...base,
        isInvoice: "on",
        paymentDue: "on",
        amount: "1.200",
        dueDate: "2026-10-15",
      }).invoice,
    ).toEqual({ status: "OPEN", amountCents: 120000, dueDate: "2026-10-15" });
    for (const amount of [undefined, "", "0", "abc", "20.000.000"]) {
      const result = uploadMetaSchema.safeParse({
        ...base,
        isInvoice: "on",
        paymentDue: "on",
        amount,
      });
      expect(result.success, String(amount)).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["amount"]);
    }
    expect(
      uploadMetaSchema.safeParse({
        ...base,
        isInvoice: "on",
        paymentDue: "on",
        amount: "5",
        dueDate: "2026-02-31",
      }).success,
    ).toBe(false);
  });

  it("schon bezahlte Rechnung braucht keinen Betrag", () => {
    expect(uploadMetaSchema.parse({ ...base, isInvoice: "on" }).invoice).toEqual({
      status: "PAID",
      amountCents: null,
      dueDate: undefined,
    });
    // Die Auswahl im Fenster schickt „true“ (offen) oder „false“ (schon bezahlt).
    expect(
      uploadMetaSchema.parse({ ...base, isInvoice: "on", paymentDue: "false", amount: "12" })
        .invoice,
    ).toEqual({ status: "PAID", amountCents: null, dueDate: undefined });
    expect(
      uploadMetaSchema.parse({ ...base, isInvoice: "on", paymentDue: "true", amount: "12" })
        .invoice,
    ).toEqual({ status: "OPEN", amountCents: 1200, dueDate: undefined });
  });

  it("Bearbeiten: offen nur mit Betrag, bezahlt auch ohne", () => {
    expect(invoiceEditSchema.safeParse({ status: "OPEN", amount: "" }).success).toBe(false);
    expect(invoiceEditSchema.parse({ status: "PAID", amount: "" })).toEqual({
      status: "PAID",
      amount: "",
      dueDate: undefined,
    });
    expect(
      invoiceEditSchema.parse({ status: "OPEN", amount: "12,34", dueDate: "2026-11-01" }),
    ).toEqual({ status: "OPEN", amount: "12,34", dueDate: "2026-11-01" });
    // Das Ergebnis lässt sich erneut prüfen – so macht es der Server mit dem, was das Formular schickt.
    const once = invoiceEditSchema.parse({ status: "OPEN", amount: "12,34" });
    expect(invoiceEditSchema.parse(once)).toEqual(once);
  });
});
