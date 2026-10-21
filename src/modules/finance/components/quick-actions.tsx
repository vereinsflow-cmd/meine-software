"use client";

import Link from "next/link";
import {
  BookOpenIcon,
  CalendarSyncIcon,
  FilePlusIcon,
  HandHeartIcon,
  PlusIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntryFormOptions } from "../ledger";
import { EntryDialog } from "./entry-dialog";

/**
 * Kreis je Aktion: kräftiger Verlauf mit weißem Symbol (Symbol ≥ 3 : 1 auf der hellsten Stelle des Verlaufs), Schein in
 * derselben Farbe. Hell wie dunkel gleich – sie stehen auf der Nacht des Kopfs.
 */
const TONE = {
  blue: "from-blue-500 to-blue-700 shadow-blue-500/40",
  orange: "from-orange-600 to-orange-800 shadow-orange-500/35",
  emerald: "from-emerald-600 to-emerald-800 shadow-emerald-500/35",
  violet: "from-violet-500 to-violet-700 shadow-violet-500/35",
  glass: "from-white/20 to-white/5 shadow-black/20 ring-1 ring-white/20",
} as const;

/** Knopf bzw. Link: Kreis mit Beschriftung darunter, Fokusring weiß auf der Nacht. */
const ROUND =
  "group/aktion grid w-17 justify-items-center gap-2 rounded-2xl text-center text-xs font-medium text-white/90 outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-4 focus-visible:ring-offset-(--finance-night)";

/**
 * Ab drei Aktionen am Handy: Jede ist so breit wie ihr Wort (mindestens der Kreis), den Rest der Kopfbreite teilen sie sich
 * (Lücke 0,25 rem). So passen alle vier ohne Überstand hinein; erst wenn es nicht reicht (bei 320 px), trennt der Browser die
 * langen Wörter („Beitrags-lauf“, `hyphens-auto`, die Seite ist `lang="de"`). Ist der Kopf schmaler als 20 rem (Handy mit
 * 320 px), sind die Kreise 3 statt 3,5 rem groß und die Wörter 12 px – so reicht der Platz auch dort ohne Trennung. Breiter
 * bleibt es bei der festen Breite `w-17`.
 */
const FILL =
  "max-sm:w-auto max-sm:min-w-0 max-sm:flex-auto max-sm:hyphens-auto @max-xs/finanzkopf:text-[0.75rem]";

function Circle({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-14 place-items-center rounded-full bg-linear-150 text-white shadow-lg inset-ring inset-ring-white/20 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/aktion:-translate-y-0.5 group-active/aktion:scale-95 motion-reduce:transition-none @max-xs/finanzkopf:size-12 [&_svg]:size-6 [&_svg]:stroke-[1.75]",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Schnellaktionen wie in einer Banking-App: runde Symbolknöpfe mit Beschriftung im Kopf der Übersicht. Nur mit „Finanzen
 * bearbeiten“, und jede nur, wo ihr Ziel auch geht: „Buchung“ öffnet das bestehende Fenster „Neue Buchung“ (nur mit
 * eingerichtetem Kassenbuch), „Rechnung“ führt zum Hochladen auf der Seite „Rechnungen“ (dazu das Recht „Dokumente
 * hochladen“), „Beitragslauf“ und „Spende“ zu ihren Seiten (beide brauchen das Kassenbuch). Wer nur ansehen darf, bekommt
 * „Kassenbuch“.
 */
export function QuickActions({
  entryOptions,
  canManage,
  canUploadInvoice,
  ledgerReady,
  className,
}: {
  /** Auswahllisten für „Neue Buchung“ (`null` ohne Recht oder ohne Kassenbuch). */
  entryOptions: EntryFormOptions | null;
  canManage: boolean;
  canUploadInvoice: boolean;
  ledgerReady: boolean;
  className?: string;
}) {
  if (!canManage) {
    return (
      <nav aria-label="Schnellaktionen" className={cn("flex gap-2", className)}>
        <Link href="/finanzen/kassenbuch" className={ROUND}>
          <Circle tone="glass">
            <BookOpenIcon />
          </Circle>
          Kassenbuch
        </Link>
      </nav>
    );
  }
  const count = (entryOptions ? 1 : 0) + (canUploadInvoice ? 1 : 0) + (ledgerReady ? 2 : 0);
  if (count === 0) return null;
  const item = cn(ROUND, count >= 3 && FILL);
  return (
    <nav
      aria-label="Schnellaktionen"
      className={cn("flex gap-2", count >= 3 && "max-sm:gap-1", className)}
    >
      {entryOptions && (
        <EntryDialog
          options={entryOptions}
          trigger={
            <button type="button" className={item}>
              <Circle tone="blue">
                <PlusIcon />
              </Circle>
              <span>
                Buchung<span className="sr-only"> erfassen</span>
              </span>
            </button>
          }
        />
      )}
      {canUploadInvoice && (
        <Link href="/finanzen/rechnungen" className={item}>
          <Circle tone="orange">
            <FilePlusIcon />
          </Circle>
          <span>
            Rechnung<span className="sr-only"> hochladen</span>
          </span>
        </Link>
      )}
      {ledgerReady && (
        <>
          <Link href="/finanzen/beitraege/lauf" className={item}>
            <Circle tone="emerald">
              <CalendarSyncIcon />
            </Circle>
            Beitragslauf
          </Link>
          <Link href="/finanzen/spenden" className={item}>
            <Circle tone="violet">
              <HandHeartIcon />
            </Circle>
            <span>
              Spende<span className="sr-only"> erfassen</span>
            </span>
          </Link>
        </>
      )}
    </nav>
  );
}
