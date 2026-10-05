"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { TaskStatus } from "@/generated/prisma/enums";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AREA_ICON } from "@/components/shared/area-icons";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import { IconButton } from "@/components/shared/icon-button";
import { useMoreActions } from "@/components/shared/more-actions";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/shared/status-badge";
import { useActionForm } from "@/hooks/use-action-form";
import { formatCalendarDate } from "@/lib/dates";
import { eventOptions } from "@/lib/event-options";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  createTaskAction,
  deleteTaskAction,
  setTaskStatusAction,
  updateTaskAction,
} from "../actions";
import { dueHint } from "../list-view";
import { TASK_PRIORITIES, taskFormSchema, type TaskFormInput } from "../schemas";
import type { TaskDto, TaskFormOptions } from "../service";

const priorityOptions = TASK_PRIORITIES.map((value) => ({
  value,
  label: TASK_PRIORITY_LABEL[value],
}));
/** Status in der Reihenfolge des Arbeitsablaufs – „Erledigt“ zuletzt. */
const STATUS_ORDER = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
] as const satisfies readonly TaskStatus[];
const statusOptions = STATUS_ORDER.map((value) => ({ value, label: TASK_STATUS_LABEL[value] }));

/** Dialog zum Anlegen und Bearbeiten einer Aufgabe. Die Auswahllisten kennen nur, was der Benutzer verwalten darf. */
export function TaskFormDialog({
  taskId,
  defaults,
  options,
  trigger,
}: {
  taskId?: string;
  defaults: TaskFormInput;
  options: TaskFormOptions;
  /** Eigener Auslöser (z. B. ein Symbolknopf auf der Karte) statt „Bearbeiten“ bzw. „Neue Aufgabe“. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: taskFormSchema,
    defaultValues: defaults,
    action: (values) => (taskId ? updateTaskAction(taskId, values) : createTaskAction(values)),
    successMessage: taskId ? "Aufgabe gespeichert." : "Aufgabe angelegt.",
    onSuccess: () => {
      setOpen(false);
      if (!taskId) form.reset(defaults);
      router.refresh();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ??
          (taskId ? (
            <Button variant="ghost" size="sm">
              <PencilIcon /> Bearbeiten
            </Button>
          ) : (
            <Button>
              <PlusIcon /> Neue Aufgabe
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{taskId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
          <DialogDescription>
            Wer zuständig ist, wird benachrichtigt. Verknüpfe die Aufgabe optional mit einer
            Veranstaltung oder Gruppe.
          </DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormError message={formError} />
          </div>
          <TextField form={form} name="title" label="Titel" required className="sm:col-span-2" />
          <TextareaField
            form={form}
            name="description"
            label="Beschreibung"
            rows={3}
            className="sm:col-span-2"
          />
          <SelectField
            form={form}
            name="assigneeMemberId"
            label="Zuständig"
            placeholder="Niemand"
            options={options.members.map((m) => ({ value: m.id, label: m.name }))}
          />
          <TextField form={form} name="dueDate" label="Fällig am" type="date" />
          {/* Veranstaltung über die ganze Breite – in halber Breite würde das Datum der gewählten Veranstaltung abgeschnitten
              („Fußball-Training Herren · Di., 29.09.2026“). Die Gruppe als zweite Verknüpfung ebenso, damit Priorität
              und Status nebeneinander bleiben. */}
          <SelectField
            form={form}
            name="eventId"
            label="Veranstaltung"
            placeholder="Keine"
            options={eventOptions(options.events)}
            className="sm:col-span-2"
          />
          <SelectField
            form={form}
            name="groupId"
            label="Gruppe"
            placeholder="Keine"
            options={options.groups.map((g) => ({ value: g.id, label: g.name }))}
            className="sm:col-span-2"
          />
          <SelectField form={form} name="priority" label="Priorität" options={priorityOptions} />
          <SelectField form={form} name="status" label="Status" options={statusOptions} />
          <TextareaField
            form={form}
            name="notes"
            label="Interne Notizen"
            rows={2}
            className="sm:col-span-2"
            hint="Nur für Verwalter sichtbar."
          />
          <div className="sm:col-span-2">
            <SubmitButton pending={isPending} className="w-full">
              {taskId ? "Speichern" : "Aufgabe anlegen"}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Priorität und Status stehen nur da, wenn sie etwas sagen – „Normal“ und „Offen“ sind der Regelfall. */
const NOTABLE_PRIORITIES = new Set(["HIGH", "URGENT"]);
const NOTABLE_STATUSES = new Set(["IN_PROGRESS", "BLOCKED"]);

/**
 * Eine Aufgabe in der Liste. Links das Kästchen zum Abhaken (die Meldung bietet „Rückgängig“ an), rechts „Bearbeiten“
 * und ⋯ mit dem Status und „Löschen“ – kein roter Knopf auf jeder Karte. Wer nur den Status ändern darf (die zuständige
 * Person), bekommt Kästchen und ⋯ mit dem Status.
 */
export function TaskRow({ task, options }: { task: TaskDto; options: TaskFormOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Die Rückfrage „Löschen“ liegt außerhalb des Menüs; danach kehrt der Fokus zum ⋯-Knopf zurück.
  const { triggerRef, show, dialog } = useMoreActions<"delete">();
  const done = task.status === "DONE";
  const hint = dueHint(task.dueInDays, done);
  const dueSoon = !done && !task.overdue && task.dueInDays !== null && task.dueInDays <= 1;

  function changeStatus(status: TaskStatus) {
    if (status === task.status) return;
    const previous = task.status;
    startTransition(async () => {
      const result = await setTaskStatusAction({ id: task.id, status });
      if (!result.ok) toast.error(result.error.message);
      else if (status === "DONE")
        toast.success(`„${task.title}“ ist erledigt.`, {
          duration: 8000,
          action: { label: "Rückgängig", onClick: () => restore(previous) },
        });
      router.refresh();
    });
  }

  function restore(status: TaskStatus) {
    void setTaskStatusAction({ id: task.id, status }).then((result) => {
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <li
      aria-label={`Aufgabe ${task.title}`}
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card p-4",
        task.overdue && "border-red-300 dark:border-red-900",
        done && "bg-muted/40",
      )}
    >
      {task.can.setStatus ? (
        <Checkbox
          checked={done}
          disabled={pending}
          aria-label={
            done ? `„${task.title}“ wieder öffnen` : `„${task.title}“ als erledigt abhaken`
          }
          className="mt-1 size-5 [&_svg]:size-4"
          onCheckedChange={(checked) => changeStatus(checked === true ? "DONE" : "OPEN")}
        />
      ) : (
        <span aria-hidden="true" className="size-5 shrink-0" />
      )}

      <div className="grid min-w-0 flex-1 content-start gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3
              className={cn(
                "text-base font-semibold break-words",
                done && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </h3>
            {NOTABLE_PRIORITIES.has(task.priority) && (
              <TaskPriorityBadge priority={task.priority} />
            )}
            {NOTABLE_STATUSES.has(task.status) && <TaskStatusBadge status={task.status} />}
          </div>
          <div className="-mt-1 -mr-1 flex shrink-0 items-center">
            {task.can.edit && (
              <TaskFormDialog
                taskId={task.id}
                options={options}
                trigger={
                  <IconButton label="Bearbeiten" className="size-8">
                    <PencilIcon />
                  </IconButton>
                }
                defaults={{
                  title: task.title,
                  description: task.description ?? "",
                  assigneeMemberId: task.assignee?.id ?? "",
                  eventId: task.event?.id ?? "",
                  groupId: task.group?.id ?? "",
                  dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "",
                  priority: task.priority,
                  status: task.status,
                  notes: task.notes ?? "",
                }}
              />
            )}
            {task.can.setStatus && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    ref={triggerRef}
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={pending}
                    aria-label={
                      task.can.edit
                        ? `Weitere Aktionen für „${task.title}“`
                        : `Status von „${task.title}“ ändern`
                    }
                  >
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" collisionPadding={16} className="min-w-48">
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={task.status}
                    onValueChange={(value) => changeStatus(value as TaskStatus)}
                  >
                    {STATUS_ORDER.map((status) => (
                      <DropdownMenuRadioItem key={status} value={status} className="py-1.5">
                        {TASK_STATUS_LABEL[status]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {task.can.edit && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        className="py-1.5"
                        onSelect={() => show("delete")}
                      >
                        <TrashIcon /> Löschen
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {task.description && (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{task.description}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {task.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                task.overdue && "font-medium text-destructive",
                dueSoon && "font-medium text-amber-700 dark:text-amber-400",
              )}
            >
              <CalendarIcon className="size-3.5" aria-hidden="true" /> Fällig:{" "}
              {formatCalendarDate(task.dueDate)}
              {hint && ` · ${hint}`}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <UserIcon className="size-3.5" aria-hidden="true" />{" "}
            {task.assignee ? task.assignee.name : "Niemand zugewiesen"}
          </span>
          {task.event && (
            <Link
              href={`/veranstaltungen/${task.event.id}`}
              className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
            >
              <AREA_ICON.veranstaltungen className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Veranstaltung: </span>
              {task.event.title}
            </Link>
          )}
          {task.group && (
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Gruppe: </span>
              {task.group.name}
            </span>
          )}
        </div>

        {task.notes && (
          <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm">Intern: {task.notes}</p>
        )}
      </div>

      {task.can.edit && (
        <ConfirmAction
          destructive
          {...dialog("delete")}
          title="Aufgabe löschen?"
          description={`„${task.title}“ wird gelöscht.`}
          confirmLabel="Löschen"
          action={() => deleteTaskAction({ id: task.id })}
          successMessage="Aufgabe gelöscht."
          onSuccess={() => router.refresh()}
        />
      )}
    </li>
  );
}
