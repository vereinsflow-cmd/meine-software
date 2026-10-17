"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface SidebarCollapseState {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseState>({
  collapsed: true,
  toggle: () => {},
});

/**
 * Seit 17.10.2026 ist die schmale, dunkle Symbolleiste der Standard (Vorlage „Analytics“); gemerkt wird nur, wer sie breit mit
 * Text haben möchte. Bewusst ein neuer Schlüssel: Unter dem alten (`vf:sidebar-collapsed`) stand bei fast allen „0“
 * (ausgeklappt) – sie sähen die neue Leiste sonst nie.
 */
const STORAGE_KEY = "vf:sidebar-breit";

/**
 * Merkt sich (nur auf diesem Gerät), ob die feste Seitenleiste breit (mit Text) oder als schmale Symbolleiste erscheint – wirkt
 * sich nur ab `lg` aus. Die Spaltenbreite steckt in der CSS-Variable `--sidebar-w` (siehe globals.css: schmal), breit setzt dieser
 * Provider sie per Inline-Style auf `--sidebar-w-wide`, damit es keinen Kampf mit den Tailwind-Breakpoint-Klassen gibt. Der
 * Zustand wird erst nach dem Einhängen aus `localStorage` gelesen (SSR kennt ihn nicht) – wer die breite Leiste gewählt hat, sieht
 * deshalb kurz die schmale.
 */
export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    // Echte Synchronisation mit einem browserseitigen, serverseitig nicht lesbaren Speicher (kein aus Props/State
    // ableitbarer Zustand) – die einmalige setState-Zuweisung beim Einhängen ist hier der vorgesehene Fall.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      // z. B. privates Fenster ohne Speicherzugriff – Vorgabe „schmal“ bleibt bestehen.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "0" : "1");
      } catch {
        // s. o.
      }
      return next;
    });
  }, []);

  return (
    <SidebarCollapseContext.Provider value={{ collapsed, toggle }}>
      <div
        data-collapsed={collapsed ? "" : undefined}
        className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)] motion-safe:lg:transition-[grid-template-columns] motion-safe:lg:duration-200 print:block"
        style={
          collapsed
            ? undefined
            : ({ "--sidebar-w": "var(--sidebar-w-wide)" } as React.CSSProperties)
        }
      >
        {children}
      </div>
    </SidebarCollapseContext.Provider>
  );
}

/** Zustand und Umschalter der Seitenleiste (siehe `SidebarCollapseProvider`). */
export function useSidebarCollapse(): SidebarCollapseState {
  return useContext(SidebarCollapseContext);
}
