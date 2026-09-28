import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zurück-Link über dem Seitentitel („‹ Alle Mitglieder“) – auf Detail- und Formularseiten gleich gestaltet. Er nennt das
 * Ziel: die Liste („Alle …“), die übergeordnete Seite („Helferplanung“) oder beim Bearbeiten den Datensatz selbst.
 */
export function BackLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={cn("mb-3", className)}>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" /> {children}
      </Link>
    </p>
  );
}
