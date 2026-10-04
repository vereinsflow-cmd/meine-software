"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClockIcon, PencilIcon, PlusIcon, UserPlusIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import type { MenuDialogProps } from "@/components/shared/more-actions";
import { useActionForm } from "@/hooks/use-action-form";
import { formatDuration } from "@/lib/dates";
import {
  assignMemberAction,
  createShiftAction,
  listAssignableAction,
  recordHoursAction,
  updateShiftAction,
} from "../actions";
import { shiftFormSchema, type ShiftFormInput } from "../schemas";
import type { AssignableMember } from "../service";

/**
 * „Neue Schicht“ bzw. „Schicht bearbeiten“. Ohne `open` bringt der Dialog seinen eigenen Knopf mit; mit `open` (aus
 * `useMoreActions`) öffnet ihn ein Punkt im Menü „⋯“ der Schicht. Das Formular entsteht bei jedem Öffnen neu: „Neue
 * Schicht“ beginnt leer, und abgebrochene Änderungen sind beim nächsten Mal weg.
 */
export function ShiftFormDialog({
  eventId,
  shiftId,
  defaults,
  members,
  ...controlled
}: {
  eventId: string;
  shiftId?: string;
  defaults: ShiftFormInput;
  members: { id: string; name: string }[];
} & Partial<MenuDialogProps>) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isControlled = controlled.open !== undefined;
  const open = controlled.open ?? ownOpen;
  const setOpen = (next: boolean) =>
    isControlled ? controlled.onOpenChange?.(next) : setOwnOpen(next);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {shiftId ? (
            <Button variant="ghost" size="sm">
              <PencilIcon /> Bearbeiten
            </Button>
          ) : (
            <Button>
              <PlusIcon /> Neue Schicht
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={controlled.onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{shiftId ? "Schicht bearbeiten" : "Neue Schicht"}</DialogTitle>
          <DialogDescription>
            Endet die Schicht nach Mitternacht, wähle eine Endzeit vor dem Beginn (z. B. 22:00 –
            02:00 Uhr).
          </DialogDescription>
        </DialogHeader>
        <ShiftForm
          eventId={eventId}
          shiftId={shiftId}
          defaults={defaults}
          members={members}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ShiftForm({
  eventId,
  shiftId,
  defaults,
  members,
  onDone,
}: {
  eventId: string;
  shiftId?: string;
  defaults: ShiftFormInput;
  members: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: shiftFormSchema,
    defaultValues: defaults,
    action: (values) =>
      shiftId ? updateShiftAction(shiftId, eventId, values) : createShiftAction(eventId, values),
    successMessage: shiftId ? "Schicht gespeichert." : "Schicht angelegt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={formError} />
      </div>
      <TextField
        form={form}
        name="title"
        label="Bezeichnung"
        required
        className="sm:col-span-2"
        hint="z. B. Aufbau, Getränkestand, Abbau"
      />
      <TextField
        form={form}
        name="taskName"
        label="Aufgabe"
        className="sm:col-span-2"
        hint="Was ist zu tun?"
      />
      <TextField form={form} name="date" label="Datum" type="date" required />
      <TextField
        form={form}
        name="requiredCount"
        label="Benötigte Helfer"
        type="number"
        inputMode="numeric"
        required
      />
      <TextField form={form} name="startTime" label="Beginn" type="time" required />
      <TextField form={form} name="endTime" label="Ende" type="time" required />
      <TextField form={form} name="meetingPoint" label="Treffpunkt" className="sm:col-span-2" />
      <TextareaField
        form={form}
        name="description"
        label="Beschreibung"
        rows={3}
        className="sm:col-span-2"
      />
      <TextField
        form={form}
        name="minAge"
        label="Mindestalter"
        type="number"
        inputMode="numeric"
        hint="Leer = kein Mindestalter."
      />
      <SelectField
        form={form}
        name="responsibleMemberId"
        label="Verantwortliche Person"
        placeholder="Keine"
        options={members.map((m) => ({ value: m.id, label: m.name }))}
      />
      <TextField
        form={form}
        name="requirements"
        label="Besondere Anforderungen"
        className="sm:col-span-2"
        hint="z. B. Hygieneschulung, festes Schuhwerk"
      />
      <TextareaField
        form={form}
        name="internalNotes"
        label="Interne Hinweise"
        rows={2}
        className="sm:col-span-2"
        hint="Nur für Veranstalter sichtbar."
      />
      <SelectField
        form={form}
        name="status"
        label="Anmeldung"
        className="sm:col-span-2"
        options={[
          { value: "OPEN", label: "Offen – Mitglieder können sich eintragen" },
          { value: "CLOSED", label: "Geschlossen – nur Zuweisung durch Veranstalter" },
        ]}
      />
      <div className="sm:col-span-2">
        <SubmitButton pending={isPending} className="w-full">
          {shiftId ? "Speichern" : "Schicht anlegen"}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Zuweisung durch Veranstalter. Die Liste zeigt, wer wegen Überschneidung, Mindestalter o. Ä. nicht möglich ist – mit Grund.
 * Ohne weitere Angaben bringt der Dialog seinen Knopf „Zuweisen“ mit; `trigger` ersetzt ihn (z. B. ein schlichter
 * Textknopf in Listen), mit `open` (aus `useMoreActions`) öffnet ihn ein Punkt im Menü „⋯“ der Schicht. Nach einer
 * Zuweisung geht der Fokus zu `focusAfter` (Id) – der Knopf, der den Dialog geöffnet hat, ist danach oft weg (Schicht voll).
 */
export function AssignDialog({
  shiftId,
  eventId,
  title,
  trigger,
  focusAfter,
  ...controlled
}: {
  shiftId: string;
  eventId: string;
  title: string;
  trigger?: ReactNode;
  focusAfter?: string;
} & Partial<MenuDialogProps>) {
  const assigned = useRef(false);
  const [ownOpen, setOwnOpen] = useState(false);
  const isControlled = controlled.open !== undefined;
  const open = controlled.open ?? ownOpen;
  const setOpen = (next: boolean) =>
    isControlled ? controlled.onOpenChange?.(next) : setOwnOpen(next);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm">
              <UserPlusIcon /> Zuweisen
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent
        onCloseAutoFocus={(event) => {
          const target = assigned.current && focusAfter && document.getElementById(focusAfter);
          assigned.current = false;
          if (!target) return controlled.onCloseAutoFocus?.(event);
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Helfer zuweisen: {title}</DialogTitle>
          <DialogDescription>
            Die Person wird per Benachrichtigung (und E-Mail) informiert. Nicht wählbare Personen
            sind mit Grund gekennzeichnet.
          </DialogDescription>
        </DialogHeader>
        {/* Eigene Komponente im Dialoginhalt: Sie entsteht bei jedem Öffnen neu und lädt die Liste dann frisch
            (Belegungen ändern sich laufend) – auch wenn das Menü „⋯“ den Dialog von außen öffnet. */}
        <AssignPicker
          shiftId={shiftId}
          eventId={eventId}
          onDone={() => {
            assigned.current = true;
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AssignPicker({
  shiftId,
  eventId,
  onDone,
}: {
  shiftId: string;
  eventId: string;
  onDone: () => void;
}) {
  const [list, setList] = useState<AssignableMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void listAssignableAction({ shiftId }).then((result) => {
      if (!active) return;
      if (result.ok) setList(result.data);
      else setLoadError(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [shiftId]);

  // Jedes Wort muss vorkommen – „Hans Helfer“ findet „Helfer, Hans“ (so heißen die Einträge in der Liste).
  const words = filter
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  const visible = (list ?? []).filter(
    (m) => !m.alreadyAssigned && words.every((word) => m.name.toLowerCase().includes(word)),
  );
  const chosen = list?.find((m) => m.id === selected);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="zuweisen-suche">Mitglied suchen</Label>
        <Input
          id="zuweisen-suche"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Name eingeben …"
          autoComplete="off"
        />
      </div>
      <div
        className="max-h-64 overflow-y-auto rounded-lg border"
        role="listbox"
        aria-label="Mitglieder"
      >
        {loadError ? (
          <p className="p-3 text-sm text-destructive">{loadError}</p>
        ) : list === null ? (
          <p className="p-3 text-sm text-muted-foreground">Wird geladen …</p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Keine passenden Mitglieder.</p>
        ) : (
          visible.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={selected === m.id}
              disabled={!!m.blockedReason}
              onClick={() => setSelected(m.id)}
              className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 aria-selected:bg-primary/10"
            >
              <span className="font-medium">{m.name}</span>
              {m.blockedReason && (
                <span className="text-xs text-destructive">{m.blockedReason}</span>
              )}
            </button>
          ))
        )}
      </div>
      <Button
        disabled={!chosen || !!chosen.blockedReason || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await assignMemberAction({ shiftId, memberId: selected, eventId });
            if (!result.ok) {
              toast.error(result.error.message);
              return;
            }
            toast.success("Helfer zugewiesen.");
            onDone();
            router.refresh();
          })
        }
      >
        {pending ? "Wird zugewiesen …" : chosen ? `${chosen.name} zuweisen` : "Zuweisen"}
      </Button>
    </div>
  );
}

/** „2,5“, „1,67“ – Stunden mit höchstens zwei Nachkommastellen, wie man sie eintippen würde. */
const hoursText = (minutes: number) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2, useGrouping: false }).format(
    minutes / 60,
  );

/**
 * Dokumentation der tatsächlich geleisteten Stunden eines Helfers (Eingabe in Stunden, z. B. 2,5). Das Eingabefeld entsteht
 * bei jedem Öffnen neu – mit dem aktuellen Wert.
 */
export function HoursDialog({
  assignmentId,
  eventId,
  name,
  plannedMinutes,
  currentMinutes,
}: {
  assignmentId: string;
  eventId: string;
  name: string;
  plannedMinutes: number;
  currentMinutes: number | null;
}) {
  const [open, setOpen] = useState(false);
  const shown = currentMinutes === null ? "Stunden" : formatDuration(currentMinutes);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs max-sm:h-11"
          data-hours=""
          // Der sichtbare Text steht vorn im Namen (Sprachsteuerung: „Klicke 2 Std.“).
          aria-label={`${shown}: Stunden von ${name} erfassen`}
        >
          <ClockIcon /> {shown}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Helferstunden: {name}</DialogTitle>
          <DialogDescription>
            Geplant {plannedMinutes === 60 ? "war" : "waren"} {formatDuration(plannedMinutes)}.
            Trage die tatsächlich geleistete Zeit ein.
          </DialogDescription>
        </DialogHeader>
        <HoursForm
          assignmentId={assignmentId}
          eventId={eventId}
          initial={hoursText(currentMinutes ?? plannedMinutes)}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function HoursForm({
  assignmentId,
  eventId,
  initial,
  onDone,
}: {
  assignmentId: string;
  eventId: string;
  initial: string;
  onDone: () => void;
}) {
  const [hours, setHours] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="stunden">Geleistete Stunden</Label>
        <Input
          id="stunden"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="z. B. 2,5"
        />
      </div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const value = Number(hours.trim().replace(",", "."));
            if (hours.trim() === "" || !Number.isFinite(value) || value < 0 || value > 24) {
              toast.error("Bitte gib die Stunden als Zahl zwischen 0 und 24 ein (z. B. 2,5).");
              return;
            }
            const result = await recordHoursAction({
              assignmentId,
              minutes: Math.round(value * 60),
              eventId,
            });
            if (!result.ok) {
              toast.error(result.error.message);
              return;
            }
            toast.success("Stunden gespeichert.");
            onDone();
            router.refresh();
          })
        }
      >
        Speichern
      </Button>
    </div>
  );
}
