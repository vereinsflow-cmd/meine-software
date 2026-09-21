import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { param, type RawSearchParams } from "@/lib/search-params";
import { ComposeForm } from "@/modules/messages/components/compose-form";
import { emptyMessage } from "@/modules/messages/schemas";
import { getComposeOptions, getDraftForEdit } from "@/modules/messages/service";
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
  const options = await getComposeOptions(ctx);
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
    : emptyMessage({
        audience: options.scope === "CLUB" ? "ALL_MEMBERS" : "DEPARTMENT",
        departmentId: options.scope === "DEPARTMENT" ? (options.departments[0]?.id ?? "") : "",
      });

  return (
    <>
      <p className="mb-3">
        <Link
          href="/nachrichten"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Nachrichten
        </Link>
      </p>
      <PageHeader
        title={draft ? "Entwurf bearbeiten" : "Neue Nachricht"}
        description="Schreibe an Mitglieder, eine Abteilung oder die Teilnehmer und Helfer einer Veranstaltung."
      />
      <ComposeForm draftId={draft ? draftId : null} defaults={defaults} options={options} />
    </>
  );
}
