import type { Metadata } from "next";
import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/shared/brand-logo";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

/** 404 außerhalb des angemeldeten Bereichs: ohne Menü, deshalb mit Logo – man soll sehen, wo man ist. */
export default function NotFound() {
  return (
    <main
      id="inhalt"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-8 p-6"
    >
      <Link href="/" aria-label="VereinsFlow – zur Startseite" className="rounded-md">
        <BrandLogo decorative className="w-48" />
      </Link>
      <EmptyState
        className="w-full"
        icon={<SearchXIcon />}
        title="Seite nicht gefunden"
        description="Diese Seite gibt es nicht, oder du hast keinen Zugriff darauf."
        action={
          <Button asChild>
            <Link href="/dashboard">Zum Dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}
