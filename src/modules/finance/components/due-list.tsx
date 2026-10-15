import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DueItem } from "../overview";

const TONE_TEXT: Record<DueItem["tone"], string> = {
  danger: "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  success: "text-emerald-700 dark:text-emerald-400",
  neutral: "text-muted-foreground",
};

/**
 * Inhalt der Karte „Das steht an“ (Übersicht und Spenden): Zähler („2 Punkte für dich“), die Punkte nach Dringlichkeit –
 * nur der erste mit blauem Knopf, alle weiteren mit einem Link –, darunter „Demnächst“ und reine Info-Zeilen (z. B. „Bescheid
 * gültig bis …“), die nicht als Punkt zählen. Ohne `finance:manage` heißt der Zähler „offene Punkte“.
 */
export function DueList({
  items,
  canManage,
  empty = "Alles erledigt – gerade ist nichts zu tun.",
}: {
  /** Nach `urgency` sortiert. */
  items: DueItem[];
  canManage: boolean;
  /** Satz, wenn es gar nichts gibt. */
  empty?: string;
}) {
  const now = items.filter((item) => !item.later && !item.info);
  const later = items.filter((item) => item.later && !item.info);
  const info = items.filter((item) => item.info);
  if (items.length === 0) return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">
        {now.length === 0
          ? "Gerade ist nichts dringend."
          : canManage
            ? now.length === 1
              ? "1 Punkt für dich"
              : `${now.length} Punkte für dich`
            : now.length === 1
              ? "1 offener Punkt"
              : `${now.length} offene Punkte`}
      </p>
      {now.length > 0 && (
        <ul className="grid">
          {now.map((item, index) => (
            <DueRow key={item.key} item={item} primary={index === 0} />
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-muted-foreground">Demnächst</h3>
          <ul className="grid">
            {later.map((item) => (
              <DueRow key={item.key} item={item} />
            ))}
          </ul>
        </>
      )}
      {info.length > 0 && (
        // Reine Info steht abgesetzt unter den Punkten (kein Knopf, zählt nicht mit).
        <ul
          className={cn(
            "grid",
            (now.length > 0 || later.length > 0) && "border-t [&>li:first-child]:pt-3",
          )}
        >
          {info.map((item) => (
            <DueRow key={item.key} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}

function DueRow({ item, primary = false }: { item: DueItem; primary?: boolean }) {
  return (
    <li className="grid gap-1 border-t py-3 first:border-t-0 first:pt-1">
      <p className="font-semibold break-words">{item.title}</p>
      <p className="text-sm break-words text-muted-foreground">
        {item.detail}
        {item.statusText && (
          <>
            {" "}
            <span className={cn("font-medium", TONE_TEXT[item.tone])}>{item.statusText}</span>
          </>
        )}
      </p>
      {primary ? (
        <Button asChild size="sm" className="mt-1 justify-self-start">
          <Link href={item.href}>{item.actionLabel}</Link>
        </Button>
      ) : (
        <Link
          href={item.href}
          className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {item.actionLabel}
        </Link>
      )}
    </li>
  );
}
