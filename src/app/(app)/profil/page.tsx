import type { Metadata } from "next";
import {
  BuildingIcon,
  KeyRoundIcon,
  MonitorSmartphoneIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClubLogo } from "@/components/shared/club-logo";
import { DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { ToneBadge } from "@/components/shared/status-badge";
import { QrCode } from "@/components/shared/qr-code";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  ChangePasswordForm,
  EmailNotificationsSwitch,
  ProfileNameForm,
  SessionList,
} from "@/modules/profile/components/profile-forms";
import {
  DisableTwoFactorDialog,
  ManualKey,
  RenewRecoveryCodesDialog,
  StartTwoFactorButton,
  TwoFactorSetup,
} from "@/modules/profile/components/two-factor";
import { getCurrentSession } from "@/server/auth/session";
import { getOwnAccount, listOwnSessions } from "@/server/auth/profile";
import { formatTotpSecret } from "@/server/auth/totp";
import { getTwoFactorOverview, type TwoFactorOverview } from "@/server/auth/two-factor";
import { listUserClubs } from "@/server/tenancy/clubs";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Mein Profil" };

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

/** Inhalt des Abschnitts „Zwei-Faktor-Anmeldung“ je nach Stand: aus, angefangen, eingeschaltet. */
function TwoFactorSection({ overview }: { overview: TwoFactorOverview }) {
  if (overview.enabledAt) {
    const left = overview.recoveryCodesLeft;
    return (
      <div className="grid gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <ToneBadge tone="success">Eingeschaltet</ToneBadge>
          <span>seit {formatDateTime(overview.enabledAt)} Uhr</span>
        </p>
        {left === 0 ? (
          // Keine Codes mehr: Wer jetzt das Handy verliert, kommt nicht mehr ins Konto – deutlicher als „bald“.
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              Du hast keine Wiederherstellungscodes mehr. Erstelle jetzt neue, damit du auch ohne
              Handy in dein Konto kommst.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm">
            {left === 1
              ? "Du hast noch 1 Wiederherstellungscode."
              : `Du hast noch ${left} Wiederherstellungscodes.`}{" "}
            {left <= 3 && (
              <span className="text-amber-700 dark:text-amber-300">
                Erstelle bald neue, damit du auch ohne Handy in dein Konto kommst.
              </span>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <RenewRecoveryCodesDialog />
          <DisableTwoFactorDialog />
        </div>
      </div>
    );
  }

  if (overview.pending) {
    // Schritt 1 (QR-Code, Schlüssel) entsteht auf dem Server; `TwoFactorSetup` blendet ihn aus, sobald die Codes dastehen.
    return (
      <TwoFactorSetup
        scan={
          <>
            <p className="text-sm text-muted-foreground">
              Öffne eine Authenticator-App (zum Beispiel Google Authenticator, Microsoft
              Authenticator oder 2FAS), wähle „Konto hinzufügen“ und scanne den Code.
            </p>
            <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <QrCode
                value={overview.pending.otpauthUrl}
                label="QR-Code für die Authenticator-App"
                className="size-44 rounded-lg ring-1 ring-foreground/10"
              />
              <ManualKey
                secret={overview.pending.secret}
                formatted={formatTotpSecret(overview.pending.secret)}
              />
            </div>
          </>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <ToneBadge tone="neutral">Nicht eingerichtet</ToneBadge>
        <span className="text-muted-foreground">
          Du brauchst dafür eine Authenticator-App auf dem Handy. Das Einrichten dauert etwa zwei
          Minuten.
        </span>
      </p>
      <div>
        <StartTwoFactorButton />
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  const ctx = await requirePageContext();
  const session = await getCurrentSession();
  const [account, sessions, clubs, twoFactor] = await Promise.all([
    getOwnAccount(ctx.userId),
    listOwnSessions(ctx.userId, session?.id ?? null),
    listUserClubs(ctx.userId),
    getTwoFactorOverview(ctx.userId),
  ]);

  return (
    <PageStack>
      <PageHeader
        title="Mein Profil"
        description="Deine Angaben, Benachrichtigungen, dein Passwort, die Zwei-Faktor-Anmeldung und die Geräte, auf denen du angemeldet bist."
      />
      <div className="grid max-w-4xl gap-6">
        <Section
          id="p-angaben"
          icon={<AREA_ICON.profil />}
          title="Persönliche Angaben"
          description="Diesen Namen sehen andere in der Anwendung, z. B. bei Nachrichten und im Änderungsprotokoll."
        >
          <div className="grid gap-6">
            <ProfileNameForm firstName={account.firstName} lastName={account.lastName} />
            <DescriptionList
              items={[
                { label: "E-Mail-Adresse (Anmeldename)", value: account.email },
                { label: "Konto erstellt", value: formatDate(account.createdAt) },
                {
                  label: "Letzte Anmeldung",
                  value: account.lastLoginAt ? `${formatDateTime(account.lastLoginAt)} Uhr` : null,
                },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              Aus Sicherheitsgründen kannst du die E-Mail-Adresse nicht selbst ändern – wende dich
              dafür an die Vereinsadministration. Deine Mitgliedsdaten im Verein (Anschrift, Telefon
              …) pflegt der Vorstand; unter „Datenschutz“ siehst du, was gespeichert ist.
            </p>
          </div>
        </Section>

        <Section id="p-vereine" icon={<BuildingIcon />} title="Meine Vereine">
          <ul className="divide-y rounded-lg border">
            {clubs.map((club) => (
              <li
                key={club.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <ClubLogo name={club.name} logoUrl={club.logoUrl} size="sm" />
                  <span className="truncate font-medium">{club.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{club.roleName}</span>
                  {club.id === ctx.clubId && <ToneBadge tone="info">Aktiv</ToneBadge>}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="p-benachrichtigungen"
          icon={<AREA_ICON.benachrichtigungen />}
          title="Benachrichtigungen"
        >
          <EmailNotificationsSwitch enabled={account.emailNotifications} />
        </Section>

        <Section
          id="p-passwort"
          icon={<KeyRoundIcon />}
          title="Passwort ändern"
          description="Nach der Änderung werden alle anderen Geräte abgemeldet."
        >
          <ChangePasswordForm />
        </Section>

        <Section
          id="p-2fa"
          icon={<ShieldCheckIcon />}
          title="Zwei-Faktor-Anmeldung"
          description="Bei der Anmeldung fragt VereinsFlow zusätzlich zum Passwort nach einem Code aus einer App auf deinem Handy. So bleibt dein Konto geschützt, auch wenn jemand dein Passwort kennt."
        >
          <TwoFactorSection overview={twoFactor} />
        </Section>

        <Section
          id="p-geraete"
          icon={<MonitorSmartphoneIcon />}
          title="Angemeldete Geräte"
          description="Erkennst du ein Gerät nicht wieder, melde es ab und ändere dein Passwort."
        >
          <SessionList
            sessions={sessions.map((s) => ({
              id: s.id,
              current: s.current,
              device: s.device,
              ipPrefix: s.ipPrefix,
              createdAt: s.createdAt.toISOString(),
              lastSeenAt: s.lastSeenAt.toISOString(),
            }))}
          />
        </Section>
      </div>
    </PageStack>
  );
}
