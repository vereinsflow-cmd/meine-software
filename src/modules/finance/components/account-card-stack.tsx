import Link from "next/link";
import { NfcIcon } from "lucide-react";
import { formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { CARD_SCRIM_STOPS, stackOrder, type AccountCard, type CardTint } from "../account-cards";
import { FINANCE_NIGHT } from "../hero-look";
import type { FinanceAccountDto } from "../ledger";
import { ACCOUNT_KIND_LABEL } from "../ledger-format";

/**
 * Spalte „Konten“ der Übersicht (auch im Ladegerüst): unter 1280 px – dort steht sie unter dem Kopf – höchstens 28 rem breit
 * und mittig. So behalten die Karten auch am Tablet Kartengröße, statt mit ihrem Seitenverhältnis die ganze Breite (und fast
 * die halbe Fensterhöhe) einzunehmen.
 */
export const ACCOUNTS_COLUMN = "w-full max-w-md justify-self-center xl:max-w-none";

/** So viel bleibt von jeder hinteren Karte im Stapel sichtbar: Name und Stand. */
const PEEK = "4.75rem";

/** Tönung je Konto über dem Foto (bzw. über der Nacht, wenn es keines gibt); darüber die Abdeckung `SCRIM`. */
const TINT: Record<CardTint, string> = {
  blue: "from-blue-600/80 via-blue-700/40 to-blue-950/85",
  emerald: "from-emerald-600/80 via-emerald-700/40 to-emerald-950/85",
  violet: "from-violet-600/80 via-violet-700/40 to-violet-950/85",
  teal: "from-teal-600/80 via-teal-700/40 to-teal-950/85",
};

/** Dunkle Abdeckung über Foto und Tönung (`CARD_SCRIM_STOPS`), damit weiße Schrift überall reicht. */
const SCRIM = `linear-gradient(to bottom, ${CARD_SCRIM_STOPS.map(([at, alpha]) => `rgb(0 0 0 / ${alpha}) ${at}%`).join(", ")})`;

/** Kartenchip (Gold) – reine Zierde. */
function Chip({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 44 34" className="h-8 w-auto drop-shadow-sm" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f6e3a1" />
          <stop offset="45%" stopColor="#d4b05a" />
          <stop offset="100%" stopColor="#a8822f" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="43" height="33" rx="6" fill={`url(#${id})`} />
      <g fill="none" stroke="#8a6a24" strokeOpacity="0.7" strokeWidth="1">
        <path d="M15 0.5v33M29 0.5v33M0.5 12h15M0.5 22h15M29 12h14.5M29 22h14.5" />
        <rect x="15" y="9" width="14" height="16" rx="3" />
      </g>
    </svg>
  );
}

/** Zweite Zeile einer Karte: die Bank – sonst die Art des Kontos, wenn sie nicht schon der Name ist („Barkasse“). */
function accountDetail(account: FinanceAccountDto): string | null {
  if (account.bankName) return account.bankName;
  const kind = ACCOUNT_KIND_LABEL[account.kind];
  return kind !== account.name ? kind : null;
}

/**
 * Konten als Bankkarten im Stapel (wie eine Wallet): vorn das Standardkonto mit Kartenchip und Vereinsname, dahinter die
 * anderen – von ihnen bleibt oben je ein Streifen mit Name und Stand sichtbar. Im Hintergrund ein Foto eurer Abteilungen,
 * getönt in der Kontofarbe („Motivkarte“, reine Zierde: Es hat mit dem Konto nichts zu tun; Auswahl fest nach Konto-Reihenfolge,
 * `accountCards`), ohne Fotos nur der Verlauf auf der Nacht. Jede Karte öffnet das Kassenbuch für ihr Konto. Keine erfundenen
 * Kartennummern: Auf der Karte steht nur, was es wirklich gibt (Name, Bank bzw. Art, Stand, Verein).
 */
export function AccountCardStack({
  cards,
  clubName,
}: {
  cards: readonly AccountCard<FinanceAccountDto>[];
  clubName: string;
}) {
  const ordered = stackOrder(cards);
  return (
    <ul className="grid grid-cols-1" aria-label="Konten">
      {ordered.map(({ account, tint, photo }, index) => {
        const front = index === ordered.length - 1;
        const detail = accountDetail(account);
        return (
          <li
            key={account.id}
            className="[grid-area:1/1]"
            style={{ marginTop: `calc(${PEEK} * ${index})` }}
          >
            <Link
              href={`/finanzen/kassenbuch?konto=${account.id}`}
              className={cn(
                "group/karte relative isolate block aspect-[1.586] overflow-hidden rounded-[1.25rem] text-white shadow-[0_18px_40px_-18px_rgb(6_10_22/0.7)] ring-1 ring-black/10 outline-none focus-visible:ring-3 focus-visible:ring-ring dark:ring-white/12",
                "transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                // Hintere Karten heben sich beim Darüberfahren und mit dem Tastaturfokus, damit mehr von ihnen (und vom Fokusrahmen) zu sehen ist.
                front
                  ? "hover:-translate-y-1"
                  : "hover:-translate-y-2 focus-visible:-translate-y-3",
              )}
              style={{ backgroundColor: FINANCE_NIGHT }}
            >
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element -- fertige WebP-Größen aus public/ mit srcset (wie DepartmentCover)
                <img
                  src={photo.src}
                  srcSet={photo.srcSet}
                  sizes="(min-width: 80rem) 28rem, min(28rem, calc(100vw - 2rem))"
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  data-card-photo={photo.sport}
                  className="absolute inset-0 -z-10 size-full object-cover saturate-[0.85] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] select-none group-hover/karte:scale-[1.04] motion-reduce:transition-none"
                  style={{ objectPosition: photo.position }}
                />
              )}
              <span
                aria-hidden="true"
                className={cn("absolute inset-0 -z-10 bg-linear-145", TINT[tint])}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 -z-10"
                style={{ backgroundImage: SCRIM }}
              />
              {/* Glanz oben links und feine Lichtkante – wie eine Metallkarte. */}
              <span
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_0%_0%,rgb(255_255_255/0.18),transparent_55%)]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_0_0_1px_rgb(255_255_255/0.1)]"
              />

              <span className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-5 pt-4">
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold">{account.name}</span>
                  {detail && (
                    <span className="block truncate text-xs font-medium text-white/85">
                      {detail}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xl font-bold tracking-tight tabular-nums",
                    account.balanceCents < 0 && "text-red-100",
                  )}
                >
                  {formatEuroFromCents(account.balanceCents)}
                </span>
              </span>

              {front && (
                <>
                  <span className="absolute inset-x-5 top-[46%] flex -translate-y-1/2 items-center justify-between gap-3">
                    <span aria-hidden="true" className="flex items-center gap-3">
                      <Chip id={`chip-${account.id}`} />
                      <NfcIcon className="size-6 text-white/80" strokeWidth={1.5} />
                    </span>
                    <span className="shrink-0 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-white ring-1 ring-white/25">
                      {account.isDefault ? "Standardkonto" : ACCOUNT_KIND_LABEL[account.kind]}
                    </span>
                  </span>
                  <span className="absolute inset-x-0 bottom-0 px-5 pb-4">
                    <span className="block truncate text-sm font-semibold tracking-[0.12em] text-white/90 uppercase">
                      {clubName}
                    </span>
                  </span>
                </>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
