"use client";

import { useRef } from "react";
import { CheckIcon, DownloadIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMoreActions } from "@/components/shared/more-actions";
import { useMarkPaid } from "@/modules/finance/components/mark-paid-button";
import { DOCUMENT_LIST_HEADING_ID } from "../display";
import type { AccessLevel, DocumentFormInput } from "../schemas";
import { DeleteDocumentDialog, EditDocumentDialog } from "./document-controls";

/** Was das Menü eines Dokuments braucht – die Rechte hat der Server schon geprüft (`DocumentDto.can`, Finanzrechte). */
export interface DocumentRowActionData {
  id: string;
  /** Voller Name mit Endung („Satzung 2026.pdf“). */
  name: string;
  /** Startwerte für „Bearbeiten“ – `null`, wenn der Benutzer das Dokument nicht ändern darf. */
  edit: DocumentFormInput | null;
  /** Zugriffsstufen, die der Benutzer vergeben darf (für „Wer darf es sehen?“). */
  accessLevels: AccessLevel[];
  delete: boolean;
  /** Offene Rechnung, die der Benutzer als bezahlt markieren darf – sonst `null`. */
  payableInvoiceId: string | null;
}

/**
 * Menü „…“ einer Zeile der Dokumentenliste (seit 20.10.2026, „Ruhige Liste“): „Herunterladen“ für alle; „Als bezahlt
 * markieren“ nur am Handy (am Computer steht dafür der Knopf „Bezahlt“ in der Zeile); „Bearbeiten“ und – abgesetzt, rot –
 * „Löschen“ für alle, die das Dokument verwalten dürfen. Mit der Tastatur bedienbar (Radix: Pfeiltasten, Eingabe, Escape);
 * die Fenster liegen außerhalb des Menüs (`useMoreActions`), danach steht der Fokus wieder auf dem Menüknopf – nach dem
 * Löschen auf dem der Nachbarzeile (`focusTargetAfterDelete`).
 */
export function DocumentRowActions({
  document,
  className,
}: {
  document: DocumentRowActionData;
  className?: string;
}) {
  const { triggerRef, show, dialog } = useMoreActions<"edit" | "delete">();
  // Hier statt im Menüpunkt: Das Menü (und damit der Punkt) verschwindet gleich nach der Auswahl, das Speichern läuft weiter.
  const markPaid = useMarkPaid({ invoiceId: document.payableInvoiceId ?? "", name: document.name });
  const editDialog = dialog("edit");
  const deleteDialog = dialog("delete");
  // Gesetzt beim Löschen (Ziel gemerkt, solange die Zeile noch dasteht); genutzt, wenn sich die Rückfrage schließt.
  const deleted = useRef<{ focusTarget: HTMLElement | null } | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            aria-label={`Aktionen für ${document.name}`}
            data-row-menu=""
            className={className}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={16}
          className="w-auto min-w-52 [&>[data-slot=dropdown-menu-item]]:gap-2 [&>[data-slot=dropdown-menu-item]]:px-2 [&>[data-slot=dropdown-menu-item]]:py-2"
        >
          <DropdownMenuItem asChild>
            <a href={`/api/dokumente/${document.id}/download`}>
              <DownloadIcon /> Herunterladen
            </a>
          </DropdownMenuItem>
          {/* Nur am Handy – am Computer steht dafür „Bezahlt“ in der Zeile. Dieselbe Meldung mit „Rückgängig“. */}
          {document.payableInvoiceId && (
            <DropdownMenuItem
              className="md:hidden"
              disabled={markPaid.pending}
              onSelect={markPaid.mark}
            >
              <CheckIcon /> Als bezahlt markieren
            </DropdownMenuItem>
          )}
          {document.edit && (
            <DropdownMenuItem onSelect={() => show("edit")}>
              <PencilIcon /> Bearbeiten
            </DropdownMenuItem>
          )}
          {document.delete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => show("delete")}>
                <Trash2Icon /> Löschen
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {document.edit && (
        <EditDocumentDialog
          id={document.id}
          defaults={document.edit}
          accessLevels={document.accessLevels}
          {...editDialog}
        />
      )}
      {document.delete && (
        <DeleteDocumentDialog
          id={document.id}
          name={document.name}
          {...deleteDialog}
          onDeleted={() => {
            deleted.current = { focusTarget: focusTargetAfterDelete(triggerRef.current) };
          }}
          onCloseAutoFocus={(event) => {
            if (!deleted.current) return deleteDialog.onCloseAutoFocus(event);
            event.preventDefault();
            focusAfterDelete(deleted.current.focusTarget);
            deleted.current = null;
          }}
        />
      )}
    </>
  );
}

/**
 * Wohin der Fokus nach dem Löschen geht: Die Zeile verschwindet samt Menüknopf – ohne Ziel landete er am Seitenanfang
 * (WCAG 2.4.3). Deshalb zum Menüknopf der nächsten Zeile (der letzten: der vorigen); die Nachbarzeilen bleiben beim Neuladen
 * der Liste stehen. Gibt es keine, nimmt die Überschrift der Liste den Fokus auf (`focusAfterDelete`).
 */
function focusTargetAfterDelete(trigger: HTMLElement | null): HTMLElement | null {
  const row = trigger?.closest("li");
  const neighbour = row?.nextElementSibling ?? row?.previousElementSibling;
  return neighbour?.querySelector<HTMLElement>("[data-row-menu]") ?? null;
}

function focusAfterDelete(target: HTMLElement | null) {
  // Nicht mehr da (z. B. nach dem Sprung auf die vorige Seite, weil die Seite leer wurde): die Überschrift.
  (target?.isConnected ? target : document.getElementById(DOCUMENT_LIST_HEADING_ID))?.focus();
}
