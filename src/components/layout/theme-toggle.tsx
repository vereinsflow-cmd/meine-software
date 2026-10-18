"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeSwitch } from "./theme-switch";

/**
 * Sonne und Mond übereinander in einer Pille (oben in der schmalen Seitenleiste, wie in der Vorlage „Vertix“): Der gedrückte
 * Knopf trägt eine graue Fläche. Ein Klick wechselt mit dem Kreis-Übergang (`useThemeSwitch`). Vor dem Laden im Browser ist
 * unbekannt, welche Darstellung gilt – dann ist keiner gedrückt.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, switchTo, originOf } = useThemeSwitch();
  const [mounted, setMounted] = useState(false);
  // Einmalig nach dem Einhängen: Erst im Browser ist die Darstellung bekannt (sonst wiche das Server-HTML ab).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const current = mounted ? resolvedTheme : undefined;

  const options = [
    { value: "light", label: "Helle Darstellung", icon: <SunIcon className="size-[1.125rem]" /> },
    { value: "dark", label: "Dunkle Darstellung", icon: <MoonIcon className="size-[1.125rem]" /> },
  ] as const;

  return (
    <div
      role="group"
      aria-label="Darstellung"
      className={cn("flex flex-col gap-1 rounded-full bg-card p-1.5 shadow-xs", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={current === option.value}
          onClick={(event) => switchTo(option.value, originOf(event.currentTarget))}
          className={cn(
            "grid size-9 place-items-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
            current === option.value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
