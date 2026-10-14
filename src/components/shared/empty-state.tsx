import { ACCENT } from "@/components/shared/accent";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** Farbtöne der runden Symbolfläche: Markenfarbe für leere Listen, Bernstein für Fehler, Grün für „geschafft“. */
const ICON_TONE = {
  primary: "bg-primary/10 text-primary",
  amber: ACCENT.amber.tile,
  emerald: ACCENT.emerald.tile,
} as const;

export type IconTone = keyof typeof ICON_TONE;

/**
 * Runde Symbolfläche (56 px) über einer Meldung – eine Quelle für leere Listen (`EmptyState`), die Fehlermeldung eines
 * Bereichs (`AreaError`) und die Bestätigung „Antrag angekommen“. Für Screenreader ausgeblendet (der Text sagt es).
 */
export function IconCircle({
  tone = "primary",
  className,
  children,
}: {
  tone?: IconTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-full [&_svg]:size-7",
        ICON_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Freundlicher Hinweis, wenn eine Liste leer ist – mit Vorschlag, was man tun kann. Bewusst eine ruhige Karte mit Symbol
 * (kein gestrichelter Rahmen, der wie ein Fehler oder eine Ablagefläche aussieht): „leer“ ist kein Problem.
 *
 * Dieselbe Karte trägt auch die Fehlermeldung eines Bereichs (`AreaError`): dann mit `tone="amber"`, Überschrift und Satz
 * in einer `role="alert"`-Fläche und der Kennung für den Support als `footer`.
 */
export function EmptyState({
  icon,
  tone = "primary",
  title,
  description,
  role,
  action,
  footer,
  className,
}: {
  icon?: React.ReactNode;
  /** Farbton der Symbolfläche. */
  tone?: IconTone;
  title: string;
  description?: React.ReactNode;
  /** Überschrift und Satz als Live-Region – `alert` für Fehler, die Screenreader sofort hören sollen. */
  role?: "alert" | "status";
  action?: React.ReactNode;
  /** Kleingedrucktes ganz unten (z. B. die Kennung für den Support). */
  footer?: React.ReactNode;
  className?: string;
}) {
  const message = (
    <>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="max-w-md text-muted-foreground">{description}</p>}
    </>
  );
  return (
    <div
      className={cn(
        CARD_SURFACE,
        "flex flex-col items-center justify-center gap-2 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <IconCircle tone={tone} className="mb-2">
          {icon}
        </IconCircle>
      )}
      {role ? (
        <div role={role} className="flex flex-col items-center gap-2">
          {message}
        </div>
      ) : (
        message
      )}
      {action && <div className="mt-3">{action}</div>}
      {footer}
    </div>
  );
}
