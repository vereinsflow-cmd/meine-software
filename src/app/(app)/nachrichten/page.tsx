import type { Metadata } from "next";
import Link from "next/link";
import { FilePenLineIcon, PlusIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { CHAT_PAGE_HEIGHT } from "@/components/shared/page-skeletons";
import { Pagination } from "@/components/shared/pagination";
import { ToneBadge } from "@/components/shared/status-badge";
import { BackLink } from "@/components/shared/back-link";
import { CARD_SURFACE } from "@/components/ui/surface";
import { formatDateTime } from "@/lib/dates";
import { intParam, pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { countDrafts, getChat, listChats } from "@/modules/messages/chats";
import { ChatList } from "@/modules/messages/components/chat-list";
import { ChatThread } from "@/modules/messages/components/chat-thread";
import { listSent } from "@/modules/messages/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";
import type { TenantContext } from "@/server/tenancy/context-core";

export const metadata: Metadata = { title: "Nachrichten" };

/**
 * Nachrichten wie bei WhatsApp: links die Chats (je Zielgruppe einer), rechts der geöffnete Chat mit seinen Sprechblasen.
 * Am Smartphone steht immer nur eines von beiden da – die Liste, oder der Chat mit einem Pfeil zurück. Die Seite füllt die
 * Höhe des Bildschirms; es scrollen die Liste und der Verlauf, nicht die Seite.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "messages:read")) return <NoAccess what="die Nachrichten" />;

  const canSend = can(ctx, "messages:send");
  if (canSend && param(params, "ansicht") === "entwuerfe")
    return <Drafts ctx={ctx} params={params} />;

  const key = param(params, "chat");
  // Erst den Chat öffnen (das markiert seine Nachrichten als gelesen), dann die Liste – so stimmen ihre Zähler.
  const chat = key
    ? await getChat(ctx, key, { limit: intParam(params, "anzahl", 50, 50, 1000) })
    : null;
  const [chats, drafts] = await Promise.all([listChats(ctx), countDrafts(ctx)]);
  const chatOpen = key !== undefined;

  return (
    // Volle Höhe: dieselbe Rechnung wie das Ladegerüst (`CHAT_PAGE_HEIGHT`), damit beim Laden nichts springt.
    <div className={cn("flex flex-col", CHAT_PAGE_HEIGHT)}>
      {/* Am Smartphone füllt der geöffnete Chat den Bildschirm (wie in der App) – die Überschrift bleibt für Screenreader. */}
      {chatOpen && <h1 className="sr-only md:hidden">Nachrichten</h1>}
      <PageHeader
        className={cn("mb-4", chatOpen && "hidden md:flex")}
        title="Nachrichten"
        description="Mitteilungen und Ankündigungen deines Vereins – ein Chat je Gruppe."
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

      <div className={cn(CARD_SURFACE, "flex min-h-0 flex-1 overflow-hidden")}>
        <aside
          aria-label="Chatliste"
          className={cn(
            "min-h-0 w-full flex-col border-r md:flex md:w-80 lg:w-96",
            chatOpen ? "hidden" : "flex",
          )}
        >
          {drafts > 0 && (
            <Link
              href="/nachrichten?ansicht=entwuerfe"
              className="flex items-center gap-2 border-b px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <FilePenLineIcon className="size-4" aria-hidden="true" />
              Entwürfe
              <span className="ml-auto tabular-nums">{drafts}</span>
            </Link>
          )}
          {chats.length === 0 ? (
            <EmptyState
              icon={<AREA_ICON.nachrichten />}
              title="Noch keine Nachrichten"
              description={
                canSend
                  ? "Mit „Neue Nachricht“ schreibst du die erste – an alle Mitglieder oder eine deiner Gruppen."
                  : "Sobald dein Verein dir etwas mitteilt, erscheint es hier."
              }
              // Liegt schon in der Chatfläche – ohne eigenen Rahmen und Schatten.
              className="m-4 shadow-none ring-0"
            />
          ) : (
            <ChatList chats={chats} activeKey={chat?.key} />
          )}
        </aside>

        <section
          aria-label={chat ? `Chat ${chat.title}` : "Chat"}
          className={cn("min-h-0 min-w-0 flex-1 flex-col", chatOpen ? "flex" : "hidden md:flex")}
        >
          {chat ? (
            <ChatThread chat={chat} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-chat-wallpaper p-6 text-center">
              {chatOpen ? (
                <>
                  <p className="font-medium">Diesen Chat gibt es nicht (mehr).</p>
                  <Link href="/nachrichten" className="text-sm underline underline-offset-4">
                    Zu den Chats
                  </Link>
                </>
              ) : (
                <>
                  <span className="flex size-16 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
                    <AREA_ICON.nachrichten className="size-7" aria-hidden="true" />
                  </span>
                  <p className="font-medium">Wähle links einen Chat aus.</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Jede Gruppe hat ihren eigenen Chat – alle Mitglieder, jede Abteilung und die
                    Helfer und Teilnehmer jeder Veranstaltung.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Entwürfe (nur für Absender): angefangene Nachrichten, die noch nicht gesendet sind. */
async function Drafts({ ctx, params }: { ctx: TenantContext; params: RawSearchParams }) {
  const result = await listSent(ctx, "drafts", pageRequest(params, 15));
  return (
    <PageStack>
      <BackLink href="/nachrichten">Nachrichten</BackLink>
      <PageHeader
        title="Entwürfe"
        description="Angefangene Nachrichten – noch nicht gesendet."
        actions={
          <Button asChild>
            <Link href="/nachrichten/neu">
              <PlusIcon /> Neue Nachricht
            </Link>
          </Button>
        }
      />
      {result.items.length === 0 ? (
        <EmptyState
          icon={<FilePenLineIcon />}
          title="Keine Entwürfe"
          description="Speichere eine Nachricht als Entwurf, um später weiterzuschreiben."
        />
      ) : (
        <div>
          <ul className="grid gap-2" aria-label="Entwürfe">
            {result.items.map((message) => (
              <li key={message.id}>
                <Link
                  href={`/nachrichten/neu?entwurf=${message.id}`}
                  // Tastaturfokus: der allgemeine Fokussaum (globals.css) – der Ring gehört hier dem Kartenrand.
                  className={cn(CARD_SURFACE, "block p-4 transition-colors hover:bg-accent/40")}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{message.subject}</span>
                      <ToneBadge tone="neutral">Entwurf</ToneBadge>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      angelegt {formatDateTime(message.createdAt)} Uhr
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm whitespace-pre-line text-muted-foreground">
                    {message.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination basePath="/nachrichten" searchParams={params} {...result} />
        </div>
      )}
    </PageStack>
  );
}
