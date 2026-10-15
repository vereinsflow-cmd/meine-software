"use client";

import Link from "next/link";
import {
  BookOpenIcon,
  EllipsisIcon,
  PencilIcon,
  Undo2Icon,
  UnlinkIcon,
  UserPlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { useMoreActions } from "@/components/shared/more-actions";
import { formatEuroFromCents } from "@/lib/dates";
import { unassignDonationAction, voidDonationAction } from "../actions";
import { DONATION_KIND_LABEL } from "../format";
import type { DonationRowActionData } from "../row-action-data";
import { AssignDonationDialog } from "./assign-donation-dialog";
import { EditDonationDialog } from "./donation-dialog";
import { ReasonDialog } from "./reason-dialog";

/** Ziel „Im Kassenbuch ansehen“: die Buchung über ihre Nummer gesucht. */
export const ledgerHref = (entryLabel: string) =>
  `/finanzen/kassenbuch?q=${encodeURIComponent(entryLabel)}`;

type RowDialog = "assign" | "edit" | "void" | "unassign";

/**
 * Menü „⋯“ einer Zeile in „Alle Spenden“: „Spender eintragen“ (Spenden-Buchung ohne Spender), „Ändern“, „Im Kassenbuch
 * ansehen“, „Kennzeichnung zurücknehmen“ (Geld – die Buchung bleibt und steht wieder als „Spender fehlt“ da) und
 * „Stornieren“ (Sach-/Aufwandsspende, mit Grund). Eine Geldspende storniert man über ihre Buchung im Kassenbuch.
 */
export function DonationRowActions({ row }: { row: DonationRowActionData }) {
  const { triggerRef, show, dialog } = useMoreActions<RowDialog>();
  const label = `${DONATION_KIND_LABEL[row.kind]} ${row.name ? `von ${row.name} ` : ""}über ${formatEuroFromCents(row.amountCents)}`;
  const canAssign = row.actions.assign && row.ledgerLineId !== null;
  const canEdit = row.actions.edit && row.donationId !== null;
  const canVoid = row.actions.void && row.donationId !== null;
  const canUnassign = row.actions.unassign && row.donationId !== null;
  if (!canAssign && !canEdit && !canVoid && !canUnassign && !row.entryLabel) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            aria-label={`Weitere Aktionen: ${label}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={16}
          className="min-w-56 [&>[data-slot=dropdown-menu-item]]:gap-2 [&>[data-slot=dropdown-menu-item]]:py-2"
        >
          {canAssign && (
            <DropdownMenuItem onSelect={() => show("assign")}>
              <UserPlusIcon /> Spender eintragen
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onSelect={() => show("edit")}>
              <PencilIcon /> Ändern
            </DropdownMenuItem>
          )}
          {row.entryLabel && (
            <DropdownMenuItem asChild>
              <Link href={ledgerHref(row.entryLabel)}>
                <BookOpenIcon /> Im Kassenbuch ansehen
              </Link>
            </DropdownMenuItem>
          )}
          {(canVoid || canUnassign) && (canAssign || canEdit || row.entryLabel) && (
            <DropdownMenuSeparator />
          )}
          {canUnassign && (
            <DropdownMenuItem onSelect={() => show("unassign")}>
              <UnlinkIcon /> Kennzeichnung zurücknehmen
            </DropdownMenuItem>
          )}
          {canVoid && (
            <DropdownMenuItem variant="destructive" onSelect={() => show("void")}>
              <Undo2Icon /> Stornieren
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canAssign && row.ledgerLineId && (
        <AssignDonationDialog ledgerLineId={row.ledgerLineId} {...dialog("assign")} />
      )}
      {canEdit && row.donationId && (
        <EditDonationDialog donationId={row.donationId} {...dialog("edit")} />
      )}
      {canVoid && (
        <ReasonDialog
          {...dialog("void")}
          title={`${DONATION_KIND_LABEL[row.kind]} stornieren?`}
          description={
            <>
              {label} zählt danach nirgends mehr mit. Sie bleibt mit dem Grund als „storniert“ in
              der Liste, gelöscht wird nichts.
            </>
          }
          placeholder="z. B. doppelt erfasst"
          confirmLabel="Stornieren"
          successMessage="Spende storniert."
          action={(reason) => voidDonationAction({ id: row.donationId, reason })}
        />
      )}
      {canUnassign && (
        <ConfirmAction
          {...dialog("unassign")}
          title="Kennzeichnung zurücknehmen?"
          description={`Die Buchung ${row.entryLabel ?? ""} bleibt im Kassenbuch. Sie steht danach wieder als Spende ohne Spender da – den Spender kannst du später neu eintragen.`}
          confirmLabel="Zurücknehmen"
          successMessage="Die Buchung ist nicht mehr als Spende zugeordnet."
          action={() => unassignDonationAction({ id: row.donationId })}
        />
      )}
    </>
  );
}
