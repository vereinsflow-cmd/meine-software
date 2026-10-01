import type { Metadata } from "next";
import Link from "next/link";
import { InboxIcon, InfoIcon, PrinterIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackLink } from "@/components/shared/back-link";
import { CompactEmpty } from "@/components/shared/compact-empty";
import { DescriptionList } from "@/components/shared/description-list";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatCalendarDate, formatDate, formatDateTime } from "@/lib/dates";
import {
  APPLICATION_DECIDED_RETENTION_DAYS,
  APPLICATION_PENDING_RETENTION_DAYS,
  APPLICATION_STATUS_LABEL,
  isJoinLinkFull,
} from "@/lib/membership-application";
import { phoneHref } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  AcceptApplicationButton,
  ChangeJoinLimitButton,
  CloseJoinLinkButton,
  CopyJoinLinkButton,
  RejectApplicationButton,
  RenewJoinLinkButton,
  ResendInvitationButton,
  SetupJoinLinkButton,
} from "@/modules/membership-applications/components/join-controls";
import { QrCode } from "@/modules/membership-applications/components/qr-code";
import {
  canManageApplications,
  getJoinLink,
  listApplications,
  type ApplicationConflict,
  type ApplicationDto,
  type JoinLink,
} from "@/modules/membership-applications/service";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Beitrittsanträge" };

/**
 * Wie viele Plätze der QR-Code noch hat: „12 von 50 Anmeldungen genutzt“ mit Balken. Ausgeschöpft: Hinweis, dass er
 * keine Anträge mehr annimmt. Ohne festgelegte Anzahl (QR-Code von vor der Begrenzung): Aufforderung, sie festzulegen.
 */
function JoinCapacityInfo({ link }: { link: JoinLink }) {
  if (link.limit === null) {
    return (
      <Alert>
        <AlertDescription className="grid gap-3">
          <p>
            Für diesen QR-Code ist keine Anzahl festgelegt – er nimmt unbegrenzt Anträge an (bisher{" "}
            {link.used}).
          </p>
          <ChangeJoinLimitButton limit={null} used={link.used} label="Anzahl festlegen" />
        </AlertDescription>
      </Alert>
    );
  }
  const full = isJoinLinkFull(link);
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        <span className="font-medium">
          {link.used} von {link.limit} {link.limit === 1 ? "Anmeldung" : "Anmeldungen"} genutzt
        </span>
        {!full && (
          <span className="text-muted-foreground">
            {" "}
            – noch {link.limit - link.used} {link.limit - link.used === 1 ? "Platz" : "Plätze"}{" "}
            frei.
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Genutzte Anmeldungen des QR-Codes"
        aria-valuemin={0}
        aria-valuemax={link.limit}
        aria-valuenow={Math.min(link.used, link.limit)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", full ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${Math.min(100, (link.used / link.limit) * 100)}%` }}
        />
      </div>
      {full && (
        <Alert variant="warning">
          <AlertDescription>
            {link.limit === 1 ? "Der einzige Platz ist" : `Alle ${link.limit} Plätze sind`}{" "}
            vergeben. Der QR-Code nimmt keine Anträge mehr an – mit „Anzahl ändern“ lässt du weitere
            zu.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Karte „QR-Code zum Beitritt“: ohne Link eine kurze Erklärung und die Hauptaktion, mit Link Code, Adresse und Knöpfe. */
function JoinLinkCard({ link }: { link: JoinLink | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          QR-Code zum Beitritt
        </CardTitle>
        <CardDescription>
          Häng den QR-Code im Verein auf oder teile den Link. Wer ihn öffnet, kann einen Antrag
          stellen – Zugang bekommt nur, wen du annimmst.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {link ? (
          <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <QrCode
              value={link.url}
              label="QR-Code zum Beitrittsformular"
              className="size-44 rounded-lg ring-1 ring-foreground/10"
            />
            <div className="grid min-w-0 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="beitritt-link">Link zum Antragsformular</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="beitritt-link"
                    readOnly
                    value={link.url}
                    className="font-mono text-sm md:text-sm"
                  />
                  <CopyJoinLinkButton url={link.url} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Eingerichtet am {formatDateTime(link.createdAt)} Uhr.
                </p>
              </div>
              <JoinCapacityInfo link={link} />
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/mitglieder/antraege/aushang">
                    <PrinterIcon /> Aushang drucken
                  </Link>
                </Button>
                {link.limit !== null && (
                  <ChangeJoinLimitButton limit={link.limit} used={link.used} />
                )}
                <RenewJoinLinkButton limit={link.limit} />
                <CloseJoinLinkButton />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm">Noch ist kein QR-Code eingerichtet. So funktioniert es:</p>
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
              <li>
                QR-Code einrichten – dabei legst du fest, wie viele Anmeldungen er zulässt – und den
                Aushang drucken.
              </li>
              <li>Interessierte scannen den Code und füllen den Antrag am Handy aus.</li>
              <li>
                Du nimmst den Antrag hier an – dann wird die Person Mitglied und bekommt eine
                Einladung per E-Mail.
              </li>
            </ol>
            <SetupJoinLinkButton />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const fullName = (application: ApplicationDto) =>
  `${application.firstName} ${application.lastName}`;

const inlineLink = "font-medium underline underline-offset-4";

/** Was dem Annehmen im Weg steht – mit nächstem Schritt. Sonst käme die Meldung erst nach Klick und Rückfrage. */
function ConflictHint({ conflict }: { conflict: ApplicationConflict }) {
  const usersLink = (
    <Link href="/benutzer" className={inlineLink}>
      Benutzer und Rollen
    </Link>
  );
  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      {conflict.kind === "member" ? (
        <>
          <AlertTitle>
            Mit dieser E-Mail-Adresse gibt es schon ein Mitglied
            {conflict.archived ? " (im Archiv)" : ""}
          </AlertTitle>
          <AlertDescription>
            <p>
              <Link href={`/mitglieder/${conflict.memberId}`} className={inlineLink}>
                {conflict.memberName}
              </Link>{" "}
              –{" "}
              {conflict.archived
                ? "tritt die Person wieder ein, hol sie dort mit „Wiederherstellen“ aus dem Archiv zurück und lehne diesen Antrag ab."
                : "ist es dieselbe Person, lehne den Antrag ab und sprich sie direkt an."}
            </p>
          </AlertDescription>
        </>
      ) : conflict.kind === "account" ? (
        <>
          <AlertTitle>Mit dieser E-Mail-Adresse hat schon jemand Zugang zum Verein</AlertTitle>
          <AlertDescription>
            <p>
              Annehmen ist nicht möglich. Sieh unter {usersLink} nach – ist es dieselbe Person,
              lehne den Antrag ab.
            </p>
          </AlertDescription>
        </>
      ) : (
        <>
          <AlertTitle>An diese E-Mail-Adresse ist schon eine Einladung unterwegs</AlertTitle>
          <AlertDescription>
            <p>
              Annehmen ist erst möglich, wenn sie zurückgezogen oder abgelaufen ist – siehe{" "}
              {usersLink}.
            </p>
          </AlertDescription>
        </>
      )}
    </Alert>
  );
}

function PendingCard({ application }: { application: ApplicationDto }) {
  const name = fullName(application);
  const others = application.samePendingEmail;
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {name}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <DescriptionList
          items={[
            {
              label: "E-Mail",
              value: (
                <a
                  href={`mailto:${application.email}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {application.email}
                </a>
              ),
            },
            {
              label: "Telefon",
              value: application.phone ? (
                <a
                  href={phoneHref(application.phone)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {application.phone}
                </a>
              ) : null,
            },
            { label: "Geburtsdatum", value: formatCalendarDate(application.birthDate) },
            {
              label: "Abteilung",
              value: application.departmentName
                ? `${application.departmentName}${application.departmentInactive ? " (nicht mehr aktiv)" : ""}`
                : "Keine Angabe",
            },
            { label: "Eingang", value: `${formatDateTime(application.createdAt)} Uhr` },
          ]}
        />
        {application.message && (
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Nachricht
            </p>
            <p className="mt-0.5 text-sm break-words whitespace-pre-line">{application.message}</p>
          </div>
        )}
        {application.conflict && <ConflictHint conflict={application.conflict} />}
        {others > 0 && (
          <Alert>
            <InfoIcon />
            <AlertDescription>
              <p>
                Von derselben E-Mail-Adresse gibt es{" "}
                {others === 1
                  ? "noch einen weiteren offenen Antrag"
                  : `noch ${others} weitere offene Anträge`}{" "}
                – vermutlich doppelt abgeschickt. Nimm einen an und lehne die anderen ab.
              </p>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <AcceptApplicationButton id={application.id} name={name} />
          <RejectApplicationButton id={application.id} name={name} />
        </div>
      </CardContent>
    </Card>
  );
}

function DecidedList({ decided }: { decided: ApplicationDto[] }) {
  if (decided.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        In den letzten {APPLICATION_DECIDED_RETENTION_DAYS} Tagen wurde über keinen Antrag
        entschieden.
      </p>
    );
  return (
    <ul className="divide-y rounded-xl bg-card shadow-sm ring-1 ring-foreground/10 dark:ring-foreground/15">
      {decided.map((application) => {
        const accepted = application.status === "ACCEPTED";
        return (
          <li
            key={application.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium break-words">{fullName(application)}</p>
              <p className="text-sm text-muted-foreground">
                {APPLICATION_STATUS_LABEL[application.status]} am{" "}
                {formatDate(application.decidedAt)}
                {application.decidedByName ? ` von ${application.decidedByName}` : ""}
              </p>
              {application.canResendInvitation && (
                // Ohne Konto hat die Person noch keinen Zugang – hier sieht man, ob die Einladung noch gilt.
                <p className="text-sm text-muted-foreground">
                  Noch kein Konto –{" "}
                  {application.invitationExpiresAt
                    ? `Einladung gültig bis ${formatDate(application.invitationExpiresAt)}`
                    : "keine gültige Einladung (abgelaufen oder nicht verschickt)"}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ToneBadge tone={accepted ? "success" : "neutral"}>
                {APPLICATION_STATUS_LABEL[application.status]}
              </ToneBadge>
              {accepted && application.memberId && (
                <Link
                  href={`/mitglieder/${application.memberId}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Zum Mitglied<span className="sr-only"> {fullName(application)}</span>
                </Link>
              )}
              {application.canResendInvitation && (
                <ResendInvitationButton id={application.id} name={fullName(application)} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function ApplicationsPage() {
  const ctx = await requirePageContext();
  if (!canManageApplications(ctx)) return <NoAccess what="die Beitrittsanträge" />;

  const [link, { pending, decided }] = await Promise.all([getJoinLink(ctx), listApplications(ctx)]);

  return (
    <div className="max-w-4xl">
      <BackLink href="/mitglieder">Alle Mitglieder</BackLink>
      <PageHeader
        title="Beitrittsanträge"
        description="Neue Mitglieder stellen ihren Antrag über den QR-Code. Erst wenn du annimmst, wird die Person Mitglied und bekommt eine Einladung per E-Mail."
      />

      <div className="grid gap-9">
        <JoinLinkCard link={link} />

        <section aria-labelledby="offene-antraege" className="grid gap-3">
          <h2 id="offene-antraege" className="text-xl font-semibold">
            Offene Anträge{pending.length > 0 ? ` (${pending.length})` : ""}
          </h2>
          {pending.length === 0 ? (
            <Card>
              <CardContent>
                <CompactEmpty icon={<InboxIcon />} accent="blue" title="Keine offenen Anträge">
                  Neue Anträge erscheinen hier. Wer über den QR-Code einen Antrag stellt, wartet auf
                  deine Entscheidung.
                </CompactEmpty>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pending.map((application) => (
                <PendingCard key={application.id} application={application} />
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Offene Anträge werden nach {APPLICATION_PENDING_RETENTION_DAYS} Tagen automatisch
            gelöscht, entschiedene nach {APPLICATION_DECIDED_RETENTION_DAYS} Tagen.
          </p>
        </section>

        <section aria-labelledby="zuletzt-entschieden" className="grid gap-3">
          <h2 id="zuletzt-entschieden" className="text-xl font-semibold">
            Zuletzt entschieden
          </h2>
          <DecidedList decided={decided} />
        </section>
      </div>
    </div>
  );
}
