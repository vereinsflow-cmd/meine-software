"use client";

import { useRouter } from "next/navigation";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextareaField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  SUPPORT_LIMITS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  type SupportStatusKey,
} from "@/lib/support";
import { updateTicketAction } from "../actions";
import { ticketUpdateSchema } from "../schemas";

/** Status setzen und der meldenden Person antworten (nur Vereinsverwaltung). */
export function TicketEditForm({
  id,
  status,
  response,
}: {
  id: string;
  status: SupportStatusKey;
  response: string | null;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: ticketUpdateSchema,
    defaultValues: { status, response: response ?? "" },
    action: (values) => updateTicketAction(id, values),
    successMessage: "Meldung gespeichert.",
    onSuccess: () => router.refresh(),
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 border-t pt-3">
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <SelectField
          form={form}
          name="status"
          label="Status"
          options={SUPPORT_STATUSES.map((value) => ({ value, label: SUPPORT_STATUS_LABEL[value] }))}
        />
        <TextareaField
          form={form}
          name="response"
          label="Antwort an die meldende Person"
          rows={3}
          hint={`Sichtbar für die meldende Person (höchstens ${SUPPORT_LIMITS.response} Zeichen). Sie wird bei Änderungen benachrichtigt.`}
        />
      </div>
      <SubmitButton pending={isPending} className="w-fit">
        Speichern
      </SubmitButton>
    </form>
  );
}
