"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarCheckIcon, CoinsIcon, SettingsIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MoreActions, useMoreActions } from "@/components/shared/more-actions";
import { CashCountDialog } from "./cash-count-dialog";

/**
 * „Weitere Aktionen“ im Kassenbuch: Kassensturz (Fenster), Monatsabschluss und Konten/Kategorien (Seiten). Seltene Aufgaben
 * des Kassenwarts – „Neue Buchung“ und „Umbuchung“ stehen daneben als eigene Knöpfe. `openCashCount` öffnet den
 * Kassensturz gleich (Link „Kassensturz machen“ aus der Checkliste des Monatsabschlusses).
 */
export function LedgerMoreMenu({
  cashAccounts,
  openCashCount = null,
}: {
  cashAccounts: { id: string; name: string; bookCents: number }[];
  /** Kasse, deren Kassensturz gleich offen startet (`?kassensturz=<id>` aus der Checkliste des Monatsabschlusses). */
  openCashCount?: string | null;
}) {
  const more = useMoreActions<never>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Eigener Zustand statt `more.dialog`: So kann das Fenster gleich offen starten (Link „Kassensturz machen“).
  const [cashOpen, setCashOpen] = useState(Boolean(openCashCount) && cashAccounts.length > 0);
  // Den Parameter gleich wieder aus der Adresse nehmen – sonst öffnete Neuladen oder „Zurück“ das Fenster erneut.
  useEffect(() => {
    if (!searchParams.has("kassensturz")) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete("kassensturz");
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
  return (
    <>
      <MoreActions triggerRef={more.triggerRef}>
        {cashAccounts.length > 0 && (
          <DropdownMenuItem onSelect={() => setCashOpen(true)}>
            <CoinsIcon /> Kassensturz
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/finanzen/abschluss">
            <CalendarCheckIcon /> Monatsabschluss
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/finanzen/einstellungen">
            <SettingsIcon /> Konten und Kategorien
          </Link>
        </DropdownMenuItem>
      </MoreActions>
      {cashAccounts.length > 0 && (
        <CashCountDialog
          accounts={cashAccounts}
          initialAccountId={openCashCount ?? undefined}
          open={cashOpen}
          onOpenChange={setCashOpen}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            more.triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
