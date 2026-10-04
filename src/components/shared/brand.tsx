import Link from "next/link";
import { BrandLogo, type LogoVariant } from "@/components/shared/brand-logo";
import { cn } from "@/lib/utils";

/**
 * Das Logo als Kopf von Seitenleiste, Menü und Anmeldeseiten. Mit `href` ein Link (Startseite bzw. Ziel), mit `href={null}`
 * reine Anzeige. Die Größe bestimmt `logoClassName` (Standard: Höhe 2,75 rem bei der horizontalen Fassung).
 */
export function Brand({
  className,
  logoClassName,
  href = "/",
  variant = "horizontal",
  small = false,
}: {
  className?: string;
  logoClassName?: string;
  href?: string | null;
  variant?: LogoVariant;
  /** Nur für `icon`: kleine Darstellung (bis 32 px) mit der vereinfachten Form des Symbols. */
  small?: boolean;
}) {
  // gestapelt: 16 rem breit; horizontal: 2,75 rem hoch – die SVG-Datei hat oben und unten Schutzraum, sichtbar sind gut 2 rem
  // (passt in Seitenleiste und Menü); Symbol: 2 rem.
  const size = variant === "stacked" ? "w-64" : variant === "icon" ? "size-8" : "h-11";
  const classes = cn("inline-flex", className);
  return href ? (
    <Link href={href} className={classes} aria-label="VereinsFlow – Startseite">
      <BrandLogo variant={variant} small={small} decorative className={cn(size, logoClassName)} />
    </Link>
  ) : (
    <span className={classes}>
      <BrandLogo variant={variant} small={small} className={cn(size, logoClassName)} />
    </span>
  );
}
