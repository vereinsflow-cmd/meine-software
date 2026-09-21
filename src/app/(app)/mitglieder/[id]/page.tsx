import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { MemberStatusBadge, ToneBadge } from "@/components/shared/status-badge";
import { formatCalendarDate, formatDateTime } from "@/lib/dates";
import { CONSENT_TYPE_LABEL, MEMBER_FIELD_LABEL } from "@/lib/labels";
import { ConsentPanel } from "@/modules/members/components/consent-panel";
import { MemberActions } from "@/modules/members/components/member-actions";
import { getMember, getMemberHistory } from "@/modules/members/service";
import { isAppError } from "@/server/errors";
import { requirePageContext } from "@/server/tenancy/context";
import type { ConsentType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Mitglied" };

const CONSENT_ORDER = Object.keys(CONSENT_TYPE_LABEL) as ConsentType[];

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageContext();

  const member = await getMember(ctx, id).catch((error: unknown) => {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN"))
      return null;
    throw error;
  });
  if (!member) notFound();

  const history = member.private ? await getMemberHistory(ctx, id) : [];
  const name = `${member.firstName} ${member.lastName}`;
  const consentRows = CONSENT_ORDER.map((type) => {
    const state = member.private?.consents.find((c) => c.type === type);
    return {
      type,
      granted: state?.granted ?? null,
      recordedAt: state?.recordedAt.toISOString() ?? null,
      source: state?.source ?? null,
    };
  });

  return (
    <>
      <p className="mb-3">
        <Link
          href="/mitglieder"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Alle Mitglieder
        </Link>
      </p>
      <PageHeader
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {member.memberNumber && <span>Mitgliedsnr. {member.memberNumber}</span>}
            <MemberStatusBadge status={member.status} />
            {member.archivedAt && !member.deletedAt && (
              <ToneBadge tone="neutral">Archiviert</ToneBadge>
            )}
            {member.deletedAt && <ToneBadge tone="danger">Im Papierkorb</ToneBadge>}
          </span>
        }
        actions={
          <MemberActions
            id={id}
            name={name}
            archived={member.archivedAt !== null}
            deleted={member.deletedAt !== null}
            can={member.can}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Stammdaten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Funktion", value: member.clubFunction },
                  { label: "Eintrittsdatum", value: formatCalendarDate(member.joinedAt) },
                  {
                    label: "Austrittsdatum",
                    value: member.leftAt ? formatCalendarDate(member.leftAt) : null,
                  },
                  { label: "Status", value: <MemberStatusBadge status={member.status} /> },
                ]}
              />
            </CardContent>
          </Card>

          {member.contact && (
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Kontakt und Anschrift
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DescriptionList
                  items={[
                    {
                      label: "E-Mail",
                      value: member.email ? (
                        <a
                          className="text-primary underline-offset-4 hover:underline"
                          href={`mailto:${member.email}`}
                        >
                          {member.email}
                        </a>
                      ) : null,
                    },
                    { label: "Telefon", value: member.phone },
                    { label: "Straße", value: member.contact.street },
                    {
                      label: "PLZ und Ort",
                      value: [member.contact.postalCode, member.contact.city]
                        .filter(Boolean)
                        .join(" "),
                    },
                    { label: "Land", value: member.contact.country },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {member.private && (
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Sensible Angaben
                </CardTitle>
                <CardDescription>Nur für berechtigte Personen sichtbar.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <DescriptionList
                  items={[
                    { label: "Geburtsdatum", value: formatCalendarDate(member.private.birthDate) },
                    {
                      label: "Interne Notizen",
                      value: member.private.internalNotes ? (
                        <span className="whitespace-pre-wrap">{member.private.internalNotes}</span>
                      ) : null,
                    },
                  ]}
                />
                <div>
                  <h3 className="mb-2 text-sm font-medium">Einwilligungen</h3>
                  <ConsentPanel memberId={id} rows={consentRows} canEdit={member.can.consents} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Abteilungen
              </CardTitle>
            </CardHeader>
            <CardContent>
              {member.departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keiner Abteilung zugeordnet.</p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {member.departments.map((department) => (
                    <li key={department.id} className="flex items-center justify-between gap-2">
                      {department.name}
                      {department.isLeader && <ToneBadge tone="info">Leitung</ToneBadge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Benutzerkonto
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {member.accountStatus === null ? (
                <p className="text-muted-foreground">Kein Benutzerkonto verknüpft.</p>
              ) : member.accountStatus === "ACTIVE" ? (
                <ToneBadge tone="success">Konto aktiv</ToneBadge>
              ) : (
                <ToneBadge tone="danger">Konto gesperrt</ToneBadge>
              )}
            </CardContent>
          </Card>
        </div>

        {member.private && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Änderungsverlauf
              </CardTitle>
              <CardDescription>
                Wer hat wann etwas geändert? Sensible Werte werden nicht mitprotokolliert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Einträge.</p>
              ) : (
                <ol className="divide-y">
                  {history.map((entry) => {
                    const fields = entry.changes
                      ? Object.keys(entry.changes).map((key) => MEMBER_FIELD_LABEL[key] ?? key)
                      : [];
                    return (
                      <li
                        key={entry.id}
                        className="flex flex-col gap-0.5 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between"
                      >
                        <div>
                          <p className="font-medium">{entry.summary ?? entry.action}</p>
                          {fields.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Geändert: {fields.join(", ")}
                            </p>
                          )}
                        </div>
                        <p className="text-xs whitespace-nowrap text-muted-foreground">
                          {formatDateTime(entry.createdAt)} Uhr · {entry.actorName}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
