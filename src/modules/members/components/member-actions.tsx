"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import {
  archiveMemberAction,
  deleteMemberAction,
  restoreFromTrashAction,
  restoreMemberAction,
} from "../actions";

/** Schaltflächen im Kopf der Mitgliederseite. Der Server prüft jede Aktion erneut – hier wird nur ausgeblendet. */
export function MemberActions({
  id,
  name,
  archived,
  deleted,
  can,
}: {
  id: string;
  name: string;
  archived: boolean;
  deleted: boolean;
  can: { update: boolean; archive: boolean; delete: boolean };
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <>
      {can.update && !deleted && (
        <Button asChild>
          <Link href={`/mitglieder/${id}/bearbeiten`}>
            <PencilIcon /> Bearbeiten
          </Link>
        </Button>
      )}

      {can.archive && !archived && !deleted && (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <ArchiveIcon /> Archivieren
            </Button>
          }
          title="Mitglied archivieren?"
          description={`${name} verschwindet aus den normalen Listen, ein verknüpftes Benutzerkonto wird gesperrt. Die Daten bleiben erhalten und das Mitglied kann jederzeit wiederhergestellt werden.`}
          confirmLabel="Archivieren"
          action={() => archiveMemberAction({ id })}
          successMessage="Mitglied archiviert."
          onSuccess={refresh}
        />
      )}

      {can.archive && archived && !deleted && (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <ArchiveRestoreIcon /> Wiederherstellen
            </Button>
          }
          title="Mitglied wiederherstellen?"
          description={`${name} erscheint wieder in den normalen Listen. Ein gesperrtes Benutzerkonto muss unter „Benutzer und Rollen“ bei Bedarf erneut freigegeben werden.`}
          confirmLabel="Wiederherstellen"
          action={() => restoreMemberAction({ id })}
          successMessage="Mitglied wiederhergestellt."
          onSuccess={refresh}
        />
      )}

      {can.delete && archived && !deleted && (
        <ConfirmAction
          destructive
          trigger={
            <Button variant="destructive">
              <Trash2Icon /> Löschen
            </Button>
          }
          title="Mitglied löschen?"
          description={`${name} wird in den Papierkorb verschoben und nach Ablauf der Aufbewahrungsfrist endgültig entfernt. Bis dahin lässt sich das Löschen rückgängig machen.`}
          confirmLabel="In den Papierkorb"
          action={() => deleteMemberAction({ id })}
          successMessage="Mitglied in den Papierkorb verschoben."
          onSuccess={() => router.push("/mitglieder")}
        />
      )}

      {can.delete && deleted && (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <Undo2Icon /> Aus dem Papierkorb holen
            </Button>
          }
          title="Aus dem Papierkorb holen?"
          description={`${name} wird wieder in das Archiv verschoben.`}
          confirmLabel="Wiederherstellen"
          action={() => restoreFromTrashAction({ id })}
          successMessage="Mitglied wiederhergestellt."
          onSuccess={refresh}
        />
      )}
    </>
  );
}
