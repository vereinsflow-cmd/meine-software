import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ToneBadge, type Tone } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/dates";
import { pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { SUPPORT_CATEGORY_LABEL, SUPPORT_STATUS_LABEL, type SupportStatusKey } from "@/lib/support";
import { TicketEditForm } from "@/modules/help/components/ticket-edit-form";
import { listTickets } from "@/modules/help/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Eingegangene Meldungen" };

const statusTone: Record<SupportStatusKey, Tone> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  DONE: "success",
};

const VIEWS = [
  { key: "offen", label: "Offen", status: "OPEN_ALL" as const },
  { key: "erledigt", label: "Erledigt", status: "DONE" as const },
  { key: "alle", label: "Alle", status: undefined },
];

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "club:update")) return <NoAccess what="die eingegangenen Meldungen" />;

  const view = VIEWS.find((entry) => entry.key === param(params, "ansicht")) ?? VIEWS[0]!;
  const result = await listTickets(ctx, { status: view.status, request: pageRequest(params, 15) });

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/hilfe">
            <ChevronLeftIcon /> Hilfe & Support
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Eingegangene Meldungen"
        description="Probleme, Fragen und Vorschläge aus deinem Verein. Setze den Status und antworte – die meldende Person wird benachrichtigt."
      />

      <nav aria-label="Ansicht wählen" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {VIEWS.map((entry) => (
          <Link
            key={entry.key}
            href={
              entry.key === "offen" ? "/hilfe/meldungen" : `/hilfe/meldungen?ansicht=${entry.key}`
            }
            aria-current={entry.key === view.key ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              entry.key === view.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon />}
          title={view.key === "offen" ? "Keine offenen Meldungen" : "Keine Meldungen"}
          description={
            view.key === "offen"
              ? "Sobald jemand ein Problem meldet, erscheint es hier – und du wirst benachrichtigt."
              : "In dieser Ansicht gibt es nichts."
          }
        />
      ) : (
        <>
          <ul className="grid gap-4">
            {result.items.map((ticket) => (
              <li
                key={ticket.id}
                className="grid gap-3 rounded-xl border p-4"
                aria-label={`Meldung ${ticket.subject}`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{ticket.subject}</h2>
                    <ToneBadge tone={statusTone[ticket.status]}>
                      {SUPPORT_STATUS_LABEL[ticket.status]}
                    </ToneBadge>
                    <ToneBadge tone="neutral">{SUPPORT_CATEGORY_LABEL[ticket.category]}</ToneBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ticket.reporter ? (
                      <>
                        Von {ticket.reporter.name} (
                        <a
                          href={`mailto:${ticket.reporter.email}`}
                          className="underline underline-offset-4"
                        >
                          {ticket.reporter.email}
                        </a>
                        )
                      </>
                    ) : (
                      "Von einer nicht mehr vorhandenen Person"
                    )}
                    {" · "}
                    {formatDateTime(ticket.createdAt)} Uhr
                    {ticket.device ? ` · ${ticket.device}` : ""}
                    {ticket.pagePath ? (
                      <>
                        {" · Seite "}
                        <Link href={ticket.pagePath} className="underline underline-offset-4">
                          {ticket.pagePath}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
                <TicketEditForm id={ticket.id} status={ticket.status} response={ticket.response} />
              </li>
            ))}
          </ul>
          <Pagination basePath="/hilfe/meldungen" searchParams={params} {...result} />
        </>
      )}
    </>
  );
}
