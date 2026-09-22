"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "./nav";

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Gibt die Beschriftung der einklappbaren Gruppe zurück, die die aktuelle Seite enthält (falls es eine solche gibt). */
function activeCollapsibleGroup(groups: NavGroup[], pathname: string): string | null {
  for (const group of groups) {
    if (
      group.collapsible &&
      group.label &&
      group.items.some((item) => isActive(item.href, pathname))
    ) {
      return group.label;
    }
  }
  return null;
}

/**
 * Navigationsliste mit Hervorhebung der aktuellen Seite (aria-current). Wird in Sidebar und mobilem Menü verwendet.
 *
 * Bewegung ist dezent und immer optional: Beim Überfahren oder Fokussieren hebt sich das Symbol leicht (kleiner Sprung
 * nach oben, leichte Vergrößerung, Farbe und heller Grund) und der Text rückt einen Hauch nach rechts; beim Drücken
 * federt es kurz ein. Im ausklappenden Menü (`animateIn`) blenden die Einträge gestaffelt ein. Alle Bewegungen stehen unter
 * `motion-safe:` – wer „Bewegung reduzieren“ eingestellt hat, sieht nur die Farbänderungen. Es gibt keine Bewegung beim Laden.
 *
 * Gruppen mit `collapsible: true` (Verein, Organisation, Kommunikation, Einstellungen) klappen sich als Akkordeon auf –
 * standardmäßig geschlossen, aber automatisch offen, wenn die aktuelle Seite darin liegt. Es ist immer höchstens eine
 * Gruppe offen: Ruhiger, als wenn sich mehrere Untermenüs gleichzeitig stapeln.
 */
export function SidebarNav({
  groups,
  onNavigate,
  pinLast = false,
  animateIn = false,
  collapsedRail = false,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  /** Hält die letzte Gruppe am unteren Rand der (scrollenden) Umgebung fest – so bleiben Profil, Datenschutz und Hilfe immer erreichbar. */
  pinLast?: boolean;
  /** Blendet die Einträge beim Erscheinen gestaffelt ein (für das ausklappende Menü). */
  animateIn?: boolean;
  /** Nur reine Symbole, ohne Gruppen/Text – für die eingeklappte feste Seitenleiste (ab `lg`, nie im mobilen Menü). */
  collapsedRail?: boolean;
}) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(() =>
    activeCollapsibleGroup(groups, pathname),
  );
  // Bei echtem Seitenwechsel die Gruppe der neuen Seite aufklappen (auch wenn zuvor manuell eine andere gewählt
  // wurde); Zustandsanpassung während des Renderns statt in einem Effekt, siehe react.dev „You Might Not Need an
  // Effect“ – so bleibt ein manuelles Auf-/Zuklappen auf derselben Seite unangetastet.
  const [trackedPathname, setTrackedPathname] = useState(pathname);
  if (pathname !== trackedPathname) {
    setTrackedPathname(pathname);
    const active = activeCollapsibleGroup(groups, pathname);
    if (active) setOpenGroup(active);
  }

  if (collapsedRail) {
    return (
      <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col items-center gap-1">
        {groups.map((group, groupIndex) => (
          <div
            key={group.label ?? groupIndex}
            className={cn(
              "flex flex-col items-center gap-1",
              groupIndex > 0 && "mt-2 border-t pt-2",
            )}
          >
            {group.items.map((item) => (
              <RailItem key={item.href} item={item} active={isActive(item.href, pathname)} />
            ))}
          </div>
        ))}
      </nav>
    );
  }

  // Wie viele Einträge vor einer Gruppe stehen – Grundlage für die gestaffelte Einblendung.
  const offsets = groups.map((_, index) =>
    groups.slice(0, index).reduce((sum, group) => sum + group.items.length, 0),
  );

  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex flex-1 flex-col gap-2 [@media(max-height:820px)]:gap-1.5"
    >
      {groups.map((group, groupIndex) => {
        const pinned =
          pinLast && groups.length > 1 && groupIndex === groups.length - 1 && !group.collapsible;
        const items = group.items.map((item, itemIndex) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href, pathname)}
            pathname={pathname}
            onNavigate={onNavigate}
            animateIn={animateIn}
            style={
              animateIn
                ? { animationDelay: `${(offsets[groupIndex]! + itemIndex) * 22}ms` }
                : undefined
            }
          />
        ));

        if (group.collapsible && group.label) {
          const open = openGroup === group.label;
          return (
            <Collapsible
              key={group.label}
              open={open}
              onOpenChange={(next) => setOpenGroup(next ? group.label! : null)}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group/trigger flex w-full items-center justify-between rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors duration-150 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{group.label}</span>
                  <ChevronRightIcon className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid gap-0.5 pt-0.5">{items}</div>
              </CollapsibleContent>
            </Collapsible>
          );
        }

        return (
          <div
            key={group.label ?? groupIndex}
            className={cn(
              "grid gap-0.5",
              pinned && "sticky bottom-0 z-10 -mx-3 mt-auto border-t bg-sidebar px-3 pt-3 pb-3",
            )}
          >
            {group.label && (
              <p className="px-3.5 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </p>
            )}
            {items}
          </div>
        );
      })}
    </nav>
  );
}

function NavLink({
  item,
  active,
  pathname,
  onNavigate,
  animateIn,
  style,
}: {
  item: NavItem;
  active: boolean;
  pathname: string;
  onNavigate?: () => void;
  animateIn: boolean;
  style?: React.CSSProperties;
}) {
  // „Hilfe & Support“ merkt sich die Seite, von der man kam – eine Meldung nennt so gleich, wo das Problem auftrat.
  const target =
    item.href === "/hilfe" && !active ? `/hilfe?von=${encodeURIComponent(pathname)}` : item.href;
  return (
    <Link
      href={target}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      style={style}
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
      <span className="min-w-0 flex-1 truncate transition-transform duration-200 ease-out motion-safe:group-hover/nav:translate-x-0.5 motion-reduce:transition-none">
        {item.label}
      </span>
      {!!item.badge && (
        <span
          aria-hidden="true"
          className={cn(
            "ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 text-xs leading-none font-semibold",
            active
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}

/** Symbol-Kachel eines Menüpunkts in der eingeklappten Seitenleiste, mit Tooltip statt sichtbarem Text. */
function RailItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          aria-label={item.badge ? `${item.label} (${item.badge})` : item.label}
          className={cn(
            "relative grid size-11 shrink-0 place-items-center rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
            active
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          {item.icon}
          {!!item.badge && (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] leading-none font-semibold text-primary-foreground ring-2 ring-sidebar"
            >
              {item.badge > 9 ? "9+" : item.badge}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {!!item.badge && ` (${item.badge})`}
      </TooltipContent>
    </Tooltip>
  );
}
