"use client";

import { useEffect, useRef } from "react";
import { ChevronsLeftIcon } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/shared/brand";
import { IconButton } from "@/components/shared/icon-button";
import { cn } from "@/lib/utils";
import { NavRail } from "./nav-rail";
import { SidebarNav } from "./sidebar-nav";
import { useSidebarCollapse } from "./sidebar-collapse";
import type { NavGroup } from "./nav";

/**
 * Feste Seitenleiste ab `lg` – seit 17.10.2026 dunkel (Vorlage „Analytics“): die Klasse `dark` schaltet für die Leiste und alles
 * darin die dunklen Farben ein, unabhängig von der Darstellung der übrigen Seite. Standard ist die schmale Symbolleiste
 * (`NavRail`: Gruppen mit Ausklapp-Menü, unten das Kürzel der Person); ausgeklappt die breite Leiste mit Text wie zuvor
 * (`SidebarNav`). Zustand siehe `SidebarCollapseProvider`.
 *
 * Schmal ragt die helle Fläche der aktuellen Seite ein Stück über den Rand in die Seite hinein (wie in der Vorlage) – deshalb
 * schneidet die Leiste dann nichts ab (`overflow-visible`) und liegt über der Seite (`z-40`). Breit scrollt die Navigation.
 */
export function Sidebar({ groups, userName }: { groups: NavGroup[]; userName: string }) {
  const { collapsed, toggle } = useSidebarCollapse();
  // Schmal und breit sind verschiedene Bausteine – der gedrückte Knopf verschwindet beim Umschalten. Hatte er den Tastaturfokus,
  // bekommt ihn der Knopf der neuen Fassung (sonst landete der Fokus im Nichts).
  const asideRef = useRef<HTMLElement>(null);
  const refocus = useRef(false);
  const onToggle = () => {
    refocus.current = document.activeElement?.hasAttribute("data-sidebar-toggle") ?? false;
    toggle();
  };
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    asideRef.current?.querySelector<HTMLElement>("[data-sidebar-toggle]")?.focus();
  }, [collapsed]);

  if (collapsed) {
    return (
      <aside
        ref={asideRef}
        className="dark sticky top-0 z-40 hidden h-dvh flex-col bg-sidebar text-sidebar-foreground scheme-dark lg:flex dark:border-r dark:border-white/5 print:hidden"
      >
        <div className="flex h-(--app-header-height) shrink-0 items-center justify-center">
          {/* Das Symbol auf einer weißen Kachel – wie die farbige Kachel der Vorlage, aber in den Farben des Logos. Die helle
              Fassung steht fest (in der dunklen Leiste wählte `BrandLogo` sonst die weiße). */}
          <Link
            href="/dashboard"
            aria-label="VereinsFlow – Startseite"
            className="grid size-12 place-items-center rounded-2xl bg-white shadow-[0_8px_20px_-10px_rgb(0_0_0/0.6)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG-Datei aus public/, next/image brächte hier nichts */}
            <img src="/brand/symbol.svg" width={1000} height={1000} alt="" className="size-9" />
          </Link>
        </div>
        <NavRail groups={groups} userName={userName} onExpand={onToggle} />
      </aside>
    );
  }

  return (
    <aside
      ref={asideRef}
      className="dark sticky top-0 hidden h-dvh flex-col overflow-hidden bg-sidebar text-sidebar-foreground scheme-dark lg:flex dark:border-r dark:border-white/5 print:hidden"
    >
      <div className="flex h-(--app-header-height) shrink-0 items-center border-b px-5">
        {/* Auf niedrigen Bildschirmen ist der Kopf flacher; dort etwas kleiner, damit das Logo nicht am oberen Rand klebt. */}
        <Brand
          href="/dashboard"
          variant="horizontal"
          logoClassName="[@media(max-height:820px)]:h-10"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-5 [@media(max-height:820px)]:pt-3">
        <SidebarNav groups={groups} pinLast />
      </div>
      <div className="shrink-0 border-t p-2">
        <IconButton
          data-sidebar-toggle=""
          onClick={onToggle}
          label="Seitenleiste einklappen"
          className={cn("w-full justify-center text-muted-foreground hover:text-foreground")}
        >
          <ChevronsLeftIcon className="size-5" />
        </IconButton>
      </div>
    </aside>
  );
}
