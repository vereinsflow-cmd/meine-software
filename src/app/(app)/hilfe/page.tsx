import type { Metadata } from "next";
import Link from "next/link";
import { InboxIcon, MailIcon, PhoneIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD_SURFACE } from "@/components/ui/surface";
import { CompactEmpty } from "@/components/shared/compact-empty";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection, PageStack } from "@/components/shared/page-section";
import { ToneBadge, type Tone } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/dates";
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  internalPathOrNull,
  type SupportStatusKey,
} from "@/lib/support";
import { param, type RawSearchParams } from "@/lib/search-params";
import { phoneHref } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { ContactsDialog } from "@/modules/help/components/contacts-dialog";
import { FaqList } from "@/modules/help/components/faq-list";
import { ReportDialog } from "@/modules/help/components/report-dialog";
import { visibleFaq } from "@/modules/help/faq";
import { getHelpOverview, listMyTickets } from "@/modules/help/service";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Hilfe & Support" };

const statusTone: Record<SupportStatusKey, Tone> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  DONE: "success",
};

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  const [overview, tickets] = await Promise.all([getHelpOverview(ctx), listMyTickets(ctx)]);
  const from = internalPathOrNull(param(params, "von"));
  const sections = visibleFaq((key, clubWide) =>
    clubWide ? scopeOf(ctx, key) === "CLUB" : can(ctx, key),
  );

  return (
    <PageStack>
      <PageHeader
        title="Hilfe & Support"
        description="Ansprechpartner, eine Anleitung zu den häufigsten Fragen und die Möglichkeit, ein Problem zu melden."
        actions={
          <>
            {/* Hauptaktion zuerst (links, am Handy oben) – wie auf den übrigen Seiten. */}
            <ReportDialog pagePath={from} />
            {overview.canManage && (
              <Button asChild variant="outline">
                <Link href="/hilfe/meldungen">
                  <InboxIcon /> Eingegangene Meldungen
                  {overview.openTickets ? ` (${overview.openTickets} offen)` : ""}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <PageSection
        id="hilfe-ansprechpartner"
        title="Ansprechpartner"
        description={`Hier erreichst du ${overview.clubName} bei Fragen und Problemen.`}
        actions={overview.canManage ? <ContactsDialog contacts={overview.contacts} /> : undefined}
      >
        {overview.contacts.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.contacts.map((contact) => (
              <li
                key={`${contact.name}-${contact.email ?? contact.phone}`}
                className={cn(CARD_SURFACE, "p-4")}
              >
                <p className="font-medium">{contact.name}</p>
                {contact.role && <p className="text-sm text-muted-foreground">{contact.role}</p>}
                <div className="mt-2 grid gap-1 text-sm">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1.5 break-all text-primary underline-offset-4 hover:underline"
                    >
                      <MailIcon className="size-3.5 shrink-0" aria-hidden="true" /> {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a
                      href={phoneHref(contact.phone)}
                      className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                    >
                      <PhoneIcon className="size-3.5 shrink-0" aria-hidden="true" /> {contact.phone}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          // Leer ist kein Fehler: ruhige Karte statt gestricheltem Rahmen, darunter der allgemeine Kontakt des Vereins.
          <div className={cn(CARD_SURFACE, "grid gap-3 p-4")}>
            <CompactEmpty icon={<UsersIcon />} accent="blue" title="Noch keine Ansprechpartner">
              Für {overview.clubName} sind noch keine Ansprechpartner hinterlegt. Nutze „Problem
              melden“ – die Vereinsverwaltung wird benachrichtigt und antwortet dir.
            </CompactEmpty>
            {(overview.clubContact.email || overview.clubContact.phone) && (
              <p className="px-1 text-sm text-muted-foreground">
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
      </PageSection>

      {tickets.length > 0 && (
        <PageSection
          id="hilfe-meine-meldungen"
          title="Meine Meldungen"
          description="Deine letzten Meldungen an die Vereinsverwaltung und ihre Antworten."
        >
          <ul className="grid gap-3">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className={cn(CARD_SURFACE, "p-4")}
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
        </PageSection>
      )}

      <PageSection
        id="hilfe-anleitung"
        title="Anleitung und häufige Fragen"
        description={`Schritt für Schritt erklärt – passend zu dem, was du in ${overview.clubName} darfst.`}
      >
        <FaqList sections={sections} />
      </PageSection>
    </PageStack>
  );
}
