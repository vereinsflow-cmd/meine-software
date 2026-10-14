import { BackLink } from "@/components/shared/back-link";
import { PageStack } from "@/components/shared/page-section";
import { PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { FeesNav } from "@/modules/fees/components/fees-nav";
import { FinanceHeader } from "./finance-header";

/**
 * Ladezustand der Finanzseiten (für die `loading.tsx` unter app/(app)/finanzen): Überschrift „Finanzen“ und die Leiste der
 * Bereiche (bei den Beiträgen auch deren Leiste) stehen sofort und echt da – beim Wechsel zwischen den Bereichen bleibt der
 * Kopf stehen, und der neue Reiter ist gleich gewählt. Nur Untertitel, Knöpfe und Inhalt sind Platzhalter; der Inhalt folgt
 * dem Aufbau der fertigen Seite (Bausteine aus components/shared/page-skeletons.tsx), damit beim Erscheinen nichts springt.
 *
 * Nur der Inhalt ist eine Live-Region (`role="status"`, für Screenreader „… wird geladen …“) – Kopf und Leisten bleiben
 * bedienbar.
 */
export function FinanceLoading({
  label,
  actions = [],
  fees = false,
  backLink,
  children,
}: {
  /** Was geladen wird, für Screenreader („Kassenbuch wird geladen …“). */
  label: string;
  /** Knöpfe im Kopf der fertigen Seite – je Knopf seine ungefähre Breite (`"w-36"`; ein Symbolknopf `"w-9"`). */
  actions?: string[];
  /** Mit der Leiste der Beiträge („Wer zahlt was“, „Beitragslauf“ …). */
  fees?: boolean;
  /** Zurück-Link über dem Kopf, wie auf der fertigen Seite. */
  backLink?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <PageStack>
      {backLink && <BackLink href={backLink.href}>{backLink.label}</BackLink>}
      <FinanceHeader
        description={<Skeleton as="span" className="h-4 w-72" />}
        actions={
          actions.length > 0
            ? actions.map((width, index) => (
                <Skeleton key={index} className={cn("h-9 rounded-lg", width)} />
              ))
            : undefined
        }
      />
      {fees && <FeesNav />}
      <PageLoading label={label}>{children}</PageLoading>
    </PageStack>
  );
}

/** Kacheln mit einer Zahl (Kontostände, Summen der Beiträge): eine Spalte am Handy, zwei ab `sm`, vier ab `xl`. */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn(CARD_SURFACE, "grid gap-2 p-4")}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3.5 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}

/** Umschaltleiste („Offen | Bezahlt | Alle“) und Suchfeld – nebeneinander, am Handy untereinander. */
export function FilterRowSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Skeleton className={cn("h-10 max-w-full rounded-lg", wide ? "w-96" : "w-60")} />
      <Skeleton className="h-9 w-full rounded-lg sm:w-80" />
    </div>
  );
}

/** Kopfkarte eines Beitragslaufs: Titel mit Zeitraum, darunter eine Zeile, rechts die drei Schritte. */
export function RunCardSkeleton() {
  return (
    <div className={cn(CARD_SURFACE, "flex flex-wrap items-start justify-between gap-4 p-5")}>
      <div className="grid min-w-0 gap-2">
        <Skeleton className="my-px h-6 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-80 max-w-full rounded-lg" />
    </div>
  );
}

/** Leiste am Ende (Hinweis links, Knöpfe rechts) – wie unter dem Beitragslauf. */
export function BottomBarSkeleton() {
  return (
    <div className={cn(CARD_SURFACE, "flex flex-wrap items-center justify-between gap-3 p-4")}>
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-9 w-40 rounded-lg" />
    </div>
  );
}
