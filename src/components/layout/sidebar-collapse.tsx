"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface SidebarCollapseState {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseState>({
  collapsed: false,
  toggle: () => {},
});

const STORAGE_KEY = "vf:sidebar-collapsed";

/**
 * Merkt sich (nur auf diesem Gerät), ob die feste Seitenleiste zur reinen Symbolleiste eingeklappt ist – wirkt sich nur
 * ab `lg` aus. Die Spaltenbreite der Seitenleiste steckt in der CSS-Variable `--sidebar-w` (siehe globals.css); im
 * eingeklappten Zustand überschreibt dieser Provider sie per Inline-Style, damit es keinen Kampf mit den
 * Tailwind-Breakpoint-Klassen gibt. Der Zustand wird erst nach dem Einhängen aus `localStorage` gelesen (SSR kennt ihn
 * nicht) – ein kurzes Aufblitzen im ausgeklappten Grundzustand ist dafür in Kauf genommen.
 */
export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Echte Synchronisation mit einem browserseitigen, serverseitig nicht lesbaren Speicher (kein aus Props/State
    // ableitbarer Zustand) – die einmalige setState-Zuweisung beim Einhängen ist hier der vorgesehene Fall.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // z. B. privates Fenster ohne Speicherzugriff – Vorgabe „ausgeklappt“ bleibt bestehen.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
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
        style={collapsed ? ({ "--sidebar-w": "4.5rem" } as React.CSSProperties) : undefined}
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
