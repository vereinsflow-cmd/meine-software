"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Kleines Symbol mit Erklärung, z. B. das Schloss neben einem Dokumentnamen („Nur Vorstand“, seit 20.10.2026): Der Hinweis
 * erscheint beim Überfahren, beim Fokussieren per Tab und – anders als ein gewöhnlicher Tooltip – auch beim Antippen am Handy
 * (ein Tipp daneben schließt ihn wieder). Screenreader lesen `label` gleich mit (unsichtbarer Text), das Symbol selbst ist
 * ausgeblendet. Für Knöpfe mit Symbol gibt es `IconButton`; dies hier ist nur eine Anzeige.
 */
export function IconHint({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  /** Das Symbol (wird für Screenreader ausgeblendet). */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          // Radix schließt den Hinweis beim Klick – am Handy (kein Überfahren) soll ihn der Tipp aber gerade öffnen.
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          className={cn(
            // Die Tippfläche reicht 6 px über das kleine Symbol hinaus (gut zu treffen am Handy).
            "relative inline-flex shrink-0 cursor-default rounded-sm text-muted-foreground after:absolute after:-inset-1.5 [&_svg]:size-3.5",
            className,
          )}
        >
          <span aria-hidden="true" className="flex">
            {children}
          </span>
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
