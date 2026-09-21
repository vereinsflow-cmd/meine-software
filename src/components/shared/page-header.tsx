import { cn } from "@/lib/utils";

/**
 * Einheitlicher Seitenkopf mit Titel, Beschreibung und Aktionen (bricht auf Smartphones um).
 * `inline`: Beschreibung steht neben dem Titel statt darunter – kompakter, z. B. für die Begrüßung auf dem Dashboard.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  inline = false,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:justify-between",
        inline ? "mb-5 sm:items-center" : "mb-7 sm:items-start",
        className,
      )}
    >
      <div
        className={cn(
          "min-w-0 sm:flex-1",
          inline && "sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-0",
        )}
      >
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className={cn("text-base text-muted-foreground", inline ? "mt-1 sm:mt-0" : "mt-1.5")}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}
