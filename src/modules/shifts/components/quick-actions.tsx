"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOutAction, signUpAction } from "../actions";

/**
 * „Eintragen“ für eine offene Schicht in Listen (Dashboard, Helferplanung). Größe, Art und Breite wählt die Liste: auf dem
 * Dashboard ein gefüllter Knopf, in der Helferplanung ein schlichter Textknopf (`variant="ghost"` mit Markenfarbe).
 * `label` nennt die Schicht für Screenreader, wenn mehrere „Eintragen“ untereinander stehen.
 */
export function QuickSignUpButton({
  shiftId,
  eventId,
  size = "sm",
  variant,
  label,
  className,
}: {
  shiftId: string;
  eventId: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  label?: string;
  /** Breite und Ausrichtung im umgebenden Raster, z. B. `w-full sm:w-auto sm:justify-self-end`. */
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={pending}
      aria-label={label ? `In ${label} eintragen` : undefined}
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

/** „Austragen“ aus der eigenen Schicht. Standard: umrandet mit Symbol; `quiet` = schlichter Textknopf (Helferplanung). */
export function QuickSignOutButton({
  shiftId,
  eventId,
  label,
  quiet = false,
  className,
}: {
  shiftId: string;
  eventId: string;
  label: string;
  quiet?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={quiet ? "ghost" : "outline"}
      className={className}
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
      {!quiet && <UserMinusIcon />} Austragen
    </Button>
  );
}
