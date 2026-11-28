import { cn } from "@/lib/utils";

/**
 * Das VereinsFlow-Logo „Punktring“: vier Ringe aus Punkten bilden eine Sprechblase (Lücke und Zipfel unten links), in der Mitte
 * ein Kleeblatt-Knoten; Farben Grün → Türkis → Vereinsblau. Daneben bzw. darunter die Wortmarke „VereinsFlow“ (gerade, „Flow“ im
 * Verlauf).
 *
 * Die Grafiken sind die SVG-Dateien aus dem Logo-Paket in `public/brand/` (siehe docs/brand/README.md), unverändert eingebunden.
 * Für die dunkle Darstellung gibt es je eine helle Fassung (`-weiss`: Name weiß, hellere Verlaufstöne). Beide Bilder stehen im
 * HTML, CSS blendet das unpassende aus (`dark:`) – so ist beim Umschalten der Darstellung nichts nachzuladen, und das ausgeblendete
 * Bild lesen Screenreader nicht vor.
 *
 *   horizontal  kompakte Fassung: kleine Form des Zeichens links, Wortmarke rechts – für Kopfzeilen und Seitenleisten (die
 *               Halbtonpunkte verschwämmen bei 40–44 px Höhe)
 *   stacked     Zeichen (mit Punktringen) oben, Wortmarke darunter – für die Anmeldung
 *   icon        nur das Zeichen (mit Punktringen, ab gut 100 px), ohne Wortmarke
 */
export type LogoVariant = "horizontal" | "stacked" | "icon";

type LogoFiles = { light: string; dark: string; width: number; height: number };

const LOGOS: Record<LogoVariant, LogoFiles> = {
  horizontal: {
    light: "/brand/logo.svg",
    dark: "/brand/logo-weiss.svg",
    width: 840,
    height: 204,
  },
  stacked: {
    light: "/brand/logo-gestapelt.svg",
    dark: "/brand/logo-gestapelt-weiss.svg",
    width: 462,
    height: 304,
  },
  icon: { light: "/brand/symbol.svg", dark: "/brand/symbol-weiss.svg", width: 210, height: 210 },
};

export function BrandLogo({
  variant = "horizontal",
  decorative = false,
  className,
}: {
  variant?: LogoVariant;
  /** `true`, wenn der Name bereits anderswo steht (z. B. in der Beschriftung des umgebenden Links). */
  decorative?: boolean;
  className?: string;
}) {
  const logo = LOGOS[variant];
  const alt = decorative ? "" : "VereinsFlow";
  // Breite und Höhe der Datei: Der Browser hält damit schon vor dem Laden den richtigen Platz frei (kein Springen der Seite).
  // Die angezeigte Größe bestimmt `className` (Höhe oder Breite), die andere Seite folgt dem Seitenverhältnis.
  const base = cn("block h-auto w-auto max-w-full", className);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG-Datei aus public/, next/image brächte hier nichts */}
      <img
        src={logo.light}
        width={logo.width}
        height={logo.height}
        alt={alt}
        draggable={false}
        className={cn(base, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- s. o. */}
      <img
        src={logo.dark}
        width={logo.width}
        height={logo.height}
        alt={alt}
        draggable={false}
        className={cn(base, "hidden dark:block")}
      />
    </>
  );
}
