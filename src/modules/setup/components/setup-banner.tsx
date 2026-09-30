"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightIcon, RocketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Hinweis oben im Inhalt, solange die Einrichtung nicht abgeschlossen ist – auf der Einrichtungsseite selbst nicht. */
export function SetupBanner() {
  const pathname = usePathname();
  if (pathname.startsWith("/einrichtung")) return null;
  return (
    <aside
      aria-label="Einrichtung des Vereins"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center print:hidden"
    >
      <RocketIcon className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden="true" />
      <p className="flex-1 text-sm">
        <span className="font-medium">Dein Verein ist noch nicht fertig eingerichtet.</span>{" "}
        <span className="text-muted-foreground">
          Der Assistent führt dich Schritt für Schritt durch den Rest.
        </span>
      </p>
      <Button asChild size="sm" className="self-start sm:self-auto">
        <Link href="/einrichtung">
          Einrichtung fortsetzen <ArrowRightIcon />
        </Link>
      </Button>
    </aside>
  );
}
