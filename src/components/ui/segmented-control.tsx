"use client";

import * as React from "react";
import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Beschriftung für Screenreader, falls `label` nur ein Symbol ist. */
  ariaLabel?: string;
  icon?: React.ReactNode;
}

/**
 * Umschaltleiste (genau eine Option ist gewählt), z. B. Diagrammtyp oder Zeitraum. Technisch eine Radix-Auswahlgruppe:
 * Pfeiltasten wechseln die Option, die Gruppe hat einen Namen, und die Auswahl lässt sich nicht „abwählen“.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  /** Name der Gruppe für Screenreader, z. B. „Diagrammtyp“. */
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T); // leerer Wert = Klick auf die schon gewählte Option: ignorieren
      }}
      aria-label={label}
      className={cn("inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1", className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          className={cn(
            "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0",
            "data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-secondary",
          )}
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
