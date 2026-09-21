import type { EventStatus, MemberStatus, TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import {
  EVENT_STATUS_LABEL,
  MEMBER_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Statusanzeigen. Die Bedeutung wird immer AUCH im Text ausgedrückt (nicht nur über die Farbe) –
 * wichtig für Barrierefreiheit (Farbenblindheit) und Ausdrucke in Schwarzweiß.
 */
const tone = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  info: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
} as const;

export type Tone = keyof typeof tone;

export function ToneBadge({
  tone: t,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", tone[t], className)}>
      {children}
    </Badge>
  );
}

const memberTone: Record<MemberStatus, Tone> = {
  ACTIVE: "success",
  PASSIVE: "neutral",
  LEFT: "neutral",
  HONORARY: "info",
  BLOCKED: "danger",
};
export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return <ToneBadge tone={memberTone[status]}>{MEMBER_STATUS_LABEL[status]}</ToneBadge>;
}

const eventTone: Record<EventStatus, Tone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  COMPLETED: "info",
  CANCELLED: "danger",
  ARCHIVED: "neutral",
};
export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <ToneBadge tone={eventTone[status]}>{EVENT_STATUS_LABEL[status]}</ToneBadge>;
}

const taskTone: Record<TaskStatus, Tone> = {
  OPEN: "neutral",
  IN_PROGRESS: "info",
  DONE: "success",
  BLOCKED: "danger",
};
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <ToneBadge tone={taskTone[status]}>{TASK_STATUS_LABEL[status]}</ToneBadge>;
}

const priorityTone: Record<TaskPriority, Tone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};
export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return <ToneBadge tone={priorityTone[priority]}>{TASK_PRIORITY_LABEL[priority]}</ToneBadge>;
}
