"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { resolveSwipe, type DashboardTabId } from "../tabs";

export interface DashboardTab {
  id: DashboardTabId;
  label: string;
  /** Vom Server gerenderter Inhalt des Reiters. */
  content: React.ReactNode;
}

const ICON: Record<DashboardTabId, typeof UsersIcon> = {
  uebersicht: LayoutDashboardIcon,
  termine: CalendarDaysIcon,
  mitglieder: UsersIcon,
  aktivitaet: ListChecksIcon,
};

interface Fade {
  start: boolean;
  end: boolean;
}

/**
 * Breite des Verlaufs am Rand der Reiterleiste. Sie ist größer als die breiteste textfreie Stelle zwischen zwei Reitern
 * (2 × 14 px Innenabstand + 4 px Abstand). So blendet am Rand immer ein Stück Schrift sichtbar aus, egal wie breit Schrift
 * und Bildschirm sind.
 */
const FADE = "3rem";

/** Maske für die Leiste: Wo sie weiterläuft, blendet sie zum Rand hin aus; ohne Überlauf keine Maske. */
function fadeMask({ start, end }: Fade): string | undefined {
  if (!start && !end) return undefined;
  const left = start ? `transparent, #000 ${FADE}` : "#000";
  const right = end ? `#000 calc(100% - ${FADE}), transparent` : "#000";
  return `linear-gradient(to right, ${left}, ${right})`;
}

/** Läuft die Geste in etwas, das selbst waagerecht scrollt oder Eingaben annimmt (Tabelle, Diagramm, Feld), gehört sie diesem Element. */
function ownsGesture(target: Element, boundary: Element): boolean {
  if (
    target.closest(
      "input, textarea, select, [contenteditable='true'], [role='slider'], [data-no-swipe]",
    )
  ) {
    return true;
  }
  for (let node: Element | null = target; node && node !== boundary; node = node.parentElement) {
    const { overflowX } = getComputedStyle(node);
    if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth)
      return true;
  }
  return false;
}

/**
 * Die Bereiche des Dashboards als „Folien“ innerhalb einer Seite (die Seitenleiste behält den einen Punkt „Dashboard“).
 *
 * Wechsel: per Reiter, mit den Pfeiltasten, mit „Zurück/Weiter“ unter dem Inhalt oder – auf Touchgeräten – durch Wischen nach
 * links/rechts. Alles geschieht im Browser, ohne Neuladen und ohne Serveranfrage (der Server liefert alle Bereiche mit). Der neue
 * Bereich gleitet in Richtung der Bewegung herein (nach rechts weiter = von rechts; zurück = von links); bei „Bewegung reduzieren“
 * erscheint er sofort. Die Adresse wird per `replaceState` nachgeführt (`?tab=mitglieder`): verlinkbar, Neuladen bleibt darauf,
 * „Zurück“ verlässt das Dashboard statt durch alle Bereiche zu laufen. Wischen ist nur eine Zugabe – jede Funktion geht auch ohne.
 *
 * Die Leiste bleibt beim Scrollen unter der Kopfzeile stehen; ein Strich gleitet unter den aktiven Reiter. Auf schmalen
 * Bildschirmen lässt sie sich seitlich wischen (ein Verlauf am Rand zeigt, dass es weitergeht), der gewählte Reiter wird
 * ins Bild geholt. Hat eine Rolle nur einen Bereich,
 * gibt es keine Leiste – nur den Inhalt.
 */
export function DashboardTabs({
  tabs,
  initial,
}: {
  tabs: DashboardTab[];
  initial: DashboardTabId;
}) {
  const [active, setActive] = useState<DashboardTabId>(initial);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const [fade, setFade] = useState<Fade>({ start: false, end: false });
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);

  const order = tabs.map((tab) => tab.id);
  const index = Math.max(0, order.indexOf(active));
  const previous = tabs[index - 1];
  const next = tabs[index + 1];

  /** Setzt den Strich unter den aktiven Reiter (ohne Zustand: direkt am Element, damit nichts neu gezeichnet werden muss). */
  const placeLine = useCallback(() => {
    const trigger = list.current?.querySelector<HTMLElement>('[data-state="active"]');
    const marker = line.current;
    if (!trigger || !marker) return;
    marker.style.width = `${trigger.offsetWidth}px`;
    marker.style.transform = `translateX(${trigger.offsetLeft}px)`;
    marker.style.opacity = "1";
  }, []);

  // Nach jedem Wechsel: Strich verschieben und den Reiter ins Bild holen (schmale Leiste).
  useEffect(() => {
    placeLine();
    bar.current
      ?.querySelector<HTMLElement>('[data-state="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, placeLine]);

  // Erste Platzierung ohne Übergang (der Strich soll nicht von links „hereinfahren“), danach gleitet er.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (line.current) line.current.style.transition = "";
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  /** Merkt sich, ob die Leiste nach links/rechts weiterläuft – dort blendet sie aus (siehe `fadeMask`). */
  const updateFade = useCallback(() => {
    const scroller = bar.current;
    if (!scroller) return;
    const start = scroller.scrollLeft > 1;
    const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    setFade((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  // Ändert sich die Breite (Fenster, Schrift), stimmen die Lage des Strichs und der Verlauf am Rand sonst nicht mehr.
  useEffect(() => {
    const element = list.current;
    const scroller = bar.current;
    if (!element || !scroller) return;
    const observer = new ResizeObserver(() => {
      placeLine();
      updateFade();
    });
    observer.observe(element);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [placeLine, updateFade]);

  if (tabs.length === 1) return <>{tabs[0]!.content}</>;

  function select(id: DashboardTabId) {
    if (id === active) return;
    setDirection(order.indexOf(id) > index ? "next" : "prev");
    setActive(id);
    const url = new URL(window.location.href);
    if (id === tabs[0]!.id) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  /** Über Zurück/Weiter oder Wischen: zusätzlich an den Anfang des Bereichs springen (der Inhalt ist oft kürzer als der vorige). */
  function go(id: DashboardTabId) {
    select(id);
    requestAnimationFrame(() => root.current?.scrollIntoView({ block: "start" }));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || !event.isPrimary) return; // Wischen nur mit Finger oder Stift
    if (ownsGesture(event.target as Element, event.currentTarget)) return;
    swipe.current = { x: event.clientX, y: event.clientY, at: performance.now() };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const direction = resolveSwipe(
      event.clientX - start.x,
      event.clientY - start.y,
      performance.now() - start.at,
    );
    const target = direction === "next" ? next : direction === "prev" ? previous : undefined;
    if (target) go(target.id);
  }

  const slide =
    direction === null
      ? undefined
      : direction === "next"
        ? "motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in motion-safe:slide-in-from-right-6"
        : "motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in motion-safe:slide-in-from-left-6";

  return (
    <Tabs
      ref={root}
      value={active}
      onValueChange={(value) => select(value as DashboardTabId)}
      className="scroll-mt-16 gap-6"
    >
      {/* Leiste: bleibt beim Scrollen unter der Kopfzeile stehen (`sticky`), leicht durchscheinend. Auf kleinen Bildschirmen
          reicht sie bis an den Rand (negativer Rand = Seitenrand) und lässt sich wischen, ab `lg` passt sie in den Inhalt.
          Läuft sie seitlich weiter, blendet die innere, scrollende Fläche zum Rand hin aus (Hinweis „hier geht es weiter“) –
          Grund, Rahmen und Schatten sitzen außen und bleiben davon unberührt. `scroll-px-12` hält den gewählten Reiter beim
          Hereinholen aus dem Verlauf heraus. */}
      <div className="sticky top-16 z-20 -mx-4 border-b bg-background/95 shadow-[0_1px_3px_-1px_rgb(0_0_0/0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 lg:mx-0 dark:shadow-none [@media(max-height:820px)]:top-14">
        <div
          ref={bar}
          onScroll={updateFade}
          data-fade={
            fade.start && fade.end ? "both" : fade.start ? "start" : fade.end ? "end" : undefined
          }
          className="scroll-px-12 overflow-x-auto px-4 sm:px-6 lg:px-0"
          style={{ maskImage: fadeMask(fade) }}
        >
          <TabsList
            ref={list}
            variant="line"
            aria-label="Bereiche des Dashboards"
            className="relative w-max gap-1 p-0 group-data-horizontal/tabs:h-12"
          >
            {tabs.map((tab) => {
              const Icon = ICON[tab.id];
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="h-full flex-none gap-2 rounded-none px-3.5 text-base font-medium text-muted-foreground after:hidden hover:text-foreground dark:text-muted-foreground data-active:font-semibold data-active:text-primary dark:data-active:text-primary"
                >
                  <Icon className="hidden xl:block" aria-hidden="true" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
            {/* Der gleitende Strich unter dem aktiven Reiter (rein optisch). Bis zur ersten Messung unsichtbar und ohne Übergang. */}
            <span
              ref={line}
              data-slot="tab-indicator"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-primary opacity-0 transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
              style={{ transition: "none" }}
            />
          </TabsList>
        </div>
      </div>

      {/* Bereich mit Wischgeste: senkrechtes Scrollen und Zoomen bleiben dem Browser, waagerechtes Wischen blättert.
          `overflow-x-clip` (mit ausgleichendem Rand) verhindert, dass der hereingleitende Bereich einen seitlichen Balken erzeugt. */}
      <div
        className="-mx-1.5 touch-pan-y touch-pinch-zoom overflow-x-clip px-1.5"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        {tabs.map((tab) => (
          <TabsContent
            key={tab.id}
            value={tab.id}
            className={cn(
              "rounded-lg text-base focus-visible:ring-2 focus-visible:ring-ring",
              // Nur der eingehende Bereich gleitet. Hätte auch der abgehende eine Animation, ließe Radix ihn bis zu deren Ende
              // eingebunden – beide stünden kurz untereinander und der neue spränge nach oben.
              tab.id === active && slide,
            )}
          >
            {tab.content}
          </TabsContent>
        ))}

        {/* Blättern am Ende des Bereichs: wie Folien – ohne wieder nach oben scrollen zu müssen. */}
        <nav
          aria-label="Bereich wechseln"
          className="mt-10 flex items-center justify-between gap-3 border-t pt-6"
        >
          {previous ? (
            <Button
              variant="outline"
              onClick={() => go(previous.id)}
              aria-label={`Zurück: ${previous.label}`}
            >
              <ArrowLeftIcon aria-hidden="true" /> {previous.label}
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button onClick={() => go(next.id)} aria-label={`Weiter: ${next.label}`}>
              {next.label} <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </Tabs>
  );
}
