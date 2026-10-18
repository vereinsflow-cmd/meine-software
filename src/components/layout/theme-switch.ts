"use client";

import { flushSync } from "react-dom";
import { useTheme } from "next-themes";

export type ThemeChoice = "light" | "dark" | "system";

/** Hell oder dunkel – „Wie Gerät“ aufgelöst nach der Einstellung des Geräts. */
function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Wechselt die Darstellung wie in der Vorlage „Vertix“ (18.10.2026): Die neue Darstellung wächst als Kreis vom gedrückten Knopf
 * (`origin`) über die ganze Seite, in 0,6 s. Dafür nimmt der Browser ein Bild der alten Seite auf (View Transitions), die neue
 * Darstellung wird sofort gesetzt – nicht erst im Effekt von next-themes – und dann per `clip-path` aufgedeckt.
 *
 * Ohne View Transitions (ältere Browser) oder mit „Bewegung reduzieren“ wechselt sie ohne Bewegung; ebenso, wenn sich hell/dunkel
 * gar nicht ändert (z. B. „Wie Gerät“ und das Gerät ist schon hell).
 */
export function useThemeSwitch() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  function switchTo(next: ThemeChoice, origin?: { x: number; y: number }) {
    const target = resolve(next);
    const root = document.documentElement;
    const apply = () => {
      flushSync(() => setTheme(next));
      root.classList.remove("light", "dark");
      root.classList.add(target);
      root.style.colorScheme = target;
    };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || still || root.classList.contains(target)) {
      setTheme(next);
      return;
    }
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 600,
            easing: "cubic-bezier(0.65, 0, 0.35, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => undefined);
  }

  /** Mitte eines Elements – Ausgangspunkt des Kreises. */
  function originOf(element: Element | null) {
    if (!element) return undefined;
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  return { theme: (theme ?? "system") as ThemeChoice, resolvedTheme, switchTo, originOf };
}
