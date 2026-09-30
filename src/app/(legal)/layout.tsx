import Link from "next/link";
import { Brand } from "@/components/shared/brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    // pt/pb: sichere Bereiche der App-Ansicht (Statusleiste, Home-Indikator); im Browser 0.
    <div className="flex min-h-dvh flex-col pt-(--safe-top) pb-(--safe-bottom)">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
          <Brand />
          <Link
            href="/anmelden"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Zur Anmeldung
          </Link>
        </div>
      </header>
      <main id="inhalt" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t px-4 py-6 text-sm text-muted-foreground">
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
          Datenschutzerklärung
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
