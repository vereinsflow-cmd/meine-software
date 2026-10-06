"use client";

import { useCallback, useState, useTransition } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/lib/action-result";

interface Options<TSchema extends z.ZodType<FieldValues, FieldValues>, TData> {
  schema: TSchema;
  defaultValues: DefaultValues<z.input<TSchema>>;
  /** Server Action. Wird nur aufgerufen, wenn die Eingaben im Browser bereits gültig sind. */
  action: (values: z.output<TSchema>) => Promise<ActionResult<TData>>;
  onSuccess?: (
    data: TData,
    form: UseFormReturn<z.input<TSchema>, unknown, z.output<TSchema>>,
  ) => void;
  /** Kurze Erfolgsmeldung als Toast. */
  successMessage?: string;
  /** Formular nach Erfolg leeren (Standard: nein). */
  resetOnSuccess?: boolean;
  /**
   * Meldet, solange gespeichert wird – z. B. damit ein Fenster sich währenddessen nicht schließen lässt (sonst ließe sich
   * dieselbe Buchung nach erneutem Öffnen ein zweites Mal absenden).
   */
  onBusy?: (busy: boolean) => void;
}

/** Die Anfrage kam nicht an oder die Antwort nicht zurück (offline, Zeitüberschreitung, neue App-Version im Hintergrund). */
const CONNECTION_ERROR =
  "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob gespeichert wurde, bevor du es noch einmal versuchst.";

/**
 * Verbindet React Hook Form (Browser-Validierung mit Zod) mit einer Server Action.
 * Die Validierung im Browser dient nur der Bequemlichkeit – der Server prüft immer erneut.
 * Feldfehler der Server-Antwort werden an den jeweiligen Feldern angezeigt.
 */
export function useActionForm<
  TSchema extends z.ZodType<FieldValues, FieldValues>,
  TData = undefined,
>(options: Options<TSchema, TData>) {
  type Input = z.input<TSchema>;
  type Output = z.output<TSchema>;

  const form = useForm<Input, unknown, Output>({
    // Die Typen des Resolvers sind für generische Schemas nicht ableitbar; Ein- und Ausgabetyp sind durch das Schema festgelegt.
    resolver: zodResolver(options.schema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: options.defaultValues,
    // Erst beim Absenden prüfen, danach live nachprüfen. Bei "Prüfen beim Verlassen des Feldes" erscheint die
    // Fehlermeldung genau dann, wenn der Benutzer auf "Speichern" klickt: das Layout verschiebt sich, der Button
    // wandert nach unten und der erste Klick geht verloren.
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const { action, onSuccess, successMessage, resetOnSuccess, onBusy } = options;

  const onSubmit = useCallback(
    (event?: React.BaseSyntheticEvent) =>
      form.handleSubmit((values) => {
        setFormError(null);
        onBusy?.(true);
        startTransition(async () => {
          let result: ActionResult<TData>;
          try {
            result = await action(values);
          } catch {
            // Ohne Abfangen ersetzte die Fehlerseite das ganze Formular – die Eingaben wären weg und unklar, ob gespeichert wurde.
            setFormError(CONNECTION_ERROR);
            return;
          } finally {
            onBusy?.(false);
          }
          if (result.ok) {
            if (successMessage) toast.success(successMessage);
            if (resetOnSuccess) form.reset();
            onSuccess?.(result.data, form);
            return;
          }

          const { fieldErrors, message } = result.error;
          let placed = false;
          for (const [path, messages] of Object.entries(fieldErrors ?? {})) {
            if (path === "_form") continue;
            // Zum ersten betroffenen Feld springen – wie bei Fehlern aus der Prüfung im Browser. Sonst bliebe ein Fehler weiter
            // oben (am Handy außerhalb des Bildschirms) unbemerkt und der Knopf schiene nichts zu tun.
            form.setError(
              path as Path<Input>,
              { type: "server", message: messages.join(" ") },
              { shouldFocus: !placed },
            );
            placed = true;
          }
          // Ist ein Feld betroffen, zeigen wir zusätzlich die allgemeine Meldung; sonst ist sie die einzige.
          setFormError(placed && result.error.code === "VALIDATION" ? null : message);
        });
      })(event),
    [action, form, onBusy, onSuccess, resetOnSuccess, successMessage],
  );

  return { form, onSubmit, isPending, formError, setFormError };
}
