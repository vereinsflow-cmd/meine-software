import Link from "next/link";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Glocke mit Zähler ungelesener Benachrichtigungen (Zahl steht auch im Screenreader-Text). */
export function NotificationBell({ unread }: { unread: number }) {
  const label = unread > 0 ? `Benachrichtigungen, ${unread} ungelesen` : "Benachrichtigungen";
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/benachrichtigungen" aria-label={label}>
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0 right-0 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-5 font-semibold text-primary-foreground ring-2 ring-card"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
