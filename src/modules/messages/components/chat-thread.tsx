import { Fragment } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckCheckIcon, MailIcon } from "lucide-react";
import { formatDate, formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { dayLabel, nameTone, withRuns } from "../chat-format";
import type { ChatBubble, ChatDetail } from "../chats";
import { BubbleActions } from "./bubble-actions";
import { ChatAvatar } from "./chat-avatar";
import { ChatComposer } from "./chat-composer";
import { ChatStream } from "./chat-stream";

/**
 * Ein geöffneter Chat wie bei WhatsApp: oben Bild und Name, darunter der Verlauf auf dem typischen hellen (bzw. dunklen)
 * Hintergrund – eigene Nachrichten rechts in Grün, die anderer links in Weiß, mit Name, Uhrzeit und Datumstrennern.
 * Unten schreibt, wer hier schreiben darf; alle anderen sehen den Hinweis, wer hier schreibt (wie in WhatsApp-Gruppen,
 * in denen nur Admins senden).
 *
 * Farben: die von WhatsApp, die Grautöne für Uhrzeit und Häkchen etwas dunkler – so erreichen sie auch auf Grün das
 * nötige Kontrastverhältnis (4,5 : 1).
 */
export function ChatThread({
  chat,
  canSendAnywhere,
}: {
  chat: ChatDetail;
  canSendAnywhere: boolean;
}) {
  const messages = withRuns(
    chat.messages.map((message) => ({
      ...message,
      authorKey: message.mine ? "ich" : (message.author ?? "?"),
    })),
  );
  const subtitle =
    chat.canPost && chat.reach !== null
      ? `Erreicht ${chat.reach} ${chat.reach === 1 ? "Person" : "Personen"}`
      : chat.eventStartsAt
        ? `Veranstaltung am ${formatDate(chat.eventStartsAt)}`
        : "Nachrichten des Vereins";

  return (
    <>
      <header className="flex items-center gap-3 border-b bg-card px-3 py-2.5">
        <Link
          href="/nachrichten"
          aria-label="Zurück zu den Chats"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <ArrowLeftIcon className="size-5" />
        </Link>
        <ChatAvatar audience={chat.target.audience} className="size-10" />
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{chat.title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>

      <ChatStream
        lastId={chat.messages.at(-1)?.id ?? null}
        className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6 dark:bg-[#0b141a]"
      >
        {chat.hasOlder && (
          <p className="mb-3 text-center">
            <Link
              href={`/nachrichten?chat=${chat.key}&anzahl=${chat.messages.length + 50}`}
              className="rounded-full bg-card px-3 py-1 text-xs font-medium shadow-sm hover:underline"
            >
              Ältere Nachrichten laden
            </Link>
          </p>
        )}
        {messages.length === 0 ? (
          <p className="mx-auto mt-8 w-fit max-w-sm rounded-lg bg-card px-3 py-2 text-center text-sm text-muted-foreground shadow-sm">
            Noch keine Nachrichten in diesem Chat. Schreib die erste!
          </p>
        ) : (
          <ol className="grid gap-1">
            {messages.map((message) => (
              <Fragment key={message.id}>
                {message.newDay && (
                  <li className="my-2 text-center">
                    <span className="rounded-lg bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm dark:bg-[#182229]">
                      {dayLabel(message.sentAt)}
                    </span>
                  </li>
                )}
                <li
                  className={cn(
                    "flex",
                    message.mine ? "justify-end" : "justify-start",
                    message.firstOfRun && !message.newDay && "mt-1.5",
                  )}
                >
                  <Bubble message={message} />
                </li>
              </Fragment>
            ))}
          </ol>
        )}
      </ChatStream>

      {chat.canPost ? (
        <ChatComposer target={chat.target} title={chat.title} reach={chat.reach} />
      ) : (
        <p className="border-t bg-card px-4 py-3 text-center text-sm text-muted-foreground">
          {canSendAnywhere
            ? "In diesem Chat schreiben nur Vorstand und Verwaltung."
            : "Nur Vorstand und Abteilungsleitung können hier schreiben."}
        </p>
      )}
    </>
  );
}

function Bubble({ message }: { message: ChatBubble & { firstOfRun: boolean } }) {
  const author = message.author ?? "Früheres Mitglied";
  return (
    <article
      id={`nachricht-${message.id}`}
      aria-label={`Nachricht von ${message.mine ? "dir" : author}: ${message.subject}`}
      className={cn(
        "relative max-w-[85%] scroll-m-4 rounded-lg px-2.5 pt-1.5 pb-1 text-sm leading-snug shadow-sm data-[highlight=true]:ring-2 data-[highlight=true]:ring-primary sm:max-w-[70%]",
        message.mine
          ? "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
          : "bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]",
        message.firstOfRun && (message.mine ? "rounded-tr-none" : "rounded-tl-none"),
        message.canDelete && "pr-9",
      )}
    >
      {message.firstOfRun && !message.mine && (
        <p className={cn("mb-0.5 text-xs font-semibold", nameTone(author))}>{author}</p>
      )}
      {message.isAnnouncement && (
        <p className="mb-0.5 text-xs font-semibold tracking-wide text-[#54656f] uppercase dark:text-white/80">
          Ankündigung
        </p>
      )}
      {message.showSubject && <p className="font-semibold">{message.subject}</p>}
      {/* Reiner Text: React maskiert alles, Zeilenumbrüche bleiben durch white-space erhalten. */}
      <p className="break-words whitespace-pre-wrap">{message.body}</p>
      <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-[#54656f] dark:text-white/80">
        {message.sendEmail && (
          <>
            <MailIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Auch per E-Mail gesendet.</span>
          </>
        )}
        <time dateTime={message.sentAt.toISOString()}>{formatTime(message.sentAt)}</time>
        {message.readCount !== null && (
          <ReadTicks read={message.readCount} total={message.recipientCount} />
        )}
      </p>
      {message.canDelete && <BubbleActions id={message.id} subject={message.subject} />}
    </article>
  );
}

/** Häkchen wie bei WhatsApp – blau, wenn alle gelesen haben – plus die genaue Zahl. */
function ReadTicks({ read, total }: { read: number; total: number }) {
  const all = total > 0 && read >= total;
  return (
    <span className="inline-flex items-center gap-0.5">
      <CheckCheckIcon
        aria-hidden="true"
        className={cn("size-4", all && "text-sky-700 dark:text-sky-300")}
      />
      <span aria-hidden="true" className="tabular-nums">
        {read}/{total}
      </span>
      <span className="sr-only">
        {read} von {total} gelesen
      </span>
    </span>
  );
}
