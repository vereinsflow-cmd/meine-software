import type { MemberStatus } from "@/generated/prisma/enums";
import { MEMBER_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { initials, tint } from "../display";

/**
 * Runder Kreis mit den Initialen, getönt in der Farbe der (ersten) Abteilung – ein Anker fürs Auge in der Mitgliederliste und
 * im Detailbereich. Ohne Farbe grau. Für Screenreader ausgeblendet: Der Name steht immer daneben.
 */
export function MemberAvatar({
  firstName,
  lastName,
  color,
  className,
}: {
  firstName: string;
  lastName: string;
  /** Geprüfte Abteilungsfarbe (`safeColor`) oder `null`. */
  color: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold tracking-wide text-foreground select-none",
        !color && "bg-muted text-muted-foreground ring-1 ring-foreground/10 ring-inset",
        className,
      )}
      style={
        color
          ? {
              backgroundColor: tint(color, 26),
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 45%, transparent)`,
            }
          : undefined
      }
    >
      {initials(firstName, lastName)}
    </span>
  );
}

const STATUS_DOT: Record<MemberStatus, string> = {
  ACTIVE: "bg-emerald-500",
  PASSIVE: "bg-slate-400 dark:bg-slate-500",
  HONORARY: "bg-blue-500 dark:bg-blue-400",
  // Wie das Abzeichen „Ausgetreten“ (Ton `ended`): nur umrandet – so unterscheidet es sich von „Passiv“.
  LEFT: "bg-transparent ring-[1.5px] ring-muted-foreground ring-inset",
  BLOCKED: "bg-red-500",
};

/** Status als Punkt mit Wort – die Bedeutung steht immer auch im Text (nicht nur in der Farbe). */
export function MemberStatusDot({
  status,
  className,
}: {
  status: MemberStatus;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      {MEMBER_STATUS_LABEL[status]}
    </span>
  );
}
