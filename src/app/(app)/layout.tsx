import { ClubSwitcher } from "@/components/layout/club-switcher";
import { IdleLogout } from "@/components/layout/idle-logout";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getNavigation } from "@/components/layout/nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarCollapseProvider } from "@/components/layout/sidebar-collapse";
import { UserMenu } from "@/components/layout/user-menu";
import { CommandPalette } from "@/components/search/command-palette";
import { SearchProvider } from "@/components/search/search-provider";
import { SearchTrigger } from "@/components/search/search-trigger";
import { clubLogoUrl } from "@/lib/club-logo";
import { countUnread } from "@/modules/notifications/service";
import { getStaticSearchEntries } from "@/modules/search/service";
import { getTaskStats } from "@/modules/tasks/service";
import { env } from "@/server/env";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";
import { listUserClubs } from "@/server/tenancy/clubs";

/**
 * Rahmen für alle Seiten des angemeldeten Bereichs. `requirePageContext` prüft serverseitig Sitzung,
 * Vereinsmitgliedschaft und Vereinsstatus – ohne gültigen Kontext sieht man keine Seite.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext();
  const [clubs, unread, taskStats] = await Promise.all([
    listUserClubs(ctx.userId),
    countUnread(ctx),
    can(ctx, "tasks:read") ? getTaskStats(ctx) : Promise.resolve(null),
  ]);
  const groups = getNavigation(ctx, {
    isPlatformAdmin: ctx.user.isPlatformAdmin,
    badges: { tasks: taskStats?.mineOpen, notifications: unread },
  });
  const name = `${ctx.user.firstName} ${ctx.user.lastName}`;
  const staticSearchEntries = getStaticSearchEntries(ctx, {
    isPlatformAdmin: ctx.user.isPlatformAdmin,
  });

  return (
    <SearchProvider staticEntries={staticSearchEntries}>
      <SidebarCollapseProvider>
        {/* Kopf fest, Navigation scrollt; die letzte Gruppe („Persönlich“ mit Hilfe & Support) bleibt unten immer sichtbar. */}
        <Sidebar groups={groups} />

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6 xl:px-8 print:hidden [@media(max-height:820px)]:h-14">
            <MobileNav
              groups={groups}
              clubName={ctx.club.name}
              clubLogoUrl={clubLogoUrl(ctx.clubId, ctx.club.logoSha256)}
            />
            <ClubSwitcher clubs={clubs} activeId={ctx.clubId} />
            <div className="flex flex-1 justify-center px-2 sm:px-4">
              <SearchTrigger />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell unread={unread} />
              <UserMenu name={name} email={ctx.user.email} roleName={ctx.roleName} />
            </div>
          </header>
          <main id="inhalt" className="mx-auto w-full max-w-[96rem] flex-1 p-4 sm:p-6 xl:p-8">
            {children}
          </main>
        </div>

        <IdleLogout idleMinutes={env.SESSION_IDLE_MINUTES} />
      </SidebarCollapseProvider>
      <CommandPalette />
    </SearchProvider>
  );
}
