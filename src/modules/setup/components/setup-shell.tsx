import Link from "next/link";
import { LogOutIcon, ShieldIcon } from "lucide-react";
import { ClubSwitcher } from "@/components/layout/club-switcher";
import { Brand } from "@/components/shared/brand";
import { ClubLogo } from "@/components/shared/club-logo";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/modules/auth/actions";
import { SetupReturnBar } from "./setup-return-bar";

/**
 * Rahmen während der Einrichtung eines neuen Vereins: nur Marke, Verein und „Abmelden“ – kein Menü, keine Suche, keine
 * Benachrichtigungen. Die App öffnet sich erst nach „Einrichtung abschließen“ (siehe `server/tenancy/setup-gate.ts`).
 * Gesperrt ist nur dieser Verein: Wer weiteren Vereine angehört, wechselt über den Vereinswechsler dorthin, und die
 * Plattformverwaltung erreicht ihre Systemseiten.
 */
export function SetupShell({
  clubName,
  clubLogoUrl,
  clubs,
  activeClubId,
  isPlatformAdmin,
  children,
}: {
  clubName: string;
  clubLogoUrl: string | null;
  clubs: React.ComponentProps<typeof ClubSwitcher>["clubs"];
  activeClubId: string;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-(--app-header-height) items-center gap-3 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6 xl:px-8 print:hidden">
        <Brand href={null} className="hidden sm:inline-flex" />
        <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
        {clubs.length > 1 ? (
          <>
            <ClubSwitcher clubs={clubs} activeId={activeClubId} />
            <span className="hidden text-xs text-muted-foreground sm:inline">Einrichtung</span>
          </>
        ) : (
          <>
            <ClubLogo name={clubName} logoUrl={clubLogoUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{clubName}</p>
              <p className="text-xs text-muted-foreground">Einrichtung</p>
            </div>
          </>
        )}
        {isPlatformAdmin && (
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/system">
              <ShieldIcon /> <span className="hidden sm:inline">Systemverwaltung</span>
            </Link>
          </Button>
        )}
        <form action={logoutAction} className={isPlatformAdmin ? undefined : "ml-auto"}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOutIcon /> Abmelden
          </Button>
        </form>
      </header>
      <main id="inhalt" className="mx-auto w-full max-w-[96rem] flex-1 p-4 sm:p-6 xl:p-8">
        <SetupReturnBar />
        {children}
      </main>
    </div>
  );
}
