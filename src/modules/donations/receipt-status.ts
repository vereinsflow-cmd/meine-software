import type {
  DonationKind,
  DonationPaymentMethod,
  DonationReceiptWish,
  FinanceAccountKind,
} from "@/generated/prisma/enums";

/**
 * Status der Zuwendungsbestätigung je Spende – berechnet, nie gespeichert. Reine Funktionen (Browser und Server), einzeln
 * getestet (`tests/unit/donation-receipt-status.test.ts`).
 *
 * Regeln (Rechtsbericht, § 50 EStDV): Bar mit bekanntem Spender ist immer „nötig“; per Überweisung bis 300,00 € je Spende
 * „nicht nötig“ (vereinfachter Nachweis: Kontoauszug plus Beleg des Vereins, § 50 Abs. 4 EStDV); Sach- und Aufwandsspenden
 * immer „nötig“; der Wunsch des Spenders („möchte eine“ / „braucht keine“) übersteuert. Maßgeblich ist, wie der Spender
 * gezahlt hat (`paymentMethod`), nicht das Konto der Buchung – Bargeld, das der Kassenwart selbst zur Bank bringt, bleibt bar.
 */
export type DonationReceiptState =
  /** storniert – zählt nirgends mit */
  | "VOID"
  /** „erstellt am 24.09.“ (Teil 2: geltende Bestätigung) */
  | "ISSUED"
  /** „Spender fehlt“ – Spenden-Buchung ohne Zuordnung */
  | "NO_DONOR"
  /** „nicht möglich“ – Spendendose */
  | "ANONYMOUS"
  /** „gesperrt“ – früheres Mitglied bzw. gesperrter Spender */
  | "RESTRICTED"
  /** „nicht nötig“ – Spender verzichtet */
  | "NOT_WANTED"
  /** „nicht nötig“ – Überweisung bis 300 € (Kontoauszug + Beleg des Vereins) */
  | "SIMPLIFIED"
  /** „Adresse fehlt“ – nötig, aber so nicht ausstellbar */
  | "ADDRESS_MISSING"
  /** „nötig“ */
  | "NEEDED";

/** § 50 Abs. 4 Satz 1 Nr. 2 EStDV – je Zuwendung, nicht je Spender und Jahr. */
export const SIMPLIFIED_PROOF_LIMIT_CENTS = 30_000;

export interface DonationReceiptFacts {
  void: boolean;
  /** Tag der geltenden Bestätigung (Teil 2), sonst leer. */
  issuedOn: Date | null;
  hasDonor: boolean;
  anonymous: boolean;
  restricted: boolean;
  kind: DonationKind;
  paymentMethod: DonationPaymentMethod | null;
  amountCents: number;
  wish: DonationReceiptWish;
  addressComplete: boolean;
}

export function donationReceiptState(d: DonationReceiptFacts): DonationReceiptState {
  if (d.void) return "VOID";
  if (d.issuedOn) return "ISSUED";
  if (d.anonymous) return "ANONYMOUS";
  if (!d.hasDonor) return "NO_DONOR";
  if (d.restricted) return "RESTRICTED";
  if (d.wish === "NOT_WANTED") return "NOT_WANTED";
  if (
    d.kind === "MONEY" &&
    d.paymentMethod === "TRANSFER" &&
    d.amountCents <= SIMPLIFIED_PROOF_LIMIT_CENTS &&
    d.wish === "AUTO"
  )
    return "SIMPLIFIED";
  if (!d.addressComplete) return "ADDRESS_MISSING";
  return "NEEDED";
}

/** Eine Bestätigung muss noch erstellt werden (mit oder ohne Anschrift). */
export const isReceiptMissing = (state: DonationReceiptState): boolean =>
  state === "NEEDED" || state === "ADDRESS_MISSING";

/** Name, Straße, PLZ und Ort sind ausgefüllt (das Land darf fehlen – dann Deutschland). */
export function addressComplete(address: {
  name: string | null | undefined;
  street: string | null | undefined;
  postalCode: string | null | undefined;
  city: string | null | undefined;
}): boolean {
  return [address.name, address.street, address.postalCode, address.city].every(
    (value) => (value ?? "").trim() !== "",
  );
}

/** Vorgabe der Zahlart aus der Kontoart (Bank → Überweisung, Barkasse → bar, sonst „PayPal o. ä.“). */
export function paymentMethodForAccount(kind: FinanceAccountKind): DonationPaymentMethod {
  return kind === "BANK" ? "TRANSFER" : kind === "CASH" ? "CASH" : "OTHER";
}

/** Bestätigungsstand eines Spenders im Jahr (Karte „Bestätigungen“, Liste „Spender“). */
export type DonorReceiptState = "MISSING" | "ISSUED" | "NOT_NEEDED";

/**
 * „fehlt“, sobald eine Spende nötig ist (auch ohne Anschrift), sonst „erstellt“, wenn es eine geltende Bestätigung gibt,
 * sonst „nicht nötig“. Stornierte Spenden zählen nicht mit (sie gehören gar nicht erst in die Liste).
 */
export function donorReceiptState(states: readonly DonationReceiptState[]): DonorReceiptState {
  const counted = states.filter((state) => state !== "VOID");
  if (counted.some(isReceiptMissing)) return "MISSING";
  if (counted.includes("ISSUED")) return "ISSUED";
  return "NOT_NEEDED";
}

export interface DonorReceiptSummary {
  missing: number;
  issued: number;
  notNeeded: number;
  /**
   * Alle Spender im Topf „nicht nötig“ haben ausschließlich Überweisungen bis 300 € – nur dann darf die Legende
   * „nicht nötig, unter 300 €“ heißen (sonst liegen dort auch „braucht keine“ und gesperrte Spender).
   */
  notNeededAllSimplified: boolean;
}

/** Zählt die Spender je Stand. `byDonor`: die Status der (nicht stornierten) Spenden je Spender. */
export function summarizeDonorReceipts(
  byDonor: Iterable<readonly DonationReceiptState[]>,
): DonorReceiptSummary {
  const summary: DonorReceiptSummary = {
    missing: 0,
    issued: 0,
    notNeeded: 0,
    notNeededAllSimplified: true,
  };
  for (const states of byDonor) {
    const counted = states.filter((state) => state !== "VOID");
    if (counted.length === 0) continue;
    const state = donorReceiptState(counted);
    if (state === "MISSING") summary.missing += 1;
    else if (state === "ISSUED") summary.issued += 1;
    else {
      summary.notNeeded += 1;
      if (!counted.every((s) => s === "SIMPLIFIED")) summary.notNeededAllSimplified = false;
    }
  }
  return summary;
}
