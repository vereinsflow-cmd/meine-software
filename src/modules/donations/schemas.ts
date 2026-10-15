import { z } from "zod";
import { trimmedIdString, trimmedOptionalIdString } from "@/lib/id-schema";
import { COUNTRY_CODES } from "@/lib/countries";
import { parseCalendarDate } from "@/lib/dates";
import { calendarDateText } from "@/modules/finance/ledger-schemas";
import { amountText, checkAmount } from "@/modules/finance/schemas";

/**
 * Eingaben rund um Spenden (Browser und Server, ohne Server-Code). Beträge kommen als Text („350,00“), Tage als
 * „JJJJ-MM-TT“. Was ohne Datenbank prüfbar ist, steht hier – mit Feldfehlern in Alltagssprache; den Rest (Zukunft,
 * Beginn des Kassenbuchs, gesperrte Spender, Dubletten) prüft der Dienst, und die Datenbank sichert alles noch einmal.
 */

export const DONATION_KINDS = ["MONEY", "IN_KIND", "EXPENSE_WAIVER"] as const;
export const DONOR_MODES = ["MEMBER", "DONOR", "NEW", "ANONYMOUS"] as const;
export const DONOR_KINDS = ["PERSON", "COMPANY", "ORGANIZATION"] as const;
export const PAYMENT_METHODS = ["TRANSFER", "CASH", "OTHER"] as const;
export const RECEIPT_WISHES = ["AUTO", "WANTED", "NOT_WANTED"] as const;
export const IN_KIND_ORIGINS = ["BUSINESS", "PRIVATE", "UNKNOWN"] as const;
export const WAIVER_BASES = ["STATUTE", "BOARD_DECISION", "CONTRACT"] as const;
export const EXEMPTION_KINDS = ["EXEMPTION_NOTICE", "KST_ANNEX", "FINDING_60A"] as const;

export type DonorMode = (typeof DONOR_MODES)[number];

const id = trimmedIdString;
const optionalId = trimmedOptionalIdString;
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || parseCalendarDate(value) !== null,
    "Bitte gib ein gültiges Datum ein.",
  );
/** Leere Auswahl („“) gilt als „nicht gewählt“. */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.enum(values).optional(),
  );

type Issue = z.RefinementCtx;
const issue = (ctx: Issue, path: string, message: string) =>
  ctx.addIssue({ code: "custom", path: [path], message });

// ---------------------------------------------------------------------------------------------
// Von wem? (Mitglied, vorhandener Spender, neu eintragen, ohne Namen)
// ---------------------------------------------------------------------------------------------

const donorChoiceFields = {
  donorMode: z.enum(DONOR_MODES),
  memberId: optionalId,
  donorId: optionalId,
  /** Neuer Spender: Art, Name (wie auf der Bestätigung) und Anschrift. */
  donorKind: optionalEnum(DONOR_KINDS),
  donorName: optionalText(120, "Der Name"),
  street: optionalText(120, "Die Straße"),
  postalCode: optionalText(10, "Die Postleitzahl"),
  city: optionalText(80, "Der Ort"),
  /** ISO-Ländercode, leer = Deutschland. */
  country: optionalText(2, "Das Land"),
  /** Ohne Namen: „Spendendose Theke“. */
  anonymousLabel: optionalText(80, "Die Bezeichnung"),
};

interface DonorChoice {
  donorMode: DonorMode;
  memberId?: string;
  donorId?: string;
  donorName?: string;
  country?: string;
  anonymousLabel?: string;
}

function checkDonorChoice(data: DonorChoice, ctx: Issue, money: boolean): void {
  if (data.donorMode === "MEMBER" && !data.memberId)
    issue(ctx, "memberId", "Bitte wähle das Mitglied.");
  if (data.donorMode === "DONOR" && !data.donorId)
    issue(ctx, "donorId", "Bitte wähle den Spender aus der Liste.");
  if (data.donorMode === "NEW") {
    if ((data.donorName ?? "").length < 2)
      issue(
        ctx,
        "donorName",
        "Bitte gib den Namen ein – so, wie er auf der Bestätigung stehen soll.",
      );
  }
  if (data.country && !COUNTRY_CODES.has(data.country))
    issue(ctx, "country", "Bitte wähle ein Land aus der Liste.");
  if (data.donorMode === "ANONYMOUS") {
    if (!money) issue(ctx, "donorMode", "Ohne Namen geht nur bei Geld (z. B. Spendendose).");
    else if ((data.anonymousLabel ?? "").length < 3)
      issue(ctx, "anonymousLabel", "Bitte gib eine Bezeichnung ein, z. B. „Spendendose Theke“.");
  }
}

// ---------------------------------------------------------------------------------------------
// Wofür? (frei, Abteilung, Veranstaltung, anderer fester Zweck)
// ---------------------------------------------------------------------------------------------

/** „frei“ · „a:<Abteilung>“ · „v:<Veranstaltung>“ · „andere“ (nur Text) – wie im Buchungsfenster. */
const purposeFields = {
  target: z.string().trim().max(80).default("frei"),
  purposeText: optionalText(120, "Der Zweck"),
};

function checkPurpose(data: { target: string; purposeText?: string }, ctx: Issue): void {
  if (!/^(frei|andere|[av]:.+)$/.test(data.target))
    issue(ctx, "target", "Bitte wähle, wofür gespendet wurde.");
  if (data.target === "andere" && !data.purposeText)
    issue(ctx, "purposeText", "Bitte gib den Zweck ein (z. B. „Vereinsheim“).");
  if (data.purposeText !== undefined && data.purposeText.length < 2)
    issue(ctx, "purposeText", "Bitte gib den Zweck etwas genauer an.");
}

/** Ziel zerlegen: Abteilung/Veranstaltung und Text (bei „frei“ ohne Text). */
export function parseDonationPurpose(target: string, purposeText: string | undefined) {
  return {
    departmentId: target.startsWith("a:") ? target.slice(2) : null,
    eventId: target.startsWith("v:") ? target.slice(2) : null,
    purposeText: target === "frei" ? null : (purposeText ?? null),
  };
}

// ---------------------------------------------------------------------------------------------
// Spende erfassen bzw. ändern
// ---------------------------------------------------------------------------------------------

const inKindFields = {
  /** Genaue Bezeichnung mit Alter, Zustand, Kaufpreis (steht so auf der Bestätigung). */
  itemDescription: optionalText(500, "Die Beschreibung"),
  inKindOrigin: optionalEnum(IN_KIND_ORIGINS),
  valuationDocs: z.boolean().default(false),
};

const waiverFields = {
  activityText: optionalText(300, "Die Beschreibung"),
  waiverBasis: optionalEnum(WAIVER_BASES),
  claimGrantedOn: optionalDate,
  activityFrom: optionalDate,
  activityTo: optionalDate,
  claimDueOn: optionalDate,
  regularActivity: z.boolean().default(false),
  /**
   * Pflicht-Häkchen: „Der Anspruch stand vor der Tätigkeit fest (Satzung, Beschluss oder schriftlicher Vertrag), war nicht
   * an den Verzicht gebunden, und der Verein hätte zahlen können.“ Der Dienst vermerkt Zeitpunkt und Person an der Spende.
   */
  claimConfirmed: z.boolean().default(false),
};

/** Kalendertag + Monate (Monatsende bleibt Monatsende: 31.05. + 3 Monate = 31.08., 30.11. + 3 = 28./29.02.). */
export function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)),
  );
}

/**
 * Letzter Tag für den Verzicht auf einen Erstattungsanspruch (BMF 25.11.2014 Nr. 3): einmalige Ansprüche innerhalb von
 * drei Monaten nach Fälligkeit, regelmäßige Tätigkeit innerhalb eines Jahres.
 */
export function latestWaiverDay(claimDueOn: Date, regularActivity: boolean): Date {
  return addMonthsClamped(claimDueOn, regularActivity ? 12 : 3);
}

interface KindData {
  kind: (typeof DONATION_KINDS)[number];
  receivedOn?: string;
  itemDescription?: string;
  inKindOrigin?: string;
  activityText?: string;
  waiverBasis?: string;
  claimGrantedOn?: string;
  activityFrom?: string;
  activityTo?: string;
  claimDueOn?: string;
  regularActivity: boolean;
  claimConfirmed: boolean;
}

function checkKindFields(data: KindData, ctx: Issue): void {
  if (data.kind === "IN_KIND") {
    if ((data.itemDescription ?? "").length < 10)
      issue(
        ctx,
        "itemDescription",
        "Bitte beschreibe die Sachspende genau (mit Alter, Zustand, Kaufpreis).",
      );
    if (!data.inKindOrigin) issue(ctx, "inKindOrigin", "Bitte wähle, woher die Sachspende stammt.");
  }
  if (data.kind !== "EXPENSE_WAIVER") return;
  if ((data.activityText ?? "").length < 5)
    issue(ctx, "activityText", "Bitte beschreibe, wofür der Aufwand entstand.");
  if (!data.waiverBasis) issue(ctx, "waiverBasis", "Bitte wähle, worauf der Anspruch beruht.");
  const day = (value: string | undefined) => (value ? parseCalendarDate(value) : null);
  const granted = day(data.claimGrantedOn);
  const from = day(data.activityFrom);
  const to = day(data.activityTo);
  const due = day(data.claimDueOn);
  const waived = day(data.receivedOn);
  if (!data.claimGrantedOn)
    issue(ctx, "claimGrantedOn", "Bitte gib an, seit wann der Anspruch besteht.");
  if (!data.activityFrom) issue(ctx, "activityFrom", "Bitte gib den Beginn der Tätigkeit ein.");
  if (!data.activityTo) issue(ctx, "activityTo", "Bitte gib das Ende der Tätigkeit ein.");
  if (!data.claimDueOn) issue(ctx, "claimDueOn", "Bitte gib an, wann die Erstattung fällig war.");
  if (granted && from && granted > from)
    issue(ctx, "claimGrantedOn", "Der Anspruch muss vor Beginn der Tätigkeit eingeräumt sein.");
  if (from && to && from > to) issue(ctx, "activityTo", "Das Ende liegt vor dem Beginn.");
  if (to && due && to > due)
    issue(ctx, "claimDueOn", "Fällig wird die Erstattung frühestens am Ende der Tätigkeit.");
  if (to && waived && to > waived)
    issue(
      ctx,
      "receivedOn",
      "Verzichten lässt sich erst nach der Tätigkeit – auf einen Anspruch, der schon entstanden ist.",
    );
  if (due && waived && waived > latestWaiverDay(due, data.regularActivity))
    issue(
      ctx,
      "receivedOn",
      data.regularActivity
        ? "Der Verzicht kam zu spät (bei regelmäßigen Tätigkeiten innerhalb eines Jahres nach Fälligkeit) – so ist es keine abziehbare Spende."
        : "Der Verzicht kam zu spät (bei einmaligen Ansprüchen innerhalb von 3 Monaten nach Fälligkeit) – so ist es keine abziehbare Spende.",
    );
  if (!data.claimConfirmed)
    issue(
      ctx,
      "claimConfirmed",
      "Bitte bestätige, dass der Anspruch vorher feststand, nicht an den Verzicht gebunden war und der Verein hätte zahlen können.",
    );
}

const donationFields = {
  kind: z.enum(DONATION_KINDS),
  ...donorChoiceFields,
  amount: amountText,
  receivedOn: calendarDateText,
  /** Nur Geld: wie der Spender gezahlt hat – leer = Vorgabe aus dem Konto. */
  paymentMethod: optionalEnum(PAYMENT_METHODS),
  /** Nur Geld: das Konto der Buchung. */
  accountId: optionalId,
  ...purposeFields,
  receiptWish: z.enum(RECEIPT_WISHES).default("AUTO"),
  /** Nur Geld: Text im Kassenbuch (leer = „Spende“ bzw. „Spende für …“). */
  description: optionalText(200, "Der Text im Kassenbuch"),
  note: optionalText(500, "Die Notiz"),
  ...inKindFields,
  ...waiverFields,
};

/** „Spende erfassen“ (Geld mit Buchung, Sach- oder Aufwandsspende ohne Buchung). */
export const donationFormSchema = z.object(donationFields).superRefine((data, ctx) => {
  const money = data.kind === "MONEY";
  checkDonorChoice(data, ctx, money);
  checkAmount(data.amount, ctx, ["amount"]);
  checkPurpose(data, ctx);
  if (money && !data.accountId) issue(ctx, "accountId", "Bitte wähle ein Konto.");
  checkKindFields(data, ctx);
});
export type DonationFormInput = z.input<typeof donationFormSchema>;
export type DonationFormData = z.output<typeof donationFormSchema>;

/**
 * Spende ändern: Spender, Zweck-Text, Zahlart, Wunsch, Notiz; bei Sach- und Aufwandsspenden auch Abteilung/Veranstaltung,
 * Wert, Tag und ihre Angaben. Bei Geld kommen Betrag, Tag, Abteilung und Veranstaltung aus der Buchung (werden ignoriert).
 */
export const donationUpdateSchema = z
  .object({
    id,
    ...donationFields,
    amount: amountText,
    receivedOn: optionalDate,
  })
  .superRefine((data, ctx) => {
    const money = data.kind === "MONEY";
    checkDonorChoice(data, ctx, money);
    checkPurpose(data, ctx);
    if (!money) {
      checkAmount(data.amount, ctx, ["amount"]);
      if (!data.receivedOn) issue(ctx, "receivedOn", "Bitte gib ein gültiges Datum ein.");
      checkKindFields(data, ctx);
    }
  });
export type DonationUpdateInput = z.input<typeof donationUpdateSchema>;
export type DonationUpdateData = z.output<typeof donationUpdateSchema>;

/** „Als Spende kennzeichnen“: Spender, Text-Zweck, Zahlart, Wunsch (Betrag, Tag, Abteilung kommen aus der Buchung). */
export const assignDonationSchema = z
  .object({
    ledgerLineId: id,
    ...donorChoiceFields,
    purposeText: optionalText(120, "Der Zweck"),
    paymentMethod: optionalEnum(PAYMENT_METHODS),
    receiptWish: z.enum(RECEIPT_WISHES).default("AUTO"),
    note: optionalText(500, "Die Notiz"),
  })
  .superRefine((data, ctx) => {
    checkDonorChoice(data, ctx, true);
    if (data.purposeText !== undefined && data.purposeText.length < 2)
      issue(ctx, "purposeText", "Bitte gib den Zweck etwas genauer an.");
  });
export type AssignDonationInput = z.input<typeof assignDonationSchema>;
export type AssignDonationData = z.output<typeof assignDonationSchema>;

const reason = z
  .string()
  .trim()
  .min(3, "Bitte gib kurz den Grund an.")
  .max(200, "Bitte fasse dich kürzer (höchstens 200 Zeichen).");

/** Sach- oder Aufwandsspende stornieren (Geld: die Buchung stornieren). */
export const voidDonationSchema = z.object({ id, reason });
/** Geld: „Kennzeichnung zurücknehmen“ – die Buchung bleibt („Spender fehlt“). */
export const unassignDonationSchema = z.object({ id });

// ---------------------------------------------------------------------------------------------
// Spender (andere Personen, Firmen, Stiftungen) – Mitglieder ändert man beim Mitglied
// ---------------------------------------------------------------------------------------------

const donorFields = {
  kind: z.enum(DONOR_KINDS),
  name: z
    .string()
    .trim()
    .min(2, "Bitte gib den Namen ein – so, wie er auf der Bestätigung stehen soll.")
    .max(120, "Der Name ist zu lang (höchstens 120 Zeichen)."),
  street: optionalText(120, "Die Straße"),
  postalCode: optionalText(10, "Die Postleitzahl"),
  city: optionalText(80, "Der Ort"),
  country: optionalText(2, "Das Land"),
};

function checkCountry(data: { country?: string }, ctx: Issue) {
  if (data.country && !COUNTRY_CODES.has(data.country))
    issue(ctx, "country", "Bitte wähle ein Land aus der Liste.");
}

export const donorSchema = z.object(donorFields).superRefine(checkCountry);
export type DonorInput = z.input<typeof donorSchema>;
export const donorUpdateSchema = z.object({ id, ...donorFields }).superRefine(checkCountry);
export type DonorUpdateInput = z.input<typeof donorUpdateSchema>;
/** Sperren (Art. 18 DSGVO): keine neuen Spenden und Bestätigungen, die Aufzeichnungen bleiben. */
export const restrictDonorSchema = z.object({ id, reason });
export const donorIdSchema = z.object({ id });

// ---------------------------------------------------------------------------------------------
// Finanzamt-Angaben (Einstellungen → Finanzamt)
// ---------------------------------------------------------------------------------------------

export const TAX_NUMBER_PATTERN = /^[0-9][0-9 /.-]*[0-9]$/;

export const taxSettingsSchema = z
  .object({
    taxOffice: optionalText(80, "Das Finanzamt"),
    taxNumber: optionalText(30, "Die Steuernummer"),
    exemptionKind: optionalEnum(EXEMPTION_KINDS),
    exemptionDate: optionalDate,
    /** „2022“ (Text aus dem Formular). */
    exemptionLastYear: optionalText(4, "Das Jahr"),
    taxPurposes: optionalText(300, "Die Zwecke"),
    taxPurposesStatute: optionalText(300, "Die Zwecke laut Satzung"),
    membershipFeesDeductible: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.taxOffice !== undefined && data.taxOffice.length < 2)
      issue(ctx, "taxOffice", "Bitte gib den Ort des Finanzamts ein (z. B. „Musterstadt“).");
    if (
      data.taxNumber !== undefined &&
      (data.taxNumber.length < 5 || !TAX_NUMBER_PATTERN.test(data.taxNumber))
    )
      issue(
        ctx,
        "taxNumber",
        "Bitte gib die Steuernummer wie im Bescheid ein (z. B. 12/345/67890).",
      );
    if (data.exemptionKind && !data.exemptionDate)
      issue(ctx, "exemptionDate", "Bitte gib das Datum des Bescheids ein.");
    if (!data.exemptionKind && data.exemptionDate)
      issue(ctx, "exemptionKind", "Bitte wähle die Art des Bescheids.");
    const lastYear = data.exemptionLastYear;
    if (lastYear !== undefined) {
      const year = Number(lastYear);
      if (!/^\d{4}$/.test(lastYear) || year < 1990 || year > 2100)
        issue(ctx, "exemptionLastYear", "Bitte gib das Jahr ein (z. B. 2022).");
      else if (data.exemptionKind === "FINDING_60A")
        issue(
          ctx,
          "exemptionLastYear",
          "Bei einer Feststellung nach § 60a AO gibt es keinen Veranlagungszeitraum.",
        );
      else {
        const date = data.exemptionDate ? parseCalendarDate(data.exemptionDate) : null;
        if (date && year > date.getUTCFullYear())
          issue(
            ctx,
            "exemptionLastYear",
            "Der letzte Veranlagungszeitraum liegt vor dem Bescheid.",
          );
      }
    }
    if (data.taxPurposes !== undefined && data.taxPurposes.length < 3)
      issue(ctx, "taxPurposes", "Bitte gib die Zwecke wie im Bescheid ein (z. B. „des Sports“).");
    if (data.exemptionKind === "FINDING_60A") {
      if ((data.taxPurposesStatute ?? "").length < 3)
        issue(
          ctx,
          "taxPurposesStatute",
          "Bitte gib die Zwecke laut Satzung ein (z. B. „den Sport“).",
        );
    }
  });
export type TaxSettingsInput = z.input<typeof taxSettingsSchema>;
export type TaxSettingsData = z.output<typeof taxSettingsSchema>;

// ---------------------------------------------------------------------------------------------
// Nachweise (Sach- und Aufwandsspenden)
// ---------------------------------------------------------------------------------------------

/** Vermerk statt Datei („Fahrtenbuch liegt beim Kassenwart“). */
export const donationNoteSchema = z.object({
  donationId: id,
  note: z
    .string()
    .trim()
    .min(3, "Bitte beschreibe den Nachweis kurz.")
    .max(500, "Bitte fasse dich kürzer (höchstens 500 Zeichen)."),
});
export const donationAttachmentIdSchema = z.object({ id });

// ---------------------------------------------------------------------------------------------
// Filter der Liste „Alle Spenden“ (?bestaetigung=…)
// ---------------------------------------------------------------------------------------------

export const DONATION_STATUS_FILTERS = [
  "alle",
  "noetig",
  "adresse",
  "erstellt",
  "nicht-noetig",
  "ohne-namen",
  "ohne-spender",
  "storniert",
] as const;
export type DonationStatusFilter = (typeof DONATION_STATUS_FILTERS)[number];

export const DONATION_STATUS_FILTER_LABEL: Record<DonationStatusFilter, string> = {
  alle: "Alle",
  noetig: "Nötig",
  adresse: "Adresse fehlt",
  erstellt: "Erstellt",
  "nicht-noetig": "Nicht nötig",
  "ohne-namen": "Ohne Namen",
  "ohne-spender": "Spender fehlt",
  storniert: "Storniert",
};

export function parseDonationStatusFilter(value: string | null | undefined): DonationStatusFilter {
  return (DONATION_STATUS_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as DonationStatusFilter)
    : "alle";
}
