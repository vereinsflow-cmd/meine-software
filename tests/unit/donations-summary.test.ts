import { describe, expect, it } from "vitest";
import type { DonationKind, DonationReceiptWish, DonorKind } from "@/generated/prisma/enums";
import {
  buildDonationsPage,
  donationRow,
  matchesStatusFilter,
  type DonationRecord,
  type DonationsPageInput,
  type DonorRecord,
  type UnassignedLineRecord,
} from "@/modules/donations/summary";
import type { TaxSettings } from "@/modules/donations/tax-validity";
import { simplifiedProof } from "@/modules/donations/simplified-proof";

/**
 * Die Zahlen des Entwurfs „Spenden-Cockpit“ (Seed-Tabelle im technischen Entwurf, Abschnitt 12): Stand 07.10.2026,
 * 23 Spenden von 14 Spendern, 4.185,00 €.
 */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const TODAY = day(2026, 10, 7);
const JUGEND = { id: "dep-jugend", name: "Jugendabteilung" };

const tax: TaxSettings = {
  taxOffice: "Musterstadt",
  taxNumber: "12/345/67890",
  exemptionKind: "EXEMPTION_NOTICE",
  exemptionDate: day(2024, 3, 14),
  exemptionLastYear: 2022,
  taxPurposes: "des Sports",
  taxPurposesStatute: null,
  membershipFeesDeductible: false,
};

function member(id: string, firstName: string, lastName: string, withAddress = true): DonorRecord {
  return {
    id: `donor-${id}`,
    kind: "PERSON",
    name: null,
    street: null,
    postalCode: null,
    city: null,
    country: null,
    restrictedAt: null,
    member: {
      id: `member-${id}`,
      firstName,
      lastName,
      street: withAddress ? "Lindenweg 1" : null,
      postalCode: withAddress ? "12345" : null,
      city: withAddress ? "Musterstadt" : null,
      country: "DE",
      anonymizedAt: null,
    },
  };
}

function external(id: string, kind: DonorKind, name: string): DonorRecord {
  return {
    id: `donor-${id}`,
    kind,
    name,
    street: "Marktplatz 1",
    postalCode: "12345",
    city: "Musterstadt",
    country: null,
    restrictedAt: null,
    member: null,
  };
}

const vogel = member("vogel", "Karin", "Vogel");
const krueger = member("krueger", "Sophie", "Krüger");
const richter = member("richter", "Thomas", "Richter");
const wolff = member("wolff", "Marta", "Wolff");
const becker = member("becker", "Jens", "Becker");
const schmitz = member("schmitz", "Helga", "Schmitz");
const brandt = member("brandt", "Ursula", "Brandt");
const paulKoch = member("pkoch", "Paul", "Koch");
const benKoch = member("bkoch", "Ben", "Koch");
const hoffmann = member("hoffmann", "Dieter", "Hoffmann", false);
const stiftung = external("stiftung", "ORGANIZATION", "Sparkassenstiftung Musterstadt");
const jansen = external("jansen", "COMPANY", "Getränke Jansen e.K.");
const lange = external("lange", "COMPANY", "Bäckerei Lange GmbH");
const brinkmann = external("brinkmann", "COMPANY", "Autohaus Brinkmann GmbH");

let counter = 0;
function donation(
  date: [number, number],
  donor: DonorRecord | string,
  euros: number,
  options: {
    kind?: DonationKind;
    account?: "BANK" | "CASH";
    purpose?: "jugend" | "vereinsheim";
    wish?: DonationReceiptWish;
    /** Teil 2: geltende Bestätigung. */
    issued?: boolean;
    voided?: boolean;
    reversed?: boolean;
  } = {},
): DonationRecord {
  counter += 1;
  const kind = options.kind ?? "MONEY";
  const account = options.account ?? "BANK";
  const receivedOn = day(2026, date[0], date[1]);
  return {
    id: `donation-${counter}`,
    kind,
    receivedOn,
    amountCents: Math.round(euros * 100),
    createdAt: new Date(receivedOn.getTime() + 12 * 3_600_000),
    anonymousLabel: typeof donor === "string" ? donor : null,
    receiptWish: options.wish ?? "AUTO",
    paymentMethod: kind === "MONEY" ? (account === "BANK" ? "TRANSFER" : "CASH") : null,
    voidedAt: options.voided ? receivedOn : null,
    voidReason: options.voided ? "doppelt erfasst" : null,
    departmentId: options.purpose === "jugend" ? JUGEND.id : null,
    eventId: null,
    purposeText: options.purpose === "vereinsheim" ? "Vereinsheim" : null,
    note: null,
    itemDescription: kind === "IN_KIND" ? "12 Kisten Mineralwasser und Apfelschorle, neu" : null,
    department: options.purpose === "jugend" ? { name: JUGEND.name } : null,
    event: null,
    donor: typeof donor === "string" ? null : donor,
    line:
      kind === "MONEY"
        ? {
            id: `line-${counter}`,
            entry: {
              id: `entry-${counter}`,
              year: 2026,
              number: 100 + counter,
              kind: "STANDARD",
              reversedBy: options.reversed ? { id: `reversal-${counter}` } : null,
              account: { name: account === "BANK" ? "Girokonto" : "Barkasse", kind: account },
            },
          }
        : null,
    issuedOn: options.issued ? day(2026, 9, 24) : null,
  };
}

/** Die 23 Spenden des Entwurfs; `issued` = Status „erstellt“ aus Teil 2. */
function seedDonations(withReceipts: boolean): DonationRecord[] {
  counter = 0;
  const issued = withReceipts;
  return [
    donation([1, 15], vogel, 50),
    donation([1, 27], krueger, 25),
    donation([2, 12], richter, 50),
    donation([3, 20], wolff, 150, { purpose: "jugend", wish: "WANTED" }),
    donation([4, 9], becker, 100, { wish: "WANTED", issued }),
    donation([4, 25], schmitz, 50, { account: "CASH", issued }),
    donation([5, 6], stiftung, 1000, { purpose: "jugend", issued }),
    donation([5, 19], richter, 50),
    donation([6, 3], wolff, 150, { purpose: "jugend", wish: "WANTED" }),
    donation([6, 10], brandt, 100, { purpose: "vereinsheim", wish: "WANTED", issued }),
    donation([6, 14], paulKoch, 240, { kind: "EXPENSE_WAIVER", issued }),
    donation([6, 24], richter, 50),
    donation([7, 4], jansen, 180, { kind: "IN_KIND", issued }),
    donation([7, 5], "Spendendose Sommerfest", 62.4, { account: "CASH" }),
    donation([7, 18], benKoch, 300, { account: "CASH", purpose: "jugend" }),
    donation([8, 7], lange, 100),
    donation([8, 21], krueger, 60),
    donation([9, 8], vogel, 50),
    donation([9, 16], brinkmann, 750, { purpose: "vereinsheim" }),
    donation([9, 22], brandt, 150, { wish: "WANTED", issued }),
    donation([9, 29], hoffmann, 350),
    donation([9, 30], "Spendendose Theke", 47.6, { account: "CASH" }),
    donation([10, 2], krueger, 120),
  ];
}

const input = (over: Partial<DonationsPageInput> = {}): DonationsPageInput => ({
  donations: seedDonations(true),
  unassigned: [],
  settings: tax,
  canManage: true,
  ...over,
});

describe("Seite „Spenden“ mit den Zahlen des Entwurfs", () => {
  const page = buildDonationsPage(input(), TODAY, 2026);

  it("Karte: 4.185,00 €, 23 Spenden von 14 Spendern, 2.450,00 € mit festem Zweck, nach Art", () => {
    expect(page.kpi).toMatchObject({
      totalCents: 418_500,
      count: 23,
      donorCount: 14,
      boundCents: 245_000,
      byKind: { MONEY: 376_500, IN_KIND: 18_000, EXPENSE_WAIVER: 24_000 },
    });
    expect(page.kpi.cumulative).toHaveLength(10);
    expect(page.kpi.cumulative.at(-1)).toBe(418_500);
    expect(page.donors).toEqual({ total: 14, members: 10, organizations: 4, otherPersons: 0 });
  });

  it("Bestätigungen je Spender: 4 fehlen, 6 erstellt, 4 nicht nötig (unter 300 €)", () => {
    expect(page.receipts).toEqual({
      missing: 4,
      issued: 6,
      notNeeded: 4,
      notNeededAllSimplified: true,
    });
  });

  it("Monate Januar bis Oktober nach Tag der Zuwendung", () => {
    expect(page.months.map((m) => [m.moneyCents / 100, m.otherCents / 100])).toEqual([
      [75, 0],
      [50, 0],
      [150, 0],
      [150, 0],
      [1050, 0],
      [300, 240],
      [362.4, 180],
      [160, 0],
      [1347.6, 0],
      [120, 0],
    ]);
  });

  it("Zwecke: Jugendabteilung 1.600/4, Vereinsheim 850/2, frei 1.735/17 (immer zuletzt)", () => {
    expect(page.purposes.map((p) => [p.label, p.cents / 100, p.count, p.bound])).toEqual([
      ["Jugendabteilung", 1600, 4, true],
      ["Vereinsheim", 850, 2, true],
      ["Frei verwendbar", 1735, 17, false],
    ]);
  });

  it("die fünf neuesten wie im Entwurf", () => {
    expect(
      page.latest.map((row) => [row.name, row.typeLabel, row.purpose.label ?? "frei", row.state]),
    ).toEqual([
      ["Sophie Krüger", "Mitglied", "frei", "SIMPLIFIED"],
      ["Spendendose Theke", "ohne Namen", "frei", "ANONYMOUS"],
      ["Dieter Hoffmann", "Mitglied", "frei", "ADDRESS_MISSING"],
      ["Ursula Brandt", "Mitglied", "frei", "ISSUED"],
      ["Autohaus Brinkmann GmbH", "Firma", "Vereinsheim", "NEEDED"],
    ]);
    expect(page.latest[2]!.donor?.editHref).toBe("/mitglieder/member-hoffmann/bearbeiten");
    expect(page.latest[4]!.donor?.editHref).toBe(
      "/finanzen/spenden/spender?bearbeiten=donor-brinkmann",
    );
  });

  it("„Das steht an“: Bestätigungen fehlen (Namen nach Nachname), Adresse, Bescheid als Info", () => {
    expect(page.due.map((d) => [d.urgency, d.title, d.info ?? false])).toEqual([
      [10, "4 Zuwendungsbestätigungen fehlen", false],
      [20, "Adresse von Dieter Hoffmann fehlt", false],
      [90, "Freistellungsbescheid vom 14.03.2024", true],
    ]);
    expect(page.due[0]!.detail).toBe(
      "Autohaus Brinkmann GmbH, Dieter Hoffmann, Ben Koch und Marta Wolff warten darauf.",
    );
    expect(page.due[0]!.actionLabel).toBe("Bestätigungen erstellen");
    expect(page.due[1]!.href).toBe("/mitglieder/member-hoffmann/bearbeiten");
    expect(page.due[2]!.detail).toBe(
      "Gültig für Bestätigungen bis 14.03.2029. Gerade ist hier nichts zu tun.",
    );
    expect(page.tax).toMatchObject({ state: "VALID" });
    expect(page.missingTaxForReceipts).toBe(false);
  });

  it("ohne Teil 2 (keine Bestätigungen) fehlen 10 – und lesend heißen die Aktionen „Ansehen“", () => {
    const reading = buildDonationsPage(
      input({ donations: seedDonations(false), canManage: false }),
      TODAY,
      2026,
    );
    expect(reading.receipts).toMatchObject({ missing: 10, issued: 0, notNeeded: 4 });
    expect(reading.due.every((d) => d.actionLabel === "Ansehen")).toBe(true);
    expect(reading.latest.every((row) => !row.actions.edit && !row.actions.void)).toBe(true);
  });
});

describe("Sonderfälle der Seite", () => {
  it("Stornierte Spenden zählen nirgends (Sachspende storniert, Buchung storniert)", () => {
    const donations = [
      ...seedDonations(true),
      donation([9, 1], jansen, 500, { kind: "IN_KIND", voided: true }),
      donation([9, 2], vogel, 900, { reversed: true }),
    ];
    const page = buildDonationsPage(input({ donations }), TODAY, 2026);
    expect(page.kpi).toMatchObject({ totalCents: 418_500, count: 23, donorCount: 14 });
    expect(page.months[8]!.moneyCents).toBe(134_760);
    expect(page.purposes.find((p) => p.key === "frei")!.count).toBe(17);
  });

  it("Nachweise anhängen: nur Sach- und Aufwandsspenden, nicht storniert, nur mit finance:manage", () => {
    const inKind = donation([9, 1], jansen, 500, { kind: "IN_KIND" });
    expect(donationRow(inKind, true).actions.evidence).toBe(true);
    expect(donationRow(inKind, false).actions.evidence).toBe(false);
    const waiver = donation([9, 1], vogel, 120, { kind: "EXPENSE_WAIVER" });
    expect(donationRow(waiver, true).actions.evidence).toBe(true);
    const voided = donation([9, 1], jansen, 500, { kind: "IN_KIND", voided: true });
    expect(donationRow(voided, true).actions.evidence).toBe(false);
    // Belege einer Geldspende hängen an ihrer Buchung.
    expect(donationRow(donation([9, 2], vogel, 90), true).actions.evidence).toBe(false);
  });

  it("Spenden-Buchungen ohne Spender zählen mit, aber nicht als Spender", () => {
    const unassigned: UnassignedLineRecord[] = [
      {
        id: "line-x",
        amountCents: 2_000,
        bookingDate: day(2026, 10, 5),
        departmentId: JUGEND.id,
        eventId: null,
        note: null,
        department: { name: JUGEND.name },
        event: null,
        entry: {
          id: "entry-x",
          year: 2026,
          number: 300,
          description: "Spende",
          counterpartyName: "Erika Muster",
          counterpartyMemberId: null,
          recordedAt: day(2026, 10, 5),
          account: { name: "Girokonto", kind: "BANK" },
        },
      },
    ];
    const page = buildDonationsPage(input({ unassigned }), TODAY, 2026);
    expect(page.kpi).toMatchObject({ totalCents: 420_500, count: 24, donorCount: 14 });
    expect(page.unassignedCount).toBe(1);
    expect(page.latest[0]).toMatchObject({
      name: "Erika Muster",
      state: "NO_DONOR",
      actions: { assign: true },
    });
    expect(page.purposes[0]).toMatchObject({ label: "Jugendabteilung", count: 5 });
    expect(page.due.find((d) => d.key === "unassigned")).toMatchObject({
      urgency: 30,
      title: "1 Spende ohne Spender",
      href: "/finanzen/spenden/alle?bestaetigung=ohne-spender",
    });
  });

  it("Finanzamt-Angaben fehlen → Punkt 8; Bescheid abgelaufen → Punkt 5 (rot)", () => {
    const missing = buildDonationsPage(input({ settings: null }), TODAY, 2026);
    expect(missing.missingTaxForReceipts).toBe(true);
    expect(missing.due[0]).toMatchObject({ urgency: 8, title: "Finanzamt-Angaben fehlen" });
    const expired = buildDonationsPage(input(), day(2029, 3, 15), 2026);
    expect(expired.due[0]).toMatchObject({
      urgency: 5,
      tone: "danger",
      title: "Freistellungsbescheid abgelaufen",
    });
    expect(expired.due[0]!.detail).toMatch(/^Seit 15\.03\.2029 darf der Verein/);
    const expiring = buildDonationsPage(input(), day(2029, 1, 28), 2026);
    expect(expiring.due.find((d) => d.key === "tax-expiring")).toMatchObject({
      urgency: 40,
      title: "Freistellungsbescheid vom 14.03.2024",
    });
  });

  it("Beschriftung „nicht nötig“ ohne „unter 300 €“, sobald „braucht keine“ im Topf liegt", () => {
    const donations = [
      ...seedDonations(true),
      donation([9, 3], lange, 900, { wish: "NOT_WANTED" }),
    ];
    expect(buildDonationsPage(input({ donations }), TODAY, 2026).receipts).toMatchObject({
      notNeeded: 4,
      notNeededAllSimplified: false,
    });
  });

  it("vergangenes Jahr: alle zwölf Monate; leeres Jahr: nur Nullen", () => {
    const empty = buildDonationsPage(input({ donations: [] }), TODAY, 2025);
    expect(empty.months).toHaveLength(12);
    expect(empty.kpi).toMatchObject({ totalCents: 0, count: 0, donorCount: 0 });
    expect(empty.purposes).toEqual([]);
    expect(empty.latest).toEqual([]);
  });

  it("Filter der Liste „Alle Spenden“", () => {
    expect(matchesStatusFilter("NEEDED", "noetig")).toBe(true);
    expect(matchesStatusFilter("ADDRESS_MISSING", "noetig")).toBe(true);
    expect(matchesStatusFilter("SIMPLIFIED", "nicht-noetig")).toBe(true);
    expect(matchesStatusFilter("VOID", "alle")).toBe(false);
    expect(matchesStatusFilter("VOID", "storniert")).toBe(true);
    expect(matchesStatusFilter("NO_DONOR", "ohne-spender")).toBe(true);
  });
});

describe("Beleg für den vereinfachten Nachweis (K11)", () => {
  const club = {
    name: "TSV Musterstadt 1898 e.V.",
    street: "Sportweg 1",
    postalCode: "12345",
    city: "Musterstadt",
  };

  it("mit gültigem Bescheid: Zweck, Freistellung, „Spende, nicht Mitgliedsbeitrag“, Hinweis auf den Kontoauszug", () => {
    const proof = simplifiedProof({ club, settings: tax, today: TODAY });
    expect(proof.ready).toBe(true);
    expect(proof.issuer.addressLines).toEqual(["Sportweg 1", "12345 Musterstadt"]);
    expect(proof.paragraphs.join("\n")).toContain(
      "Wir sind wegen Förderung des Sports nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes Musterstadt StNr. 12/345/67890, vom 14.03.2024 für den letzten Veranlagungszeitraum 2022",
    );
    expect(proof.paragraphs).toContain(
      "Die Zuwendung wird nur zur Förderung des Sports verwendet.",
    );
    expect(proof.paragraphs).toContain(
      "Es handelt sich um eine Spende, nicht um einen Mitgliedsbeitrag.",
    );
    expect(proof.footnote).toMatch(/Kein amtliches Muster/);
  });

  it("§ 60a: „Wir fördern nach unserer Satzung den Sport.“ (K5); ohne Angaben bzw. abgelaufen nicht druckbar", () => {
    const sixtyA = simplifiedProof({
      club,
      settings: {
        ...tax,
        exemptionKind: "FINDING_60A",
        exemptionLastYear: null,
        taxPurposesStatute: "den Sport",
      },
      today: TODAY,
    });
    expect(sixtyA.paragraphs[0]).toMatch(/Wir fördern nach unserer Satzung den Sport\.$/);
    expect(simplifiedProof({ club, settings: null, today: TODAY })).toMatchObject({
      ready: false,
      paragraphs: [],
    });
    expect(simplifiedProof({ club, settings: tax, today: day(2029, 3, 15) }).ready).toBe(false);
  });
});
