import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/shared/brand";
import { logoutAction } from "@/modules/auth/actions";
import { getTenantContext, requirePlatformAdminPage } from "@/server/tenancy/context";

/**
 * Eigenes Layout für die Systemadministration: Sie braucht keinen Vereinskontext (ein Superadministrator muss
 * keinem Verein angehören) und darf deshalb nicht im Vereinsbereich liegen.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdminPage();
  const hasClub = (await getTenantContext()) !== null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 sm:px-6">
        <Brand href="/system" />
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          Systemadministration
        </span>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">
            {user.firstName} {user.lastName}
          </span>
          {hasClub && (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Zum Verein</Link>
            </Button>
          )}
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Abmelden
            </Button>
          </form>
        </div>
      </header>
      <main id="inhalt" className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
