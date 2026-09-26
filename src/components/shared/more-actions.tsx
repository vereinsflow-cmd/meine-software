"use client";

import { useRef, useState } from "react";
import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Was ein Dialog braucht, den ein Punkt aus „Weitere Aktionen“ öffnet (siehe `useMoreActions`). */
export interface MenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}

/**
 * Zustand der Rückfragen hinter „Weitere Aktionen“. Er liegt bewusst außerhalb des Menüs: Das Menü schließt sich nach
 * der Auswahl – läge der Dialog darin, ginge er gleich mit zu. `show(name)` öffnet einen Dialog, `dialog(name)` liefert
 * dessen Props; nach dem Schließen kehrt der Fokus zum Menüknopf zurück (es gibt keinen eigenen Auslöser-Knopf).
 */
export function useMoreActions<T extends string>() {
  const [active, setActive] = useState<T | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return {
    triggerRef,
    show: (name: T) => setActive(name),
    dialog: (name: T): MenuDialogProps => ({
      open: active === name,
      onOpenChange: (open) =>
        setActive((current) => (open ? name : current === name ? null : current)),
      onCloseAutoFocus: (event) => {
        event.preventDefault();
        triggerRef.current?.focus();
      },
    }),
  };
}

/**
 * Umrandeter Knopf „Weitere Aktionen“ mit Menü für seltene und folgenreiche Aktionen im Seitenkopf – die häufigen
 * (z. B. „Bearbeiten“) stehen daneben als eigene Knöpfe. Gefährliche Punkte (`variant="destructive"`) stehen zuletzt,
 * durch `DropdownMenuSeparator` abgesetzt. Die Punkte sind etwas höher als üblich (gut treffbar am Smartphone), und
 * das Menü hält 16 px Abstand zum Bildschirmrand – wie der Seiteninhalt.
 */
export function MoreActions({
  triggerRef,
  children,
}: {
  triggerRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} variant="outline">
          <EllipsisIcon /> Weitere Aktionen
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className="w-auto min-w-52 [&>[data-slot=dropdown-menu-item]]:gap-2 [&>[data-slot=dropdown-menu-item]]:px-2 [&>[data-slot=dropdown-menu-item]]:py-2"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
