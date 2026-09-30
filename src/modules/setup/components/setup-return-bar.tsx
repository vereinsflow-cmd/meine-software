"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, RocketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SETUP_PATH } from "@/lib/club-setup";
import { lastSetupStep } from "./remember-step";

// Der Speicher meldet keine Änderungen; gelesen wird bei jedem Rendern (z. B. nach einem Seitenwechsel).
const noSubscription = () => () => {};

/** Während der Einrichtung auf den Seiten, zu denen der Assistent führt (z. B. Mitglieder importieren): der Weg zurück. */
export function SetupReturnBar() {
  const pathname = usePathname();
  // Zurück zu dem Schritt, von dem aus die Person hierher kam (z. B. „Mitglieder“) – erst im Browser bekannt, auf dem
  // Server ohne Angabe (dann der erste offene Schritt).
  const step = useSyncExternalStore(noSubscription, lastSetupStep, () => null);
  const href = step ? `${SETUP_PATH}?schritt=${step}` : SETUP_PATH;
  if (pathname.startsWith(SETUP_PATH)) return null;
  return (
    <aside
      aria-label="Einrichtung des Vereins"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center print:hidden"
    >
      <RocketIcon className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden="true" />
      <p className="flex-1 text-sm">
        <span className="font-medium">Du richtest gerade deinen Verein ein.</span>{" "}
        <span className="text-muted-foreground">
          Wenn du hier fertig bist, geht es im Assistenten weiter.
        </span>
      </p>
      <Button asChild size="sm" className="self-start sm:self-auto">
        <Link href={href}>
          <ArrowLeftIcon /> Zurück zum Assistenten
        </Link>
      </Button>
    </aside>
  );
}
