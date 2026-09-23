import type { Metadata } from "next";
import {
  KeyRoundIcon,
  MonitorSmartphoneIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  BellIcon,
  BuildingIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClubLogo } from "@/components/shared/club-logo";
import { DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  ChangePasswordForm,
  EmailNotificationsSwitch,
  ProfileNameForm,
  SessionList,
} from "@/modules/profile/components/profile-forms";
import { getCurrentSession } from "@/server/auth/session";
import { getOwnAccount, listOwnSessions } from "@/server/auth/profile";
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

export default async function ProfilePage() {
  const ctx = await requirePageContext();
  const session = await getCurrentSession();
  const [account, sessions, clubs] = await Promise.all([
    getOwnAccount(ctx.userId),
    listOwnSessions(ctx.userId, session?.id ?? null),
    listUserClubs(ctx.userId),
  ]);

  return (
    <>
      <PageHeader
        title="Mein Profil"
        description="Deine Angaben, Benachrichtigungen, dein Passwort und die Geräte, auf denen du angemeldet bist."
      />
      <div className="grid max-w-4xl gap-6">
        <Section
          id="p-angaben"
          icon={<UserRoundIcon />}
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

        <Section id="p-benachrichtigungen" icon={<BellIcon />} title="Benachrichtigungen">
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

        <Section id="p-2fa" icon={<ShieldCheckIcon />} title="Zwei-Faktor-Authentifizierung">
          {account.totpEnabledAt ? (
            <p className="text-sm">
              <ToneBadge tone="success">Aktiv</ToneBadge> seit{" "}
              {formatDateTime(account.totpEnabledAt)} Uhr.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <ToneBadge tone="neutral">Nicht eingerichtet</ToneBadge> Die optionale
              Zwei-Faktor-Anmeldung per Authenticator-App ist in Vorbereitung (siehe Roadmap). Bis
              dahin schützt ein langes, einmaliges Passwort dein Konto am besten.
            </p>
          )}
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
    </>
  );
}
