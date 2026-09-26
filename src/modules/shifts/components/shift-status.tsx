import {
  BanIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ContrastIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { ToneBadge, type Tone } from "@/components/shared/status-badge";
import { FILL_LABEL, URGENCY_LABEL, type ShiftHealth } from "@/lib/shift-health";
import { cn } from "@/lib/utils";

/**
 * Visuelle Darstellung der Besetzung: Fortschrittsbalken, freie Plätze und Warnhinweis. Farbe UND Text/Symbol –
 * die Bedeutung ist auch ohne Farbwahrnehmung und im Schwarzweiß-Ausdruck erkennbar.
 */
const fillTone: Record<ShiftHealth["fill"], Tone> = {
  CANCELLED: "neutral",
  EMPTY: "danger",
  PARTIAL: "warning",
  FULL: "success",
};

/**
 * Symbol je Stufe, als Reihe lesbar: leerer (gestrichelter) Kreis → halb gefüllter Kreis → Kreis mit Haken. Abgesagte
 * Schichten tragen das Verbotszeichen wie die Aktion „Absagen“ – ein leerer Kreis sähe aus wie „unbesetzt“.
 */
const fillIcon: Record<ShiftHealth["fill"], LucideIcon> = {
  CANCELLED: BanIcon,
  EMPTY: CircleDashedIcon,
  PARTIAL: ContrastIcon,
  FULL: CircleCheckIcon,
};

export function ShiftFillBadge({ health }: { health: ShiftHealth }) {
  const Icon = fillIcon[health.fill];
  return (
    <ToneBadge tone={fillTone[health.fill]} className="gap-1">
      <Icon className="size-3" aria-hidden="true" />
      {FILL_LABEL[health.fill]}
    </ToneBadge>
  );
}

export function UrgencyBadge({ health }: { health: ShiftHealth }) {
  if (health.urgency === "NONE") return null;
  return (
    <ToneBadge tone={health.urgency === "SOON" ? "warning" : "danger"} className="gap-1">
      <TriangleAlertIcon className="size-3" aria-hidden="true" />
      {URGENCY_LABEL[health.urgency]}
    </ToneBadge>
  );
}

export function FillBar({
  filled,
  required,
  health,
  className,
}: {
  filled: number;
  required: number;
  health: ShiftHealth;
  className?: string;
}) {
  const color =
    health.fill === "FULL"
      ? "bg-emerald-500"
      : health.fill === "CANCELLED"
        ? "bg-muted-foreground/40"
        : health.fill === "EMPTY"
          ? "bg-red-500"
          : "bg-amber-500";
  return (
    <div className={cn("grid gap-1", className)}>
      <div
        role="progressbar"
        aria-label="Besetzung"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={Math.min(filled, required)}
        aria-valuetext={`${filled} von ${required} Helfern`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${health.ratio * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {filled} von {required} Helfern
        {health.freeSpots > 0 && health.fill !== "CANCELLED" && (
          <strong className="text-foreground">
            {" "}
            · {health.freeSpots} {health.freeSpots === 1 ? "Platz" : "Plätze"} frei
          </strong>
        )}
      </p>
    </div>
  );
}
