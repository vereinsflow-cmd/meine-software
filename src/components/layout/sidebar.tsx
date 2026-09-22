"use client";

import { ChevronsLeftIcon } from "lucide-react";
import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";
import { useSidebarCollapse } from "./sidebar-collapse";
import type { NavGroup } from "./nav";

/** Feste Seitenleiste ab `lg` – mit Umschalter für die eingeklappte Symbolleiste (Zustand siehe `SidebarCollapseProvider`). */
export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const { collapsed, toggle } = useSidebarCollapse();

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r bg-sidebar lg:flex print:hidden">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b [@media(max-height:820px)]:h-14",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <Brand
          href="/dashboard"
          variant={collapsed ? "icon" : "horizontal"}
          logoClassName={collapsed ? "h-8" : undefined}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-5 [@media(max-height:820px)]:pt-3">
        <SidebarNav groups={groups} pinLast={!collapsed} collapsedRail={collapsed} />
      </div>
      <div className="shrink-0 border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
          className="w-full justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronsLeftIcon
            className={cn("size-5 transition-transform duration-200", collapsed && "rotate-180")}
          />
        </Button>
      </div>
    </aside>
  );
}
