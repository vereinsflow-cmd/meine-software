"use client";

import { useRouter } from "next/navigation";
import { ChevronDownIcon, TrashIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { useMoreActions } from "@/components/shared/more-actions";
import { deleteMessageAction } from "../actions";

/**
 * Kleiner Pfeil oben in der Blase (wie bei WhatsApp) – nur, wo man die Nachricht verwalten darf. „Zurückrufen“ blendet sie
 * bei allen Empfängern aus; bereits verschickte E-Mails bleiben.
 */
export function BubbleActions({ id, subject }: { id: string; subject: string }) {
  const router = useRouter();
  const { triggerRef, show, dialog } = useMoreActions<"recall">();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Aktionen für „${subject}“`}
            className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full text-current/70 transition-colors outline-none hover:bg-black/5 hover:text-current focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
          >
            <ChevronDownIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={16} className="min-w-44">
          <DropdownMenuItem
            variant="destructive"
            className="py-1.5"
            onSelect={() => show("recall")}
          >
            <TrashIcon /> Zurückrufen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmAction
        destructive
        {...dialog("recall")}
        title="Nachricht zurückrufen?"
        description={`„${subject}“ verschwindet bei allen Empfängern aus dem Posteingang. Bereits verschickte E-Mails lassen sich nicht zurückholen.`}
        confirmLabel="Zurückrufen"
        action={() => deleteMessageAction({ id })}
        successMessage="Nachricht zurückgerufen."
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
