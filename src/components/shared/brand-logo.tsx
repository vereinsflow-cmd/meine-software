import { cn } from "@/lib/utils";
import { LOGO_PATHS } from "./brand-logo-paths";

/**
 * Das VereinsFlow-Logo als Vektorgrafik: zwei sich überschneidende Kreise, die Wortmarke „VereinsFlow“ und – in der
 * gestapelten Fassung – der Slogan „Bringt Vereinsarbeit in Fluss“.
 *
 * Die Farben kommen aus CSS-Variablen (`--logo-*`, siehe globals.css), damit das Logo auch in der dunklen Darstellung lesbar bleibt.
 * Die Maße stammen vom Original (docs/brand/vereinsflow-logo-original.png); Koordinaten liegen im Pixelraster des Originals.
 *
 *   horizontal  Symbol links, Wortmarke rechts – für Kopfzeilen und Seitenleisten
 *   stacked     Symbol oben, Wortmarke und Slogan darunter – für die Anmeldung
 *   icon        nur das Symbol, ohne Wortmarke – für die eingeklappte Seitenleiste
 */
export type LogoVariant = "horizontal" | "stacked" | "icon";

const VIEW_BOX: Record<LogoVariant, string> = {
  horizontal: "0 0 1005 162",
  stacked: "536 286 689 515",
  // Ausschnitt des Symbols aus der horizontalen Fassung (dieselbe Transformation, siehe unten).
  icon: "0 0 280 162",
};

/** Symbol im Raster des Originals: Kreise mit Radius 130,5; der Überschnitt (Linse) hat eine eigene Farbe. */
function Symbol() {
  return (
    <>
      <circle cx="785.5" cy="420.5" r="130.5" className="fill-(--logo-dark)" />
      <circle cx="975.5" cy="420.5" r="130.5" className="fill-(--logo-light)" />
      <path
        d="M880.5 331.03A130.5 130.5 0 0 0 880.5 509.97A130.5 130.5 0 0 0 880.5 331.03Z"
        className="fill-(--logo-overlap)"
      />
    </>
  );
}

function Wordmark() {
  return (
    <>
      <path d={LOGO_PATHS.vereins} className="fill-(--logo-ink)" />
      <path d={LOGO_PATHS.flow} className="fill-(--logo-dark)" />
    </>
  );
}

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
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEW_BOX[variant]}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "VereinsFlow – Bringt Vereinsarbeit in Fluss"}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      className={cn("block h-auto max-w-full", className)}
    >
      {variant === "stacked" ? (
        <>
          <Symbol />
          <Wordmark />
          <path d={LOGO_PATHS.tagline} className="fill-(--logo-muted)" />
        </>
      ) : variant === "icon" ? (
        <g transform="scale(0.62) translate(-655 -290)">
          <Symbol />
        </g>
      ) : (
        <>
          {/* Symbol verkleinert an den linken Rand, Wortmarke rechts daneben auf halber Symbolhöhe */}
          <g transform="scale(0.62) translate(-655 -290)">
            <Symbol />
          </g>
          <g transform="translate(-216.4 -613.4)">
            <Wordmark />
          </g>
        </>
      )}
    </svg>
  );
}
