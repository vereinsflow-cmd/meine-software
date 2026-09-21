import { Brand } from "@/components/shared/brand";
import { ClubSwitcher } from "@/components/layout/club-switcher";
import { IdleLogout } from "@/components/layout/idle-logout";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getNavigation } from "@/components/layout/nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { countUnread } from "@/modules/notifications/service";
import { env } from "@/server/env";
import { requirePageContext } from "@/server/tenancy/context";
import { listUserClubs } from "@/server/tenancy/clubs";

/**
 * Rahmen für alle Seiten des angemeldeten Bereichs. `requirePageContext` prüft serverseitig Sitzung,
 * Vereinsmitgliedschaft und Vereinsstatus – ohne gültigen Kontext sieht man keine Seite.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext();
  const [clubs, unread] = await Promise.all([listUserClubs(ctx.userId), countUnread(ctx)]);
  const groups = getNavigation(ctx, { isPlatformAdmin: ctx.user.isPlatformAdmin });
  const name = `${ctx.user.firstName} ${ctx.user.lastName}`;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[18.5rem_minmax(0,1fr)] print:block">
      {/* Kopf fest, Navigation scrollt; die letzte Gruppe („Persönlich“ mit Hilfe & Support) bleibt unten immer sichtbar. */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r bg-sidebar lg:flex print:hidden">
        <div className="flex h-16 shrink-0 items-center border-b px-5 [@media(max-height:820px)]:h-14">
          <Brand href="/dashboard" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-5 [@media(max-height:820px)]:pt-3">
          <SidebarNav groups={groups} pinLast />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6 xl:px-8 print:hidden [@media(max-height:820px)]:h-14">
          <MobileNav groups={groups} clubName={ctx.club.name} />
          <ClubSwitcher clubs={clubs} activeId={ctx.clubId} />
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
    </div>
  );
}
