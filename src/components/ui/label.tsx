"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label as LabelPrimitive } from "radix-ui";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Erklärt den Stern an Pflichtfeldern („* Pflichtfeld“). Sichtbar nur, wenn im selben Fenster bzw. Formular ein Stern steht
 * (`data-slot="required-mark"`, siehe `FieldShell`) – so trägt sie jeder `DialogHeader`, ohne dass Fenster ohne Pflichtfelder
 * sie zeigen. Wie der Stern für Screenreader verborgen: Pflichtfelder melden sich dort selbst (`aria-required`).
 */
function RequiredLegend({ className }: { className?: string }) {
  return (
    <p
      data-slot="required-legend"
      aria-hidden="true"
      className={cn(
        "col-span-full hidden text-sm text-muted-foreground [[data-slot=dialog-content]:has([data-slot=required-mark])_&]:block [form:has([data-slot=required-mark])_&]:block",
        className,
      )}
    >
      <span className="text-destructive">*</span> Pflichtfeld
    </p>
  );
}

export { Label, RequiredLegend };
