import type {
  DonationKind,
  DonationPaymentMethod,
  DonationReceiptWish,
  DonorKind,
  FinanceAccountKind,
  LedgerEntryKind,
} from "@/generated/prisma/enums";
import { formatCalendarDate } from "@/lib/dates";
import type { DueItem } from "@/modules/finance/overview";
import { entryNumber } from "@/modules/finance/ledger-format";
import {
  EXEMPTION_KIND_LABEL,
  FREE_PURPOSE,
  donorDisplayName,
  donorSortKey,
  donorTypeLabel,
  joinNames,
  purposeGroup,
  purposeLabel,
} from "./format";
import {
  addressComplete,
  donationReceiptState,
  isReceiptMissing,
  summarizeDonorReceipts,
  type DonationReceiptState,
  type DonorReceiptSummary,
} from "./receipt-status";
import type { DonationStatusFilter } from "./schemas";
import { taxValidity, type TaxSettings, type TaxValidity } from "./tax-validity";

/**
 * Zahlen der Seite „Spenden“ – rein gerechnet aus den Rohzeilen von `getDonationsPage` (so ohne Datenbank testbar,
 * `tests/unit/donations-summary.test.ts`). Eine Quelle: Die violette Karte der Übersicht nutzt dieselben Zahlen.
 *
 * Gezählt werden alle nicht stornierten Spenden des Jahres (nach Tag der Zuwendung) und die Spenden-Buchungen ohne
 * Spender („Spender fehlt“). Stornierte Spenden zählen nirgends – auch wenn das Storno im Folgejahr gebucht ist.
 */

// ---------------------------------------------------------------------------------------------
// Rohzeilen (Form der Abfragen in service.ts)
// ---------------------------------------------------------------------------------------------

export interface DonorRecord {
  id: string;
  kind: DonorKind;
  name: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  restrictedAt: Date | null;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    anonymizedAt: Date | null;
  } | null;
}

export interface DonationRecord {
  id: string;
  kind: DonationKind;
  receivedOn: Date;
  amountCents: number;
  createdAt: Date;
  anonymousLabel: string | null;
  receiptWish: DonationReceiptWish;
  paymentMethod: DonationPaymentMethod | null;
  voidedAt: Date | null;
  voidReason: string | null;
  departmentId: string | null;
  eventId: string | null;
  purposeText: string | null;
  note: string | null;
  itemDescription: string | null;
  department: { name: string } | null;
  event: { title: string } | null;
  donor: DonorRecord | null;
  line: {
    id: string;
    entry: {
      id: string;
      year: number;
      number: number;
      kind: LedgerEntryKind;
      reversedBy: { id: string } | null;
      account: { name: string; kind: FinanceAccountKind };
    };
  } | null;
  /** Teil 2: Tag der geltenden Zuwendungsbestätigung. */
  issuedOn?: Date | null;
}

/** Spenden-Buchung ohne Spende („Spender fehlt“). */
export interface UnassignedLineRecord {
  id: string;
  amountCents: number;
  bookingDate: Date;
  departmentId: string | null;
  eventId: string | null;
  note: string | null;
  department: { name: string } | null;
  event: { title: string } | null;
  entry: {
    id: string;
    year: number;
    number: number;
    description: string;
    counterpartyName: string | null;
    counterpartyMemberId: string | null;
    recordedAt: Date;
    account: { name: string; kind: FinanceAccountKind };
  };
}

export interface DonationsPageInput {
  donations: DonationRecord[];
  unassigned: UnassignedLineRecord[];
  settings: TaxSettings | null;
  canManage: boolean;
}

// ---------------------------------------------------------------------------------------------
// Zeilen für Listen
// ---------------------------------------------------------------------------------------------

/** Spender einer Zeile mit allem, was die Listen brauchen. */
export interface DonorRefDto {
  id: string;
  kind: DonorKind;
  memberId: string | null;
  name: string;
  /** „Mitglied“, „Firma“, „Früheres Mitglied (gesperrt)“ … */
  typeLabel: string;
  restricted: boolean;
  addressComplete: boolean;
  /** Anschrift ändern: beim Mitglied bzw. in der Liste „Spender“. */
  editHref: string;
}

export interface DonationRowDto {
  /** „d:<Spende>“ bzw. „l:<Buchungszeile>“ (Spender fehlt). */
  key: string;
  donationId: string | null;
  ledgerLineId: string | null;
  entry: { id: string; label: string; accountName: string } | null;
  kind: DonationKind;
  receivedOn: Date;
  amountCents: number;
  donor: DonorRefDto | null;
  /** Spender, Bezeichnung der Spendendose bzw. Gegenüber der Buchung. */
  name: string;
  /** Zeile unter dem Namen: „Mitglied“, „Firma“, „ohne Namen“, „aus dem Kassenbuch“ … */
  typeLabel: string;
  /** `label` leer = frei verwendbar; `group` = Balken in „Wofür gespendet wurde“. */
  purpose: { label: string | null; groupKey: string; groupLabel: string; bound: boolean };
  paymentMethod: DonationPaymentMethod | null;
  receiptWish: DonationReceiptWish;
  state: DonationReceiptState;
  issuedOn: Date | null;
  voidReason: string | null;
  note: string | null;
  itemDescription: string | null;
  /** Reihenfolge bei gleichem Tag: erfasst bzw. gebucht. */
  recordedAt: Date;
  /** Was der Kassenwart mit der Zeile tun kann (nur mit `finance:manage`). */
  actions: { assign: boolean; edit: boolean; void: boolean; unassign: boolean };
}

export function donorRef(donor: DonorRecord): DonorRefDto {
  // Eigene Angaben (externer Spender, Momentaufnahme eines gesperrten Mitglieds) gehen vor; sonst das Mitglied.
  const own = donor.member === null || donor.name !== null;
  const address = own ? donor : donor.member!;
  const name = donorDisplayName(donor);
  const restricted = donor.restrictedAt !== null;
  return {
    id: donor.id,
    kind: donor.kind,
    memberId: donor.member?.id ?? null,
    name,
    typeLabel: donorTypeLabel({ kind: donor.kind, restricted, member: donor.member }),
    restricted,
    addressComplete: addressComplete({ name, ...pickAddress(address) }),
    editHref: donor.member
      ? `/mitglieder/${donor.member.id}/bearbeiten`
      : `/finanzen/spenden/spender?bearbeiten=${donor.id}`,
  };
}

function pickAddress(a: { street: string | null; postalCode: string | null; city: string | null }) {
  return { street: a.street, postalCode: a.postalCode, city: a.city };
}

export function donationRow(d: DonationRecord, canManage: boolean): DonationRowDto {
  const donor = d.donor ? donorRef(d.donor) : null;
  const voided =
    d.voidedAt !== null ||
    (d.line !== null && (d.line.entry.reversedBy !== null || d.line.entry.kind !== "STANDARD"));
  const state = donationReceiptState({
    void: voided,
    issuedOn: d.issuedOn ?? null,
    hasDonor: donor !== null,
    anonymous: donor === null && d.anonymousLabel !== null,
    restricted: donor?.restricted ?? false,
    kind: d.kind,
    paymentMethod: d.paymentMethod,
    amountCents: d.amountCents,
    wish: d.receiptWish,
    addressComplete: donor?.addressComplete ?? false,
  });
  const group = purposeGroup(d);
  const live = state !== "VOID";
  return {
    key: `d:${d.id}`,
    donationId: d.id,
    ledgerLineId: d.line?.id ?? null,
    entry: d.line
      ? {
          id: d.line.entry.id,
          label: entryNumber(d.line.entry.year, d.line.entry.number),
          accountName: d.line.entry.account.name,
        }
      : null,
    kind: d.kind,
    receivedOn: d.receivedOn,
    amountCents: d.amountCents,
    donor,
    name: donor?.name ?? d.anonymousLabel ?? "",
    typeLabel: donor?.typeLabel ?? "ohne Namen",
    purpose: {
      label: purposeLabel(d),
      groupKey: group.key,
      groupLabel: group.label,
      bound: group.bound,
    },
    paymentMethod: d.paymentMethod,
    receiptWish: d.receiptWish,
    state,
    issuedOn: d.issuedOn ?? null,
    voidReason: d.voidReason,
    note: d.note,
    itemDescription: d.itemDescription,
    recordedAt: d.createdAt,
    actions: {
      assign: false,
      edit: canManage && live && state !== "ISSUED" && !(donor?.restricted ?? false),
      void: canManage && live && d.kind !== "MONEY" && state !== "ISSUED",
      unassign: canManage && live && d.kind === "MONEY" && state !== "ISSUED",
    },
  };
}

export function unassignedRow(line: UnassignedLineRecord, canManage: boolean): DonationRowDto {
  const group = purposeGroup({ ...line, purposeText: null });
  return {
    key: `l:${line.id}`,
    donationId: null,
    ledgerLineId: line.id,
    entry: {
      id: line.entry.id,
      label: entryNumber(line.entry.year, line.entry.number),
      accountName: line.entry.account.name,
    },
    kind: "MONEY",
    receivedOn: line.bookingDate,
    amountCents: line.amountCents,
    donor: null,
    name: line.entry.counterpartyName?.trim() || line.entry.description,
    typeLabel: "aus dem Kassenbuch",
    purpose: {
      label: purposeLabel({ ...line, purposeText: null }),
      groupKey: group.key,
      groupLabel: group.label,
      bound: group.bound,
    },
    paymentMethod: null,
    receiptWish: "AUTO",
    state: "NO_DONOR",
    issuedOn: null,
    voidReason: null,
    note: line.note,
    itemDescription: null,
    recordedAt: line.entry.recordedAt,
    actions: { assign: canManage, edit: false, void: false, unassign: false },
  };
}

/**
 * Filter der Liste „Alle Spenden“ (?bestaetigung=…). „Alle“ zeigt alles außer Storniertem (wie die Zahlen der Seite);
 * „Nicht nötig“ umfasst Überweisungen bis 300 €, „braucht keine“ und gesperrte Spender.
 */
export function matchesStatusFilter(
  state: DonationReceiptState,
  filter: DonationStatusFilter,
): boolean {
  switch (filter) {
    case "alle":
      return state !== "VOID";
    case "noetig":
      return isReceiptMissing(state);
    case "adresse":
      return state === "ADDRESS_MISSING";
    case "erstellt":
      return state === "ISSUED";
    case "nicht-noetig":
      return state === "SIMPLIFIED" || state === "NOT_WANTED" || state === "RESTRICTED";
    case "ohne-namen":
      return state === "ANONYMOUS";
    case "ohne-spender":
      return state === "NO_DONOR";
    case "storniert":
      return state === "VOID";
  }
}

/** Neueste zuerst: nach Tag der Zuwendung, dann nach Erfassung. */
export function compareRows(a: DonationRowDto, b: DonationRowDto): number {
  return (
    b.receivedOn.getTime() - a.receivedOn.getTime() ||
    b.recordedAt.getTime() - a.recordedAt.getTime() ||
    a.key.localeCompare(b.key)
  );
}

/** Alle Zeilen eines Jahres (Spenden und Spenden-Buchungen ohne Spender), neueste zuerst. */
export function buildDonationRows(input: DonationsPageInput): DonationRowDto[] {
  return [
    ...input.donations.map((d) => donationRow(d, input.canManage)),
    ...input.unassigned.map((line) => unassignedRow(line, input.canManage)),
  ].sort(compareRows);
}

// ---------------------------------------------------------------------------------------------
// Seite „Spenden“
// ---------------------------------------------------------------------------------------------

export interface DonationKpi {
  /** Alle nicht stornierten Spenden + Spenden-Buchungen ohne Spender. */
  totalCents: number;
  count: number;
  /** Verschiedene Spender (ohne Spendendose und ohne Zuordnung). */
  donorCount: number;
  /** Mit festem Zweck (Abteilung, Veranstaltung oder anderer fester Zweck). */
  boundCents: number;
  byKind: Record<DonationKind, number>;
  /** Je Monat aufsummiert, Januar bis zum aktuellen Monat (Kurs auf der Karte). */
  cumulative: number[];
}

export interface DonationsPageData {
  year: number;
  /** Stand der Zahlen (heute). */
  asOf: Date;
  canManage: boolean;
  kpi: DonationKpi;
  donors: { total: number; members: number; organizations: number; otherPersons: number };
  /** Je Spender. */
  receipts: DonorReceiptSummary;
  /** Januar bis zum aktuellen Monat (bzw. Dezember für vergangene Jahre), nach Tag der Zuwendung. */
  months: { month: number; moneyCents: number; otherCents: number }[];
  due: DueItem[];
  /** Die fünf neuesten. */
  latest: DonationRowDto[];
  /** Nach Betrag, „Frei verwendbar“ immer zuletzt. */
  purposes: { key: string; label: string; cents: number; count: number; bound: boolean }[];
  /** Spenden-Buchungen ohne Spender. */
  unassignedCount: number;
  tax: TaxValidity;
  /** Finanzamt-Angaben fehlen, obwohl Bestätigungen oder Belege bis 300 € gebraucht werden. */
  missingTaxForReceipts: boolean;
}

/** Ziele der Punkte unter „Das steht an“. Teil 2: „Bestätigungen erstellen“ führt zum Erstellen. */
export const DONATION_LINKS = {
  settings: "/finanzen/einstellungen#finanzamt",
  receiptsToCreate: "/finanzen/spenden/alle?bestaetigung=noetig",
  addressesMissing: "/finanzen/spenden/alle?bestaetigung=adresse",
  unassigned: "/finanzen/spenden/alle?bestaetigung=ohne-spender",
} as const;

const DAY_MS = 86_400_000;

/** Monate, die das Jahr auf der Seite zeigt (0 = Januar): bis heute im laufenden Jahr, sonst alle. */
export function monthsShown(year: number, today: Date): number {
  if (year < today.getUTCFullYear()) return 12;
  if (year > today.getUTCFullYear()) return 0;
  return today.getUTCMonth() + 1;
}

export function buildDonationsPage(
  input: DonationsPageInput,
  today: Date,
  year: number,
): DonationsPageData {
  const rows = buildDonationRows(input);
  const live = rows.filter((row) => row.state !== "VOID");

  // Kennzahlen und Monate
  const byKind: Record<DonationKind, number> = { MONEY: 0, IN_KIND: 0, EXPENSE_WAIVER: 0 };
  const shown = monthsShown(year, today);
  const months = Array.from({ length: shown }, (_, month) => ({
    month,
    moneyCents: 0,
    otherCents: 0,
  }));
  let boundCents = 0;
  for (const row of live) {
    byKind[row.kind] += row.amountCents;
    if (row.purpose.bound) boundCents += row.amountCents;
    const bucket = months[row.receivedOn.getUTCMonth()];
    if (bucket) {
      if (row.kind === "MONEY") bucket.moneyCents += row.amountCents;
      else bucket.otherCents += row.amountCents;
    }
  }
  const cumulative: number[] = [];
  months.reduce((sum, m) => {
    const next = sum + m.moneyCents + m.otherCents;
    cumulative.push(next);
    return next;
  }, 0);

  // Spender: je Spender einmal, mit den Status seiner Spenden
  const donorRows = new Map<
    string,
    { donor: DonorRefDto; record: DonorRecord; rows: DonationRowDto[] }
  >();
  const records = new Map(input.donations.flatMap((d) => (d.donor ? [[d.donor.id, d.donor]] : [])));
  for (const row of live) {
    if (!row.donor) continue;
    const entry = donorRows.get(row.donor.id) ?? {
      donor: row.donor,
      record: records.get(row.donor.id)!,
      rows: [],
    };
    entry.rows.push(row);
    donorRows.set(row.donor.id, entry);
  }
  const donors = { total: donorRows.size, members: 0, organizations: 0, otherPersons: 0 };
  for (const { donor } of donorRows.values()) {
    if (donor.memberId) donors.members += 1;
    else if (donor.kind === "PERSON") donors.otherPersons += 1;
    else donors.organizations += 1;
  }
  const receipts = summarizeDonorReceipts(
    [...donorRows.values()].map((entry) => entry.rows.map((row) => row.state)),
  );

  // Zwecke
  const purposeMap = new Map<
    string,
    { key: string; label: string; cents: number; count: number; bound: boolean }
  >();
  for (const row of live) {
    const entry = purposeMap.get(row.purpose.groupKey) ?? {
      key: row.purpose.groupKey,
      label: row.purpose.groupLabel,
      cents: 0,
      count: 0,
      bound: row.purpose.bound,
    };
    entry.cents += row.amountCents;
    entry.count += 1;
    purposeMap.set(row.purpose.groupKey, entry);
  }
  const purposes = [...purposeMap.values()].sort(
    (a, b) =>
      Number(a.key === FREE_PURPOSE) - Number(b.key === FREE_PURPOSE) ||
      b.cents - a.cents ||
      a.label.localeCompare(b.label, "de"),
  );

  const tax = taxValidity(input.settings, today);
  const needsTaxData = live.some(
    (row) => isReceiptMissing(row.state) || row.state === "SIMPLIFIED",
  );
  const missingTaxForReceipts = tax.state === "MISSING" && needsTaxData;

  const waiting = [...donorRows.values()].filter((entry) =>
    entry.rows.some((row) => isReceiptMissing(row.state)),
  );
  const withoutAddress = [...donorRows.values()].filter((entry) =>
    entry.rows.some((row) => row.state === "ADDRESS_MISSING"),
  );
  const unassignedCount = live.filter((row) => row.state === "NO_DONOR").length;

  return {
    year,
    asOf: today,
    canManage: input.canManage,
    kpi: {
      totalCents: byKind.MONEY + byKind.IN_KIND + byKind.EXPENSE_WAIVER,
      count: live.length,
      donorCount: donorRows.size,
      boundCents,
      byKind,
      cumulative,
    },
    donors,
    receipts,
    months,
    due: donationDueItems({
      tax,
      missingTaxForReceipts,
      waiting: waiting.map((entry) => ({
        donor: entry.donor,
        sortKey: donorSortKey(entry.record),
      })),
      withoutAddress: withoutAddress.map((entry) => entry.donor),
      unassignedCount,
      canManage: input.canManage,
    }),
    latest: live.slice(0, 5),
    purposes,
    unassignedCount,
    tax,
    missingTaxForReceipts,
  };
}

/** „Das steht an“ der Spenden-Seite (Dringlichkeit: kleiner = wichtiger; 90 = reine Info). */
export function donationDueItems(input: {
  tax: TaxValidity;
  missingTaxForReceipts: boolean;
  waiting: { donor: DonorRefDto; sortKey: string }[];
  withoutAddress: DonorRefDto[];
  unassignedCount: number;
  canManage: boolean;
}): DueItem[] {
  const { tax, canManage } = input;
  const items: DueItem[] = [];
  const view = (label: string) => (canManage ? label : "Ansehen");

  if (tax.state === "EXPIRED")
    items.push({
      key: "tax-expired",
      urgency: 5,
      title: `${EXEMPTION_KIND_LABEL[tax.kind]} abgelaufen`,
      detail: `Seit ${formatCalendarDate(new Date(tax.validUntil.getTime() + DAY_MS))} darf der Verein keine Zuwendungsbestätigungen ausstellen (§ 63 Abs. 5 AO). Neuen Bescheid beim Finanzamt beantragen.`,
      tone: "danger",
      href: DONATION_LINKS.settings,
      actionLabel: view("Angaben ansehen"),
    });
  if (input.missingTaxForReceipts)
    items.push({
      key: "tax-missing",
      urgency: 8,
      title: "Finanzamt-Angaben fehlen",
      detail:
        "Ohne Finanzamt, Steuernummer und Bescheid kann der Verein keine Zuwendungsbestätigungen ausstellen.",
      tone: "warning",
      href: DONATION_LINKS.settings,
      actionLabel: view("Angaben eintragen"),
    });
  if (input.waiting.length > 0) {
    const names = [...input.waiting]
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "de"))
      .map((entry) => entry.donor.name);
    const n = names.length;
    items.push({
      key: "receipts-missing",
      urgency: 10,
      title: n === 1 ? "1 Zuwendungsbestätigung fehlt" : `${n} Zuwendungsbestätigungen fehlen`,
      detail: `${joinNames(names)} ${n === 1 ? "wartet" : "warten"} darauf.`,
      tone: "warning",
      href: DONATION_LINKS.receiptsToCreate,
      actionLabel: view("Bestätigungen erstellen"),
    });
  }
  if (input.withoutAddress.length > 0) {
    const single = input.withoutAddress.length === 1 ? input.withoutAddress[0]! : null;
    items.push({
      key: "address-missing",
      urgency: 20,
      title: single
        ? `Adresse von ${single.name} fehlt`
        : `Adressen von ${input.withoutAddress.length} Spendern fehlen`,
      detail: "Ohne Anschrift lässt sich keine Bestätigung ausstellen.",
      tone: "warning",
      href: single ? single.editHref : DONATION_LINKS.addressesMissing,
      actionLabel: view("Adresse eintragen"),
    });
  }
  if (input.unassignedCount > 0)
    items.push({
      key: "unassigned",
      urgency: 30,
      title:
        input.unassignedCount === 1
          ? "1 Spende ohne Spender"
          : `${input.unassignedCount} Spenden ohne Spender`,
      detail: "Im Kassenbuch als Spende gebucht, aber noch niemandem zugeordnet.",
      tone: "neutral",
      href: DONATION_LINKS.unassigned,
      actionLabel: view("Spender eintragen"),
    });
  if (tax.state === "EXPIRING")
    items.push({
      key: "tax-expiring",
      urgency: 40,
      title: `${EXEMPTION_KIND_LABEL[tax.kind]} vom ${formatCalendarDate(tax.date)}`,
      detail: `Gültig für Bestätigungen nur noch bis ${formatCalendarDate(tax.validUntil)} (${
        tax.daysLeft === 0
          ? "heute letzter Tag"
          : tax.daysLeft === 1
            ? "noch 1 Tag"
            : `in ${tax.daysLeft} Tagen`
      }). Bitte rechtzeitig einen neuen Bescheid beantragen – im Zweifel Steuerberater fragen.`,
      tone: "warning",
      href: DONATION_LINKS.settings,
      actionLabel: view("Bescheid ansehen"),
    });
  if (tax.state === "VALID")
    items.push({
      key: "tax-valid",
      urgency: 90,
      title: `${EXEMPTION_KIND_LABEL[tax.kind]} vom ${formatCalendarDate(tax.date)}`,
      detail: `Gültig für Bestätigungen bis ${formatCalendarDate(tax.validUntil)}. Gerade ist hier nichts zu tun.`,
      tone: "success",
      href: DONATION_LINKS.settings,
      actionLabel: view("Bescheid ansehen"),
      info: true,
    });
  return items.sort((a, b) => a.urgency - b.urgency);
}

/** Für die Spender-Karte: „10 Mitglieder“, „4 Firmen und Stiftungen“ … (Beschriftung je Art). */
export const DONOR_GROUP_LABEL = {
  members: (n: number) => (n === 1 ? "1 Mitglied" : `${n} Mitglieder`),
  organizations: (n: number) => (n === 1 ? "1 Firma oder Stiftung" : `${n} Firmen und Stiftungen`),
  otherPersons: (n: number) => (n === 1 ? "1 weitere Person" : `${n} weitere Personen`),
} as const;
