import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BellIcon,
  CalendarDaysIcon,
  CalendarIcon,
  HandHeartIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateShort } from "@/lib/dates";
import { param, type RawSearchParams } from "@/lib/search-params";
import { getAnalytics } from "@/modules/dashboard/analytics";
import { Analytics, AnalyticsSkeleton } from "@/modules/dashboard/components/analytics";
import { DashboardTabs, type DashboardTab } from "@/modules/dashboard/components/dashboard-tabs";
import { KpiCarousel } from "@/modules/dashboard/components/kpi-carousel";
import { CardGrid, Group } from "@/modules/dashboard/components/layout";
import {
  Birthdays,
  HelperHours,
  LatestNotifications,
  MyShifts,
  MyTasks,
  OpenShifts,
  RecentActivity,
  StaffingWarnings,
  StatCard,
  UpcomingEvents,
} from "@/modules/dashboard/components/widgets";
import { getDashboard } from "@/modules/dashboard/service";
import { DASHBOARD_TABS, availableTabs, resolveTab } from "@/modules/dashboard/tabs";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Das Dashboard in vier Reitern (Aufteilung und Begründung: `modules/dashboard/tabs.ts`). Die Seite bleibt EINE Seite – der
 * Reiterwechsel geschieht im Browser (`DashboardTabs`), die Seitenleiste zeigt weiter nur „Dashboard“. Der Server berechnet
 * wie bisher nur, was die Rolle sehen darf; Reiter ohne Inhalt gibt es nicht. Die Diagramme laden per `Suspense` nach.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [ctx, params] = await Promise.all([requirePageContext(), searchParams]);
  const data = await getDashboard(ctx);
  const { members, events, shifts, tasks, notifications, birthdays, activity } = data;
  const nextEvent = events?.upcoming[0];

  // Einmal berechnen, von mehreren Reitern verwendet. Das `catch` verhindert eine „unbehandelte Ablehnung“, falls kein
  // Reiter die Daten abholt; die Reiter selbst bekommen einen Fehler weiterhin zu sehen.
  const analytics = getAnalytics(ctx);
  analytics.catch(() => undefined);

  const overview = (
    <div className="grid gap-10">
      <KpiCarousel>
        {members ? (
          <StatCard
            label={members.scope === "CLUB" ? "Mitglieder" : "Mitglieder (deine Abteilung)"}
            value={members.total}
            hint={
              members.joinedThisYear > 0
                ? `${members.joinedThisYear} neu in diesem Jahr`
                : "Ohne Archiv"
            }
            href="/mitglieder"
            icon={<UsersIcon />}
            accent="blue"
          />
        ) : (
          <StatCard
            label="Ungelesen"
            value={notifications.unread}
            hint={notifications.unread === 1 ? "Benachrichtigung" : "Benachrichtigungen"}
            href="/benachrichtigungen"
            icon={<BellIcon />}
            accent="amber"
          />
        )}
        {events && (
          <StatCard
            label="Termine in 30 Tagen"
            value={events.countNext30Days}
            hint={
              nextEvent
                ? `Nächster: ${nextEvent.title} (${formatDateShort(nextEvent.startsAt)})`
                : "Keine kommenden Termine"
            }
            href="/veranstaltungen"
            icon={<CalendarDaysIcon />}
            accent="violet"
          />
        )}
        {shifts && (
          <StatCard
            label="Freie Helferplätze"
            value={shifts.freeSpots}
            hint="In kommenden Schichten"
            href="/helferplanung"
            icon={<HandHeartIcon />}
            accent="emerald"
          />
        )}
        {shifts && <HelperHours hours={shifts.hours} />}
      </KpiCarousel>

      <Group id="g-fuer-dich" title="Für dich">
        <CardGrid>
          {tasks && <MyTasks tasks={tasks} organizer={can(ctx, "tasks:manage")} />}
          {shifts && <MyShifts shifts={shifts} />}
          <LatestNotifications notifications={notifications} />
        </CardGrid>
      </Group>
    </div>
  );

  const appointments = (
    <div className="grid gap-10">
      <Group id="g-anstehend" title="Anstehend">
        <CardGrid>
          {events && <UpcomingEvents events={events} />}
          {shifts && <OpenShifts shifts={shifts} />}
        </CardGrid>
      </Group>
      <Suspense fallback={<AnalyticsSkeleton />}>
        <Analytics
          data={analytics}
          topics={["events", "hours"]}
          description="Veranstaltungen und Helferstunden im Zeitverlauf"
        />
      </Suspense>
    </div>
  );

  const membersTab = (
    <div className="grid gap-10">
      {birthdays && (
        <Group id="g-geburtstage" title="Anstehend">
          <CardGrid>
            <Birthdays birthdays={birthdays} />
          </CardGrid>
        </Group>
      )}
      {members && (
        <Suspense fallback={<AnalyticsSkeleton />}>
          <Analytics
            data={analytics}
            topics={["members"]}
            description="Verteilung und Entwicklung der Mitglieder"
          />
        </Suspense>
      )}
    </div>
  );

  const work = (
    <div className="grid gap-10">
      {activity && (
        <Group id="g-aktivitaet" title="Aktivität">
          <CardGrid>
            <RecentActivity entries={activity} />
          </CardGrid>
        </Group>
      )}
      {tasks && (
        <Suspense fallback={<AnalyticsSkeleton />}>
          <Analytics data={analytics} topics={["tasks"]} description="Aufgaben nach Status" />
        </Suspense>
      )}
    </div>
  );

  const content = {
    uebersicht: overview,
    termine: appointments,
    mitglieder: membersTab,
    aktivitaet: work,
  };
  const available = availableTabs(data);
  const tabs: DashboardTab[] = DASHBOARD_TABS.filter((tab) => available.includes(tab.id)).map(
    (tab) => ({ ...tab, content: content[tab.id] }),
  );

  return (
    <>
      <PageHeader
        inline
        title={`Willkommen, ${ctx.user.firstName}!`}
        description={ctx.roleName}
        actions={
          <>
            {can(ctx, "members:create") && (
              <Button asChild variant="outline">
                <Link href="/mitglieder/neu">
                  <PlusIcon /> Neues Mitglied
                </Link>
              </Button>
            )}
            {can(ctx, "events:create") && (
              <Button asChild>
                <Link href="/veranstaltungen/neu">
                  <PlusIcon /> Neue Veranstaltung
                </Link>
              </Button>
            )}
            {!can(ctx, "events:create") && can(ctx, "events:read") && (
              <Button asChild variant="outline">
                <Link href="/kalender">
                  <CalendarIcon /> Kalender
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* Der Hinweis auf unbesetzte Schichten steht über den Reitern: Wichtiges soll nicht hinter einem Reiter verschwinden. */}
      {shifts && <StaffingWarnings warnings={shifts.warnings} />}

      <DashboardTabs tabs={tabs} initial={resolveTab(param(params, "tab"), available)} />
    </>
  );
}
