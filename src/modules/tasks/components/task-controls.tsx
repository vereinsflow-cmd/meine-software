"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarIcon, PencilIcon, PlusIcon, Trash2Icon, UserIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import { TaskPriorityBadge, TaskStatusBadge, ToneBadge } from "@/components/shared/status-badge";
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
import { TASK_PRIORITIES, TASK_STATUSES, taskFormSchema, type TaskFormInput } from "../schemas";
import type { TaskDto, TaskFormOptions } from "../service";

const priorityOptions = TASK_PRIORITIES.map((value) => ({
  value,
  label: TASK_PRIORITY_LABEL[value],
}));
const statusOptions = TASK_STATUSES.map((value) => ({ value, label: TASK_STATUS_LABEL[value] }));

/** Dialog zum Anlegen und Bearbeiten einer Aufgabe. Die Auswahllisten kennen nur, was der Benutzer verwalten darf. */
export function TaskFormDialog({
  taskId,
  defaults,
  options,
}: {
  taskId?: string;
  defaults: TaskFormInput;
  options: TaskFormOptions;
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
        {taskId ? (
          <Button variant="ghost" size="sm">
            <PencilIcon /> Bearbeiten
          </Button>
        ) : (
          <Button>
            <PlusIcon /> Neue Aufgabe
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{taskId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
          <DialogDescription>
            Wer zuständig ist, wird benachrichtigt. Verknüpfe die Aufgabe optional mit einer
            Veranstaltung oder Gruppe.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
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

/** Eine Aufgabe in der Liste: Angaben, Status ändern, bearbeiten, löschen. */
export function TaskRow({ task, options }: { task: TaskDto; options: TaskFormOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = task.status === "DONE";

  function changeStatus(status: string) {
    startTransition(async () => {
      const result = await setTaskStatusAction({ id: task.id, status });
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <li
      aria-label={`Aufgabe ${task.title}`}
      className={cn(
        "grid gap-3 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_auto]",
        task.overdue && "border-red-300 dark:border-red-900",
        done && "bg-muted/30",
      )}
    >
      <div className="grid content-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={cn("text-base font-semibold", done && "text-muted-foreground line-through")}
          >
            {task.title}
          </h3>
          <TaskPriorityBadge priority={task.priority} />
          <TaskStatusBadge status={task.status} />
          {task.overdue && <ToneBadge tone="danger">Überfällig</ToneBadge>}
        </div>
        {task.description && <p className="text-sm whitespace-pre-wrap">{task.description}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {task.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-3.5" aria-hidden="true" /> Fällig:{" "}
              {formatCalendarDate(task.dueDate)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <UserIcon className="size-3.5" aria-hidden="true" />{" "}
            {task.assignee ? task.assignee.name : "Niemand zugewiesen"}
          </span>
          {task.event && (
            <Link
              href={`/veranstaltungen/${task.event.id}`}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Veranstaltung: {task.event.title}
            </Link>
          )}
          {task.group && (
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden="true" /> {task.group.name}
            </span>
          )}
        </div>
        {task.notes && (
          <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm">Intern: {task.notes}</p>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-2 md:justify-end">
        {task.can.setStatus && (
          <NativeSelect
            aria-label={`Status von ${task.title}`}
            value={task.status}
            disabled={pending}
            onChange={(event) => changeStatus(event.target.value)}
            className="w-40"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        )}
        {task.can.edit && (
          <>
            <TaskFormDialog
              taskId={task.id}
              options={options}
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
            <ConfirmAction
              destructive
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2Icon /> Löschen
                </Button>
              }
              title="Aufgabe löschen?"
              description={`„${task.title}“ wird gelöscht.`}
              confirmLabel="Löschen"
              action={() => deleteTaskAction({ id: task.id })}
              successMessage="Aufgabe gelöscht."
              onSuccess={() => router.refresh()}
            />
          </>
        )}
      </div>
    </li>
  );
}
