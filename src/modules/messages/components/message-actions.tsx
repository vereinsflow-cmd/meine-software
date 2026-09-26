"use client";

import { useRouter } from "next/navigation";
import { TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { deleteMessageAction } from "../actions";

/** Zurückrufen (bei gesendeten) bzw. Verwerfen (bei Entwürfen). Gesendete Nachrichten verschwinden damit bei allen Empfängern. */
export function DeleteMessageButton({
  id,
  subject,
  draft,
  redirectTo,
}: {
  id: string;
  subject: string;
  draft: boolean;
  redirectTo: string;
}) {
  const router = useRouter();
  return (
    <ConfirmAction
      destructive
      trigger={
        <Button variant="outline" className="text-destructive">
          <TrashIcon /> {draft ? "Entwurf verwerfen" : "Zurückrufen"}
        </Button>
      }
      title={draft ? "Entwurf verwerfen?" : "Nachricht zurückrufen?"}
      description={
        draft
          ? `Der Entwurf „${subject}“ wird gelöscht.`
          : `„${subject}“ verschwindet bei allen Empfängern aus dem Posteingang. Bereits verschickte E-Mails lassen sich nicht zurückholen.`
      }
      confirmLabel={draft ? "Verwerfen" : "Zurückrufen"}
      action={() => deleteMessageAction({ id })}
      successMessage={draft ? "Entwurf verworfen." : "Nachricht zurückgerufen."}
      onSuccess={() => router.push(redirectTo)}
    />
  );
}
