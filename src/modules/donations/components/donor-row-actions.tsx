"use client";

import Link from "next/link";
import { BanIcon, EllipsisIcon, ListIcon, PencilIcon, Trash2Icon } from "lucide-react";
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
import { deleteDonorAction, restrictDonorAction } from "../actions";
import { DonorDialog, type DonorDialogDonor } from "./donor-dialogs";
import { ReasonDialog } from "./reason-dialog";

/** Was das Menü eines Spenders braucht (Art und Anschrift für „Anschrift ändern“). */
export interface DonorRowActionData extends DonorDialogDonor {
  /** Mitglied: Anschrift ändert man beim Mitglied. */
  memberEditHref: string | null;
  /** Spenden des Spenders in „Alle Spenden“ (im gewählten Jahr). */
  donationsHref: string | null;
  actions: { edit: boolean; restrict: boolean; delete: boolean };
}

/**
 * Menü „⋯“ eines Spenders: „Anschrift ändern“ (andere Spender, nicht gesperrt) bzw. „Im Mitglied ändern“ (Mitglieder),
 * „Spenden ansehen“, „Sperren“ (Art. 18 DSGVO, mit Grund – keine neuen Spenden und Bestätigungen, die Aufzeichnungen
 * bleiben) und „Löschen“ (nur ohne Spenden). `openEdit` öffnet „Anschrift ändern“ gleich (`?bearbeiten=<id>`).
 */
export function DonorRowActions({
  donor,
  openEdit = false,
}: {
  donor: DonorRowActionData;
  openEdit?: boolean;
}) {
  const { edit, restrict, delete: remove } = donor.actions;
  const { triggerRef, show, dialog } = useMoreActions<"edit" | "restrict" | "delete">(
    openEdit && edit ? "edit" : null,
  );
  if (!edit && !donor.memberEditHref && !donor.donationsHref && !restrict && !remove) return null;
  const editDialog = dialog("edit");
  const restrictDialog = dialog("restrict");
  const deleteDialog = dialog("delete");
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            aria-label={`Weitere Aktionen für ${donor.name}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={16}
          className="min-w-52 [&>[data-slot=dropdown-menu-item]]:gap-2 [&>[data-slot=dropdown-menu-item]]:py-2"
        >
          {edit && (
            <DropdownMenuItem onSelect={() => show("edit")}>
              <PencilIcon /> Anschrift ändern
            </DropdownMenuItem>
          )}
          {donor.memberEditHref && (
            <DropdownMenuItem asChild>
              <Link href={donor.memberEditHref}>
                <PencilIcon /> Im Mitglied ändern
              </Link>
            </DropdownMenuItem>
          )}
          {donor.donationsHref && (
            <DropdownMenuItem asChild>
              <Link href={donor.donationsHref}>
                <ListIcon /> Spenden ansehen
              </Link>
            </DropdownMenuItem>
          )}
          {(restrict || remove) && (edit || donor.memberEditHref || donor.donationsHref) && (
            <DropdownMenuSeparator />
          )}
          {restrict && (
            <DropdownMenuItem onSelect={() => show("restrict")}>
              <BanIcon /> Sperren
            </DropdownMenuItem>
          )}
          {remove && (
            <DropdownMenuItem variant="destructive" onSelect={() => show("delete")}>
              <Trash2Icon /> Löschen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {edit && <DonorDialog donor={donor} {...editDialog} />}
      {restrict && (
        <ReasonDialog
          {...restrictDialog}
          title={`${donor.name} sperren?`}
          description="Danach lassen sich für diesen Spender keine neuen Spenden erfassen und keine Bestätigungen ausstellen. Die bisherigen Spenden bleiben aufbewahrt (10 Jahre)."
          placeholder="z. B. Wunsch des Spenders"
          confirmLabel="Sperren"
          successMessage="Spender gesperrt."
          action={(reason) => restrictDonorAction({ id: donor.id, reason })}
        />
      )}
      {remove && (
        <ConfirmAction
          {...deleteDialog}
          title={`${donor.name} löschen?`}
          description="Der Spender hat keine Spenden – er wird mit Name und Anschrift endgültig entfernt."
          confirmLabel="Löschen"
          destructive
          successMessage="Spender gelöscht."
          action={() => deleteDonorAction({ id: donor.id })}
        />
      )}
    </>
  );
}
