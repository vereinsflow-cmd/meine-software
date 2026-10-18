"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/** Farben der Kopfzeile (= Seitengrund `--background`), gleich wie in `viewport.themeColor` in app/layout.tsx. */
const STATUS_BAR = { light: "#f4f4f6", dark: "#0b0b0c" } as const;

/**
 * Hält die Farbe der Statusleiste auf dem Handy passend zum gewählten Design: Wer im Profilmenü „Hell“ oder „Dunkel“ fest
 * einstellt, bekommt die Leiste in dieser Farbe – sonst folgt sie wie bisher der Einstellung des Geräts.
 */
export function ThemeColorSync() {
  const { theme } = useTheme();
  useEffect(() => {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content =
        theme === "light" || theme === "dark"
          ? STATUS_BAR[theme]
          : meta.media.includes("dark")
            ? STATUS_BAR.dark
            : STATUS_BAR.light;
    });
  }, [theme]);
  return null;
}
