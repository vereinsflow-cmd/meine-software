"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { cn } from "@/lib/utils";

const FEES_TABS: { href: string; label: string; also?: string[] }[] = [
  { href: "/finanzen/beitraege", label: "Wer zahlt was" },
  { href: "/finanzen/beitraege/lauf", label: "Beitragslauf", also: ["/finanzen/beitraege/laeufe"] },
  { href: "/finanzen/beitraege/offen", label: "Offene Beiträge" },
  { href: "/finanzen/beitraege/arten", label: "Beitragsarten" },
  { href: "/finanzen/beitraege/familien", label: "Familien" },
];

/** Welcher Reiter gilt: der mit dem längsten passenden Pfad (ein einzelner Beitrag gehört zu „Offene Beiträge“). */
function currentTab(pathname: string): string {
  if (/^\/finanzen\/beitraege\/[^/]+$/.test(pathname)) {
    const known = FEES_TABS.some((tab) => tab.href === pathname);
    if (!known) return "/finanzen/beitraege/offen";
  }
  let best = "/finanzen/beitraege";
  for (const tab of FEES_TABS)
    for (const prefix of [tab.href, ...(tab.also ?? [])])
      if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && prefix.length > best.length)
        best = tab.href;
  return best;
}

/** Unterbereiche der Beiträge. */
export function FeesNav() {
  const pathname = usePathname();
  const active = currentTab(pathname);
  return (
    <nav aria-label="Bereiche der Beiträge" className={cn(SEGMENT_BAR, "mb-5")}>
      {FEES_TABS.map((tab) => {
        const current = tab.href === active;
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
