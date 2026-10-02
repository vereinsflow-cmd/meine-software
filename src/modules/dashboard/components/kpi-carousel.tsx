"use client";

import { Children, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BlockSize } from "../layout-prefs";
import { BENTO_CELL, BENTO_GRID, GRID_COLUMNS, SMALL_COLUMNS } from "../kpi-layout";

/**
 * Kennzahlen: Ab Tablet-Breite (`sm`) ein Raster, auf dem Smartphone ein Karussell – die Karten liegen nebeneinander und
 * rasten beim Wischen ein, die nächste ragt zur Hälfte ins Bild (Hinweis, dass es weitergeht). Statt vier hoher Karten
 * untereinander bleibt die Übersicht kurz. Darunter zeigen Punkte, welche Karte gerade vorn ist; sie sind zugleich Knöpfe
 * (Zielgröße 24 px). Mit der Tastatur genügt Tab: Ein fokussierter Link scrollt seine Karte von selbst ins Bild.
 * Die Karten selbst bleiben unverändert (Links mit Zahl und Hinweis) – das Karussell ordnet sie nur an.

 *
 * `layout="bento"`: das Kachelraster wie im Entwurf 2 (Aufteilung und Breiten: `modules/dashboard/kpi-layout.ts`). `size`: die
 * eigene Größe der Kennzahlen („Anpassen“) – „Klein“ ohne Kachelraster als schmale Reihe, am Handy zwei Karten nebeneinander.
 */
export function KpiCarousel({
  children,
  label = "Kennzahlen",
  layout = "grid",
  size = "m",
}: {
  children: React.ReactNode;
  label?: string;
  layout?: "grid" | "bento";
  size?: BlockSize;
}) {
  const items = Children.toArray(children);
  const bento = layout === "bento" && size !== "s" && items.length === BENTO_CELL.length;
  const columns = size === "s" ? SMALL_COLUMNS : GRID_COLUMNS;
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  function onScroll() {
    const element = scroller.current;
    const first = element?.firstElementChild as HTMLElement | null;
    if (!element || !first || items.length < 2) return;
    // Abstand von Karte zu Karte = Breite der ersten + Lücke (Abstand zur zweiten Karte)
    const second = element.children[1] as HTMLElement | undefined;
    const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    setPage(Math.min(items.length - 1, Math.max(0, Math.round(element.scrollLeft / step))));
  }

  function goTo(index: number) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (scroller.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "start",
      block: "nearest",
    });
  }

  return (
    // `min-w-0`: Als Element eines Rasters darf das Karussell seine Spalte sonst auf die Breite aller Karten aufweiten.
    <div
      data-layout={bento ? "bento" : "grid"}
      data-size={size}
      className="group/kpis @container/kpis min-w-0"
    >
      <div
        ref={scroller}
        role="group"
        aria-roledescription="Karussell"
        aria-label={label}
        onScroll={onScroll}
        className={cn(
          // Smartphone: nebeneinander, einrastend, bis an den Bildschirmrand; Bildlaufleiste ausgeblendet
          // (unten mehr Innenabstand mit ausgleichendem Rand – sonst schnitte die Bildlauffläche den farbigen Schein unter den
          // Karten ab)
          "-mx-4 -mt-1 -mb-10 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pt-1 pb-10 [&::-webkit-scrollbar]:hidden",
          // ab `sm`: Raster aus zwei Spalten; breiter das Kachelraster bzw. mehr Spalten (`kpi-layout.ts`)
          "sm:mx-0 sm:my-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:p-0",
          bento ? BENTO_GRID[size === "l" ? "l" : "m"] : columns[Math.min(items.length, 4)],
        )}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className={cn(
              "shrink-0 snap-start sm:w-auto",
              size === "s" ? "w-[46%]" : "w-[78%]",
              bento && BENTO_CELL[index],
            )}
          >
            {item}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mt-2 flex justify-center gap-1 sm:hidden">
          {items.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Kennzahl ${index + 1} von ${items.length}`}
              aria-current={index === page ? "true" : undefined}
              className="grid size-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "h-2 rounded-full transition-all duration-200 motion-reduce:transition-none",
                  index === page ? "w-5 bg-primary" : "w-2 bg-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
