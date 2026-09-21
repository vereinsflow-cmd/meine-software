import Link from "next/link";
import { BrandLogo, type LogoVariant } from "@/components/shared/brand-logo";
import { cn } from "@/lib/utils";

/**
 * Das Logo als Kopf von Seitenleiste, Menü und Anmeldeseiten. Mit `href` ein Link (Startseite bzw. Ziel), mit `href={null}`
 * reine Anzeige. Die Größe bestimmt `logoClassName` (Standard: Höhe 2,25 rem bei der horizontalen Fassung).
 */
export function Brand({
  className,
  logoClassName,
  href = "/",
  variant = "horizontal",
}: {
  className?: string;
  logoClassName?: string;
  href?: string | null;
  variant?: LogoVariant;
}) {
  // gestapelt: 16 rem breit – so bleibt auch der Slogan lesbar; horizontal: 2,25 rem hoch (passt in Seitenleiste und Menü)
  const size = variant === "stacked" ? "w-64" : "h-9";
  const classes = cn("inline-flex", className);
  return href ? (
    <Link href={href} className={classes} aria-label="VereinsFlow – Startseite">
      <BrandLogo variant={variant} decorative className={cn(size, logoClassName)} />
    </Link>
  ) : (
    <span className={classes}>
      <BrandLogo variant={variant} className={cn(size, logoClassName)} />
    </span>
  );
}
