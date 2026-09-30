import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleCheckIcon,
  CircleIcon,
  FileSpreadsheetIcon,
  QrCodeIcon,
  UserPlusIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { enumParam, type RawSearchParams } from "@/lib/search-params";
import { ClubLogoCard } from "@/modules/clubs/components/logo-card";
import { ClubSettingsForm } from "@/modules/clubs/components/settings-form";
import { getClubSettings } from "@/modules/clubs/service";
import { DepartmentDialog } from "@/modules/departments/components/department-dialog";
import { CompleteSetupButton } from "@/modules/setup/components/complete-setup-button";
import { RememberStep } from "@/modules/setup/components/remember-step";
import { SetupFrameSync } from "@/modules/setup/components/setup-frame";
import { SetupStepper } from "@/modules/setup/components/setup-stepper";
import { getSetupOverview, type SetupOverview } from "@/modules/setup/service";
import {
  SETUP_STEPS,
  SETUP_STEP_IDS,
  firstOpenStep,
  type SetupStepId,
} from "@/modules/setup/steps";
import { InviteDialog } from "@/modules/users/components/user-controls";
import {
  listClubUsers,
  listInvitableMembers,
  listInvitations,
  listRoles,
} from "@/modules/users/service";
import { env } from "@/server/env";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";
import { isSetupLocked } from "@/server/tenancy/setup-gate";
import type { TenantContext } from "@/server/tenancy/context-core";

export const metadata: Metadata = { title: "Verein einrichten" };

const INTRO: Record<SetupStepId, string> = {
  verein:
    "Pflichtangaben sind mit * markiert: Kontakt-E-Mail und Anschrift stehen in der Datenschutzerklärung, auf dem Aushang zum Beitritt und in E-Mails an deine Mitglieder. Ohne sie geht es nicht weiter.",
  logo: "Mit eurem Logo erkennen alle sofort, in welchem Verein sie gerade sind – in der Kopfzeile, auf dem Aushang und beim Vereinswechsel.",
  abteilungen:
    "Lege die Sparten und Gruppen deines Vereins an, zum Beispiel Fußball, Tennis oder Jugend. Mitglieder, Termine und Aufgaben lassen sich später danach ordnen.",
  mitglieder:
    "Wähle, wie deine Mitglieder in VereinsFlow kommen. Du kannst die Wege auch kombinieren – danach geht es hier weiter.",
  vorstand:
    "Lade die Personen ein, die mit dir im Verein arbeiten: Vorstand, Kasse, Abteilungsleitungen. Jede Person bekommt eine Rolle mit passenden Rechten.",
  abschluss:
    "Fast geschafft. Hier siehst du, was schon erledigt ist. Mit „Einrichtung abschließen“ öffnet sich VereinsFlow mit allen Bereichen – offene Schritte kannst du jederzeit später nachholen.",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "club:update")) return <NoAccess what="die Einrichtung des Vereins" />;

  const overview = await getSetupOverview(ctx);
  const requested = enumParam(params, "schritt", SETUP_STEP_IDS);
  // Ohne Angabe beim ersten offenen Schritt beginnen (`RememberStep` trägt ihn in die Adresse ein).
  const step = requested ?? firstOpenStep(overview.done);
  // Zuerst die Pflichtangaben – vorher sind die übrigen Schritte gesperrt (nur solange die Einrichtung läuft; ein längst
  // eingerichteter Verein ohne vollständige Anschrift kann jeden Schritt öffnen).
  const stepsLocked = !overview.completedAt && !overview.done.verein;
  if (stepsLocked && step !== "verein") redirect("/einrichtung?schritt=verein");
  const index = SETUP_STEP_IDS.indexOf(step);
  const current = SETUP_STEPS[index]!;
  const previous = SETUP_STEPS[index - 1];
  const next = SETUP_STEPS[index + 1];

  return (
    <>
      <PageHeader
        title="Verein einrichten"
        description={
          overview.completedAt
            ? "Die Einrichtung ist abgeschlossen – du kannst jeden Schritt jederzeit wieder öffnen."
            : "Schritt für Schritt startklar: Zuerst die Pflichtangaben, danach lässt sich jeder Schritt überspringen. Die übrigen Bereiche von VereinsFlow öffnen sich nach dem Abschluss."
        }
      />
      <RememberStep step={step} />
      <SetupFrameSync locked={isSetupLocked(ctx)} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <SetupStepper current={step} done={overview.done} locked={stepsLocked} />
        <section aria-labelledby="schritt-titel" className="grid max-w-4xl min-w-0 gap-6">
          <div className="grid gap-1">
            <p className="text-sm text-muted-foreground">
              Schritt {index + 1} von {SETUP_STEPS.length}
            </p>
            <h2 id="schritt-titel" className="text-xl font-semibold tracking-tight">
              {current.title}
            </h2>
            <p className="max-w-prose text-muted-foreground">{INTRO[step]}</p>
          </div>

          <StepContent step={step} ctx={ctx} overview={overview} />

          <nav
            aria-label="Zwischen den Schritten wechseln"
            className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
          >
            {previous ? (
              <Button asChild variant="outline">
                <Link href={`/einrichtung?schritt=${previous.id}`}>
                  <ArrowLeftIcon /> Zurück
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {stepsLocked ? (
              <p className="text-sm text-muted-foreground">
                Fülle zuerst die Pflichtfelder (*) aus und klicke auf „Speichern und weiter“.
              </p>
            ) : next ? (
              <Button asChild>
                <Link href={`/einrichtung?schritt=${next.id}`}>
                  Weiter: {next.title} <ArrowRightIcon />
                </Link>
              </Button>
            ) : overview.completedAt ? (
              <Button asChild>
                <Link href="/dashboard">
                  Zum Dashboard <ArrowRightIcon />
                </Link>
              </Button>
            ) : (
              <CompleteSetupButton />
            )}
          </nav>
        </section>
      </div>
    </>
  );
}

async function StepContent({
  step,
  ctx,
  overview,
}: {
  step: SetupStepId;
  ctx: TenantContext;
  overview: SetupOverview;
}) {
  switch (step) {
    case "verein":
    case "logo": {
      const settings = await getClubSettings(ctx);
      return step === "logo" ? (
        <ClubLogoCard clubId={ctx.clubId} clubName={settings.name} logo={settings.logo} />
      ) : (
        <ClubSettingsForm
          setup={overview.completedAt ? undefined : { nextHref: "/einrichtung?schritt=logo" }}
          defaults={{
            name: settings.name,
            contactEmail: settings.contactEmail ?? "",
            phone: settings.phone ?? "",
            street: settings.street ?? "",
            postalCode: settings.postalCode ?? "",
            city: settings.city ?? "",
            website: settings.website ?? "",
            privacyContact: settings.privacyContact ?? "",
            leftMembersMonths: settings.retention.leftMembersMonths,
            trashDays: settings.retention.trashDays,
            auditMonths: settings.retention.auditMonths,
          }}
        />
      );
    }

    case "abteilungen":
      return (
        <Card>
          <CardHeader>
            <CardTitle>
              {overview.departments.length === 0
                ? "Noch keine Abteilung"
                : `${overview.departments.length} ${overview.departments.length === 1 ? "Abteilung" : "Abteilungen"}`}
            </CardTitle>
            <CardDescription>
              Ein kleiner Verein ohne Sparten braucht keine Abteilungen – dann einfach weiter.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {overview.departments.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {overview.departments.map((department) => (
                  <li
                    key={department.id}
                    className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: department.color ?? "var(--muted-foreground)" }}
                    />
                    {department.name}
                  </li>
                ))}
              </ul>
            )}
            {scopeOf(ctx, "departments:manage") === "CLUB" && (
              <div>
                <DepartmentDialog stayOnPage />
              </div>
            )}
          </CardContent>
        </Card>
      );

    case "mitglieder": {
      const others = overview.facts.members - 1;
      const ways = [
        {
          href: "/mitglieder/neu",
          icon: <UserPlusIcon />,
          title: "Einzeln anlegen",
          text: "Für die ersten Personen oder einen kleinen Verein.",
        },
        {
          href: "/mitglieder/import",
          icon: <FileSpreadsheetIcon />,
          title: "Liste importieren",
          text: "Aus Excel oder einer CSV-Datei – mit Vorschau, bevor etwas übernommen wird.",
        },
        {
          href: "/mitglieder/antraege",
          icon: <QrCodeIcon />,
          title: "Per QR-Code beitreten lassen",
          text: "Aushang drucken: Neue Mitglieder stellen den Antrag mit dem Handy, du nimmst ihn an.",
        },
      ];
      return (
        <div className="grid gap-4">
          <p className="text-sm">
            {others <= 0
              ? "Bisher bist nur du als Mitglied eingetragen."
              : `Bisher ${others === 1 ? "ist ein weiteres Mitglied" : `sind ${others} weitere Mitglieder`} eingetragen.`}
          </p>
          {can(ctx, "members:create") && (
            <ul className="grid gap-3 md:grid-cols-3">
              {ways.map((way) => (
                <li key={way.href}>
                  <Link
                    href={way.href}
                    className="group flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5"
                    >
                      {way.icon}
                    </span>
                    <span className="font-medium group-hover:text-primary">{way.title}</span>
                    <span className="text-sm text-muted-foreground">{way.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    case "vorstand": {
      const canInvite = can(ctx, "users:invite");
      const [roles, users, invitations, invitable] = await Promise.all([
        listRoles(ctx),
        listClubUsers(ctx),
        canInvite ? listInvitations(ctx) : Promise.resolve([]),
        canInvite ? listInvitableMembers(ctx) : Promise.resolve([]),
      ]);
      const open = invitations.filter((invitation) => !invitation.expired);
      return (
        <Card>
          <CardHeader>
            <CardTitle>Wer hat schon Zugang?</CardTitle>
            <CardDescription>
              Welche Rolle was darf, steht unter{" "}
              <Link
                href="/benutzer?tab=rollen"
                className="text-primary underline underline-offset-4"
              >
                Benutzer → Rollen und Rechte
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-2">
              {users.map((user) => (
                <li key={user.membershipId} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {user.name}
                    {user.isSelf && " (du)"}
                  </span>
                  <span className="text-sm text-muted-foreground">{user.roleName}</span>
                </li>
              ))}
              {open.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{invitation.memberName ?? invitation.email}</span>
                  <span className="text-sm text-muted-foreground">
                    {invitation.roleName} · eingeladen, noch nicht angenommen
                  </span>
                </li>
              ))}
            </ul>
            {canInvite && (
              <div>
                <InviteDialog
                  roles={roles.map((role) => ({
                    id: role.id,
                    name: role.name,
                    assignable: role.assignable,
                  }))}
                  members={invitable}
                />
              </div>
            )}
            {env.MAIL_TRANSPORT !== "smtp" && (
              <Alert>
                <AlertDescription>
                  In dieser lokalen Version werden keine echten E-Mails verschickt. Den
                  Einladungslink findest du im Fenster, in dem VereinsFlow läuft.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      );
    }

    case "abschluss":
      return (
        <Card>
          <CardContent className="pt-6">
            <ul className="grid gap-3">
              {SETUP_STEPS.filter((entry) => entry.id !== "abschluss").map((entry) => {
                const done = overview.done[entry.id as Exclude<SetupStepId, "abschluss">];
                return (
                  <li key={entry.id} className="flex items-start gap-3">
                    {done ? (
                      <CircleCheckIcon
                        className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleIcon
                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/einrichtung?schritt=${entry.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {entry.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {done ? "Erledigt" : "Noch offen – geht auch später"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      );
  }
}
