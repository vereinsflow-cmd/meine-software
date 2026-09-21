import Link from "next/link";
import { Brand } from "@/components/shared/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/5 via-background to-background">
      <header className="mx-auto flex w-full max-w-md justify-center px-4 pt-8 sm:pt-12">
        <Brand variant="stacked" />
      </header>
      <main
        id="inhalt"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8"
      >
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-md justify-center gap-4 px-4 pb-8 text-sm text-muted-foreground">
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
      </footer>
    </div>
  );
}
