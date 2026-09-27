"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
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
import {
  CheckboxField,
  FormError,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { EVENT_TYPE_LABEL, options as labelOptions } from "@/lib/labels";
import { FREQUENCY_LABEL, MAX_SERIES_OCCURRENCES } from "@/lib/recurrence";
import { createEventAction } from "@/modules/events/actions";
import { eventFormSchema } from "@/modules/events/schemas";
import {
  followStartDate,
  isDateKey,
  quickEventDefaults,
  type QuickEventOptions,
} from "../quick-event";

/**
 * „Neuer Termin“ direkt im Kalender: ein kurzes Formular mit dem Nötigsten, gespeichert wie im großen Formular als
 * Entwurf. Geöffnet wird es per Doppelklick auf einen Tag (`DayDoubleClick`) oder – für Tastatur und Touch – über den
 * Knopf im Seitenkopf (`NewEventButton`). Nach dem Speichern bleibt man im Kalender; der neue Termin erscheint am Tag.
 */
function QuickEventForm({
  date,
  options,
  onDone,
}: {
  date: string;
  options: QuickEventOptions;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: eventFormSchema,
    defaultValues: quickEventDefaults(date, options),
    action: createEventAction,
    onSuccess: ({ id, count }) => {
      onDone();
      toast.success(
        count > 1 ? `${count} Termine als Entwurf angelegt.` : "Termin als Entwurf angelegt.",
        { action: { label: "Öffnen", onClick: () => router.push(`/veranstaltungen/${id}`) } },
      );
      router.refresh();
    },
  });

  // Verschiebt man den Beginn, wandert das Ende mit – sonst läge es plötzlich davor.
  useEffect(() => {
    let previous = form.getValues("startDate");
    const subscription = form.watch((values, { name }) => {
      if (name !== "startDate") return;
      const next = values.startDate ?? "";
      const end = form.getValues("endDate");
      const followed = followStartDate(previous, next, end);
      previous = next;
      if (followed !== end)
        form.setValue("endDate", followed, { shouldValidate: form.formState.isSubmitted });
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const allDay = form.watch("allDay");
  const repeat = form.watch("repeat");

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      {formError && (
        <div className="sm:col-span-2">
          <FormError message={formError} />
        </div>
      )}
      <TextField form={form} name="title" label="Titel" required className="sm:col-span-2" />
      <SelectField
        form={form}
        name="type"
        label="Art"
        options={labelOptions(EVENT_TYPE_LABEL)}
        required
      />
      <SelectField
        form={form}
        name="departmentId"
        label="Abteilung"
        required={options.departmentRequired}
        placeholder={options.departmentRequired ? "Bitte wählen" : "Ganzer Verein"}
        options={options.departments
          .filter((d) => d.selectable !== false)
          .map((d) => ({ value: d.id, label: d.name }))}
      />
      <CheckboxField form={form} name="allDay" label="Ganztägig" className="sm:col-span-2" />
      <TextField form={form} name="startDate" label="Beginn – Datum" type="date" required />
      {!allDay && (
        <TextField form={form} name="startTime" label="Beginn – Uhrzeit" type="time" required />
      )}
      <TextField form={form} name="endDate" label="Ende – Datum" type="date" required />
      {!allDay && (
        <TextField form={form} name="endTime" label="Ende – Uhrzeit" type="time" required />
      )}
      <TextField
        form={form}
        name="locationName"
        label="Ort"
        hint="z. B. Sportplatz, Vereinsheim"
        className="sm:col-span-2"
      />
      <SelectField
        form={form}
        name="repeat"
        label="Wiederholung"
        options={[
          { value: "none", label: "Einmalig" },
          ...Object.entries(FREQUENCY_LABEL).map(([value, label]) => ({ value, label })),
        ]}
      />
      {repeat !== "none" && (
        <TextField
          form={form}
          name="repeatCount"
          label="Anzahl der Termine"
          type="number"
          inputMode="numeric"
          hint={`Insgesamt, höchstens ${MAX_SERIES_OCCURRENCES}.`}
        />
      )}
      <DialogFooter className="sm:col-span-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Abbrechen
          </Button>
        </DialogClose>
        <SubmitButton pending={isPending}>Als Entwurf speichern</SubmitButton>
      </DialogFooter>
    </form>
  );
}

function QuickEventDialog({
  date,
  open,
  onOpenChange,
  options,
  trigger,
}: {
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: QuickEventOptions;
  trigger?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Neuer Termin</DialogTitle>
          <DialogDescription>
            Der Termin wird als Entwurf gespeichert und ist erst nach dem Veröffentlichen für
            Mitglieder sichtbar. Weitere Angaben wie Beschreibung oder Anmeldung ergänzt du auf der
            Seite des Termins.
          </DialogDescription>
        </DialogHeader>
        <QuickEventForm
          key={date}
          date={date}
          options={options}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Links, Knöpfe und Felder behalten beim Doppelklick ihre eigene Wirkung. */
const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button']";

/** Tag unter dem Zeiger (`data-date` der Kalenderzelle) – `null` auf Bedienelementen und außerhalb eines Tages. */
function dayAt(target: EventTarget): string | null {
  if (!(target instanceof Element) || target.closest(INTERACTIVE)) return null;
  const day = target.closest<HTMLElement>("[data-date]")?.dataset.date;
  return isDateKey(day) ? day : null;
}

/**
 * Doppelklick auf einen Tag – ein Element mit `data-date="JJJJ-MM-TT"` in den Kalenderansichten – öffnet „Neuer
 * Termin“ mit diesem Datum. Die Ansichten selbst bleiben Server-Komponenten; diese Hülle hört nur auf den Doppelklick.
 */
export function DayDoubleClick({
  options,
  children,
}: {
  options: QuickEventOptions;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  return (
    <>
      <div
        onMouseDown={(event) => {
          // Sonst markiert der Browser beim Doppelklick das Wort unter dem Zeiger.
          if (event.detail > 1 && dayAt(event.target)) event.preventDefault();
        }}
        onDoubleClick={(event) => {
          const day = dayAt(event.target);
          if (!day) return;
          setDate(day);
          setOpen(true);
        }}
      >
        {children}
      </div>
      <QuickEventDialog date={date} open={open} onOpenChange={setOpen} options={options} />
    </>
  );
}

/** „Neuer Termin“ im Seitenkopf: derselbe Weg ohne Maus (Tastatur, Smartphone), vorbelegt mit dem gezeigten Tag. */
export function NewEventButton({ date, options }: { date: string; options: QuickEventOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <QuickEventDialog
      date={date}
      open={open}
      onOpenChange={setOpen}
      options={options}
      trigger={
        <Button>
          <PlusIcon /> Neuer Termin
        </Button>
      }
    />
  );
}
