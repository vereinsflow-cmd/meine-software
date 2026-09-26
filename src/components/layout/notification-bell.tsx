import Link from "next/link";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Button } from "@/components/ui/button";

/**
 * Glocke mit Zähler ungelesener Benachrichtigungen (Zahl steht auch im Screenreader-Text). Die Glocke ist so groß wie die
 * Menüsymbole (20 px); der Zähler sitzt auf ihrer oberen rechten Ecke und lässt die Glocke selbst erkennbar – vorher war
 * er größer als das Symbol und verdeckte es fast ganz.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const label = unread > 0 ? `Benachrichtigungen, ${unread} ungelesen` : "Benachrichtigungen";
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/benachrichtigungen" aria-label={label}>
        <AREA_ICON.benachrichtigungen className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-card"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
