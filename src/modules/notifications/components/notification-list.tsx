"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, BellRingIcon, CheckCheckIcon, ClockIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from "../actions";

interface Item {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open(item: Item) {
    startTransition(async () => {
      const result = await markNotificationReadAction({ id: item.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (result.data.linkUrl) router.push(result.data.linkUrl);
      else router.refresh();
    });
  }

  function toggleUnread(item: Item) {
    startTransition(async () => {
      const result = item.readAt
        ? await markNotificationUnreadAction({ id: item.id })
        : await markNotificationReadAction({ id: item.id });
      if (!result.ok) toast.error(result.error.message);
      else router.refresh();
    });
  }

  return (
    <ul className="grid gap-3" aria-busy={pending}>
      {items.map((item) => {
        const unread = item.readAt === null;
        return (
          <li
            key={item.id}
            className={cn(
              "relative flex items-start gap-4 overflow-hidden rounded-xl p-4 pl-5 shadow-sm ring-1 transition-shadow duration-150 hover:shadow-md motion-reduce:transition-none sm:p-5 sm:pl-6",
              unread
                ? "bg-primary/[0.06] ring-primary/40 dark:bg-primary/10"
                : "bg-card ring-foreground/10 dark:ring-foreground/15",
            )}
          >
            {unread && (
              <span className="absolute inset-y-0 left-0 w-1.5 bg-primary" aria-hidden="true" />
            )}
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                unread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {unread ? <BellRingIcon className="size-5" /> : <BellIcon className="size-5" />}
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="rounded-md text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn("block text-base", unread ? "font-semibold" : "font-medium")}>
                    {unread && <span className="sr-only">Ungelesen: </span>}
                    {item.title}
                  </span>
                  {item.body && (
                    <span className="mt-1 block text-[0.9375rem] text-muted-foreground">
                      {item.body}
                    </span>
                  )}
                </button>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ClockIcon className="size-3.5" aria-hidden="true" />
                  {formatDateTime(item.createdAt)} Uhr
                  {unread && (
                    <span
                      className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
                      aria-hidden="true"
                    >
                      Neu
                    </span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 sm:mt-0 sm:shrink-0"
                onClick={() => toggleUnread(item)}
                disabled={pending}
              >
                {unread ? "Als gelesen markieren" : "Als ungelesen markieren"}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          toast.success(
            result.data.count > 0
              ? "Alle Benachrichtigungen als gelesen markiert."
              : "Es gab nichts zu markieren.",
          );
          router.refresh();
        })
      }
    >
      <CheckCheckIcon /> Alle als gelesen markieren
    </Button>
  );
}
