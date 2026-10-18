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
 * Feste Seitenleiste ab `lg`. Standard ist die schmale Symbolleiste (`NavRail`) – seit 18.10.2026 wie in der Vorlage „Vertix“:
 * keine eigene Fläche, sondern schwebende Pillen auf dem Seitengrund (oben das Logo, Hell/Dunkel, die Gruppen, unten das Kürzel
 * der Person) in der Darstellung der übrigen Seite. Ausgeklappt die breite Leiste mit Text wie zuvor (`SidebarNav`). Zustand
 * siehe `SidebarCollapseProvider`. Die Menüs der Gruppen liegen `fixed` über der Seite (`z-40`).
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
        className="sticky top-0 z-40 hidden h-dvh flex-col text-foreground lg:flex print:hidden"
      >
        <div className="flex h-(--app-header-height) shrink-0 items-center justify-center">
          {/* Das Symbol in einem weißen Kreis – wie das runde Logo der Vorlage, aber in den Farben des Logos (auch im Dunkeln weiß). */}
          <Link
            href="/dashboard"
            aria-label="VereinsFlow – Startseite"
            className="grid size-11 place-items-center rounded-full bg-white shadow-xs ring-1 ring-black/5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG-Datei aus public/, next/image brächte hier nichts */}
            <img src="/brand/symbol.svg" width={1000} height={1000} alt="" className="size-7" />
          </Link>
        </div>
        <NavRail groups={groups} userName={userName} onExpand={onToggle} />
      </aside>
    );
  }

  return (
    <aside
      ref={asideRef}
      className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground lg:flex print:hidden"
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
