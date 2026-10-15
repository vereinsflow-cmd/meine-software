"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { cn } from "@/lib/utils";

/** Bereiche der Finanzen in der Reihenfolge der Leiste. Neue Bereiche kommen dazu, sobald sie fertig sind. */
export const FINANCE_TABS = [
  { href: "/finanzen", label: "Übersicht", exact: true },
  { href: "/finanzen/beitraege", label: "Beiträge" },
  { href: "/finanzen/kassenbuch", label: "Kassenbuch" },
  { href: "/finanzen/rechnungen", label: "Rechnungen" },
  { href: "/finanzen/spenden", label: "Spenden" },
  { href: "/finanzen/abschluss", label: "Abschluss" },
] as const;

/** Was die kleine Zahl an einem Bereich bedeutet (für Screenreader, direkt hinter der Zahl). */
const COUNT_MEANING: Partial<Record<string, (count: number) => string>> = {
  "/finanzen/rechnungen": () => " überfällig",
  "/finanzen/abschluss": (count) =>
    count === 1 ? " Monat abzuschließen" : " Monate abzuschließen",
  "/finanzen/spenden": (count) =>
    count === 1 ? " Zuwendungsbestätigung fehlt" : " Zuwendungsbestätigungen fehlen",
};

/**
 * Leiste unter der Überschrift „Finanzen“ (Entwurf 3 „Cockpit“, gewählt am 04.10.2026): Kacheln in einer hellen Leiste wie die
 * übrigen Umschaltleisten. `counts` zeigt kleine Zahlen an einem Bereich (z. B. überfällige Rechnungen). Am Handy scrollt
 * die Leiste waagerecht statt umzubrechen – beim Laden so, dass der gewählte Bereich ganz zu sehen ist und links kein
 * abgeschnittener Rest eines Reiters steht (der Reiter davor beginnt am Rand).
 */
export function FinanceTabs({ counts = {} }: { counts?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = bar.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    // Nur die Leiste selbst scrollen (nie die Seite): offsetLeft zählt ab der Leiste (`relative`), 4 px = ihr Innenabstand.
    const previous = active.previousElementSibling as HTMLElement | null;
    let left = previous ? previous.offsetLeft - 4 : 0;
    if (active.offsetLeft + active.offsetWidth + 4 - left > nav.clientWidth)
      left = active.offsetLeft - 4;
    nav.scrollLeft = Math.max(0, left);
  }, [pathname]);
  return (
    <nav
      ref={bar}
      aria-label="Bereiche der Finanzen"
      // relative: Auch der unsichtbare Hilfstext („überfällig“) bleibt in der waagerecht scrollenden Leiste – sonst
      // machte er die Seite am Handy breiter als den Bildschirm. `self-start`: In der Spalte der Seite (`PageStack`) nur so
      // breit wie die Kacheln; den Abstand darunter macht die Spalte.
      className={cn(SEGMENT_BAR, "relative max-w-full flex-nowrap self-start overflow-x-auto")}
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
                <span className="sr-only">{COUNT_MEANING[tab.href]?.(count) ?? " offen"}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
