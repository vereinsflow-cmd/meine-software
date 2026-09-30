"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";

/**
 * Abstand der Meldungen zum Bildschirmrand: der Sonner-Standard (24 px, am Handy 16 px) plus der sichere Bereich der
 * App-Ansicht (Statusleiste, Kamera-Aussparung, Home-Indikator – siehe `--safe-*` in globals.css; im Browser 0).
 */
function edgeOffset(base: string) {
  return {
    top: `calc(${base} + var(--safe-top))`,
    right: `calc(${base} + var(--safe-right))`,
    bottom: `calc(${base} + var(--safe-bottom))`,
    left: `calc(${base} + var(--safe-left))`,
  };
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <LoaderCircleIcon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      offset={edgeOffset("24px")}
      mobileOffset={edgeOffset("16px")}
      {...props}
    />
  );
};

export { Toaster };
