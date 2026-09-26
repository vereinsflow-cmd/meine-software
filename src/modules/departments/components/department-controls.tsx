"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PowerIcon, PowerOffIcon, Trash2Icon, UserMinusIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { MoreActions, useMoreActions } from "@/components/shared/more-actions";
import {
  addDepartmentMemberAction,
  addGroupMemberAction,
  deleteDepartmentAction,
  deleteGroupAction,
  removeGroupMemberAction,
  setDepartmentActiveAction,
  setLeaderAction,
} from "../actions";

/**
 * Seltene Aktionen der Abteilungsseite im Menü „Weitere Aktionen“: Deaktivieren bzw. Aktivieren und – abgesetzt und
 * rot – Löschen. Die Rückfragen liegen außerhalb des Menüs (siehe `useMoreActions`).
 */
export function DepartmentActions({
  id,
  name,
  isActive,
  canClubWide,
}: {
  id: string;
  name: string;
  isActive: boolean;
  canClubWide: boolean;
}) {
  const router = useRouter();
  const more = useMoreActions<"active" | "delete">();
  if (!canClubWide) return null;
  return (
    <>
      <MoreActions triggerRef={more.triggerRef}>
        <DropdownMenuItem onSelect={() => more.show("active")}>
          {isActive ? <PowerOffIcon /> : <PowerIcon />} {isActive ? "Deaktivieren" : "Aktivieren"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => more.show("delete")}>
          <Trash2Icon /> Löschen
        </DropdownMenuItem>
      </MoreActions>
      <ConfirmAction
        {...more.dialog("active")}
        title={isActive ? "Abteilung deaktivieren?" : "Abteilung aktivieren?"}
        description={
          isActive
            ? `${name} wird nicht mehr zur Auswahl angeboten. Mitglieder, Veranstaltungen und Verlauf bleiben erhalten.`
            : `${name} steht wieder zur Auswahl.`
        }
        confirmLabel={isActive ? "Deaktivieren" : "Aktivieren"}
        action={() => setDepartmentActiveAction({ id, isActive: !isActive })}
        successMessage={isActive ? "Abteilung deaktiviert." : "Abteilung aktiviert."}
        onSuccess={() => router.refresh()}
      />
      <ConfirmAction
        destructive
        {...more.dialog("delete")}
        title="Abteilung löschen?"
        description={`${name} wird endgültig gelöscht. Das geht nur, wenn ihr keine Mitglieder, Gruppen oder Veranstaltungen mehr zugeordnet sind – sonst deaktiviere sie besser.`}
        confirmLabel="Endgültig löschen"
        action={() => deleteDepartmentAction({ id })}
        successMessage="Abteilung gelöscht."
        onSuccess={() => router.push("/abteilungen")}
      />
    </>
  );
}

export function LeaderToggle({
  departmentId,
  memberId,
  isLeader,
  name,
}: {
  departmentId: string;
  memberId: string;
  isLeader: boolean;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={isLeader ? `${name} als Leitung entfernen` : `${name} zur Leitung machen`}
      onClick={() =>
        startTransition(async () => {
          const result = await setLeaderAction({ departmentId, memberId, isLeader: !isLeader });
          if (!result.ok) toast.error(result.error.message);
          else {
            toast.success(isLeader ? "Leitung entfernt." : "Leitung festgelegt.");
            router.refresh();
          }
        })
      }
    >
      {isLeader ? "Leitung entfernen" : "Zur Leitung machen"}
    </Button>
  );
}

export function AddDepartmentMemberControls({
  departmentId,
  candidates,
}: {
  departmentId: string;
  candidates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");

  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="Mitglied zur Abteilung hinzufügen"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="h-8 w-auto max-w-56"
      >
        <option value="">Mitglied auswählen …</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <Button
        size="sm"
        variant="outline"
        disabled={!selected || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addDepartmentMemberAction({ departmentId, memberId: selected });
            if (!result.ok) toast.error(result.error.message);
            else {
              setSelected("");
              toast.success("Mitglied hinzugefügt.");
              router.refresh();
            }
          })
        }
      >
        <UserPlusIcon /> Mitglied hinzufügen
      </Button>
    </div>
  );
}

export function GroupControls({
  groupId,
  departmentId,
  name,
  candidates,
  memberIds,
}: {
  groupId: string;
  departmentId: string;
  name: string;
  candidates: { id: string; name: string }[];
  memberIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const available = candidates.filter((c) => !memberIds.includes(c.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {available.length > 0 && (
        <>
          <NativeSelect
            aria-label={`Mitglied zur Gruppe ${name} hinzufügen`}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-8 w-auto max-w-56"
          >
            <option value="">Mitglied hinzufügen …</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await addGroupMemberAction({
                  groupId,
                  memberId: selected,
                  departmentId,
                });
                if (!result.ok) toast.error(result.error.message);
                else {
                  setSelected("");
                  router.refresh();
                }
              })
            }
          >
            <UserPlusIcon /> Hinzufügen
          </Button>
        </>
      )}
      <ConfirmAction
        destructive
        trigger={
          <Button size="sm" variant="ghost" className="text-destructive">
            <Trash2Icon /> Gruppe löschen
          </Button>
        }
        title="Gruppe löschen?"
        description={`Die Gruppe „${name}“ wird gelöscht. Die Mitglieder selbst bleiben erhalten.`}
        confirmLabel="Löschen"
        action={() => deleteGroupAction({ id: groupId, departmentId })}
        successMessage="Gruppe gelöscht."
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

export function RemoveGroupMemberButton({
  groupId,
  departmentId,
  memberId,
  name,
}: {
  groupId: string;
  departmentId: string;
  memberId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      disabled={pending}
      aria-label={`${name} aus der Gruppe entfernen`}
      onClick={() =>
        startTransition(async () => {
          const result = await removeGroupMemberAction({ groupId, memberId, departmentId });
          if (!result.ok) toast.error(result.error.message);
          else router.refresh();
        })
      }
    >
      <UserMinusIcon />
    </Button>
  );
}
