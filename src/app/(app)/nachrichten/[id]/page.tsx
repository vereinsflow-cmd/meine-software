import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/dates";
import { DeleteMessageButton } from "@/modules/messages/components/message-actions";
import { AUDIENCE_LABEL } from "@/modules/messages/schemas";
import { getMessage } from "@/modules/messages/service";
import { isAppError } from "@/server/errors";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Nachricht" };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext();
  if (!can(ctx, "messages:read")) return <NoAccess what="die Nachrichten" />;

  const message = await getMessage(ctx, id).catch((error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!message) notFound();

  const target =
    message.audience === "DEPARTMENT" && message.department
      ? `Abteilung ${message.department.name}`
      : message.event && message.audience !== "ALL_MEMBERS"
        ? `${message.audience === "EVENT_HELPERS" ? "Helfer" : "Zugesagte Teilnehmer"}: ${message.event.title}`
        : AUDIENCE_LABEL[message.audience];

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
        title={message.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {message.author ? `Von ${message.author}` : "Von einem früheren Mitglied"} ·{" "}
            {message.sentAt ? `${formatDateTime(message.sentAt)} Uhr` : "nicht gesendet"}
            {message.isAnnouncement && <ToneBadge tone="info">Ankündigung</ToneBadge>}
            {message.status === "DRAFT" && <ToneBadge tone="neutral">Entwurf</ToneBadge>}
          </span>
        }
        actions={
          message.can.delete ? (
            <DeleteMessageButton
              id={message.id}
              subject={message.subject}
              draft={message.status === "DRAFT"}
              redirectTo="/nachrichten"
            />
          ) : undefined
        }
      />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardContent>
            {/* Reiner Text: React maskiert alles, Zeilenumbrüche bleiben durch white-space erhalten. */}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">
          An: {target}
          {message.sendEmail && " · zusätzlich per E-Mail"}
        </p>
        {message.readCount !== null && message.status === "SENT" && (
          <p className="text-sm" role="status">
            <strong className="tabular-nums">{message.readCount}</strong> von{" "}
            <span className="tabular-nums">{message.recipientCount}</span> Empfängern haben die
            Nachricht geöffnet.
          </p>
        )}
      </div>
    </>
  );
}
