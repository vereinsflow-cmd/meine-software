"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addChatMembersAction } from "../actions";
import type { AddMembersOptions } from "../chat-members";

const CONNECTION_ERROR =
  "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob die Personen schon hinzugefügt sind, bevor du es noch einmal versuchst.";

/** Ab so vielen Namen gibt es ein Suchfeld über der Liste. */
const SEARCH_FROM = 8;

const normalized = (text: string) => text.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();

/**
 * „Mitglieder hinzufügen“ oben im Chat einer Abteilung bzw. der Teilnehmer einer Veranstaltung: Liste zum Ankreuzen (mit
 * Suche), wer noch nicht dazugehört. Der Text sagt, was das bedeutet – in die Abteilung aufgenommen bzw. als zugesagt
 * angemeldet. Danach steht im Verlauf „Du hast … hinzugefügt“.
 */
export function AddMembersDialog({
  chatKey,
  options,
}: {
  chatKey: string;
  options: AddMembersOptions;
}) {
  const router = useRouter();
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const department = options.audience === "DEPARTMENT";
  const words = normalized(query).split(" ").filter(Boolean);
  // „Hans Hel“ findet „Helfer, Hans“: jedes Wort muss irgendwo im Namen stehen.
  const shown = options.candidates.filter((c) =>
    words.every((word) => normalized(c.name).includes(word)),
  );
  const count = selected.size;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setSelected(new Set());
      setError(null);
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof addChatMembersAction>>;
      try {
        result = await addChatMembersAction({ chat: chatKey, memberIds: [...selected] });
      } catch {
        setError(CONNECTION_ERROR);
        return;
      }
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const added = result.data.added;
      toast.success(added === 1 ? "1 Person hinzugefügt." : `${added} Personen hinzugefügt.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {/* Kurz „Hinzufügen“ (wie bei WhatsApp), damit der Name der Gruppe daneben Platz hat; am Smartphone nur das
            Symbol. Der volle Name steht für Screenreader im Label. */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          aria-label="Mitglieder hinzufügen"
        >
          <UserPlusIcon />
          <span className="hidden sm:inline">Hinzufügen</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // Am Smartphone nicht gleich die Tastatur aufklappen: Erst sieht man die Liste, gesucht wird bei Bedarf.
          if (!window.matchMedia("(pointer: coarse)").matches) return;
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Mitglieder hinzufügen</DialogTitle>
          <DialogDescription>
            {department
              ? `Wer hinzugefügt wird, gehört danach zur Abteilung ${options.name} und liest ab jetzt im Chat mit. Frühere Nachrichten bleiben verborgen.`
              : `Wer hinzugefügt wird, ist danach für „${options.name}“ angemeldet (zugesagt) und liest ab jetzt im Chat mit. Frühere Nachrichten bleiben verborgen.`}
          </DialogDescription>
        </DialogHeader>

        {options.candidates.length === 0 ? (
          <p className="text-muted-foreground">
            {department
              ? "Alle aktiven Mitglieder gehören schon zu dieser Abteilung."
              : "Alle aktiven Mitglieder haben schon geantwortet – angemeldet, abgesagt oder auf der Warteliste. Ändern lässt sich das auf der Seite der Veranstaltung."}
          </p>
        ) : (
          <div className="grid gap-2">
            {options.candidates.length >= SEARCH_FROM && (
              <>
                <label htmlFor={searchId} className="sr-only">
                  Name suchen
                </label>
                <Input
                  id={searchId}
                  type="search"
                  placeholder="Name suchen"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </>
            )}
            <fieldset className="max-h-72 overflow-y-auto rounded-lg border">
              <legend className="sr-only">Wen hinzufügen?</legend>
              {shown.length === 0 ? (
                <p className="px-3 py-2.5 text-muted-foreground">Niemand gefunden.</p>
              ) : (
                <ul className="divide-y">
                  {shown.map((candidate) => (
                    <li key={candidate.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-accent/60">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 rounded accent-primary"
                          checked={selected.has(candidate.id)}
                          onChange={(event) => toggle(candidate.id, event.target.checked)}
                        />
                        <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                        {!candidate.hasAccount && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ohne App-Zugang
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            {options.candidates.some((c) => !c.hasAccount) && (
              <p className="text-xs text-muted-foreground">
                Wer ohne App-Zugang ist, gehört trotzdem zur Gruppe und liest mit, sobald die
                Einladung angenommen ist.
              </p>
            )}
          </div>
        )}

        <FormError message={error} />

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Abbrechen</Button>
          </DialogClose>
          {options.candidates.length > 0 && (
            <Button onClick={submit} disabled={count === 0 || pending}>
              {pending
                ? "Wird hinzugefügt …"
                : count === 0
                  ? "Hinzufügen"
                  : count === 1
                    ? "1 Person hinzufügen"
                    : `${count} Personen hinzufügen`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
