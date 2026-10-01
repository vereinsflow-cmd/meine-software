"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SendIcon } from "lucide-react";
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
import {
  CheckboxField,
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionResult } from "@/lib/action-result";
import { eventOptions, type EventChoice } from "@/lib/event-options";
import { previewRecipientsAction, saveDraftAction, sendMessageAction } from "../actions";
import { chatKeyOf } from "../chat-format";
import {
  AUDIENCE_LABEL,
  messageFormSchema,
  type Audience,
  type MessageFormInput,
} from "../schemas";

interface SubmitResult {
  /** true = als Entwurf gespeichert, false = gesendet */
  saved: boolean;
  id: string;
  recipients: number;
  unreachable: number;
}

interface Preview {
  reachable: number;
  unreachable: number;
}

/**
 * Nachricht verfassen. Die Zielgruppe wird vor dem Versand ausgewertet und angezeigt ("erreicht 12 Personen"); der
 * Versand selbst verlangt eine Bestätigung, weil er sich nicht zurückholen lässt (nur ausblenden).
 */
export function ComposeForm({
  draftId,
  defaults,
  options,
}: {
  draftId: string | null;
  defaults: MessageFormInput;
  options: {
    scope: "CLUB" | "DEPARTMENT" | "OWN";
    /** An alle Mitglieder schreiben (als Verein oder als Mitglied)? */
    allMembers: boolean;
    /** `managed`: als Verein bzw. Leitung – nur dann gibt es Ankündigung und E-Mail. */
    departments: { id: string; name: string; managed: boolean }[];
    /** `asParticipant`/`asHelper`: an die Teilnehmer bzw. Helfer dieser Veranstaltung darf ich schreiben. */
    events: (EventChoice & { managed: boolean; asParticipant: boolean; asHelper: boolean })[];
  };
}) {
  const router = useRouter();
  // Was gerade abgeschickt wird: die Referenz wird beim Absenden gelesen (vor dem nächsten Rendern schon gesetzt),
  // der Zustand steuert nur die Beschriftung der Schaltfläche.
  const mode = useRef<"draft" | "send">("send");
  const [activeMode, setActiveMode] = useState<"draft" | "send">("send");
  const chooseMode = (next: "draft" | "send") => {
    mode.current = next;
    setActiveMode(next);
  };
  const [previewState, setPreviewState] = useState<{
    key: string;
    preview: Preview | null;
    error: string | null;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Ankündigung und E-Mail nur, wer hier als Verein bzw. Leitung schreibt – alle anderen schreiben einfache Nachrichten.
  const announceAllowed = (target: {
    audience: Audience;
    departmentId?: string;
    eventId?: string;
  }) =>
    options.scope === "CLUB" ||
    (target.audience === "DEPARTMENT" &&
      !!options.departments.find((d) => d.id === target.departmentId)?.managed) ||
    ((target.audience === "EVENT_PARTICIPANTS" || target.audience === "EVENT_HELPERS") &&
      !!options.events.find((e) => e.id === target.eventId)?.managed);

  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: messageFormSchema,
    defaultValues: defaults,
    action: async (input): Promise<ActionResult<SubmitResult>> => {
      const values = announceAllowed(input)
        ? input
        : { ...input, isAnnouncement: false, sendEmail: false };
      if (mode.current === "draft") {
        const saved = await saveDraftAction(draftId, values);
        return saved.ok
          ? { ok: true, data: { saved: true, id: saved.data.id, recipients: 0, unreachable: 0 } }
          : saved;
      }
      const sent = await sendMessageAction(draftId, values);
      return sent.ok ? { ok: true, data: { saved: false, ...sent.data } } : sent;
    },
    onSuccess: (data) => {
      setConfirmOpen(false);
      if (data.saved) {
        toast.success("Entwurf gespeichert.");
        router.push("/nachrichten?ansicht=entwuerfe");
      } else {
        toast.success(
          `Nachricht an ${data.recipients} ${data.recipients === 1 ? "Person" : "Personen"} gesendet.`,
        );
        // In den Chat der Gruppe – dort steht die Nachricht jetzt als grüne Blase.
        const values = form.getValues();
        router.push(
          `/nachrichten?chat=${chatKeyOf({
            audience: values.audience,
            departmentId: values.departmentId || null,
            eventId: values.eventId || null,
          })}#nachricht-${data.id}`,
        );
      }
      router.refresh();
    },
  });

  const audience = form.watch("audience") as Audience;
  const departmentId = form.watch("departmentId");
  const eventId = form.watch("eventId");
  const needsDepartment = audience === "DEPARTMENT";
  const needsEvent = audience === "EVENT_PARTICIPANTS" || audience === "EVENT_HELPERS";
  const targetReady = (!needsDepartment || !!departmentId) && (!needsEvent || !!eventId);

  // Die Vorschau gilt nur für genau die Zielgruppe, für die sie berechnet wurde – nach einem Wechsel erscheint keine veraltete Zahl.
  const targetKey = `${audience}|${departmentId ?? ""}|${eventId ?? ""}`;
  const shown = targetReady && previewState?.key === targetKey ? previewState : null;
  const preview = shown?.preview ?? null;
  const previewError = shown?.error ?? null;

  useEffect(() => {
    if (!targetReady) return;
    let cancelled = false;
    void previewRecipientsAction({ audience, departmentId, eventId }).then((result) => {
      if (cancelled) return;
      setPreviewState(
        result.ok
          ? { key: targetKey, preview: result.data, error: null }
          : { key: targetKey, preview: null, error: result.error.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [audience, departmentId, eventId, targetReady, targetKey]);

  // Nur Zielgruppen, die ich erreichen darf (als Mitglied: alle Mitglieder, meine Abteilungen, meine Veranstaltungen).
  const audienceOptions = (Object.keys(AUDIENCE_LABEL) as Audience[])
    .filter((value) =>
      value === "ALL_MEMBERS"
        ? options.allMembers
        : value === "DEPARTMENT"
          ? options.departments.length > 0
          : value === "EVENT_HELPERS"
            ? options.events.some((e) => e.asHelper)
            : options.events.some((e) => e.asParticipant),
    )
    .map((value) => ({ value, label: AUDIENCE_LABEL[value] }));
  const extrasAllowed = announceAllowed({ audience, departmentId, eventId });
  const body = form.watch("body") ?? "";

  return (
    <>
      <form method="post" onSubmit={onSubmit} noValidate className="grid max-w-3xl gap-5">
        <FormError message={formError} />
        <SelectField
          form={form}
          name="audience"
          label="An wen?"
          options={audienceOptions}
          required
        />
        {needsDepartment && (
          <SelectField
            form={form}
            name="departmentId"
            label="Abteilung"
            placeholder="Bitte wählen"
            options={options.departments.map((d) => ({ value: d.id, label: d.name }))}
            required
          />
        )}
        {needsEvent && (
          <SelectField
            form={form}
            name="eventId"
            label="Veranstaltung"
            placeholder="Bitte wählen"
            options={eventOptions(
              options.events.filter((e) =>
                audience === "EVENT_HELPERS" ? e.asHelper : e.asParticipant,
              ),
            )}
            required
          />
        )}
        <div role="status" aria-live="polite" className="text-sm">
          {previewError && <p className="text-destructive">{previewError}</p>}
          {preview && (
            <p className={preview.reachable === 0 ? "text-destructive" : "text-muted-foreground"}>
              Erreicht {preview.reachable} {preview.reachable === 1 ? "Person" : "Personen"}
              {preview.unreachable > 0
                ? `; ${preview.unreachable} ${preview.unreachable === 1 ? "Mitglied hat" : "Mitglieder haben"} kein aktives Benutzerkonto und ${preview.unreachable === 1 ? "wird" : "werden"} nicht erreicht`
                : ""}
              .
            </p>
          )}
        </div>

        <TextField form={form} name="subject" label="Betreff" required />
        <div className="grid gap-1">
          <TextareaField
            form={form}
            name="body"
            label="Nachricht"
            rows={10}
            required
            hint="Reiner Text – Zeilenumbrüche bleiben erhalten, Formatierungen (HTML) werden nicht dargestellt."
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums" aria-live="off">
            {body.length} / 5000
          </p>
        </div>
        {extrasAllowed ? (
          <div className="grid gap-3">
            <CheckboxField
              form={form}
              name="isAnnouncement"
              label="Als Ankündigung kennzeichnen"
              hint="Ankündigungen werden in der Benachrichtigung besonders benannt."
            />
            <CheckboxField
              form={form}
              name="sendEmail"
              label="Zusätzlich per E-Mail senden"
              hint="Nur an Personen, die E-Mail-Benachrichtigungen nicht abgeschaltet haben."
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Alle in der Gruppe sehen deine Nachricht im Chat und bekommen eine Benachrichtigung.
            Ankündigungen und E-Mails verschicken Vorstand und Abteilungsleitung.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isPending || (preview !== null && preview.reachable === 0)}
            onClick={async () => {
              chooseMode("send");
              if (await form.trigger()) setConfirmOpen(true);
            }}
          >
            <SendIcon /> Jetzt senden …
          </Button>
          <Button
            type="submit"
            variant="outline"
            disabled={isPending}
            onClick={() => chooseMode("draft")} // wird vor dem Absenden des Formulars gesetzt
          >
            {isPending && activeMode === "draft" ? "Wird gespeichert …" : "Als Entwurf speichern"}
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nachricht jetzt senden?</AlertDialogTitle>
            <AlertDialogDescription>
              „{form.getValues("subject")}“ geht an{" "}
              {preview
                ? `${preview.reachable} ${preview.reachable === 1 ? "Person" : "Personen"}`
                : "die gewählte Zielgruppe"}
              . Eine gesendete Nachricht kann nicht mehr geändert, nur zurückgerufen (ausgeblendet)
              werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Zurück</AlertDialogCancel>
            <Button
              disabled={isPending}
              onClick={() => {
                chooseMode("send");
                void onSubmit();
              }}
            >
              {isPending ? "Wird gesendet …" : "Senden"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
