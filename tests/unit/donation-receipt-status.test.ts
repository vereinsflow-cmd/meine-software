import { describe, expect, it } from "vitest";
import { receiptBadge } from "@/modules/donations/format";
import {
  addressComplete,
  donationReceiptState,
  donorReceiptState,
  paymentMethodForAccount,
  SIMPLIFIED_PROOF_LIMIT_CENTS,
  summarizeDonorReceipts,
  type DonationReceiptFacts,
} from "@/modules/donations/receipt-status";
import {
  addMonthsClamped,
  donationFormSchema,
  latestWaiverDay,
  taxSettingsSchema,
} from "@/modules/donations/schemas";

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** Eine gewöhnliche Geldspende eines Spenders mit vollständiger Anschrift, Wunsch „wie üblich“. */
const facts = (over: Partial<DonationReceiptFacts> = {}): DonationReceiptFacts => ({
  void: false,
  issuedOn: null,
  hasDonor: true,
  anonymous: false,
  restricted: false,
  kind: "MONEY",
  paymentMethod: "TRANSFER",
  amountCents: 5_000,
  wish: "AUTO",
  addressComplete: true,
  ...over,
});

describe("Status der Zuwendungsbestätigung je Spende", () => {
  it("Überweisung bis einschließlich 300,00 € ist „nicht nötig“, ab 300,01 € „nötig“ (je Spende)", () => {
    expect(SIMPLIFIED_PROOF_LIMIT_CENTS).toBe(30_000);
    expect(donationReceiptState(facts({ amountCents: 30_000 }))).toBe("SIMPLIFIED");
    expect(donationReceiptState(facts({ amountCents: 30_001 }))).toBe("NEEDED");
    expect(donationReceiptState(facts({ amountCents: 1 }))).toBe("SIMPLIFIED");
  });

  it("maßgeblich ist, wie der Spender gezahlt hat – nicht das Konto (K1)", () => {
    // Bar übergeben und vom Kassenwart auf dem Girokonto gebucht: bleibt „nötig“.
    expect(donationReceiptState(facts({ paymentMethod: "CASH", amountCents: 1_000 }))).toBe(
      "NEEDED",
    );
    // PayPal o. ä.: vorsichtshalber nie „nicht nötig“.
    expect(donationReceiptState(facts({ paymentMethod: "OTHER", amountCents: 1_000 }))).toBe(
      "NEEDED",
    );
    expect(paymentMethodForAccount("BANK")).toBe("TRANSFER");
    expect(paymentMethodForAccount("CASH")).toBe("CASH");
    expect(paymentMethodForAccount("OTHER")).toBe("OTHER");
  });

  it("der Wunsch des Spenders übersteuert", () => {
    expect(donationReceiptState(facts({ wish: "WANTED" }))).toBe("NEEDED");
    expect(donationReceiptState(facts({ wish: "NOT_WANTED", amountCents: 500_000 }))).toBe(
      "NOT_WANTED",
    );
    expect(donationReceiptState(facts({ wish: "NOT_WANTED", paymentMethod: "CASH" }))).toBe(
      "NOT_WANTED",
    );
  });

  it("Sach- und Aufwandsspenden sind immer nötig (auch klein)", () => {
    expect(
      donationReceiptState(facts({ kind: "IN_KIND", paymentMethod: null, amountCents: 100 })),
    ).toBe("NEEDED");
    expect(
      donationReceiptState(
        facts({ kind: "EXPENSE_WAIVER", paymentMethod: null, amountCents: 100 }),
      ),
    ).toBe("NEEDED");
  });

  it("Reihenfolge: storniert → erstellt → ohne Namen → Spender fehlt → gesperrt → nicht nötig → Adresse fehlt", () => {
    expect(donationReceiptState(facts({ void: true, issuedOn: day(2026, 9, 24) }))).toBe("VOID");
    expect(donationReceiptState(facts({ issuedOn: day(2026, 9, 24), restricted: true }))).toBe(
      "ISSUED",
    );
    expect(donationReceiptState(facts({ hasDonor: false, anonymous: true }))).toBe("ANONYMOUS");
    expect(donationReceiptState(facts({ hasDonor: false }))).toBe("NO_DONOR");
    expect(donationReceiptState(facts({ restricted: true, wish: "NOT_WANTED" }))).toBe(
      "RESTRICTED",
    );
    // Überweisung bis 300 € braucht keine Anschrift – erst eine nötige Bestätigung scheitert daran.
    expect(donationReceiptState(facts({ addressComplete: false }))).toBe("SIMPLIFIED");
    expect(donationReceiptState(facts({ addressComplete: false, paymentMethod: "CASH" }))).toBe(
      "ADDRESS_MISSING",
    );
  });

  it("Anschrift vollständig = Name, Straße, PLZ, Ort (fehlende PLZ → Adresse fehlt)", () => {
    const full = {
      name: "Dieter Hoffmann",
      street: "Am Hang 3",
      postalCode: "12345",
      city: "Musterstadt",
    };
    expect(addressComplete(full)).toBe(true);
    expect(addressComplete({ ...full, postalCode: null })).toBe(false);
    expect(addressComplete({ ...full, street: "  " })).toBe(false);
  });

  it("Beschriftungen wie im Entwurf", () => {
    expect(receiptBadge("NEEDED")).toMatchObject({ label: "nötig", tone: "warning" });
    expect(receiptBadge("ADDRESS_MISSING")).toMatchObject({
      label: "Adresse fehlt",
      tone: "danger",
    });
    expect(receiptBadge("ISSUED", day(2026, 9, 24))).toMatchObject({
      label: "erstellt am 24.09.",
      tone: "success",
    });
    expect(receiptBadge("SIMPLIFIED")).toMatchObject({
      label: "nicht nötig",
      explanation: "Überweisung bis 300 € – Kontoauszug und Beleg des Vereins genügen.",
    });
    expect(receiptBadge("ANONYMOUS").label).toBe("nicht möglich");
    expect(receiptBadge("NO_DONOR").label).toBe("Spender fehlt");
    expect(receiptBadge("VOID")).toMatchObject({ label: "storniert", strike: true });
  });
});

describe("Bestätigungen je Spender", () => {
  it("fehlt, sobald eine Spende nötig ist; sonst erstellt; sonst nicht nötig", () => {
    expect(donorReceiptState(["SIMPLIFIED", "NEEDED"])).toBe("MISSING");
    expect(donorReceiptState(["ISSUED", "ADDRESS_MISSING"])).toBe("MISSING");
    expect(donorReceiptState(["ISSUED", "SIMPLIFIED"])).toBe("ISSUED");
    expect(donorReceiptState(["SIMPLIFIED", "NOT_WANTED"])).toBe("NOT_NEEDED");
    expect(donorReceiptState(["VOID", "SIMPLIFIED"])).toBe("NOT_NEEDED");
  });

  it("die Legende heißt nur „unter 300 €“, wenn im Topf ausschließlich Überweisungen bis 300 € liegen (K21)", () => {
    const simple = summarizeDonorReceipts([
      ["SIMPLIFIED"],
      ["SIMPLIFIED", "SIMPLIFIED"],
      ["NEEDED"],
    ]);
    expect(simple).toEqual({ missing: 1, issued: 0, notNeeded: 2, notNeededAllSimplified: true });
    expect(summarizeDonorReceipts([["SIMPLIFIED"], ["NOT_WANTED"]]).notNeededAllSimplified).toBe(
      false,
    );
    expect(summarizeDonorReceipts([["RESTRICTED"]]).notNeededAllSimplified).toBe(false);
    // Spender nur mit stornierten Spenden zählen gar nicht.
    expect(summarizeDonorReceipts([["VOID"]])).toMatchObject({
      missing: 0,
      issued: 0,
      notNeeded: 0,
    });
  });
});

describe("Aufwandsspende: Zeitregeln (K13, BMF 25.11.2014)", () => {
  const base = {
    kind: "EXPENSE_WAIVER",
    donorMode: "MEMBER",
    memberId: "m1",
    amount: "240,00",
    receivedOn: "2026-06-14",
    target: "frei",
    activityText: "Fahrten zu Auswärtsspielen, 800 km × 0,30 €",
    waiverBasis: "STATUTE",
    claimGrantedOn: "2026-01-01",
    activityFrom: "2026-04-01",
    activityTo: "2026-05-31",
    claimDueOn: "2026-05-31",
    claimConfirmed: true,
  };
  const errors = (input: Record<string, unknown>) => {
    const result = donationFormSchema.safeParse(input);
    return result.success
      ? {}
      : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("gültiger Verzicht wird angenommen", () => {
    expect(errors(base)).toEqual({});
  });

  it("Anspruch nach Beginn der Tätigkeit, Verzicht vor ihrem Ende, fehlendes Häkchen", () => {
    expect(errors({ ...base, claimGrantedOn: "2026-04-02" })).toHaveProperty("claimGrantedOn");
    expect(errors({ ...base, receivedOn: "2026-05-30" })).toHaveProperty("receivedOn");
    expect(errors({ ...base, claimConfirmed: false })).toHaveProperty("claimConfirmed");
  });

  it("Verzicht zu spät: einmalig 3 Monate, regelmäßig 1 Jahr nach Fälligkeit (taggenau)", () => {
    expect(latestWaiverDay(day(2026, 5, 31), false)).toEqual(day(2026, 8, 31));
    expect(latestWaiverDay(day(2026, 5, 31), true)).toEqual(day(2027, 5, 31));
    expect(addMonthsClamped(day(2026, 11, 30), 3)).toEqual(day(2027, 2, 28));
    expect(errors({ ...base, receivedOn: "2026-08-31" })).toEqual({});
    expect(errors({ ...base, receivedOn: "2026-09-01" }).receivedOn).toMatch(/zu spät/);
    expect(errors({ ...base, receivedOn: "2026-09-01", regularActivity: true })).toEqual({});
  });

  it("ohne Namen geht nur bei Geld; Sachspende braucht Beschreibung und Herkunft", () => {
    expect(errors({ ...base, donorMode: "ANONYMOUS", anonymousLabel: "Dose" })).toHaveProperty(
      "donorMode",
    );
    const inKind = { ...base, kind: "IN_KIND", itemDescription: "Wasser", inKindOrigin: "" };
    expect(errors(inKind)).toMatchObject({
      itemDescription: expect.any(String),
      inKindOrigin: expect.any(String),
    });
  });
});

describe("Finanzamt-Angaben (Eingabe)", () => {
  const ok = {
    taxOffice: "Musterstadt",
    taxNumber: "12/345/67890",
    exemptionKind: "EXEMPTION_NOTICE",
    exemptionDate: "2024-03-14",
    exemptionLastYear: "2022",
    taxPurposes: "des Sports",
  };
  const errors = (input: Record<string, unknown>) => {
    const result = taxSettingsSchema.safeParse(input);
    return result.success
      ? {}
      : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("nimmt vollständige Angaben an, prüft Steuernummer, Jahr und § 60a", () => {
    expect(errors(ok)).toEqual({});
    expect(errors({ ...ok, taxNumber: "12/abc" })).toHaveProperty("taxNumber");
    expect(errors({ ...ok, exemptionLastYear: "2025" })).toHaveProperty("exemptionLastYear");
    expect(errors({ ...ok, exemptionKind: "FINDING_60A" })).toMatchObject({
      exemptionLastYear: expect.any(String),
      taxPurposesStatute: expect.any(String),
    });
    expect(
      errors({
        ...ok,
        exemptionKind: "FINDING_60A",
        exemptionLastYear: "",
        taxPurposesStatute: "den Sport",
      }),
    ).toEqual({});
    expect(errors({ ...ok, exemptionDate: "" })).toHaveProperty("exemptionDate");
  });
});
