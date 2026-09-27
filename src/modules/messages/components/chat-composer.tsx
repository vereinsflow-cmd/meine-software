"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SendHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { sendMessageAction } from "../actions";
import { chatKeyOf, subjectFromBody, type ChatTarget } from "../chat-format";

/**
 * Eingabezeile unten im Chat (wie bei WhatsApp): Text schreiben, rundem Knopf senden. Einen eigenen Betreff gibt es hier
 * nicht – er entsteht aus der ersten Zeile (`subjectFromBody`); wer ihn selbst wählen will, nimmt „Mit Betreff
 * schreiben“. Weil die Nachricht viele Personen erreicht und sich nur zurückrufen lässt, fragt der Knopf einmal nach.
 * „Als Ankündigung“ und „Auch per E-Mail“ gibt es nur für Vorstand und Leitung (`canAnnounce`).
 * Die Eingabetaste macht eine neue Zeile; Strg/⌘ + Eingabe sendet.
 */
export function ChatComposer({
  target,
  title,
  reach,
  canAnnounce,
}: {
  target: ChatTarget;
  title: string;
  reach: number | null;
  canAnnounce: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState("");
  const [announcement, setAnnouncement] = useState(false);
  const [email, setEmail] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const text = body.trim();
  const people =
    reach === null
      ? "die Mitglieder dieses Chats"
      : `${reach} ${reach === 1 ? "Person" : "Personen"}`;

  function ask() {
    if (text && !pending) setConfirmOpen(true);
  }

  function send() {
    startTransition(async () => {
      const result = await sendMessageAction(null, {
        subject: subjectFromBody(text),
        body: text,
        audience: target.audience,
        departmentId: target.departmentId ?? "",
        eventId: target.eventId ?? "",
        isAnnouncement: canAnnounce && announcement,
        sendEmail: canAnnounce && email,
      });
      setConfirmOpen(false);
      if (!result.ok) {
        const fields = result.error.fieldErrors ?? {};
        setError(
          Object.values(fields).flat()[0] ??
            result.error.message ??
            "Die Nachricht wurde nicht gesendet.",
        );
        return;
      }
      setBody("");
      setAnnouncement(false);
      setEmail(false);
      setError(null);
      toast.success(
        `Nachricht an ${result.data.recipients} ${result.data.recipients === 1 ? "Person" : "Personen"} gesendet.`,
      );
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        ask();
      }}
      className="border-t bg-card px-2 pt-2 pb-2 sm:px-3"
    >
      {error && (
        <p role="alert" className="mb-2 px-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor={`${id}-text`} className="sr-only">
          Nachricht an {title}
        </label>
        <textarea
          id={`${id}-text`}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              ask();
            }
          }}
          rows={1}
          maxLength={5000}
          placeholder="Nachricht schreiben"
          disabled={pending}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-3xl border border-field bg-background px-4 py-2 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 md:text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text || pending}
          aria-label="Senden"
          className="size-10 shrink-0 rounded-full bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500"
        >
          <SendHorizontalIcon className="size-5" />
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
        {canAnnounce && (
          <>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={announcement}
                onChange={(event) => setAnnouncement(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Als Ankündigung
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={email}
                onChange={(event) => setEmail(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Auch per E-Mail
            </label>
          </>
        )}
        <Link
          href={`/nachrichten/neu?an=${chatKeyOf(target)}`}
          className="ml-auto underline-offset-4 hover:text-foreground hover:underline"
        >
          Mit Betreff schreiben
        </Link>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nachricht senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Sie geht an {people} im Chat „{title}“
              {canAnnounce && email ? " – zusätzlich per E-Mail" : ""}. Gesendet lässt sie sich
              nicht mehr ändern, nur zurückrufen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Zurück</AlertDialogCancel>
            <Button disabled={pending} onClick={send}>
              {pending ? "Wird gesendet …" : "Senden"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
