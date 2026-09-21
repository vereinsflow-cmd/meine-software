import { cn } from "@/lib/utils";

/**
 * Freundlicher Hinweis, wenn eine Liste leer ist – mit Vorschlag, was man tun kann. Bewusst eine ruhige Karte mit Symbol
 * (kein gestrichelter Rahmen, der wie ein Fehler oder eine Ablagefläche aussieht): „leer“ ist kein Problem.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl bg-card px-6 py-14 text-center shadow-sm ring-1 ring-foreground/10 dark:ring-foreground/15",
        className,
      )}
    >
      {icon && (
        <div
          className="mb-2 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-7"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="max-w-md text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
