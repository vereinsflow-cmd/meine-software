import { cn } from "@/lib/utils";

/** Beschriftete Wertepaare (Stammdaten). Leere Werte werden als "–" dargestellt. */
export function DescriptionList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </dt>
          <dd className="mt-0.5 text-sm break-words">
            {value === null || value === undefined || value === "" ? "–" : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
