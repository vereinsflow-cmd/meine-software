import type { Metadata } from "next";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { BackLink } from "@/components/shared/back-link";
import { param, type RawSearchParams } from "@/lib/search-params";
import { parseChatKey, type ChatTarget } from "@/modules/messages/chat-format";
import { ComposeForm } from "@/modules/messages/components/compose-form";
import { emptyMessage } from "@/modules/messages/schemas";
import {
  getComposeOptions,
  getDraftForEdit,
  type ComposeOptions,
} from "@/modules/messages/service";
import { isAppError } from "@/server/errors";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Neue Nachricht" };

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  // Aus einem Chat kommend („Mit Betreff schreiben“): dessen Gruppe vorauswählen – und in die Auswahl aufnehmen, falls sie
  // sonst fehlt (z. B. eine länger zurückliegende Veranstaltung). Nur, wenn man dort schreiben darf.
  const chatTarget = parseChatKey(param(params, "an"));
  const options = await getComposeOptions(ctx, {
    include: chatTarget
      ? {
          audience: chatTarget.audience,
          departmentId: chatTarget.departmentId ?? undefined,
          eventId: chatTarget.eventId ?? undefined,
        }
      : undefined,
  });
  if (!options) return <NoAccess what="das Schreiben von Nachrichten" />;

  const draftId = param(params, "entwurf") ?? null;
  const draft = draftId
    ? await getDraftForEdit(ctx, draftId).catch((error: unknown) => {
        // Nicht auffindbar, fremd oder schon gesendet: Formular leer öffnen statt eines Fehlers.
        if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "CONFLICT"))
          return null;
        throw error;
      })
    : null;
  const defaults = draft
    ? {
        ...emptyMessage(),
        ...draft,
        departmentId: draft.departmentId ?? "",
        eventId: draft.eventId ?? "",
      }
    : chatTarget && offers(options, chatTarget)
      ? emptyMessage({
          audience: chatTarget.audience,
          departmentId: chatTarget.departmentId ?? "",
          eventId: chatTarget.eventId ?? "",
        })
      : emptyMessage(defaultTarget(options));

  return (
    <>
      <BackLink href="/nachrichten">Nachrichten</BackLink>
      <PageHeader
        title={draft ? "Entwurf bearbeiten" : "Neue Nachricht"}
        description={
          options.scope === "OWN"
            ? "Schreibe an alle Mitglieder oder an eine deiner Gruppen – deine Abteilungen und die Veranstaltungen, bei denen du dabei bist."
            : "Schreibe an Mitglieder, eine Abteilung oder die Teilnehmer und Helfer einer Veranstaltung."
        }
      />
      <ComposeForm draftId={draft ? draftId : null} defaults={defaults} options={options} />
    </>
  );
}

/** Vorauswahl: Leitung die eigene Abteilung, sonst alle Mitglieder, sonst die erste eigene Gruppe. */
function defaultTarget(options: ComposeOptions) {
  const led = options.scope === "DEPARTMENT" && options.departments.find((d) => d.managed);
  if (led) return { audience: "DEPARTMENT" as const, departmentId: led.id };
  if (options.allMembers) return { audience: "ALL_MEMBERS" as const };
  const department = options.departments[0];
  if (department) return { audience: "DEPARTMENT" as const, departmentId: department.id };
  return { audience: "EVENT_PARTICIPANTS" as const, eventId: options.events[0]?.id ?? "" };
}

/** Steht die Gruppe in der Auswahl (sonst zeigte das Formular leere Felder)? */
function offers(options: ComposeOptions, target: ChatTarget): boolean {
  if (target.audience === "ALL_MEMBERS") return options.allMembers;
  if (target.audience === "DEPARTMENT")
    return options.departments.some((d) => d.id === target.departmentId);
  const event = options.events.find((e) => e.id === target.eventId);
  return target.audience === "EVENT_HELPERS" ? !!event?.asHelper : !!event?.asParticipant;
}
