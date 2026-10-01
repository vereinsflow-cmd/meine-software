"use client";

import * as React from "react";
import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";
import { SEGMENT_BAR, SEGMENT_ITEM, SEGMENT_ITEM_ON } from "./segment-styles";

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
  stretch = false,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  /** Name der Gruppe für Screenreader, z. B. „Diagrammtyp“. */
  label: string;
  /**
   * Auf dem Handy über die volle Breite mit gleich breiten, 36 px hohen Einträgen (ab vier Einträgen zwei Spalten) –
   * statt einer Leiste, die irgendwo umbricht.
   */
  stretch?: boolean;
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
      className={cn(
        SEGMENT_BAR,
        stretch &&
          (options.length > 3
            ? "max-sm:grid max-sm:w-full max-sm:grid-cols-2"
            : "max-sm:flex max-sm:w-full"),
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          className={cn(SEGMENT_ITEM, SEGMENT_ITEM_ON, stretch && "max-sm:h-9 max-sm:flex-1")}
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
