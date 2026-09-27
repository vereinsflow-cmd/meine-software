import Link from "next/link";
import { cn } from "@/lib/utils";
import { chatListTime } from "../chat-format";
import type { ChatSummary } from "../chats";
import { ChatAvatar } from "./chat-avatar";

/**
 * Chatliste wie bei WhatsApp: Bild, Name, Zeit der letzten Nachricht, darunter ihr Anfang („Du: …“ bzw. der Vorname) und
 * – in Grün – die Zahl der ungelesenen Nachrichten. Der gewählte Chat ist hervorgehoben.
 */
export function ChatList({ chats, activeKey }: { chats: ChatSummary[]; activeKey?: string }) {
  return (
    <ul aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto">
      {chats.map((chat) => {
        const active = chat.key === activeKey;
        const firstName = chat.last.author?.split(" ")[0];
        return (
          <li key={chat.key}>
            <Link
              href={`/nachrichten?chat=${chat.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                active && "bg-accent",
              )}
            >
              <ChatAvatar audience={chat.target.audience} />
              {/* Eine Spalte mit fester Breite: sonst machen lange Vorschauen die Zeile breiter als die Liste. */}
              <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5 border-b py-3">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{chat.title}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      chat.unread > 0
                        ? "font-semibold text-emerald-700 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {chatListTime(chat.last.sentAt)}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-muted-foreground">
                    {chat.last.mine ? "Du: " : firstName ? `${firstName}: ` : ""}
                    {chat.last.preview}
                  </span>
                  {chat.unread > 0 && (
                    <span className="min-w-5 shrink-0 rounded-full bg-emerald-700 px-1.5 text-center text-xs leading-5 font-semibold text-white tabular-nums">
                      {chat.unread}
                      <span className="sr-only">
                        {chat.unread === 1 ? " ungelesene Nachricht" : " ungelesene Nachrichten"}
                      </span>
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
