"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOutAction, signUpAction } from "../actions";

export function QuickSignUpButton({ shiftId, eventId }: { shiftId: string; eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await signUpAction({ shiftId, eventId });
          if (!result.ok) toast.error(result.error.message);
          else toast.success("Du bist eingetragen.");
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Eintragen"}
    </Button>
  );
}

export function QuickSignOutButton({
  shiftId,
  eventId,
  label,
}: {
  shiftId: string;
  eventId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      aria-label={`Aus ${label} austragen`}
      onClick={() =>
        startTransition(async () => {
          const result = await signOutAction({ shiftId, eventId });
          if (!result.ok) toast.error(result.error.message);
          else toast.success("Du hast dich ausgetragen.");
          router.refresh();
        })
      }
    >
      <UserMinusIcon /> Austragen
    </Button>
  );
}
