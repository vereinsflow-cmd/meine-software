"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav";

/**
 * Navigationsliste mit Hervorhebung der aktuellen Seite (aria-current). Wird in Sidebar und mobilem Menü verwendet.
 *
 * Bewegung ist dezent und immer optional: Beim Überfahren oder Fokussieren hebt sich das Symbol leicht (kleiner Sprung
 * nach oben, leichte Vergrößerung, Farbe und heller Grund) und der Text rückt einen Hauch nach rechts; beim Drücken
 * federt es kurz ein. Im ausklappenden Menü (`animateIn`) blenden die Einträge gestaffelt ein. Alle Bewegungen stehen unter
 * `motion-safe:` – wer „Bewegung reduzieren“ eingestellt hat, sieht nur die Farbänderungen. Es gibt keine Bewegung beim Laden.
 */
export function SidebarNav({
  groups,
  onNavigate,
  pinLast = false,
  animateIn = false,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  /** Hält die letzte Gruppe am unteren Rand der (scrollenden) Umgebung fest – so bleiben Profil, Datenschutz und Hilfe immer erreichbar. */
  pinLast?: boolean;
  /** Blendet die Einträge beim Erscheinen gestaffelt ein (für das ausklappende Menü). */
  animateIn?: boolean;
}) {
  const pathname = usePathname();
  // Wie viele Einträge vor einer Gruppe stehen – Grundlage für die gestaffelte Einblendung.
  const offsets = groups.map((_, index) =>
    groups.slice(0, index).reduce((sum, group) => sum + group.items.length, 0),
  );

  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex flex-1 flex-col gap-5 [@media(max-height:820px)]:gap-3"
    >
      {groups.map((group, groupIndex) => (
        <div
          key={group.label ?? groupIndex}
          className={cn(
            "grid gap-0.5",
            pinLast &&
              groups.length > 1 &&
              groupIndex === groups.length - 1 &&
              "sticky bottom-0 z-10 -mx-3 mt-auto border-t bg-sidebar px-3 pt-3 pb-3",
          )}
        >
          {group.label && (
            <p className="px-3.5 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {group.label}
            </p>
          )}
          {group.items.map((item, itemIndex) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            // „Hilfe & Support“ merkt sich die Seite, von der man kam – eine Meldung nennt so gleich, wo das Problem auftrat.
            const target =
              item.href === "/hilfe" && !active
                ? `/hilfe?von=${encodeURIComponent(pathname)}`
                : item.href;
            return (
              <Link
                key={item.href}
                href={target}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                style={
                  animateIn
                    ? { animationDelay: `${(offsets[groupIndex]! + itemIndex) * 22}ms` }
                    : undefined
                }
                className={cn(
                  "group/nav flex items-center gap-2.5 rounded-lg px-3.5 py-1.5 text-base leading-snug font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [@media(max-height:820px)]:py-1",
                  // Aktive Seite: gefüllt statt nur getönt – so ist auf einen Blick klar, wo man sich befindet.
                  active
                    ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                    : "text-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  animateIn &&
                    "motion-safe:animate-in motion-safe:duration-300 motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-left-3",
                )}
              >
                {/* Symbolfläche: 28 px um das 21-px-Symbol, ragt ohne Höhenzuwachs über die Zeile hinaus (negativer Rand). */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "-my-1 -ml-1 grid size-7 shrink-0 place-items-center rounded-lg transition-[translate,scale,background-color,color] duration-200 ease-out motion-reduce:transition-none",
                    "motion-safe:group-hover/nav:-translate-y-px motion-safe:group-hover/nav:scale-110 motion-safe:group-focus-visible/nav:-translate-y-px motion-safe:group-focus-visible/nav:scale-110 motion-safe:group-active/nav:scale-95",
                    active
                      ? "bg-primary-foreground/15"
                      : "group-hover/nav:bg-primary/12 group-hover/nav:text-primary group-focus-visible/nav:bg-primary/12 group-focus-visible/nav:text-primary",
                  )}
                >
                  {item.icon}
                </span>
                <span className="transition-transform duration-200 ease-out motion-safe:group-hover/nav:translate-x-0.5 motion-reduce:transition-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
