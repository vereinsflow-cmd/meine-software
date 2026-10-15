import type { DonationKind } from "@/generated/prisma/enums";
import type { DonationRowDto } from "./summary";

/** Was das Menü einer Zeile braucht (nur das – nicht die ganze Zeile in den Browser). */
export interface DonationRowActionData {
  key: string;
  donationId: string | null;
  ledgerLineId: string | null;
  kind: DonationKind;
  name: string;
  amountCents: number;
  entryLabel: string | null;
  actions: DonationRowDto["actions"];
}

/** Aus der ganzen Zeile (Server) nur das, was das Menü „⋯“ (Client) braucht. */
export function rowActionData(row: DonationRowDto): DonationRowActionData {
  return {
    key: row.key,
    donationId: row.donationId,
    ledgerLineId: row.ledgerLineId,
    kind: row.kind,
    name: row.name,
    amountCents: row.amountCents,
    entryLabel: row.entry?.label ?? null,
    actions: row.actions,
  };
}
