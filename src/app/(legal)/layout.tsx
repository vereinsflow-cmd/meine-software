import Link from "next/link";
import { Brand } from "@/components/shared/brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
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
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <Link
          href="/impressum"
          className="mr-4 underline-offset-4 hover:text-foreground hover:underline"
        >
          Impressum
        </Link>
        <Link
          href="/datenschutzerklaerung"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Datenschutzerklärung
        </Link>
      </footer>
    </div>
  );
}
