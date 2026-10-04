import { cn } from "@/lib/utils";

/**
 * Das VereinsFlow-Logo: ein „V“ aus drei Etappen (links Schwarz, rechts Vereinsblau) mit orangefarbenem Punkt und Tempo-Strichen,
 * daneben bzw. darunter die Wortmarke „VereinsFlow“ (kursiv, orange unterstrichen).
 *
 * Die Grafiken sind die SVG-Dateien aus dem Logo-Paket in `public/brand/` (siehe docs/brand/README.md), unverändert eingebunden.
 * Für die dunkle Darstellung gibt es je eine helle Fassung (Schwarz → Weiß, Vereinsblau → Himmel). Beide Bilder stehen im HTML,
 * CSS blendet das unpassende aus (`dark:`) – so ist beim Umschalten der Darstellung nichts nachzuladen, und das ausgeblendete Bild
 * lesen Screenreader nicht vor.
 *
 *   horizontal  Symbol links, Wortmarke rechts – für Kopfzeilen und Seitenleisten
 *   stacked     Symbol oben, Wortmarke darunter – für die Anmeldung
 *   icon        nur das Symbol, ohne Wortmarke – für die eingeklappte Seitenleiste
 */
export type LogoVariant = "horizontal" | "stacked" | "icon";

type LogoFiles = { light: string; dark: string; width: number; height: number };

const LOGOS: Record<LogoVariant, LogoFiles> = {
  horizontal: {
    light: "/brand/logo.svg",
    dark: "/brand/logo-weiss.svg",
    width: 1325,
    height: 298,
  },
  stacked: {
    light: "/brand/logo-gestapelt.svg",
    dark: "/brand/logo-gestapelt-weiss.svg",
    width: 819,
    height: 485,
  },
  icon: { light: "/brand/symbol.svg", dark: "/brand/symbol-weiss.svg", width: 1000, height: 1000 },
};

/**
 * Symbol für kleine Größen (bis 32 px): die ruhigere Form des Favicons – zwei statt drei Etappen, ohne Tempo-Striche –, damit das V
 * klar erkennbar bleibt. Abgeleitet aus `src/app/icon.svg` des Logo-Pakets (ohne die dunkle Kachel).
 */
const SMALL_ICON: LogoFiles = {
  light: "/brand/symbol-klein.svg",
  dark: "/brand/symbol-klein-weiss.svg",
  width: 32,
  height: 32,
};

export function BrandLogo({
  variant = "horizontal",
  small = false,
  decorative = false,
  className,
}: {
  variant?: LogoVariant;
  /** Nur für `icon`: Darstellung bis 32 px (z. B. eingeklappte Seitenleiste) – nimmt die vereinfachte Form. */
  small?: boolean;
  /** `true`, wenn der Name bereits anderswo steht (z. B. in der Beschriftung des umgebenden Links). */
  decorative?: boolean;
  className?: string;
}) {
  const logo = variant === "icon" && small ? SMALL_ICON : LOGOS[variant];
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
