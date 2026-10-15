import type { DonationKind } from "@/generated/prisma/enums";
import { calendarDateToInputValue, formatCalendarDate, todayCalendarDate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { env } from "@/server/env";
import { conflict, notFound } from "@/server/errors";
import type { TenantContext } from "@/server/tenancy/context-core";
import { assertFinance, canFinance } from "@/modules/finance/access";
import { entryNumber } from "@/modules/finance/ledger-format";
import { listDonationEvidence, type DonationEvidenceDto } from "./evidence";
import { DONATION_KIND_LABEL, purposeLabel } from "./format";
import { addressComplete } from "./receipt-status";
import type { DonationUpdateInput } from "./schemas";
import {
  donationFormOptions,
  getAssignDonationDefaults,
  type AssignDonationDefaults,
  type DonationFormOptions,
} from "./service";

/**
 * Daten der Fenster, die erst beim Öffnen laden („Als Spende kennzeichnen“ aus dem Kassenbuch, „Spende ändern“,
 * „Nachweise“). So lädt keine Liste vorab Mitglieder, Spender und alle Angaben jeder Zeile. Die Auswahllisten bekommen
 * dabei das Mitglied, den Spender bzw. den Zweck der Spende dazu, wenn sie dort fehlen (z. B. archiviertes Mitglied,
 * alte Veranstaltung) – sonst stünde im Fenster eine leere Auswahl.
 */

const NO_LEDGER = "Bitte richte zuerst das Kassenbuch ein (Finanzen → Kassenbuch).";

async function formOptions(ctx: TenantContext): Promise<DonationFormOptions> {
  const options = await donationFormOptions(ctx);
  if (!options) throw conflict(NO_LEDGER);
  return options;
}

/** Fehlendes Mitglied an die Auswahl hängen („Nachname, Vorname“). */
async function withMember(
  ctx: TenantContext,
  options: DonationFormOptions,
  memberId: string | null | undefined,
): Promise<DonationFormOptions> {
  if (!memberId || options.members.some((m) => m.value === memberId)) return options;
  const member = await ctx.db.member.findFirst({
    where: { id: memberId, deletedAt: null, anonymizedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) return options;
  return {
    ...options,
    members: [
      ...options.members,
      { value: member.id, label: `${member.lastName}, ${member.firstName}` },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// „Als Spende kennzeichnen“
// ---------------------------------------------------------------------------------------------

export interface AssignDonationSetup {
  defaults: AssignDonationDefaults;
  options: DonationFormOptions;
}

export async function getAssignDonationSetup(
  ctx: TenantContext,
  ledgerLineId: string,
): Promise<AssignDonationSetup> {
  assertFinance(ctx, "finance:manage");
  const [defaults, options] = await Promise.all([
    getAssignDonationDefaults(ctx, ledgerLineId),
    formOptions(ctx),
  ]);
  return { defaults, options: await withMember(ctx, options, defaults.suggestion.memberId) };
}

// ---------------------------------------------------------------------------------------------
// „Spende ändern“
// ---------------------------------------------------------------------------------------------

export interface DonationEditData {
  id: string;
  kind: DonationKind;
  /** Kurz für Titel und Meldungen: „Geldspende 350,00 € (Buchung 2026-0142)“. */
  label: string;
  /** Geld: Betrag, Tag, Konto, Abteilung und Veranstaltung kommen fest aus der Buchung. */
  booking: {
    entryLabel: string;
    accountName: string;
    amountCents: number;
    receivedOn: Date;
    /** Abteilung bzw. Veranstaltung der Buchungszeile – leer = frei. */
    targetLabel: string | null;
  } | null;
  defaults: DonationUpdateInput;
  options: DonationFormOptions;
}

export async function getDonationEditData(
  ctx: TenantContext,
  id: string,
): Promise<DonationEditData> {
  assertFinance(ctx, "finance:manage");
  const [donation, baseOptions] = await Promise.all([
    ctx.db.donation.findFirst({
      where: { id },
      select: {
        id: true,
        kind: true,
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
        event: { select: { title: true, startsAt: true } },
        donor: {
          select: {
            id: true,
            kind: true,
            name: true,
            street: true,
            postalCode: true,
            city: true,
            memberId: true,
            restrictedAt: true,
          },
        },
        line: {
          select: {
            entry: {
              select: {
                year: true,
                number: true,
                reversedBy: { select: { id: true } },
                account: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    formOptions(ctx),
  ]);
  if (!donation) throw notFound("Die Spende");
  // Dieselben Sperren wie beim Speichern (`updateDonation`) – sonst füllte man das Fenster umsonst aus.
  if (donation.voidedAt || donation.line?.entry.reversedBy)
    throw conflict("Diese Spende ist storniert – sie bleibt, wie sie ist.");
  if (donation.donor?.restrictedAt)
    throw conflict("Dieser Spender ist gesperrt – die Spende bleibt, wie sie ist.");

  const money = donation.kind === "MONEY";
  const donor = donation.donor;
  let options = await withMember(ctx, baseOptions, donor?.memberId);
  if (donor && !donor.memberId && !options.donors.some((d) => d.value === donor.id))
    options = {
      ...options,
      donors: [
        ...options.donors,
        {
          value: donor.id,
          label: donor.city ? `${donor.name ?? ""} – ${donor.city}` : (donor.name ?? ""),
          kind: donor.kind,
          addressComplete: addressComplete(donor),
        },
      ],
    };
  const target = donation.departmentId
    ? `a:${donation.departmentId}`
    : donation.eventId
      ? `v:${donation.eventId}`
      : null;
  if (!money && target && !options.targets.some((t) => t.value === target))
    options = {
      ...options,
      targets: [
        ...options.targets,
        donation.department
          ? { value: target, label: donation.department.name, group: "Abteilung" as const }
          : {
              value: target,
              label: `${donation.event?.title ?? "Veranstaltung"}${
                donation.event
                  ? ` (${formatCalendarDate(todayCalendarDate(donation.event.startsAt))})`
                  : ""
              }`,
              group: "Veranstaltung" as const,
            },
      ],
    };

  const date = (value: Date | null) => (value ? calendarDateToInputValue(value) : "");
  const entryLabel = donation.line
    ? entryNumber(donation.line.entry.year, donation.line.entry.number)
    : null;
  const defaults: DonationUpdateInput = {
    id: donation.id,
    kind: donation.kind,
    donorMode: donor ? (donor.memberId ? "MEMBER" : "DONOR") : "ANONYMOUS",
    memberId: donor?.memberId ?? "",
    donorId: donor && !donor.memberId ? donor.id : "",
    donorKind: "PERSON",
    donorName: "",
    street: "",
    postalCode: "",
    city: "",
    country: "DE",
    anonymousLabel: donation.anonymousLabel ?? "",
    amount: centsToInput(donation.amountCents),
    receivedOn: date(donation.receivedOn),
    paymentMethod: donation.paymentMethod ?? "",
    accountId: "",
    // Geld: Abteilung/Veranstaltung kommen aus der Buchung (der Dienst ignoriert das Ziel) – nur der Text ist änderbar.
    target: money ? "frei" : (target ?? (donation.purposeText ? "andere" : "frei")),
    purposeText: donation.purposeText ?? "",
    receiptWish: donation.receiptWish,
    description: "",
    note: donation.note ?? "",
    itemDescription: donation.itemDescription ?? "",
    inKindOrigin: donation.inKindOrigin ?? "",
    valuationDocs: donation.valuationDocs,
    activityText: donation.activityText ?? "",
    waiverBasis: donation.waiverBasis ?? "",
    claimGrantedOn: date(donation.claimGrantedOn),
    activityFrom: date(donation.activityFrom),
    activityTo: date(donation.activityTo),
    claimDueOn: date(donation.claimDueOn),
    regularActivity: donation.regularActivity,
    // Wer ändert, bestätigt die Voraussetzungen der Aufwandsspende erneut (das Häkchen ist nicht gespeichert).
    claimConfirmed: false,
  };
  return {
    id: donation.id,
    kind: donation.kind,
    label: `${DONATION_KIND_LABEL[donation.kind]}${entryLabel ? ` (Buchung ${entryLabel})` : ""}`,
    booking:
      money && donation.line
        ? {
            entryLabel: entryLabel!,
            accountName: donation.line.entry.account.name,
            amountCents: donation.amountCents,
            receivedOn: donation.receivedOn,
            targetLabel: purposeLabel({ ...donation, purposeText: null }),
          }
        : null,
    defaults,
    options,
  };
}

// ---------------------------------------------------------------------------------------------
// „Nachweise“
// ---------------------------------------------------------------------------------------------

export interface DonationEvidenceData {
  items: DonationEvidenceDto[];
  /** Anhängen und Entfernen (nur mit `finance:manage`, nicht bei stornierten Spenden). */
  canManage: boolean;
  maxUploadMb: number;
}

export async function getDonationEvidenceData(
  ctx: TenantContext,
  donationId: string,
): Promise<DonationEvidenceData> {
  assertFinance(ctx, "finance:read");
  const [donation, items] = await Promise.all([
    ctx.db.donation.findFirst({
      where: { id: donationId },
      select: {
        voidedAt: true,
        line: { select: { entry: { select: { reversedBy: { select: { id: true } } } } } },
      },
    }),
    listDonationEvidence(ctx, donationId),
  ]);
  if (!donation) throw notFound("Die Spende");
  const live = !donation.voidedAt && !donation.line?.entry.reversedBy;
  return {
    items,
    canManage: live && canFinance(ctx, "finance:manage"),
    maxUploadMb: env.MAX_UPLOAD_MB,
  };
}
