"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ClockIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ParticipantStatus } from "@/generated/prisma/enums";
import { respondAction } from "../actions";

/** Zu- und Absage für die Veranstaltung. Zeigt den aktuellen Status und – falls nicht möglich – den Grund. */
export function RsvpPanel({
  eventId,
  myStatus,
  open,
  reason,
  full,
  waitlistEnabled,
}: {
  eventId: string;
  myStatus: ParticipantStatus | null;
  open: boolean;
  reason: string | null;
  full: boolean;
  waitlistEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function respond(response: "ACCEPTED" | "DECLINED") {
    startTransition(async () => {
      const result = await respondAction({ eventId, response });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        result.data.status === "ACCEPTED"
          ? "Du hast zugesagt."
          : result.data.status === "WAITLISTED"
            ? "Du stehst auf der Warteliste. Du rückst automatisch nach, wenn ein Platz frei wird."
            : "Du hast abgesagt.",
      );
      router.refresh();
    });
  }

  const statusText =
    myStatus === "ACCEPTED"
      ? "Du hast zugesagt."
      : myStatus === "WAITLISTED"
        ? "Du stehst auf der Warteliste."
        : myStatus === "DECLINED"
          ? "Du hast abgesagt."
          : "Du hast noch nicht geantwortet.";

  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-sm font-medium" role="status">
        {myStatus === "ACCEPTED" && (
          <CheckIcon className="size-4 text-emerald-600" aria-hidden="true" />
        )}
        {myStatus === "WAITLISTED" && (
          <ClockIcon className="size-4 text-amber-600" aria-hidden="true" />
        )}
        {myStatus === "DECLINED" && (
          <XIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        )}
        {statusText}
      </p>
      {!open && myStatus !== "ACCEPTED" && myStatus !== "WAITLISTED" ? (
        <p className="text-sm text-muted-foreground">{reason}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {myStatus !== "ACCEPTED" && myStatus !== "WAITLISTED" && open && (
            <Button onClick={() => respond("ACCEPTED")} disabled={pending}>
              <CheckIcon />{" "}
              {full ? (waitlistEnabled ? "Auf die Warteliste" : "Ausgebucht") : "Zusagen"}
            </Button>
          )}
          {myStatus !== "DECLINED" && (
            <Button variant="outline" onClick={() => respond("DECLINED")} disabled={pending}>
              <XIcon /> {myStatus === null ? "Absagen" : "Abmelden"}
            </Button>
          )}
          {myStatus === "DECLINED" && open && (
            <Button onClick={() => respond("ACCEPTED")} disabled={pending}>
              <CheckIcon /> Doch zusagen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
