import type { Prisma } from "@/generated/prisma/client";
import type {
  DonationKind,
  DonationPaymentMethod,
  DonorKind,
  FinanceAccountKind,
} from "@/generated/prisma/enums";
import {
  formatCalendarDate,
  formatEuroFromCents,
  parseCalendarDate,
  todayCalendarDate,
} from "@/lib/dates";
import { parseEuroToCents } from "@/lib/money";
import { parseInput } from "@/server/action";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import { lockUntilCommit, type TenantTx } from "@/server/db/tenant";
import { badRequest, conflict, notFound, validationFailed } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance, canFinance } from "@/modules/finance/access";
import { entryFormOptions, insertEntry, LONG_TX, systemCategoryId } from "@/modules/finance/ledger";
import { entryNumber } from "@/modules/finance/ledger-format";
import { removeDonationEvidenceInTx } from "./evidence";
import {
  DONATION_KIND_LABEL,
  DONOR_KIND_LABEL,
  EXEMPTION_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  RECEIPT_WISH_LABEL,
  purposeLabel,
} from "./format";
import {
  donorReceiptState,
  isReceiptMissing,
  paymentMethodForAccount,
  type DonorReceiptState,
} from "./receipt-status";
import {
  assignDonationSchema,
  donationFormSchema,
  donationUpdateSchema,
  donorIdSchema,
  donorSchema,
  donorUpdateSchema,
  parseDonationPurpose,
  parseDonationStatusFilter,
  restrictDonorSchema,
  taxSettingsSchema,
  unassignDonationSchema,
  voidDonationSchema,
  DONATION_STATUS_FILTERS,
  type DonationStatusFilter,
  type DonorMode,
} from "./schemas";
import { simplifiedProof, type SimplifiedProof } from "./simplified-proof";
import {
  buildDonationRows,
  buildDonationsPage,
  donorRef,
  matchesStatusFilter,
  type DonationRowDto,
  type DonationsPageData,
  type DonationsPageInput,
  type DonorRefDto,
} from "./summary";
import { taxValidity, taxWarnings, type TaxSettings, type TaxValidity } from "./tax-validity";

/**
 * Spenden (Etappe 15, docs/adr/0013): Spender, Geld-, Sach- und Aufwandsspenden, Finanzamt-Angaben. Geldspenden buchen im
 * Kassenbuch (eine Zeile der Kategorie „Spenden“); Sach- und Aufwandsspenden stehen nur hier, mit Nachweisen. Die Zahlen
 * der Seite rechnet `summary.ts` rein aus den Rohzeilen von `getDonationsPage` – dieselbe Quelle nutzt die Übersicht.
 *
 * Rechte: lesen `finance:read`, alles Schreibende `finance:manage` (nur vereinsweit). Sperren: Ändern, Zuordnen,
 * Stornieren, Zurücknehmen und Sperren eines Spenders nehmen `finance:donations` (keiner dieser Abläufe bucht danach).
 * Abläufe, die buchen (`recordDonation`, „Korrigieren“), nehmen diese Sperre nie – sonst Gefahr einer Verklemmung mit
 * einem gleichzeitigen Storno (Nummernkreis ↔ Spenden-Sperre, K2).
 */

const DONATIONS_LOCK = "finance:donations";

// ---------------------------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------------------------

const donorSelect = {
  id: true,
  kind: true,
  name: true,
  street: true,
  postalCode: true,
  city: true,
  country: true,
  restrictedAt: true,
  member: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      street: true,
      postalCode: true,
      city: true,
      country: true,
      anonymizedAt: true,
    },
  },
} satisfies Prisma.DonorSelect;

const donationSelect = {
  id: true,
  kind: true,
  receivedOn: true,
  amountCents: true,
  createdAt: true,
  anonymousLabel: true,
  receiptWish: true,
  paymentMethod: true,
  voidedAt: true,
  voidReason: true,
  departmentId: true,
  eventId: true,
  purposeText: true,
  note: true,
  itemDescription: true,
  department: { select: { name: true } },
  event: { select: { title: true } },
  donor: { select: donorSelect },
  line: {
    select: {
      id: true,
      entry: {
        select: {
          id: true,
          year: true,
          number: true,
          kind: true,
          reversedBy: { select: { id: true } },
          account: { select: { name: true, kind: true } },
        },
      },
    },
  },
  // Teil 2: receiptItems (aktive Positionen) → issuedOn
} satisfies Prisma.DonationSelect;

const unassignedSelect = {
  id: true,
  amountCents: true,
  bookingDate: true,
  departmentId: true,
  eventId: true,
  note: true,
  department: { select: { name: true } },
  event: { select: { title: true } },
  entry: {
    select: {
      id: true,
      year: true,
      number: true,
      description: true,
      counterpartyName: true,
      counterpartyMemberId: true,
      recordedAt: true,
      account: { select: { name: true, kind: true } },
    },
  },
} satisfies Prisma.LedgerLineSelect;

/** Spenden-Buchungen ohne Spende: geltende gewöhnliche Einnahmen der Kategorie „Spenden“. */
const UNASSIGNED_LINE = {
  amountCents: { gt: 0 },
  category: { is: { systemKey: "DONATIONS" } },
  entry: { is: { kind: "STANDARD", reversedBy: { is: null } } },
  donation: { is: null },
} satisfies Prisma.LedgerLineWhereInput;

const taxSelect = {
  taxOffice: true,
  taxNumber: true,
  exemptionKind: true,
  exemptionDate: true,
  exemptionLastYear: true,
  taxPurposes: true,
  taxPurposesStatute: true,
  membershipFeesDeductible: true,
} satisfies Prisma.FinanceSettingsSelect;

function yearRange(year: number): { gte: Date; lte: Date } {
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw badRequest("Bitte wähle ein gültiges Jahr.");
  return { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) };
}

async function loadYear(ctx: TenantContext, year: number): Promise<DonationsPageInput> {
  const range = yearRange(year);
  const [donations, unassigned, settings] = await Promise.all([
    ctx.db.donation.findMany({ where: { receivedOn: range }, select: donationSelect }),
    ctx.db.ledgerLine.findMany({
      where: { bookingDate: range, ...UNASSIGNED_LINE },
      select: unassignedSelect,
    }),
    ctx.db.financeSettings.findUnique({ where: { clubId: ctx.clubId }, select: taxSelect }),
  ]);
  return { donations, unassigned, settings, canManage: canFinance(ctx, "finance:manage") };
}

// ---------------------------------------------------------------------------------------------
// Seite „Spenden“, Listen
// ---------------------------------------------------------------------------------------------

/**
 * Alles für die Seite `/finanzen/spenden` – und die einzige Quelle für die violette Karte der Übersicht (gleiche Zahlen
 * auf beiden Seiten). Drei Abfragen, der Rest ist reine Rechnung (`buildDonationsPage`).
 */
export async function getDonationsPage(
  ctx: TenantContext,
  year: number,
): Promise<DonationsPageData> {
  assertFinance(ctx, "finance:read");
  return buildDonationsPage(await loadYear(ctx, year), todayCalendarDate(), year);
}

export interface DonationList {
  year: number;
  filter: DonationStatusFilter;
  q: string;
  /** Gefiltert, neueste zuerst. */
  rows: DonationRowDto[];
  /** Anzahl je Filter (für die Umschaltleiste). */
  counts: Record<DonationStatusFilter, number>;
  /** Summe der gezeigten Zeilen (ohne stornierte, außer im Filter „Storniert“). */
  totalCents: number;
  canManage: boolean;
}

/** „Alle Spenden“ eines Jahres: dieselben Abfragen wie die Seite, rein gefiltert (Status, Suche nach Name/Zweck/Nummer). */
export async function listDonations(
  ctx: TenantContext,
  options: { year: number; status?: string | null; q?: string | null },
): Promise<DonationList> {
  assertFinance(ctx, "finance:read");
  const input = await loadYear(ctx, options.year);
  const all = buildDonationRows(input);
  const filter = parseDonationStatusFilter(options.status);
  const q = (options.q ?? "").trim().slice(0, 80);
  const needle = q.toLocaleLowerCase("de");
  const searched = needle
    ? all.filter((row) =>
        [row.name, row.purpose.label ?? "", row.entry?.label ?? "", row.typeLabel]
          .join(" ")
          .toLocaleLowerCase("de")
          .includes(needle),
      )
    : all;
  const counts = Object.fromEntries(
    DONATION_STATUS_FILTERS.map((f) => [
      f,
      searched.filter((row) => matchesStatusFilter(row.state, f)).length,
    ]),
  ) as Record<DonationStatusFilter, number>;
  const rows = searched.filter((row) => matchesStatusFilter(row.state, filter));
  return {
    year: options.year,
    filter,
    q,
    rows,
    counts,
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    canManage: input.canManage,
  };
}

export interface DonorRowDto extends DonorRefDto {
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  restrictedAt: Date | null;
  restrictedReason: string | null;
  anonymized: boolean;
  /** Im gewählten Jahr (ohne stornierte). */
  totalCents: number;
  count: number;
  /** Stand der Bestätigungen im Jahr – leer ohne Spenden im Jahr. */
  receiptState: DonorReceiptState | null;
  /** Spenden über alle Jahre (gelöscht werden kann nur ein Spender ohne Spenden). */
  lifetimeCount: number;
  actions: { edit: boolean; restrict: boolean; delete: boolean };
}

export interface DonorList {
  year: number;
  all: boolean;
  donors: DonorRowDto[];
  canManage: boolean;
}

/**
 * Liste „Spender“: Spender mit Spenden im Jahr (mit `all` alle), Summe, Anzahl, Bestätigungsstand und alles, was über sie
 * gespeichert ist (manuelle Auskunft für externe Spender). Mitglieder ändert man beim Mitglied.
 */
export async function listDonors(
  ctx: TenantContext,
  options: { year: number; all?: boolean },
): Promise<DonorList> {
  assertFinance(ctx, "finance:read");
  const [input, donors] = await Promise.all([
    loadYear(ctx, options.year),
    ctx.db.donor.findMany({
      select: { ...donorSelect, restrictedReason: true, _count: { select: { donations: true } } },
    }),
  ]);
  const rows = buildDonationRows(input).filter((row) => row.state !== "VOID");
  const byDonor = new Map<string, DonationRowDto[]>();
  for (const row of rows) {
    if (!row.donor) continue;
    byDonor.set(row.donor.id, [...(byDonor.get(row.donor.id) ?? []), row]);
  }
  const canManage = input.canManage;
  const result = donors
    .filter((donor) => options.all || byDonor.has(donor.id))
    .map((donor): DonorRowDto => {
      const ref = donorRef(donor);
      const own = donor.member === null || donor.name !== null;
      const address = own ? donor : donor.member!;
      const yearRows = byDonor.get(donor.id) ?? [];
      return {
        ...ref,
        street: address.street,
        postalCode: address.postalCode,
        city: address.city,
        country: address.country,
        restrictedAt: donor.restrictedAt,
        restrictedReason: donor.restrictedReason,
        anonymized: donor.member?.anonymizedAt != null,
        totalCents: yearRows.reduce((sum, row) => sum + row.amountCents, 0),
        count: yearRows.length,
        receiptState: yearRows.length > 0 ? donorReceiptState(yearRows.map((r) => r.state)) : null,
        lifetimeCount: donor._count.donations,
        actions: {
          edit: canManage && donor.member === null && donor.restrictedAt === null,
          restrict: canManage && donor.restrictedAt === null,
          delete: canManage && donor._count.donations === 0,
        },
      };
    })
    .sort(
      (a, b) =>
        b.totalCents - a.totalCents || a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
    );
  return { year: options.year, all: Boolean(options.all), donors: result, canManage };
}

/** Wie viele Spenden eines Mitglieds noch auf eine Zuwendungsbestätigung warten (Hinweis vor dem Papierkorb). */
export async function missingReceiptsForMember(
  ctx: TenantContext,
  memberId: string,
): Promise<number> {
  assertFinance(ctx, "finance:read");
  const donations = await ctx.db.donation.findMany({
    where: { donor: { is: { memberId } } },
    select: donationSelect,
  });
  return buildDonationRows({ donations, unassigned: [], settings: null, canManage: false }).filter(
    (row) => isReceiptMissing(row.state),
  ).length;
}

// ---------------------------------------------------------------------------------------------
// Auswahllisten der Fenster „Spende erfassen“ und „Als Spende kennzeichnen“
// ---------------------------------------------------------------------------------------------

export interface DonationFormOptions {
  accounts: {
    value: string;
    label: string;
    kind: FinanceAccountKind;
    /** Vorgabe „Wie kam das Geld?“ zu diesem Konto. */
    paymentMethod: DonationPaymentMethod;
  }[];
  /** Standard: das Bankkonto (bei „Ohne Namen“ die Barkasse). */
  defaultAccountId: string | null;
  cashAccountId: string | null;
  /** „Nachname, Vorname“ – ohne als Spender gesperrte. */
  members: { value: string; label: string }[];
  /** Andere Personen, Firmen, Stiftungen (nicht gesperrt). */
  donors: { value: string; label: string; kind: DonorKind; addressComplete: boolean }[];
  /** Abteilungen („a:<id>“) und Veranstaltungen („v:<id>“). */
  targets: { value: string; label: string; group: "Abteilung" | "Veranstaltung" }[];
  today: string;
  /** Frühester Tag einer Geldspende (offener Zeitraum), „JJJJ-MM-TT“. */
  minDate: string;
  /** Beginn des Kassenbuchs (frühester Tag einer Sach-/Aufwandsspende). */
  ledgerStart: string;
  maxUploadMb: number;
}

/** `null`, solange das Kassenbuch nicht eingerichtet ist. */
export async function donationFormOptions(ctx: TenantContext): Promise<DonationFormOptions | null> {
  assertFinance(ctx, "finance:manage");
  const base = await entryFormOptions(ctx);
  if (!base) return null;
  const [accounts, members, donors] = await Promise.all([
    ctx.db.financeAccount.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, isDefault: true },
    }),
    ctx.db.member.findMany({
      where: { archivedAt: null, deletedAt: null, anonymizedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        donor: { select: { restrictedAt: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    ctx.db.donor.findMany({
      where: { memberId: null, restrictedAt: null },
      select: donorSelect,
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    accounts: accounts.map((a) => ({
      value: a.id,
      label: a.name,
      kind: a.kind,
      paymentMethod: paymentMethodForAccount(a.kind),
    })),
    defaultAccountId:
      accounts.find((a) => a.kind === "BANK" && a.isDefault)?.id ??
      accounts.find((a) => a.kind === "BANK")?.id ??
      accounts[0]?.id ??
      null,
    cashAccountId: accounts.find((a) => a.kind === "CASH")?.id ?? null,
    members: members
      .filter((m) => !m.donor?.restrictedAt)
      .map((m) => ({
        value: m.id,
        label: `${m.lastName}, ${m.firstName}${m.status === "LEFT" ? " (ausgetreten)" : ""}`,
      })),
    donors: donors.map((d) => {
      const ref = donorRef(d);
      return {
        value: d.id,
        label: d.city ? `${ref.name} – ${d.city}` : ref.name,
        kind: d.kind,
        addressComplete: ref.addressComplete,
      };
    }),
    targets: base.targets,
    today: base.today,
    minDate: base.minDate,
    ledgerStart: base.ledgerStart,
    maxUploadMb: base.maxUploadMb,
  };
}

export interface AssignDonationDefaults {
  line: {
    id: string;
    amountCents: number;
    bookingDate: Date;
    entryId: string;
    entryLabel: string;
    description: string;
    counterpartyName: string | null;
    accountName: string;
    accountKind: FinanceAccountKind;
    /** Abteilung bzw. Veranstaltung der Zeile (fest) – leer = frei. */
    purposeLabel: string | null;
  };
  /** Vorschlag für „Von wem?“ aus dem Gegenüber der Buchung. */
  suggestion: { donorMode: DonorMode; memberId?: string; donorId?: string; donorName?: string };
  /** Vorgabe „Wie kam das Geld?“ aus der Kontoart (Rückfrage bei Bank: „Bar übergeben und eingezahlt?“). */
  paymentMethod: DonationPaymentMethod;
}

/**
 * Vorbelegung für „Als Spende kennzeichnen“: Ist ein Mitglied an der Buchung vermerkt, dieses; passt der Name genau auf
 * „Vorname Nachname“ eines Mitglieds bzw. auf einen Spender, dieser; sonst „Andere Person oder Firma“ mit dem Namen.
 */
export async function getAssignDonationDefaults(
  ctx: TenantContext,
  ledgerLineId: string,
): Promise<AssignDonationDefaults> {
  assertFinance(ctx, "finance:manage");
  const line = await ctx.db.ledgerLine.findFirst({
    where: { id: ledgerLineId, ...UNASSIGNED_LINE },
    select: unassignedSelect,
  });
  if (!line) throw notFound("Die Spenden-Buchung");
  const name = line.entry.counterpartyName?.trim() ?? "";
  let suggestion: AssignDonationDefaults["suggestion"] = { donorMode: "MEMBER" };
  const usable = { deletedAt: null, anonymizedAt: null } as const;
  if (line.entry.counterpartyMemberId) {
    const member = await ctx.db.member.findFirst({
      where: { id: line.entry.counterpartyMemberId, ...usable },
      select: { id: true, donor: { select: { restrictedAt: true } } },
    });
    if (member && !member.donor?.restrictedAt)
      suggestion = { donorMode: "MEMBER", memberId: member.id };
  } else if (name.length >= 2) {
    const lastName = name.split(/\s+/).at(-1)!;
    const [members, donors] = await Promise.all([
      ctx.db.member.findMany({
        where: { ...usable, lastName: { equals: lastName, mode: "insensitive" } },
        select: { id: true, firstName: true, lastName: true },
        take: 20,
      }),
      ctx.db.donor.findMany({
        where: { memberId: null, restrictedAt: null, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
        take: 2,
      }),
    ]);
    const lower = name.toLocaleLowerCase("de").replace(/\s+/g, " ");
    const exact = members.filter(
      (m) => `${m.firstName} ${m.lastName}`.toLocaleLowerCase("de").replace(/\s+/g, " ") === lower,
    );
    if (exact.length === 1) suggestion = { donorMode: "MEMBER", memberId: exact[0]!.id };
    else if (donors.length === 1) suggestion = { donorMode: "DONOR", donorId: donors[0]!.id };
    else suggestion = { donorMode: "NEW", donorName: name };
  }
  return {
    line: {
      id: line.id,
      amountCents: line.amountCents,
      bookingDate: line.bookingDate,
      entryId: line.entry.id,
      entryLabel: entryNumber(line.entry.year, line.entry.number),
      description: line.entry.description,
      counterpartyName: line.entry.counterpartyName,
      accountName: line.entry.account.name,
      accountKind: line.entry.account.kind,
      purposeLabel: purposeLabel({ ...line, purposeText: null }),
    },
    suggestion,
    paymentMethod: paymentMethodForAccount(line.entry.account.kind),
  };
}

// ---------------------------------------------------------------------------------------------
// Spender bestimmen bzw. anlegen
// ---------------------------------------------------------------------------------------------

interface DonorChoiceData {
  donorMode: DonorMode;
  memberId?: string;
  donorId?: string;
  donorKind?: DonorKind;
  donorName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  anonymousLabel?: string;
}

interface ResolvedDonor {
  donorId: string | null;
  memberId: string | null;
  /** Name für das Kassenbuch (Gegenüber) bzw. die Bezeichnung der Spendendose. */
  displayName: string | null;
  anonymousLabel: string | null;
}

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

/** Neuer externer Spender (Dublette: gleicher Name und gleiche PLZ, ohne Groß-/Kleinschreibung). */
async function createDonorInTx(
  tx: TenantTx,
  ctx: TenantContext,
  data: {
    kind: DonorKind;
    name: string;
    street?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  },
  nameField: string,
): Promise<{ id: string; name: string }> {
  const name = normalizeName(data.name);
  // Zwei gleichzeitige „Neu eintragen …“ desselben Namens: nacheinander, die zweite sieht danach die erste.
  await lockUntilCommit(tx, ctx.clubId, `donor:${name.toLocaleLowerCase("de")}`);
  const sameName = await tx.donor.findMany({
    where: { memberId: null, name: { equals: name, mode: "insensitive" } },
    select: { postalCode: true },
  });
  const postalCode = data.postalCode?.trim() || null;
  if (sameName.some((d) => (d.postalCode ?? "").toLowerCase() === (postalCode ?? "").toLowerCase()))
    throw validationFailed({
      [nameField]: ["Diesen Spender gibt es schon – bitte aus der Liste wählen."],
    });
  const donor = await tx.donor.create({
    data: {
      clubId: ctx.clubId,
      kind: data.kind,
      name,
      street: data.street?.trim() || null,
      postalCode,
      city: data.city?.trim() || null,
      country: data.country && data.country !== "DE" ? data.country : null,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
    select: { id: true, name: true },
  });
  // Keine Namen im Protokoll (finance.* bleibt 10 Jahre): nur die Art.
  await recordAudit(tx, auditActor(ctx), {
    action: "finance.donor_created",
    entityType: "Donor",
    entityId: donor.id,
    summary: `Spender angelegt (${DONOR_KIND_LABEL[data.kind]})`,
  });
  return { id: donor.id, name };
}

/** Mitglied als Spender: legt den Spender bei der ersten Spende an (eine Quelle für Name und Anschrift: das Mitglied). */
async function memberDonor(
  tx: TenantTx,
  ctx: TenantContext,
  memberId: string,
): Promise<{ donorId: string; name: string }> {
  const member = await tx.member.findFirst({
    where: { id: memberId, deletedAt: null, anonymizedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) throw validationFailed({ memberId: ["Bitte wähle das Mitglied."] });
  // Zwei gleichzeitige erste Spenden desselben Mitglieds: Die zweite wartet und findet danach den Spender (der
  // Mandanten-Filter macht aus einem upsert kein natives ON CONFLICT – ohne Sperre gäbe es einen Unique-Fehler, K18).
  await lockUntilCommit(tx, ctx.clubId, `donor:member:${member.id}`);
  const existing = await tx.donor.findFirst({
    where: { memberId: member.id },
    select: { id: true, restrictedAt: true },
  });
  if (existing?.restrictedAt)
    throw validationFailed({
      memberId: [
        "Dieses Mitglied ist als Spender gesperrt – es lassen sich keine Spenden mehr erfassen.",
      ],
    });
  const donorId =
    existing?.id ??
    (
      await tx.donor.create({
        data: {
          clubId: ctx.clubId,
          kind: "PERSON",
          memberId: member.id,
          createdById: ctx.userId,
          updatedById: ctx.userId,
        },
        select: { id: true },
      })
    ).id;
  return { donorId, name: `${member.firstName} ${member.lastName}`.trim() };
}

async function resolveDonor(
  tx: TenantTx,
  ctx: TenantContext,
  data: DonorChoiceData,
): Promise<ResolvedDonor> {
  switch (data.donorMode) {
    case "MEMBER": {
      const { donorId, name } = await memberDonor(tx, ctx, data.memberId!);
      return { donorId, memberId: data.memberId!, displayName: name, anonymousLabel: null };
    }
    case "DONOR": {
      const donor = await tx.donor.findFirst({
        where: { id: data.donorId!, memberId: null },
        select: { id: true, name: true, restrictedAt: true },
      });
      if (!donor) throw validationFailed({ donorId: ["Bitte wähle den Spender aus der Liste."] });
      if (donor.restrictedAt)
        throw validationFailed({
          donorId: [
            "Dieser Spender ist gesperrt – für ihn lassen sich keine Spenden mehr erfassen.",
          ],
        });
      return { donorId: donor.id, memberId: null, displayName: donor.name, anonymousLabel: null };
    }
    case "NEW": {
      const created = await createDonorInTx(
        tx,
        ctx,
        {
          kind: data.donorKind ?? "PERSON",
          name: data.donorName!,
          street: data.street,
          postalCode: data.postalCode,
          city: data.city,
          country: data.country,
        },
        "donorName",
      );
      return {
        donorId: created.id,
        memberId: null,
        displayName: created.name,
        anonymousLabel: null,
      };
    }
    case "ANONYMOUS": {
      const label = normalizeName(data.anonymousLabel!);
      return { donorId: null, memberId: null, displayName: label, anonymousLabel: label };
    }
  }
}

/** Abteilung bzw. Veranstaltung des Zwecks prüfen (gehört zum Verein, Veranstaltung nicht gelöscht). */
async function loadTarget(
  tx: TenantTx,
  purpose: { departmentId: string | null; eventId: string | null },
): Promise<{ department: { name: string } | null; event: { title: string } | null }> {
  const department = purpose.departmentId
    ? await tx.department.findFirst({ where: { id: purpose.departmentId }, select: { name: true } })
    : null;
  const event = purpose.eventId
    ? await tx.event.findFirst({
        where: { id: purpose.eventId, deletedAt: null },
        select: { title: true },
      })
    : null;
  if ((purpose.departmentId && !department) || (purpose.eventId && !event))
    throw validationFailed({
      target: ["Bitte wähle eine Abteilung oder Veranstaltung aus der Liste."],
    });
  return { department, event };
}

/** Tag einer Sach- oder Aufwandsspende: nicht in der Zukunft, nicht vor dem Beginn des Kassenbuchs. */
function checkDonationDay(day: Date, ledgerStartDate: Date, field = "receivedOn"): void {
  if (day.getTime() > todayCalendarDate().getTime())
    throw validationFailed({ [field]: ["Der Tag der Zuwendung liegt in der Zukunft."] });
  if (day.getTime() < ledgerStartDate.getTime())
    throw validationFailed({
      [field]: [
        `Das Kassenbuch beginnt am ${formatCalendarDate(ledgerStartDate)} – frühere Spenden gehören in die alten Unterlagen.`,
      ],
    });
}

async function requireLedger(tx: TenantTx, clubId: string) {
  const settings = await tx.financeSettings.findUnique({ where: { clubId } });
  if (!settings) throw conflict("Bitte richte zuerst das Kassenbuch ein (Finanzen → Kassenbuch).");
  return settings;
}

const day = (value: string | undefined) => (value ? parseCalendarDate(value) : null);

/** Felder der Sach- bzw. Aufwandsspende (die jeweils anderen bleiben leer). */
function kindFields(
  kind: DonationKind,
  data: {
    itemDescription?: string;
    inKindOrigin?: "BUSINESS" | "PRIVATE" | "UNKNOWN";
    valuationDocs: boolean;
    activityText?: string;
    waiverBasis?: "STATUTE" | "BOARD_DECISION" | "CONTRACT";
    claimGrantedOn?: string;
    activityFrom?: string;
    activityTo?: string;
    claimDueOn?: string;
    regularActivity: boolean;
  },
) {
  const inKind = kind === "IN_KIND";
  const waiver = kind === "EXPENSE_WAIVER";
  return {
    itemDescription: inKind ? (data.itemDescription ?? null) : null,
    inKindOrigin: inKind ? (data.inKindOrigin ?? null) : null,
    valuationDocs: inKind ? data.valuationDocs : false,
    activityText: waiver ? (data.activityText ?? null) : null,
    waiverBasis: waiver ? (data.waiverBasis ?? null) : null,
    claimGrantedOn: waiver ? day(data.claimGrantedOn) : null,
    activityFrom: waiver ? day(data.activityFrom) : null,
    activityTo: waiver ? day(data.activityTo) : null,
    claimDueOn: waiver ? day(data.claimDueOn) : null,
    regularActivity: waiver ? data.regularActivity : false,
  };
}

// ---------------------------------------------------------------------------------------------
// Spende erfassen
// ---------------------------------------------------------------------------------------------

export interface RecordedDonation {
  donationId: string;
  /** Geld: die neue Buchung (für den Beleg, `uploadReceipt(file, entryId)`). */
  entryId: string | null;
  /** Geld: Buchungsnummer „2026-0142“. */
  label: string | null;
}

/**
 * „Spende erfassen“ in einer Transaktion: Spender bestimmen (Mitglied, vorhandener oder neuer Spender, ohne Namen), bei Geld
 * die Buchung im Kassenbuch (Kategorie „Spenden“, Zeitraum, Zukunft und Barkasse prüft die Datenbank), dann die Spende.
 * Keine Sperre `finance:donations` (siehe Kopf): Eine neue Spende kann noch auf keiner Bestätigung stehen.
 */
export async function recordDonation(
  ctx: TenantContext,
  input: unknown,
): Promise<RecordedDonation> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(donationFormSchema, input);
  const amountCents = parseEuroToCents(data.amount!)!;
  const receivedOn = parseCalendarDate(data.receivedOn)!;
  const purpose = parseDonationPurpose(data.target, data.purposeText);
  const money = data.kind === "MONEY";
  return ctx.db.$transaction(async (tx) => {
    const settings = await requireLedger(tx, ctx.clubId);
    if (!money) checkDonationDay(receivedOn, settings.ledgerStartDate);
    const target = await loadTarget(tx, purpose);
    const donor = await resolveDonor(tx, ctx, data);

    let entry: { id: string; label: string } | null = null;
    let ledgerLineId: string | null = null;
    let paymentMethod: DonationPaymentMethod | null = null;
    if (money) {
      const account = await tx.financeAccount.findFirst({
        where: { id: data.accountId!, archivedAt: null },
        select: { id: true, kind: true },
      });
      if (!account) throw validationFailed({ accountId: ["Bitte wähle ein Konto."] });
      paymentMethod = data.paymentMethod ?? paymentMethodForAccount(account.kind);
      const purposeName = purposeLabel({ purposeText: purpose.purposeText, ...target });
      const description = (
        data.description ?? (purposeName ? `Spende für ${purposeName}` : "Spende")
      ).slice(0, 200);
      const created = await insertEntry(tx, ctx, {
        accountId: account.id,
        bookingDate: receivedOn,
        kind: "STANDARD",
        description,
        counterpartyName: donor.displayName?.slice(0, 140) ?? null,
        counterpartyMemberId: donor.memberId,
        lines: [
          {
            categoryId: await systemCategoryId(tx, "DONATIONS"),
            amountCents,
            departmentId: purpose.departmentId,
            eventId: purpose.eventId,
            note: purpose.purposeText,
          },
        ],
      });
      const line = await tx.ledgerLine.findFirstOrThrow({
        where: { entryId: created.id, position: 1 },
        select: { id: true },
      });
      ledgerLineId = line.id;
      entry = { id: created.id, label: entryNumber(created.year, created.number) };
      await recordAudit(tx, auditActor(ctx), {
        action: "finance.entry_created",
        entityType: "LedgerEntry",
        entityId: created.id,
        summary: `Buchung ${entry.label}: ${description} (${formatEuroFromCents(amountCents)})`,
      });
    }

    const waiver = data.kind === "EXPENSE_WAIVER";
    const donation = await tx.donation.create({
      data: {
        clubId: ctx.clubId,
        kind: data.kind,
        donorId: donor.donorId,
        anonymousLabel: donor.anonymousLabel,
        ledgerLineId,
        // Geld: Betrag, Tag, Abteilung und Veranstaltung setzt die Datenbank aus der Zeile.
        receivedOn,
        amountCents,
        paymentMethod,
        departmentId: purpose.departmentId,
        eventId: purpose.eventId,
        purposeText: purpose.purposeText,
        receiptWish: data.receiptWish,
        note: data.note ?? null,
        ...kindFields(data.kind, data),
        claimConfirmedAt: waiver ? new Date() : null,
        claimConfirmedById: waiver ? ctx.userId : null,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
      select: { id: true },
    });
    // Ohne Namen: „Spende erfasst: 350,00 € (Buchung 2026-0142)“ (finance.* bleibt 10 Jahre im Protokoll).
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donation_recorded",
      entityType: "Donation",
      entityId: donation.id,
      summary: money
        ? `Spende erfasst: ${formatEuroFromCents(amountCents)} (Buchung ${entry!.label})`
        : `${DONATION_KIND_LABEL[data.kind]} erfasst: ${formatEuroFromCents(amountCents)}${
            waiver ? " – Anspruch bestätigt" : ""
          }`,
    });
    return { donationId: donation.id, entryId: entry?.id ?? null, label: entry?.label ?? null };
  }, LONG_TX);
}

// ---------------------------------------------------------------------------------------------
// Als Spende kennzeichnen, ändern, stornieren, Kennzeichnung zurücknehmen
// ---------------------------------------------------------------------------------------------

/**
 * „Als Spende kennzeichnen“: eine Spenden-Buchung ohne Spender zuordnen. Legt nur die Spende an – Betrag, Tag, Abteilung
 * und Veranstaltung kommen aus der Zeile. Erlaubt auch in abgeschlossenen Monaten (keine Buchung).
 */
export async function assignDonation(
  ctx: TenantContext,
  input: unknown,
): Promise<{ donationId: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(assignDonationSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await lockUntilCommit(tx, ctx.clubId, DONATIONS_LOCK);
    const line = await tx.ledgerLine.findFirst({
      where: { id: data.ledgerLineId },
      select: {
        id: true,
        amountCents: true,
        bookingDate: true,
        category: { select: { systemKey: true } },
        donation: { select: { id: true } },
        entry: {
          select: {
            year: true,
            number: true,
            kind: true,
            reversedBy: { select: { id: true } },
            account: { select: { kind: true } },
          },
        },
      },
    });
    if (!line) throw notFound("Die Buchung");
    if (line.donation) throw conflict("Diese Buchung ist schon als Spende gekennzeichnet.");
    if (line.category.systemKey !== "DONATIONS" || line.amountCents <= 0)
      throw conflict("Nur Einnahmen der Kategorie „Spenden“ lassen sich als Spende kennzeichnen.");
    if (line.entry.kind !== "STANDARD")
      throw conflict("Nur eine gewöhnliche Einnahme lässt sich als Spende kennzeichnen.");
    if (line.entry.reversedBy)
      throw conflict(
        "Diese Buchung ist storniert – sie lässt sich nicht mehr als Spende kennzeichnen.",
      );
    const donor = await resolveDonor(tx, ctx, data);
    const donation = await tx.donation.create({
      data: {
        clubId: ctx.clubId,
        kind: "MONEY",
        donorId: donor.donorId,
        anonymousLabel: donor.anonymousLabel,
        ledgerLineId: line.id,
        receivedOn: line.bookingDate,
        amountCents: line.amountCents,
        paymentMethod: data.paymentMethod ?? paymentMethodForAccount(line.entry.account.kind),
        purposeText: data.purposeText ?? null,
        receiptWish: data.receiptWish,
        note: data.note ?? null,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
      select: { id: true },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donation_recorded",
      entityType: "Donation",
      entityId: donation.id,
      summary: `Spende zugeordnet: ${formatEuroFromCents(line.amountCents)} (Buchung ${entryNumber(line.entry.year, line.entry.number)})`,
    });
    return { donationId: donation.id };
  }, LONG_TX);
}

const donationForUpdate = {
  id: true,
  kind: true,
  donorId: true,
  anonymousLabel: true,
  receivedOn: true,
  amountCents: true,
  paymentMethod: true,
  departmentId: true,
  eventId: true,
  purposeText: true,
  receiptWish: true,
  note: true,
  itemDescription: true,
  inKindOrigin: true,
  valuationDocs: true,
  activityText: true,
  waiverBasis: true,
  claimGrantedOn: true,
  activityFrom: true,
  activityTo: true,
  claimDueOn: true,
  regularActivity: true,
  voidedAt: true,
  department: { select: { name: true } },
  event: { select: { title: true } },
  donor: { select: { restrictedAt: true } },
  line: {
    select: {
      entry: { select: { year: true, number: true, reversedBy: { select: { id: true } } } },
    },
  },
} satisfies Prisma.DonationSelect;

async function loadForChange(tx: TenantTx, id: string) {
  const donation = await tx.donation.findFirst({ where: { id }, select: donationForUpdate });
  if (!donation) throw notFound("Die Spende");
  if (donation.voidedAt || donation.line?.entry.reversedBy)
    throw conflict("Diese Spende ist storniert – sie bleibt, wie sie ist.");
  return donation;
}

/**
 * Spende ändern: Spender, Text-Zweck, Zahlart, Wunsch, Notiz; bei Sach- und Aufwandsspenden auch Abteilung/Veranstaltung,
 * Wert, Tag und ihre Angaben (Geld: Abteilung/Veranstaltung nur über „Korrigieren“ der Buchung). Das Protokoll hält
 * Zweck, Betrag, Tag, Zahlart und Wunsch mit alt/neu fest (ein nachträglich geänderter Zweck ist haftungsrelevant).
 */
export async function updateDonation(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(donationUpdateSchema, input);
  await ctx.db.$transaction(async (tx) => {
    await lockUntilCommit(tx, ctx.clubId, DONATIONS_LOCK);
    const current = await loadForChange(tx, data.id);
    if (current.kind !== data.kind)
      throw badRequest(
        "Die Art einer Spende lässt sich nicht ändern – storniere sie und erfasse sie neu.",
      );
    if (current.donor?.restrictedAt)
      throw conflict("Dieser Spender ist gesperrt – die Spende bleibt, wie sie ist.");
    const money = current.kind === "MONEY";
    const settings = await requireLedger(tx, ctx.clubId);

    // Zweck: bei Geld nur der Text (Abteilung/Veranstaltung kommen aus der Buchung).
    const parsed = parseDonationPurpose(data.target, data.purposeText);
    const purpose = money
      ? {
          departmentId: current.departmentId,
          eventId: current.eventId,
          purposeText: data.purposeText ?? null,
        }
      : parsed;
    const target = money
      ? { department: current.department, event: current.event }
      : await loadTarget(tx, purpose);
    const amountCents = money ? current.amountCents : parseEuroToCents(data.amount!)!;
    const receivedOn = money ? current.receivedOn : parseCalendarDate(data.receivedOn!)!;
    if (!money && receivedOn.getTime() !== current.receivedOn.getTime())
      checkDonationDay(receivedOn, settings.ledgerStartDate);

    // Spender: dasselbe Mitglied bzw. derselbe Spender bleibt, sonst neu bestimmen.
    const sameDonor =
      (data.donorMode === "DONOR" && data.donorId === current.donorId) ||
      (data.donorMode === "ANONYMOUS" &&
        current.anonymousLabel !== null &&
        normalizeName(data.anonymousLabel ?? "") === current.anonymousLabel);
    const donor = sameDonor
      ? { donorId: current.donorId, anonymousLabel: current.anonymousLabel }
      : await resolveDonor(tx, ctx, data);
    const paymentMethod = money ? (data.paymentMethod ?? current.paymentMethod) : null;

    const next = {
      donorId: donor.donorId,
      anonymousLabel: donor.anonymousLabel,
      amountCents,
      receivedOn,
      paymentMethod,
      departmentId: purpose.departmentId,
      eventId: purpose.eventId,
      purposeText: purpose.purposeText,
      receiptWish: data.receiptWish,
      note: data.note ?? null,
      ...(money ? {} : kindFields(current.kind, data)),
    };
    const before = {
      zweck: purposeLabel(current) ?? "frei",
      betrag: formatEuroFromCents(current.amountCents),
      tag: formatCalendarDate(current.receivedOn),
      zahlart: current.paymentMethod ? PAYMENT_METHOD_LABEL[current.paymentMethod] : null,
      wunsch: RECEIPT_WISH_LABEL[current.receiptWish],
      spender: current.donorId ?? current.anonymousLabel,
      notiz: current.note,
      angaben: JSON.stringify(money ? {} : kindFields(current.kind, toKindInput(current))),
    };
    const after = {
      zweck: purposeLabel({ purposeText: purpose.purposeText, ...target }) ?? "frei",
      betrag: formatEuroFromCents(amountCents),
      tag: formatCalendarDate(receivedOn),
      zahlart: paymentMethod ? PAYMENT_METHOD_LABEL[paymentMethod] : null,
      wunsch: RECEIPT_WISH_LABEL[data.receiptWish],
      spender: donor.donorId ?? donor.anonymousLabel,
      notiz: next.note,
      angaben: JSON.stringify(money ? {} : kindFields(current.kind, data)),
    };
    const changes = diffChanges(before, after, {
      // Wer gespendet hat und Notizen: nur „geändert“ (keine Namen im 10 Jahre aufbewahrten Protokoll).
      masked: ["spender", "notiz", "angaben"],
    });
    const departmentOrEventChanged =
      purpose.departmentId !== current.departmentId || purpose.eventId !== current.eventId;
    if (!changes && !departmentOrEventChanged) return;
    await tx.donation.update({
      where: { id: current.id },
      data: { ...next, updatedById: ctx.userId },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donation_updated",
      entityType: "Donation",
      entityId: current.id,
      summary: `${DONATION_KIND_LABEL[current.kind]} geändert (${formatEuroFromCents(amountCents)}${
        current.line
          ? `, Buchung ${entryNumber(current.line.entry.year, current.line.entry.number)}`
          : ""
      })`,
      changes,
    });
  }, LONG_TX);
}

/** Gespeicherte Angaben in der Form der Eingabe (für den Vergleich vorher/nachher). */
function toKindInput(d: {
  itemDescription: string | null;
  inKindOrigin: "BUSINESS" | "PRIVATE" | "UNKNOWN" | null;
  valuationDocs: boolean;
  activityText: string | null;
  waiverBasis: "STATUTE" | "BOARD_DECISION" | "CONTRACT" | null;
  claimGrantedOn: Date | null;
  activityFrom: Date | null;
  activityTo: Date | null;
  claimDueOn: Date | null;
  regularActivity: boolean;
}) {
  const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : undefined);
  return {
    itemDescription: d.itemDescription ?? undefined,
    inKindOrigin: d.inKindOrigin ?? undefined,
    valuationDocs: d.valuationDocs,
    activityText: d.activityText ?? undefined,
    waiverBasis: d.waiverBasis ?? undefined,
    claimGrantedOn: iso(d.claimGrantedOn),
    activityFrom: iso(d.activityFrom),
    activityTo: iso(d.activityTo),
    claimDueOn: iso(d.claimDueOn),
    regularActivity: d.regularActivity,
  };
}

/** Sach- oder Aufwandsspende stornieren (mit Grund). Eine Geldspende storniert man über ihre Buchung. */
export async function voidDonation(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(voidDonationSchema, input);
  await ctx.db.$transaction(async (tx) => {
    await lockUntilCommit(tx, ctx.clubId, DONATIONS_LOCK);
    const current = await loadForChange(tx, data.id);
    if (current.kind === "MONEY")
      throw conflict(
        "Eine Geldspende stornierst du über ihre Buchung im Kassenbuch („⋯“ → „Stornieren“).",
      );
    await tx.donation.update({
      where: { id: current.id },
      data: {
        voidedAt: new Date(),
        voidedById: ctx.userId,
        voidReason: data.reason,
        updatedById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donation_voided",
      entityType: "Donation",
      entityId: current.id,
      summary: `${DONATION_KIND_LABEL[current.kind]} storniert: ${formatEuroFromCents(current.amountCents)} – ${data.reason}`,
    });
  });
}

/**
 * Geld: „Kennzeichnung zurücknehmen“ – die Spende verschwindet, die Buchung bleibt („Spender fehlt“). Nachweise an der
 * Spende werden mit entfernt (eigens hochgeladene Dateien wandern in den Papierkorb, wenn sie sonst nirgends hängen).
 */
export async function unassignDonation(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(unassignDonationSchema, input);
  await ctx.db.$transaction(async (tx) => {
    await lockUntilCommit(tx, ctx.clubId, DONATIONS_LOCK);
    const current = await tx.donation.findFirst({
      where: { id: data.id },
      select: {
        id: true,
        kind: true,
        amountCents: true,
        line: { select: { entry: { select: { year: true, number: true } } } },
        attachments: { select: { id: true } },
      },
    });
    if (!current) throw notFound("Die Spende");
    if (current.kind !== "MONEY" || !current.line)
      throw conflict("Sach- und Aufwandsspenden bleiben erhalten – storniere sie stattdessen.");
    for (const attachment of current.attachments)
      await removeDonationEvidenceInTx(tx, ctx, attachment.id, { audit: false });
    await tx.donation.delete({ where: { id: current.id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donation_unassigned",
      entityType: "Donation",
      entityId: current.id,
      summary: `Spende nicht mehr zugeordnet: ${formatEuroFromCents(current.amountCents)} (Buchung ${entryNumber(current.line.entry.year, current.line.entry.number)})`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Spender pflegen (andere Personen, Firmen, Stiftungen)
// ---------------------------------------------------------------------------------------------

/** Neuen externen Spender anlegen (Liste „Spender“). */
export async function createDonor(ctx: TenantContext, input: unknown): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(donorSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const created = await createDonorInTx(tx, ctx, data, "name");
    return { id: created.id };
  });
}

/**
 * Name, Art und Anschrift eines externen Spenders ändern (Mitglieder ändert man beim Mitglied). Das Protokoll nennt nur,
 * WELCHE Angaben sich geändert haben – keine alten oder neuen Namen und Anschriften (K16).
 */
export async function updateDonor(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(donorUpdateSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const donor = await tx.donor.findFirst({
      where: { id: data.id },
      select: {
        id: true,
        memberId: true,
        kind: true,
        name: true,
        street: true,
        postalCode: true,
        city: true,
        country: true,
        restrictedAt: true,
      },
    });
    if (!donor) throw notFound("Der Spender");
    if (donor.memberId)
      throw conflict("Name und Anschrift eines Mitglieds änderst du beim Mitglied.");
    if (donor.restrictedAt)
      throw conflict("Dieser Spender ist gesperrt – seine Angaben bleiben, wie sie sind.");
    const name = normalizeName(data.name);
    const next = {
      kind: data.kind,
      name,
      street: data.street ?? null,
      postalCode: data.postalCode ?? null,
      city: data.city ?? null,
      country: data.country && data.country !== "DE" ? data.country : null,
    };
    if (
      name.toLocaleLowerCase("de") !== (donor.name ?? "").toLocaleLowerCase("de") ||
      (next.postalCode ?? "") !== (donor.postalCode ?? "")
    ) {
      await lockUntilCommit(tx, ctx.clubId, `donor:${name.toLocaleLowerCase("de")}`);
      const twin = await tx.donor.findFirst({
        where: {
          memberId: null,
          NOT: { id: donor.id },
          name: { equals: name, mode: "insensitive" },
          postalCode: next.postalCode ? { equals: next.postalCode, mode: "insensitive" } : null,
        },
        select: { id: true },
      });
      if (twin) throw validationFailed({ name: ["Diesen Spender gibt es schon."] });
    }
    const changes = diffChanges(
      {
        art: DONOR_KIND_LABEL[donor.kind],
        name: donor.name,
        strasse: donor.street,
        plz: donor.postalCode,
        ort: donor.city,
        land: donor.country,
      },
      {
        art: DONOR_KIND_LABEL[next.kind],
        name: next.name,
        strasse: next.street,
        plz: next.postalCode,
        ort: next.city,
        land: next.country,
      },
      { masked: ["name", "strasse", "plz", "ort", "land"] },
    );
    if (!changes) return;
    await tx.donor.update({ where: { id: donor.id }, data: { ...next, updatedById: ctx.userId } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donor_updated",
      entityType: "Donor",
      entityId: donor.id,
      summary: `Spender geändert (${DONOR_KIND_LABEL[next.kind]})`,
      changes,
    });
  });
}

/** Sperren (Art. 18 DSGVO): keine neuen Spenden und Bestätigungen; die Aufzeichnungen bleiben bis zum Fristende. */
export async function restrictDonor(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(restrictDonorSchema, input);
  await ctx.db.$transaction(async (tx) => {
    await lockUntilCommit(tx, ctx.clubId, DONATIONS_LOCK);
    const donor = await tx.donor.findFirst({
      where: { id: data.id },
      select: { id: true, restrictedAt: true },
    });
    if (!donor) throw notFound("Der Spender");
    if (donor.restrictedAt) throw conflict("Dieser Spender ist schon gesperrt.");
    await tx.donor.update({
      where: { id: donor.id },
      data: { restrictedAt: new Date(), restrictedReason: data.reason, updatedById: ctx.userId },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donor_restricted",
      entityType: "Donor",
      entityId: donor.id,
      summary: `Spender gesperrt: ${data.reason}`,
    });
  });
}

/** Löschen nur ohne Spenden (sonst sind es Aufzeichnungen nach § 50 Abs. 7 EStDV – dann sperren). */
export async function deleteDonor(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(donorIdSchema, input);
  await ctx.db.$transaction(async (tx) => {
    await lockUntilCommit(tx, ctx.clubId, DONATIONS_LOCK);
    const donor = await tx.donor.findFirst({
      where: { id: data.id },
      select: { id: true, kind: true, memberId: true, _count: { select: { donations: true } } },
    });
    if (!donor) throw notFound("Der Spender");
    if (donor._count.donations > 0)
      throw conflict(
        "Für diesen Spender gibt es Spenden – sie werden 10 Jahre aufbewahrt. Sperre ihn stattdessen.",
      );
    await tx.donor.delete({ where: { id: donor.id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donor_deleted",
      entityType: "Donor",
      entityId: donor.id,
      summary: `Spender gelöscht (${donor.memberId ? "Mitglied" : DONOR_KIND_LABEL[donor.kind]})`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Finanzamt-Angaben
// ---------------------------------------------------------------------------------------------

export interface TaxSettingsDto {
  /** Das Kassenbuch ist eingerichtet (nur dann lassen sich die Angaben speichern). */
  stored: boolean;
  values: TaxSettings;
  validity: TaxValidity;
  /** Hinweise ohne Sperre (Sportverein + abziehbare Beiträge). */
  warnings: string[];
  canManage: boolean;
}

const EMPTY_TAX: TaxSettings = {
  taxOffice: null,
  taxNumber: null,
  exemptionKind: null,
  exemptionDate: null,
  exemptionLastYear: null,
  taxPurposes: null,
  taxPurposesStatute: null,
  membershipFeesDeductible: false,
};

export async function getTaxSettings(ctx: TenantContext): Promise<TaxSettingsDto> {
  assertFinance(ctx, "finance:read");
  const row = await ctx.db.financeSettings.findUnique({
    where: { clubId: ctx.clubId },
    select: taxSelect,
  });
  const values = row ?? EMPTY_TAX;
  return {
    stored: row !== null,
    values,
    validity: taxValidity(row, todayCalendarDate()),
    warnings: taxWarnings(row),
    canManage: canFinance(ctx, "finance:manage"),
  };
}

/** Finanzamt-Angaben speichern (Einstellungen → Finanzamt). Das Protokoll hält alt/neu fest (keine Personendaten). */
export async function updateTaxSettings(
  ctx: TenantContext,
  input: unknown,
): Promise<TaxSettingsDto> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(taxSettingsSchema, input);
  const exemptionDate = data.exemptionDate ? parseCalendarDate(data.exemptionDate) : null;
  if (exemptionDate && exemptionDate.getTime() > todayCalendarDate().getTime())
    throw validationFailed({ exemptionDate: ["Das Datum des Bescheids liegt in der Zukunft."] });
  const sixtyA = data.exemptionKind === "FINDING_60A";
  const next: TaxSettings = {
    taxOffice: data.taxOffice ?? null,
    taxNumber: data.taxNumber ?? null,
    exemptionKind: data.exemptionKind ?? null,
    exemptionDate,
    exemptionLastYear: !sixtyA && data.exemptionLastYear ? Number(data.exemptionLastYear) : null,
    taxPurposes: data.taxPurposes ?? null,
    taxPurposesStatute: sixtyA ? (data.taxPurposesStatute ?? null) : null,
    membershipFeesDeductible: data.membershipFeesDeductible,
  };
  await ctx.db.$transaction(async (tx) => {
    const current = await tx.financeSettings.findUnique({
      where: { clubId: ctx.clubId },
      select: { id: true, ...taxSelect },
    });
    if (!current)
      throw conflict(
        "Bitte richte zuerst das Kassenbuch ein (Finanzen → Kassenbuch) – danach trägst du hier die Finanzamt-Angaben ein.",
      );
    const view = (s: TaxSettings) => ({
      finanzamt: s.taxOffice,
      steuernummer: s.taxNumber,
      bescheid: s.exemptionKind ? EXEMPTION_KIND_LABEL[s.exemptionKind] : null,
      datum: s.exemptionDate ? formatCalendarDate(s.exemptionDate) : null,
      veranlagungszeitraum: s.exemptionLastYear,
      zwecke: s.taxPurposes,
      zweckeSatzung: s.taxPurposesStatute,
      beitraegeAbziehbar: s.membershipFeesDeductible ? "ja" : "nein",
    });
    const changes = diffChanges(view(current), view(next));
    if (!changes) return;
    await tx.financeSettings.update({
      where: { clubId: ctx.clubId },
      data: { ...next, updatedById: ctx.userId },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.tax_settings_updated",
      entityType: "FinanceSettings",
      entityId: current.id,
      summary: "Finanzamt-Angaben geändert",
      changes,
    });
  });
  return getTaxSettings(ctx);
}

// ---------------------------------------------------------------------------------------------
// Beleg für den vereinfachten Nachweis (bis 300 €)
// ---------------------------------------------------------------------------------------------

/** Daten der Druckansicht `/finanzen/spenden/beleg` (keine Speicherung). */
export async function getSimplifiedProof(ctx: TenantContext): Promise<SimplifiedProof> {
  assertFinance(ctx, "finance:read");
  const [club, settings] = await Promise.all([
    ctx.db.club.findFirstOrThrow({
      select: { name: true, street: true, postalCode: true, city: true },
    }),
    ctx.db.financeSettings.findUnique({ where: { clubId: ctx.clubId }, select: taxSelect }),
  ]);
  return simplifiedProof({ club, settings, today: todayCalendarDate() });
}
