"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Brand } from "@/components/shared/brand";
import { ClubLogo } from "@/components/shared/club-logo";
import { SidebarNav } from "./sidebar-nav";
import type { NavGroup } from "./nav";

/** Ausklappbares Menü für Smartphones und Tablets (ab der Breite `lg` ersetzt durch die feste Sidebar). */
export function MobileNav({
  groups,
  clubName,
  clubLogoUrl,
}: {
  groups: NavGroup[];
  clubName: string;
  clubLogoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menü öffnen">
          <MenuIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle asChild>
            <div>
              <Brand href={null} />
            </div>
          </SheetTitle>
          {/* Beschreibung des Dialogs: nur Text und schmückendes Logo (ein <p>, deshalb nur Inline-Inhalte). */}
          <SheetDescription className="flex items-center gap-2">
            <ClubLogo name={clubName} logoUrl={clubLogoUrl} size="sm" />
            <span className="truncate">{clubName}</span>
          </SheetDescription>
        </SheetHeader>
        <div className="p-3">
          <SidebarNav groups={groups} onNavigate={() => setOpen(false)} animateIn variant="sheet" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
