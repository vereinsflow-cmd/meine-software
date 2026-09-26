import type { Metadata } from "next";
import Link from "next/link";
import { FilePenLineIcon, InboxIcon, PlusIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/dates";
import { enumParam, pageRequest, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { AUDIENCE_LABEL } from "@/modules/messages/schemas";
import {
  countUnreadMessages,
  listInbox,
  listSent,
  type MessageDto,
} from "@/modules/messages/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Nachrichten" };

const VIEWS = ["eingang", "gesendet", "entwuerfe"] as const;

function audienceText(message: MessageDto): string {
  if (message.audience === "DEPARTMENT" && message.department)
    return `Abteilung ${message.department.name}`;
  if (
    message.event &&
    (message.audience === "EVENT_PARTICIPANTS" || message.audience === "EVENT_HELPERS")
  )
    return `${message.audience === "EVENT_HELPERS" ? "Helfer" : "Teilnehmer"}: ${message.event.title}`;
  return AUDIENCE_LABEL[message.audience];
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "messages:read")) return <NoAccess what="die Nachrichten" />;

  const canSend = can(ctx, "messages:send");
  const requested = enumParam(params, "ansicht", VIEWS) ?? "eingang";
  const view = !canSend && requested !== "eingang" ? "eingang" : requested;
  const request = pageRequest(params, 15);

  const [result, unread] = await Promise.all([
    view === "eingang"
      ? listInbox(ctx, request)
      : listSent(ctx, view === "gesendet" ? "sent" : "drafts", request),
    countUnreadMessages(ctx),
  ]);

  const tabs: { key: (typeof VIEWS)[number]; label: string; icon: React.ReactNode }[] = [
    {
      key: "eingang",
      label: unread > 0 ? `Posteingang (${unread})` : "Posteingang",
      icon: <InboxIcon className="size-4" />,
    },
    ...(canSend
      ? [
          { key: "gesendet" as const, label: "Gesendet", icon: <SendIcon className="size-4" /> },
          {
            key: "entwuerfe" as const,
            label: "Entwürfe",
            icon: <FilePenLineIcon className="size-4" />,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Nachrichten"
        description="Mitteilungen und Ankündigungen deines Vereins."
        actions={
          canSend ? (
            <Button asChild>
              <Link href="/nachrichten/neu">
                <PlusIcon /> Neue Nachricht
              </Link>
            </Button>
          ) : undefined
        }
      />

      {tabs.length > 1 && (
        <nav aria-label="Ansicht wählen" className="mb-4 inline-flex rounded-lg bg-muted p-0.5">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.key === "eingang" ? "/nachrichten" : `/nachrichten?ansicht=${tab.key}`}
              aria-current={tab.key === view ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
                tab.key === view
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.icon} {tab.label}
            </Link>
          ))}
        </nav>
      )}

      {result.items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon />}
          title={
            view === "eingang"
              ? "Keine Nachrichten"
              : view === "gesendet"
                ? "Noch nichts gesendet"
                : "Keine Entwürfe"
          }
          description={
            view === "eingang"
              ? "Sobald dein Verein dir etwas mitteilt, erscheint es hier."
              : "Schreibe eine neue Nachricht an Mitglieder, eine Abteilung oder die Helfer einer Veranstaltung."
          }
          action={
            canSend && view !== "eingang" ? (
              <Button asChild>
                <Link href="/nachrichten/neu">Nachricht schreiben</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul
            className="grid gap-2"
            aria-label={
              view === "eingang"
                ? "Posteingang"
                : view === "gesendet"
                  ? "Gesendete Nachrichten"
                  : "Entwürfe"
            }
          >
            {result.items.map((message) => {
              const unreadMessage = view === "eingang" && message.readByMe === false;
              const href =
                view === "entwuerfe"
                  ? `/nachrichten/neu?entwurf=${message.id}`
                  : `/nachrichten/${message.id}`;
              return (
                <li key={message.id}>
                  <Link
                    href={href}
                    className={cn(
                      "block rounded-xl border p-4 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      unreadMessage && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        {unreadMessage && (
                          <span
                            className="size-2 shrink-0 rounded-full bg-primary"
                            aria-hidden="true"
                          />
                        )}
                        {unreadMessage && <span className="sr-only">Ungelesen: </span>}
                        <span
                          className={cn(
                            "truncate",
                            unreadMessage ? "font-semibold" : "font-medium",
                          )}
                        >
                          {message.subject}
                        </span>
                        {message.isAnnouncement && <ToneBadge tone="info">Ankündigung</ToneBadge>}
                        {view === "entwuerfe" && <ToneBadge tone="neutral">Entwurf</ToneBadge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {message.sentAt
                          ? `${formatDateTime(message.sentAt)} Uhr`
                          : `angelegt ${formatDateTime(message.createdAt)} Uhr`}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">
                      {message.body}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {view === "eingang" && message.author && <span>Von {message.author}</span>}
                      <span>{audienceText(message)}</span>
                      {view === "gesendet" && (
                        <span>
                          {message.recipientCount}{" "}
                          {message.recipientCount === 1 ? "Empfänger" : "Empfänger"} ·{" "}
                          {message.readCount ?? 0} gelesen
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination basePath="/nachrichten" searchParams={params} {...result} />
        </>
      )}
    </>
  );
}
