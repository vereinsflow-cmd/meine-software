import Link from "next/link";
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  BuildingIcon,
  CarIcon,
  CoffeeIcon,
  DumbbellIcon,
  FlagIcon,
  GraduationCapIcon,
  HandHeartIcon,
  KeyRoundIcon,
  LandmarkIcon,
  MailIcon,
  MegaphoneIcon,
  PartyPopperIcon,
  PercentIcon,
  ScaleIcon,
  ShieldCheckIcon,
  TrophyIcon,
  Undo2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { ACCENT, type Accent } from "@/components/shared/accent";
import { formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { departmentImage } from "@/modules/departments/department-image";
import { dayHeading } from "../balance-curve";
import type { LedgerEntryDto } from "../ledger";

/**
 * Symbol und Farbe je Kategorie – erkannt am Namen der Kategorie (die Standardkategorien aus `default-categories.ts`; eigene
 * Kategorien bekommen den Pfeil „rein“ bzw. „raus“). Reine Orientierung, der Name steht daneben.
 */
const CATEGORY_ICON: readonly (readonly [RegExp, React.ElementType, Accent])[] = [
  [/beitr[aä]g|mitglied/i, UsersIcon, "blue"],
  [/aufnahme/i, UserPlusIcon, "blue"],
  [/spende/i, HandHeartIcon, "violet"],
  [/zusch[uü]/i, LandmarkIcon, "teal"],
  [/zins/i, PercentIcon, "teal"],
  [/vermiet/i, KeyRoundIcon, "teal"],
  [/sponsor|werbung/i, MegaphoneIcon, "cyan"],
  [/speise|getr[aä]nk|kiosk/i, CoffeeIcon, "amber"],
  [/startgeld|kurs|turnier/i, TrophyIcon, "amber"],
  [/halle|platz|miete/i, BuildingIcon, "slate"],
  [/[üu]bungsleit|trainer/i, GraduationCapIcon, "emerald"],
  [/sportmaterial|ausr[üu]st|material/i, DumbbellIcon, "emerald"],
  [/verband/i, FlagIcon, "slate"],
  [/versicher/i, ShieldCheckIcon, "slate"],
  [/bank/i, LandmarkIcon, "slate"],
  [/b[üu]ro|porto/i, MailIcon, "slate"],
  [/fahrt|reise/i, CarIcon, "slate"],
  [/fest|feier/i, PartyPopperIcon, "rose"],
  [/kassendifferenz/i, ScaleIcon, "slate"],
];

function entryLook(entry: LedgerEntryDto): { icon: React.ElementType; accent: Accent } {
  if (entry.kind === "TRANSFER") return { icon: ArrowLeftRightIcon, accent: "slate" };
  if (entry.kind === "REVERSAL") return { icon: Undo2Icon, accent: "slate" };
  if (entry.kind === "OPENING") return { icon: FlagIcon, accent: "slate" };
  const category = entry.lines[0]?.categoryName ?? "";
  for (const [pattern, icon, accent] of CATEGORY_ICON) {
    if (pattern.test(category)) return { icon, accent };
  }
  return entry.amountCents >= 0
    ? { icon: ArrowDownLeftIcon, accent: "emerald" }
    : { icon: ArrowUpRightIcon, accent: "rose" };
}

const KIND_LABEL: Partial<Record<LedgerEntryDto["kind"], string>> = {
  TRANSFER: "Umbuchung",
  REVERSAL: "Storno",
  OPENING: "Anfangsbestand",
};

/**
 * „Zuletzt gebucht“ wie der Umsatzverlauf einer Banking-App: nach Tagen gruppiert („Heute“, „Gestern“, „Mo., 5. Oktober“),
 * links das Symbol der Kategorie – bzw. das runde Foto der Abteilung, wenn die Buchung einer Abteilung mit Foto zugeordnet
 * ist –, rechts der Betrag (rein grün mit „+“, raus rot mit „−“, Umbuchungen und Anfangsbestände neutral; „Einnahme“ bzw.
 * „Ausgabe“ für Screenreader). „Beleg fehlt“ und „storniert“ als kleine Schilder. Jede Zeile öffnet das Kassenbuch mit der
 * Buchungsnummer als Suche.
 */
export function RecentEntries({
  entries,
  today,
}: {
  entries: readonly LedgerEntryDto[];
  today: Date;
}) {
  const groups: { heading: string; entries: LedgerEntryDto[] }[] = [];
  for (const entry of entries) {
    const heading = dayHeading(entry.bookingDate, today);
    const group = groups.at(-1);
    if (group?.heading === heading) group.entries.push(entry);
    else groups.push({ heading, entries: [entry] });
  }
  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Je Tag eine Gruppe (keine Landmarke – sonst stünde jeder Tag in der Landmarken-Liste des Screenreaders), benannt
          über ihre Überschrift. Es gibt nur eine solche Liste je Seite, die Nummer genügt als Kennung. */}
      {groups.map((group, index) => (
        <div
          key={group.heading}
          role="group"
          aria-labelledby={`zuletzt-tag-${index}`}
          className="grid grid-cols-1 gap-1"
        >
          <h3
            id={`zuletzt-tag-${index}`}
            className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {group.heading}
          </h3>
          <ul className="grid grid-cols-1">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <EntryRow entry={entry} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EntryRow({ entry }: { entry: LedgerEntryDto }) {
  const { icon: Icon, accent } = entryLook(entry);
  const department = entry.lines.find((line) => line.department)?.department ?? null;
  const photo = department && entry.kind === "STANDARD" ? departmentImage(department.name) : null;
  const title = entry.counterpartyMember?.name ?? entry.counterpartyName ?? entry.description;
  const category =
    KIND_LABEL[entry.kind] ??
    (entry.lines.length > 1 ? "Aufgeteilt" : (entry.lines[0]?.categoryName ?? ""));
  const meta = [
    title !== entry.description ? entry.description : null,
    category,
    department?.name,
    entry.account.name,
  ].filter(Boolean);
  const neutral = entry.kind === "TRANSFER" || entry.kind === "OPENING";
  const positive = entry.amountCents > 0;
  const sign = entry.amountCents === 0 ? "" : positive ? "+" : "−";

  return (
    <Link
      href={`/finanzen/kassenbuch?q=${encodeURIComponent(entry.label)}`}
      className="flex items-center gap-3.5 rounded-2xl px-2 py-2.5 transition-colors outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
    >
      <span aria-hidden="true" className="relative shrink-0">
        {photo ? (
          <span className="relative block size-11 overflow-hidden rounded-full shadow-sm ring-2 ring-background">
            {/* eslint-disable-next-line @next/next/no-img-element -- kleinste WebP-Größe aus public/ */}
            <img
              src={photo.srcSet.split(", ")[0]!.split(" ")[0]}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
              style={{ objectPosition: photo.position }}
            />
          </span>
        ) : (
          <span
            className={cn(
              "grid size-11 place-items-center rounded-full [&_svg]:size-5",
              ACCENT[accent].tile,
            )}
          >
            <Icon strokeWidth={1.75} />
          </span>
        )}
        {photo && (
          <span
            className={cn(
              "absolute -right-1 -bottom-1 grid size-5.5 place-items-center rounded-full ring-2 ring-card [&_svg]:size-3",
              ACCENT[accent].tile,
            )}
          >
            <Icon strokeWidth={2} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="line-clamp-2 min-w-0 font-semibold break-words hyphens-auto sm:line-clamp-1">
            {title}
          </span>
          {entry.needsReceipt && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-px text-xs font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
              Beleg fehlt
            </span>
          )}
          {entry.reversedBy && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-px text-xs font-semibold text-muted-foreground">
              storniert
            </span>
          )}
        </span>
        <span className="block truncate text-sm text-muted-foreground">{meta.join(" · ")}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-right font-semibold tabular-nums",
          neutral
            ? "text-foreground"
            : positive
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-700 dark:text-red-400",
          entry.reversedBy && "line-through decoration-1",
        )}
      >
        {!neutral && entry.amountCents !== 0 && (
          <span className="sr-only">{positive ? "Einnahme " : "Ausgabe "}</span>
        )}
        {sign}
        {formatEuroFromCents(Math.abs(entry.amountCents))}
      </span>
    </Link>
  );
}
