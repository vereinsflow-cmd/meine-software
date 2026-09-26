"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecksIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { formatCalendarDate } from "@/lib/dates";
import { eventOptions, type EventChoice } from "@/lib/event-options";
import { cn } from "@/lib/utils";
import {
  addChecklistItemAction,
  createChecklistAction,
  deleteChecklistAction,
  removeChecklistItemAction,
  toggleChecklistItemAction,
} from "../actions";
import { checklistSchema } from "../schemas";
import type { ChecklistDto } from "../checklists";

/** Neue Checkliste (optional einer Veranstaltung zugeordnet; auf der Veranstaltungsseite ist sie fest vorgegeben). */
export function NewChecklistDialog({
  eventId,
  events,
}: {
  eventId?: string;
  events?: EventChoice[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: checklistSchema,
    defaultValues: { title: "", eventId: eventId ?? "" },
    action: createChecklistAction,
    successMessage: "Checkliste angelegt.",
    onSuccess: () => {
      setOpen(false);
      form.reset({ title: "", eventId: eventId ?? "" });
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon /> Neue Checkliste
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Checkliste</DialogTitle>
          <DialogDescription>
            z. B. „Vorbereitung Sommerfest“. Die Punkte fügst du danach hinzu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <TextField form={form} name="title" label="Titel" required />
          {!eventId && events && (
            <SelectField
              form={form}
              name="eventId"
              label="Veranstaltung"
              placeholder="Keine (allgemeine Liste)"
              options={eventOptions(events)}
            />
          )}
          <SubmitButton pending={isPending}>Checkliste anlegen</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddItemForm({ checklistId }: { checklistId: string }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        startTransition(async () => {
          const result = await addChecklistItemAction({ checklistId, text });
          if (!result.ok) {
            toast.error(result.error.fieldErrors?.text?.[0] ?? result.error.message);
            return;
          }
          setText("");
          router.refresh();
        });
      }}
    >
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Neuen Punkt hinzufügen …"
        aria-label="Neuer Punkt"
        maxLength={200}
        disabled={pending}
      />
      <Button type="submit" variant="secondary" disabled={pending || !text.trim()}>
        <PlusIcon /> Hinzufügen
      </Button>
    </form>
  );
}

function ChecklistItemRow({ item }: { item: ChecklistDto["items"][number] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-start gap-3 py-2">
      <Checkbox
        checked={item.isDone}
        disabled={!item.canToggle || pending}
        aria-label={item.text}
        className="mt-0.5"
        onCheckedChange={(checked) =>
          startTransition(async () => {
            const result = await toggleChecklistItemAction({ id: item.id, done: checked === true });
            if (!result.ok) toast.error(result.error.message);
            router.refresh();
          })
        }
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", item.isDone && "text-muted-foreground line-through")}>
          {item.text}
        </p>
        {(item.assignee || item.dueDate) && (
          <p className="text-xs text-muted-foreground">
            {item.assignee?.name}
            {item.assignee && item.dueDate ? " · " : ""}
            {item.dueDate && `fällig ${formatCalendarDate(item.dueDate)}`}
          </p>
        )}
      </div>
    </div>
  );
}

export function ChecklistCard({ list }: { list: ChecklistDto }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const total = list.items.length;
  return (
    <section aria-label={`Checkliste ${list.title}`} className="rounded-xl border p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ListChecksIcon className="size-4" aria-hidden="true" /> {list.title}
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="text-sm text-muted-foreground tabular-nums"
            aria-label={`${list.done} von ${total} erledigt`}
          >
            {list.done} / {total}
          </span>
          {list.canManage && (
            <ConfirmAction
              destructive
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  aria-label={`Checkliste ${list.title} löschen`}
                >
                  <Trash2Icon />
                </Button>
              }
              title="Checkliste löschen?"
              description={`„${list.title}“ mit allen Punkten wird gelöscht.`}
              confirmLabel="Löschen"
              action={() => deleteChecklistAction({ id: list.id })}
              successMessage="Checkliste gelöscht."
              onSuccess={() => router.refresh()}
            />
          )}
        </div>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${total === 0 ? 0 : Math.round((list.done / total) * 100)}%` }}
        />
      </div>
      {total === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Noch keine Punkte.</p>
      ) : (
        <ul className="divide-y">
          {list.items.map((item) => (
            <li key={item.id} className="flex items-start">
              <div className="min-w-0 flex-1">
                <ChecklistItemRow item={item} />
              </div>
              {list.canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-1 size-7 opacity-60 hover:opacity-100 focus-visible:opacity-100"
                  disabled={pending}
                  aria-label={`Punkt „${item.text}“ entfernen`}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removeChecklistItemAction({ id: item.id });
                      if (!result.ok) toast.error(result.error.message);
                      router.refresh();
                    })
                  }
                >
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.canManage && (
        <div className="mt-3">
          <AddItemForm checklistId={list.id} />
        </div>
      )}
    </section>
  );
}
