import Link from "next/link";
import { Brand } from "@/components/shared/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // pt/pb: sichere Bereiche der App-Ansicht (Statusleiste, Home-Indikator); im Browser 0.
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/5 via-background to-background pt-(--safe-top) pb-(--safe-bottom)">
      <header className="mx-auto flex w-full max-w-md justify-center px-4 pt-8 sm:pt-12">
        <Brand variant="stacked" />
      </header>
      <main
        id="inhalt"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8"
      >
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-md flex-wrap justify-center gap-x-4 gap-y-2 px-4 pb-8 text-sm text-muted-foreground">
        <Link
          href="/impressum"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Impressum
        </Link>
        <Link
          href="/datenschutzerklaerung"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Datenschutz
        </Link>
        <Link
          href="/konto-loeschen"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Konto löschen
        </Link>
      </footer>
    </div>
  );
}
