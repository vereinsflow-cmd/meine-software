import type { Metadata } from "next";
import Link from "next/link";
import {
  DatabaseIcon,
  DownloadIcon,
  FileCheckIcon,
  IdCardIcon,
  ScaleIcon,
  TrashIcon,
  UserXIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateTime } from "@/lib/dates";
import { SUPPORT_RETENTION_MONTHS } from "@/lib/support";
import { getClubPrivacyInfo } from "@/modules/clubs/service";
import { getOwnConsents } from "@/modules/privacy/consents";
import { DeletionPanel, OwnConsentPanel } from "@/modules/privacy/components/privacy-panels";
import { getPendingDeletion, listPendingDeletionRequests } from "@/server/privacy/deletion";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Datenschutz" };

function Section({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader>
          <CardTitle
            id={id}
            role="heading"
            aria-level={2}
            className="flex items-center gap-2 text-base [&_svg]:size-4"
          >
            <span aria-hidden="true">{icon}</span> {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  );
}

export default async function PrivacyPage() {
  const ctx = await requirePageContext();
  const canManage = can(ctx, "privacy:manage");
  const [info, consents, pending, requests] = await Promise.all([
    getClubPrivacyInfo(ctx),
    getOwnConsents(ctx),
    getPendingDeletion(ctx.userId),
    canManage ? listPendingDeletionRequests(ctx) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Datenschutz"
        description="Deine Rechte: Auskunft, Einwilligungen, Datenexport und Löschung – und wer für deine Daten verantwortlich ist."
      />
      <div className="grid max-w-4xl gap-6">
        <Section
          id="d-verantwortlicher"
          icon={<ScaleIcon />}
          title="Wer ist verantwortlich?"
          description="Dein Verein verarbeitet deine Daten für die Vereinsverwaltung. VereinsFlow ist das Werkzeug dafür."
        >
          <div className="grid gap-4">
            <DescriptionList
              items={[
                { label: "Verein", value: info.name },
                { label: "Anschrift", value: info.address },
                { label: "E-Mail", value: info.contactEmail },
                {
                  label: "Ansprechpartner für Datenschutz",
                  value: info.privacyContact ? (
                    <span className="whitespace-pre-wrap">{info.privacyContact}</span>
                  ) : null,
                },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              Ausführliche Informationen findest du in der{" "}
              <Link
                href="/datenschutzerklaerung"
                className="text-primary underline underline-offset-4"
              >
                Datenschutzerklärung
              </Link>
              . Fragen zu deinen Daten beantwortet der Ansprechpartner.
            </p>
          </div>
        </Section>

        <Section
          id="d-daten"
          icon={<DatabaseIcon />}
          title="Welche Daten sind gespeichert?"
          description="Wie lange sie aufbewahrt werden, legt dein Verein fest."
        >
          <div className="grid gap-4">
            <ul className="text-sm">
              <li>
                <strong>Konto:</strong> Name, E-Mail-Adresse, Passwort (nur als Prüfwert),
                Anmeldezeiten und angemeldete Geräte.
              </li>
              <li>
                <strong>Mitgliedsdaten:</strong> Stammdaten, Kontaktdaten, Abteilungen,
                Einwilligungen – soweit dein Verein sie erfasst hat.
              </li>
              <li>
                <strong>Aktivitäten:</strong> Zu- und Absagen zu Veranstaltungen, Helferschichten
                samt Stunden, Aufgaben, Benachrichtigungen.
              </li>
              <li>
                <strong>Meldungen:</strong> Anliegen, die du über „Hilfe & Support“ an die
                Vereinsverwaltung schickst, samt Antwort. Erledigte Meldungen werden nach{" "}
                {SUPPORT_RETENTION_MONTHS} Monaten gelöscht.
              </li>
            </ul>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              <li>
                Gelöschte Mitglieder bleiben {info.retention.trashDays} Tage im Papierkorb und
                werden dann anonymisiert.
              </li>
              <li>
                {info.retention.leftMembersMonths > 0
                  ? `Daten ausgetretener Mitglieder werden nach ${info.retention.leftMembersMonths} Monaten anonymisiert.`
                  : "Daten ausgetretener Mitglieder werden nicht automatisch anonymisiert."}
              </li>
              <li>
                Das Änderungsprotokoll wird nach {info.retention.auditMonths} Monaten gelöscht.
              </li>
            </ul>
            {ctx.memberId && (
              <Button asChild variant="outline" className="w-fit">
                <Link href={`/mitglieder/${ctx.memberId}`}>
                  <IdCardIcon /> Meine Mitgliedsdaten ansehen
                </Link>
              </Button>
            )}
          </div>
        </Section>

        <Section id="d-einwilligungen" icon={<FileCheckIcon />} title="Meine Einwilligungen">
          {consents ? (
            <OwnConsentPanel
              rows={consents.map((c) => ({
                ...c,
                recordedAt: c.recordedAt?.toISOString() ?? null,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Dein Konto ist mit keinem Mitgliedsdatensatz verknüpft – es sind daher keine
              Einwilligungen gespeichert.
            </p>
          )}
        </Section>

        <Section
          id="d-export"
          icon={<DownloadIcon />}
          title="Meine Daten herunterladen"
          description="Auskunft und Datenübertragbarkeit: eine JSON-Datei mit allen Daten, die zu dir gespeichert sind."
        >
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Enthalten sind nur deine eigenen Daten – keine Angaben über andere Personen und keine
              Passwörter oder Zugangsschlüssel. Du kannst den Export bis zu fünfmal pro Stunde
              abrufen.
            </p>
            <Button asChild className="w-fit">
              <a href="/api/privacy/export">
                <DownloadIcon /> Daten herunterladen (JSON)
              </a>
            </Button>
          </div>
        </Section>

        <Section id="d-loeschen" icon={<TrashIcon />} title="Konto und Daten löschen">
          <DeletionPanel
            pending={
              pending
                ? {
                    requestedAt: pending.requestedAt.toISOString(),
                    scheduledFor: pending.scheduledFor.toISOString(),
                  }
                : null
            }
          />
        </Section>

        {canManage && (
          <Section
            id="d-anfragen"
            icon={<UserXIcon />}
            title="Offene Löschanträge in deinem Verein"
            description="Nur für Verantwortliche des Datenschutzes. Die Löschung wird nach der Bedenkzeit automatisch ausgeführt."
          >
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Es liegen keine offenen Löschanträge vor.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  >
                    <span className="font-medium">{request.name}</span>
                    <span className="text-muted-foreground">
                      beantragt am {formatDateTime(request.requestedAt)} Uhr · Ausführung am{" "}
                      {formatDateTime(request.scheduledFor)} Uhr
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
