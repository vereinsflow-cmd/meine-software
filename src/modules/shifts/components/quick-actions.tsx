"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOutAction, signUpAction } from "../actions";

/**
 * „Eintragen“ für eine offene Schicht in Listen (Dashboard, Helferplanung). Größe und Breite wählt die Liste: In offenen
 * Schichten steht der Knopf wie auf der Helferplan-Seite unter dem Besetzungsbalken – normale Höhe, am Handy so breit
 * wie die Karte (`size="default"`, `className="w-full sm:w-auto …"`).
 */
export function QuickSignUpButton({
  shiftId,
  eventId,
  size = "sm",
  className,
}: {
  shiftId: string;
  eventId: string;
  size?: React.ComponentProps<typeof Button>["size"];
  /** Breite und Ausrichtung im umgebenden Raster, z. B. `w-full sm:w-auto sm:justify-self-end`. */
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      className={className}
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
