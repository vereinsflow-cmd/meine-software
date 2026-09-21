import type { Metadata } from "next";
import Link from "next/link";
import { InboxIcon, MailIcon, PhoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge, type Tone } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/dates";
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  internalPathOrNull,
  type SupportStatusKey,
} from "@/lib/support";
import { param, type RawSearchParams } from "@/lib/search-params";
import { ContactsDialog } from "@/modules/help/components/contacts-dialog";
import { FaqList } from "@/modules/help/components/faq-list";
import { ReportDialog } from "@/modules/help/components/report-dialog";
import { visibleFaq } from "@/modules/help/faq";
import { getHelpOverview, listMyTickets } from "@/modules/help/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Hilfe & Support" };

const statusTone: Record<SupportStatusKey, Tone> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  DONE: "success",
};

const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  const [overview, tickets] = await Promise.all([getHelpOverview(ctx), listMyTickets(ctx)]);
  const from = internalPathOrNull(param(params, "von"));
  const sections = visibleFaq((key) => can(ctx, key));

  return (
    <>
      <PageHeader
        title="Hilfe & Support"
        description="Ansprechpartner, eine Anleitung zu den häufigsten Fragen und die Möglichkeit, ein Problem zu melden."
        actions={
          <>
            {overview.canManage && (
              <Button asChild variant="outline">
                <Link href="/hilfe/meldungen">
                  <InboxIcon /> Eingegangene Meldungen
                  {overview.openTickets ? ` (${overview.openTickets} offen)` : ""}
                </Link>
              </Button>
            )}
            <ReportDialog pagePath={from} />
          </>
        }
      />

      <div className="grid gap-10">
        <section aria-labelledby="hilfe-ansprechpartner" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="hilfe-ansprechpartner" className="text-lg font-semibold">
                Ansprechpartner
              </h2>
              <p className="text-sm text-muted-foreground">
                Hier erreichst du {overview.clubName} bei Fragen und Problemen.
              </p>
            </div>
            {overview.canManage && <ContactsDialog contacts={overview.contacts} />}
          </div>

          {overview.contacts.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {overview.contacts.map((contact) => (
                <li
                  key={`${contact.name}-${contact.email ?? contact.phone}`}
                  className="rounded-xl border p-4"
                >
                  <p className="font-medium">{contact.name}</p>
                  {contact.role && <p className="text-sm text-muted-foreground">{contact.role}</p>}
                  <div className="mt-2 grid gap-1 text-sm">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1.5 break-all text-primary underline-offset-4 hover:underline"
                      >
                        <MailIcon className="size-3.5 shrink-0" aria-hidden="true" />{" "}
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={phoneHref(contact.phone)}
                        className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                      >
                        <PhoneIcon className="size-3.5 shrink-0" aria-hidden="true" />{" "}
                        {contact.phone}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <p>
                Für {overview.clubName} sind noch keine Ansprechpartner hinterlegt. Nutze „Problem
                melden“ – die Vereinsverwaltung wird benachrichtigt und antwortet dir.
              </p>
              {(overview.clubContact.email || overview.clubContact.phone) && (
                <p className="mt-2">
                  Allgemeiner Kontakt des Vereins:{" "}
                  {overview.clubContact.email && (
                    <a
                      href={`mailto:${overview.clubContact.email}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {overview.clubContact.email}
                    </a>
                  )}
                  {overview.clubContact.email && overview.clubContact.phone && " · "}
                  {overview.clubContact.phone && (
                    <a
                      href={phoneHref(overview.clubContact.phone)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {overview.clubContact.phone}
                    </a>
                  )}
                </p>
              )}
            </div>
          )}

          {overview.platformSupportEmail && (
            <p className="text-sm text-muted-foreground">
              Technische Fragen zur Anwendung selbst, die dein Verein nicht klären kann:{" "}
              <a
                href={`mailto:${overview.platformSupportEmail}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {overview.platformSupportEmail}
              </a>
            </p>
          )}
        </section>

        {tickets.length > 0 && (
          <section aria-labelledby="hilfe-meine-meldungen" className="grid gap-3">
            <div>
              <h2 id="hilfe-meine-meldungen" className="text-lg font-semibold">
                Meine Meldungen
              </h2>
              <p className="text-sm text-muted-foreground">
                Deine letzten Meldungen an die Vereinsverwaltung und ihre Antworten.
              </p>
            </div>
            <ul className="grid gap-3">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="rounded-xl border p-4"
                  aria-label={`Meldung ${ticket.subject}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{ticket.subject}</p>
                    <ToneBadge tone={statusTone[ticket.status]}>
                      {SUPPORT_STATUS_LABEL[ticket.status]}
                    </ToneBadge>
                    <ToneBadge tone="neutral">{SUPPORT_CATEGORY_LABEL[ticket.category]}</ToneBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Gesendet am {formatDateTime(ticket.createdAt)} Uhr
                  </p>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{ticket.description}</p>
                  {ticket.response && (
                    <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">
                        Antwort der Vereinsverwaltung
                        {ticket.respondedAt ? ` · ${formatDateTime(ticket.respondedAt)} Uhr` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{ticket.response}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="hilfe-anleitung" className="grid gap-4">
          <div>
            <h2 id="hilfe-anleitung" className="text-lg font-semibold">
              Anleitung und häufige Fragen
            </h2>
            <p className="text-sm text-muted-foreground">
              Schritt für Schritt erklärt – passend zu dem, was du in {overview.clubName} darfst.
            </p>
          </div>
          <FaqList sections={sections} />
        </section>
      </div>
    </>
  );
}
