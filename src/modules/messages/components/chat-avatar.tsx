import { AREA_ICON } from "@/components/shared/area-icons";
import { cn } from "@/lib/utils";
import type { Audience } from "../schemas";

/** Rundes Bild eines Chats wie bei WhatsApp – je Zielgruppe ein Bereichssymbol auf eigener, ruhiger Farbe. */
const STYLE: Record<Audience, { icon: (typeof AREA_ICON)[keyof typeof AREA_ICON]; tone: string }> =
  {
    ALL_MEMBERS: {
      icon: AREA_ICON.mitglieder,
      tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    },
    DEPARTMENT: {
      icon: AREA_ICON.abteilungen,
      tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    },
    EVENT_HELPERS: {
      icon: AREA_ICON.helferplanung,
      tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    },
    EVENT_PARTICIPANTS: {
      icon: AREA_ICON.veranstaltungen,
      tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    },
  };

export function ChatAvatar({ audience, className }: { audience: Audience; className?: string }) {
  const { icon: Icon, tone } = STYLE[audience];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full",
        tone,
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
