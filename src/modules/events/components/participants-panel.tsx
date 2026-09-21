"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateTime } from "@/lib/dates";
import { PARTICIPANT_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ParticipantStatus } from "@/generated/prisma/enums";
import { removeParticipantAction, setParticipantAction } from "../actions";

interface Row {
  memberId: string;
  name: string;
  status: ParticipantStatus;
  note: string | null;
  respondedAt: string;
}

const STATUSES: ParticipantStatus[] = ["ACCEPTED", "WAITLISTED", "DECLINED"];

/** Teilnehmerverwaltung für Veranstalter: Status ändern, entfernen, Mitglieder hinzufügen. */
export function ParticipantsPanel({
  eventId,
  rows,
  candidates,
  editable,
}: {
  eventId: string;
  rows: Row[];
  candidates: { id: string; name: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error?.message ?? "Fehler");
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      {editable && candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="Mitglied hinzufügen"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-auto min-w-56"
          >
            <option value="">Mitglied hinzufügen …</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            disabled={!selected || pending}
            onClick={() => {
              const memberId = selected;
              setSelected("");
              run(() => setParticipantAction({ eventId, memberId, status: "ACCEPTED" }));
            }}
          >
            <UserPlusIcon /> Anmelden
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Antworten.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li
              key={row.memberId}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "font-medium",
                    row.status === "DECLINED" && "text-muted-foreground line-through",
                  )}
                >
                  {row.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(row.respondedAt)} Uhr{row.note ? ` · „${row.note}“` : ""}
                </p>
              </div>
              {editable ? (
                <div className="flex items-center gap-1">
                  <NativeSelect
                    aria-label={`Status von ${row.name}`}
                    value={row.status}
                    disabled={pending}
                    className="h-8 w-auto"
                    onChange={(e) =>
                      run(() =>
                        setParticipantAction({
                          eventId,
                          memberId: row.memberId,
                          status: e.target.value,
                        }),
                      )
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {PARTICIPANT_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={pending}
                    aria-label={`${row.name} entfernen`}
                    onClick={() =>
                      run(() =>
                        removeParticipantAction({
                          eventId,
                          memberId: row.memberId,
                          status: "DECLINED",
                        }),
                      )
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  {PARTICIPANT_STATUS_LABEL[row.status]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
