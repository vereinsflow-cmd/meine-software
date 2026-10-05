"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { cn } from "@/lib/utils";

const FEES_TABS = [
  { href: "/finanzen/beitraege", label: "Wer zahlt was", exact: true },
  { href: "/finanzen/beitraege/arten", label: "Beitragsarten" },
] as const;

/** Unterbereiche der Beiträge (weitere folgen: Familien, Beitragslauf, offene Beiträge). */
export function FeesNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Bereiche der Beiträge" className={cn(SEGMENT_BAR, "mb-5")}>
      {FEES_TABS.map((tab) => {
        const current =
          "exact" in tab && tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={segmentItem(current)}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
