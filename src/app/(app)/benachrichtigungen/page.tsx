import type { Metadata } from "next";
import { BellOffIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import {
  MarkAllReadButton,
  NotificationList,
} from "@/modules/notifications/components/notification-list";
import { countUnread, listNotifications } from "@/modules/notifications/service";
import { pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Benachrichtigungen" };

const FILTER_TAB =
  "inline-flex items-center rounded-md px-4 py-1.5 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
const FILTER_TAB_ACTIVE = "bg-card text-foreground shadow-sm hover:text-foreground";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  const unreadOnly = param(params, "filter") === "ungelesen";
  const [result, unread] = await Promise.all([
    listNotifications(ctx, { unreadOnly, request: pageRequest(params) }),
    countUnread(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Benachrichtigungen"
        description={unread > 0 ? `${unread} ungelesen` : "Alles gelesen."}
        actions={<MarkAllReadButton disabled={unread === 0} />}
      />
      <div
        className="mb-6 inline-flex gap-1 rounded-lg bg-muted p-1 text-sm"
        role="group"
        aria-label="Filter"
      >
        <a
          href="/benachrichtigungen"
          aria-current={!unreadOnly ? "true" : undefined}
          className={cn(FILTER_TAB, !unreadOnly && FILTER_TAB_ACTIVE)}
        >
          Alle
        </a>
        <a
          href="/benachrichtigungen?filter=ungelesen"
          aria-current={unreadOnly ? "true" : undefined}
          className={cn(FILTER_TAB, unreadOnly && FILTER_TAB_ACTIVE)}
        >
          Nur ungelesene
          {unread > 0 && (
            <span
              className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
              aria-hidden="true"
            >
              {unread}
            </span>
          )}
        </a>
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<BellOffIcon />}
          title={
            unreadOnly ? "Keine ungelesenen Benachrichtigungen" : "Noch keine Benachrichtigungen"
          }
          description="Hier erscheinen Hinweise zu neuen Veranstaltungen, Schichteinteilungen, Aufgaben und Nachrichten."
        />
      ) : (
        <>
          <NotificationList
            items={result.items.map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              linkUrl: item.linkUrl,
              readAt: item.readAt?.toISOString() ?? null,
              createdAt: item.createdAt.toISOString(),
            }))}
          />
          <Pagination basePath="/benachrichtigungen" searchParams={params} {...result} />
        </>
      )}
    </>
  );
}
