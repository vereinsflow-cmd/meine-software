"use client";

import { useState, useTransition } from "react";
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

export function ShiftFormDialog({
  eventId,
  shiftId,
  defaults,
  members,
}: {
  eventId: string;
  shiftId?: string;
  defaults: ShiftFormInput;
  members: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: shiftFormSchema,
    defaultValues: defaults,
    action: (values) =>
      shiftId ? updateShiftAction(shiftId, eventId, values) : createShiftAction(eventId, values),
    successMessage: shiftId ? "Schicht gespeichert." : "Schicht angelegt.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{shiftId ? "Schicht bearbeiten" : "Neue Schicht"}</DialogTitle>
          <DialogDescription>
            Endet die Schicht nach Mitternacht, wähle eine Endzeit vor dem Beginn (z. B. 22:00 –
            02:00 Uhr).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
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
      </DialogContent>
    </Dialog>
  );
}

/** Zuweisung durch Veranstalter. Die Liste zeigt, wer wegen Überschneidung, Mindestalter o. Ä. nicht möglich ist – mit Grund. */
export function AssignDialog({
  shiftId,
  eventId,
  title,
}: {
  shiftId: string;
  eventId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<AssignableMember[] | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Die Liste wird beim Öffnen frisch geladen (nicht früher: Belegungen ändern sich laufend).
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setList(null);
    void listAssignableAction({ shiftId }).then((result) => {
      if (result.ok) setList(result.data);
      else toast.error(result.error.message);
    });
  }

  const visible = (list ?? []).filter(
    (m) => !m.alreadyAssigned && m.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const chosen = list?.find((m) => m.id === selected);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlusIcon /> Zuweisen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Helfer zuweisen: {title}</DialogTitle>
          <DialogDescription>
            Die Person wird per Benachrichtigung (und E-Mail) informiert. Nicht wählbare Personen
            sind mit Grund gekennzeichnet.
          </DialogDescription>
        </DialogHeader>
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
            {list === null ? (
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
                setSelected("");
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? "Wird zugewiesen …" : chosen ? `${chosen.name} zuweisen` : "Zuweisen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Dokumentation der tatsächlich geleisteten Stunden eines Helfers (Eingabe in Stunden, z. B. 2,5). */
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
  const [hours, setHours] = useState(
    String(((currentMinutes ?? plannedMinutes) / 60).toString().replace(".", ",")),
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={`Stunden von ${name} erfassen`}
        >
          <ClockIcon /> {currentMinutes === null ? "Stunden" : formatDuration(currentMinutes)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Helferstunden: {name}</DialogTitle>
          <DialogDescription>
            Geplant waren {formatDuration(plannedMinutes)}. Trage die tatsächlich geleistete Zeit
            ein.
          </DialogDescription>
        </DialogHeader>
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
                const value = Number(hours.replace(",", "."));
                if (!Number.isFinite(value) || value < 0 || value > 24) {
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
                setOpen(false);
                router.refresh();
              })
            }
          >
            Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
