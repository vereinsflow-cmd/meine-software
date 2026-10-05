"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { cn } from "@/lib/utils";

/** Bereiche der Finanzen in der Reihenfolge der Leiste. Neue Bereiche kommen dazu, sobald sie fertig sind. */
export const FINANCE_TABS = [
  { href: "/finanzen", label: "Übersicht", exact: true },
  { href: "/finanzen/kassenbuch", label: "Kassenbuch" },
  { href: "/finanzen/rechnungen", label: "Rechnungen" },
  { href: "/finanzen/abschluss", label: "Abschluss" },
] as const;

/**
 * Leiste unter der Überschrift „Finanzen“ (Entwurf 3 „Cockpit“, gewählt am 04.10.2026): Kacheln in einer hellen Leiste wie die
 * übrigen Umschaltleisten. `counts` zeigt kleine Zahlen an einem Bereich (z. B. überfällige Rechnungen). Am Handy scrollt
 * die Leiste waagerecht statt umzubrechen.
 */
export function FinanceTabs({ counts = {} }: { counts?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Bereiche der Finanzen"
      className={cn(SEGMENT_BAR, "mb-6 max-w-full flex-nowrap overflow-x-auto")}
    >
      {FINANCE_TABS.map((tab) => {
        const current =
          "exact" in tab && tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const count = counts[tab.href];
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={segmentItem(current, "h-9 px-3.5")}
          >
            {tab.label}
            {count !== undefined && count > 0 && (
              <span className="min-w-5 rounded-full bg-amber-100 px-1.5 text-center text-xs font-semibold text-amber-800 tabular-nums dark:bg-amber-400/20 dark:text-amber-200">
                {count}
                <span className="sr-only">
                  {tab.href === "/finanzen/abschluss" ? " Monat abzuschließen" : " überfällig"}
                </span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
