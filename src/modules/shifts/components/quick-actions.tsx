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
 * `label` nennt die Schicht für Screenreader, wenn mehrere „Eintragen“ untereinander stehen. `focusAfter` (Id eines Elements)
 * bekommt danach den Fokus – der Knopf selbst ist dann meist verschwunden (aus „Eintragen“ wird „Austragen“).
 */
export function QuickSignUpButton({
  shiftId,
  eventId,
  size = "sm",
  variant,
  label,
  focusAfter,
  className,
}: {
  shiftId: string;
  eventId: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  label?: string;
  focusAfter?: string;
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
      aria-disabled={pending}
      aria-label={label ? `In ${label} eintragen` : undefined}
      onClick={() =>
        !pending &&
        startTransition(async () => {
          const result = await signUpAction({ shiftId, eventId });
          if (!result.ok) toast.error(result.error.message);
          else toast.success("Du bist eingetragen.");
          if (result.ok) focusTarget(focusAfter);
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Eintragen"}
    </Button>
  );
}

/**
 * Während der Aktion sind die Knöpfe nur `aria-disabled` (nicht `disabled`): So behalten sie den Fokus, falls etwas schiefgeht.
 * Nach Erfolg springt er zu `targetId` – der Knopf selbst verschwindet dann.
 */
function focusTarget(targetId: string | undefined) {
  if (targetId) document.getElementById(targetId)?.focus();
}

/**
 * „Austragen“ aus der eigenen Schicht. Standard: umrandet mit Symbol; `quiet` = schlichter Textknopf (Helferplanung).
 * `focusAfter` wie bei `QuickSignUpButton`.
 */
export function QuickSignOutButton({
  shiftId,
  eventId,
  label,
  quiet = false,
  focusAfter,
  className,
}: {
  shiftId: string;
  eventId: string;
  label: string;
  quiet?: boolean;
  focusAfter?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={quiet ? "ghost" : "outline"}
      className={className}
      aria-disabled={pending}
      aria-label={`Aus ${label} austragen`}
      onClick={() =>
        !pending &&
        startTransition(async () => {
          const result = await signOutAction({ shiftId, eventId });
          if (!result.ok) toast.error(result.error.message);
          else toast.success("Du hast dich ausgetragen.");
          if (result.ok) focusTarget(focusAfter);
          router.refresh();
        })
      }
    >
      {!quiet && <UserMinusIcon />} Austragen
    </Button>
  );
}
