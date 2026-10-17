"use client";

import { Children, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BlockSize } from "../layout-prefs";
import {
  BENTO_GRID,
  BENTO_STACK,
  GRID_COLUMNS,
  SMALL_COLUMNS,
  bentoCells,
  stackedCount,
} from "../kpi-layout";

/**
 * Kennzahlen: Ab Tablet-Breite (`sm`) ein Raster, auf dem Smartphone ein Karussell – die Karten liegen nebeneinander und
 * rasten beim Wischen ein, die nächste ragt zur Hälfte ins Bild (Hinweis, dass es weitergeht). Statt vier hoher Karten
 * untereinander bleibt die Übersicht kurz. Darunter zeigen Punkte, welche Karte gerade vorn ist; sie sind zugleich Knöpfe
 * (Zielgröße 24 px). Mit der Tastatur genügt Tab: Ein fokussierter Link scrollt seine Karte von selbst ins Bild.
 * Die Karten selbst bleiben unverändert (Links mit Zahl und Hinweis) – das Karussell ordnet sie nur an.

 *
 * `layout="bento"`: das Kachelraster (Entwurf 4, vier oder fünf Karten) (Aufteilung und Breiten: `modules/dashboard/kpi-layout.ts`). `size`: die
 * eigene Größe der Kennzahlen („Anpassen“) – „Klein“ ohne Kachelraster als schmale Reihe, am Handy zwei Karten nebeneinander.
 */
/**
 * Die Karten blenden beim ersten Erscheinen nacheinander ein (je 50 ms versetzt, 8 px von unten, 300 ms) – einmal je Seitenaufruf:
 * Kehrt man über die Reiter zurück, stehen sie sofort da (sonst wirkte das häufige Wechseln langsam). Die Klassen stehen schon im
 * Server-HTML, die Bewegung beginnt also mit dem ersten Bild; „Bewegung reduzieren“ schaltet sie ab (`motion-safe`).
 */
let entered = false;

export function KpiCarousel({
  children,
  label = "Kennzahlen",
  layout = "grid",
  size = "m",
  lastFromTablet = false,
}: {
  children: React.ReactNode;
  label?: string;
  layout?: "grid" | "bento";
  size?: BlockSize;
  /**
   * Die letzte Karte erst ab Tablet-Breite (`sm`): Am Handy stünde sie im Karussell ganz hinten, kaum zu finden – die Seite
   * zeigt sie dort stattdessen als eigene Karte darunter (die Offenen Zahlungen).
   */
  lastFromTablet?: boolean;
}) {
  const items = Children.toArray(children);
  // Was am Handy im Karussell steht (für Punkte und Stand)
  const phoneCount = lastFromTablet ? items.length - 1 : items.length;
  const cells = layout === "bento" && size !== "s" ? bentoCells(items.length) : null;
  const bento = cells !== null;
  const columns = size === "s" ? SMALL_COLUMNS : GRID_COLUMNS;
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [enter, setEnter] = useState(() => !entered);
  useEffect(() => {
    entered = true;
    // Nach dem Einblenden die Animation ganz entfernen: Wird eine Zelle später neu aufgebaut (der Stapel rechts wechselt mit
    // der Breite zwischen `contents` und `flex`), liefe sie sonst noch einmal ab – samt kurz unsichtbarer Karte.
    const timer = window.setTimeout(() => setEnter(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  function onScroll() {
    const element = scroller.current;
    const first = element?.firstElementChild as HTMLElement | null;
    if (!element || !first || phoneCount < 2) return;
    // Abstand von Karte zu Karte = Breite der ersten + Lücke (Abstand zur zweiten Karte)
    const second = element.children[1] as HTMLElement | undefined;
    const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    setPage(Math.min(phoneCount - 1, Math.max(0, Math.round(element.scrollLeft / step))));
  }

  function goTo(index: number) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Über die Zellen, nicht die direkten Kinder: Der Stapel rechts (`contents`) ist ein Kind mit zwei Karten darin.
    scroller.current?.querySelectorAll<HTMLElement>("[data-kpi-cell]")[index]?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "start",
      block: "nearest",
    });
  }

  const cell = (item: React.ReactNode, index: number, stacked = false) => (
    <div
      key={index}
      data-kpi-cell=""
      style={enter ? { animationDelay: `${index * 50}ms` } : undefined}
      className={cn(
        "shrink-0 snap-start sm:w-auto",
        enter &&
          "motion-safe:animate-in motion-safe:duration-300 motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        size === "s" ? "w-[46%]" : "w-[78%]",
        cells?.[index],
        lastFromTablet && index === items.length - 1 && "max-sm:hidden",
        // Im Stapel rechts: die obere Karte so hoch wie ihr Inhalt, die letzte füllt den Rest
        stacked && (index === items.length - 1 ? "@bento/kpis:flex-1" : "@bento/kpis:flex-none"),
        // Fünf Karten in zwei Spalten (schmaler als das Kachelraster): die letzte über die volle Breite statt allein halb
        cells &&
          items.length % 2 === 1 &&
          index === items.length - 1 &&
          "@max-bento/kpis:col-span-2",
      )}
    >
      {item}
    </div>
  );
  // Bei fünf Karten im Kachelraster bilden die letzten beiden den Stapel rechts. Unterhalb des Kachelrasters löst er sich auf
  // (`contents`): Seine Karten sind dann Teil des Karussells bzw. des Rasters wie alle anderen.
  const stack = cells ? stackedCount(items.length) : 0;
  const singles = items.slice(0, items.length - stack).map((item, index) => cell(item, index));
  const stacked =
    stack > 0 ? (
      <div key="stack" className={cn("contents", BENTO_STACK)}>
        {items
          .slice(items.length - stack)
          .map((item, offset) => cell(item, items.length - stack + offset, true))}
      </div>
    ) : null;

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
        {singles}
        {stacked}
      </div>
      {phoneCount > 1 && (
        <div className="mt-2 flex justify-center gap-1 sm:hidden">
          {items.slice(0, phoneCount).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Kennzahl ${index + 1} von ${phoneCount}`}
              aria-current={index === page ? "true" : undefined}
              className="grid size-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "h-2 rounded-full transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none",
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
