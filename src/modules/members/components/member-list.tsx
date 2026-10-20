import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { formatCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { groupByLetter, safeColor, splitLastCharacter } from "../display";
import type { MemberListItem, MemberSortField } from "../types";
import { KeepSelectedVisible } from "./keep-selected-visible";
import { MemberAvatar, MemberStatusDot } from "./member-avatar";

/**
 * Schmale Namensliste links neben dem Detailbereich (Mitgliederseite, seit 20.10.2026 – Entwurf „Liste mit Detailbereich“):
 * Initialen in Abteilungsfarbe, Vorname und fetter Nachname, darunter die Abteilungen, rechts der Status. Nach Namen sortiert
 * stehen klebende Buchstaben-Trenner dazwischen; bei den anderen Sortierungen zeigt die zweite Zeile vorn den Wert, nach dem
 * sortiert ist (Nummer bzw. Eintritt).
 *
 * Jede Zeile hat zwei Namenslinks, je nach Bildschirm ist genau einer da (der andere `display: none`, also weder sichtbar noch
 * per Tab oder Screenreader erreichbar): am Computer `?id=…` – das Mitglied erscheint rechts im Detail –, am Handy (unter
 * `lg`) gleich die Seite des Mitglieds. Beides ohne Skript. Der sichtbare Link legt eine unsichtbare Fläche über die ganze
 * Zeile (`after:`), so ist die ganze Zeile antippbar.
 */
export function MemberList({
  id,
  items,
  sort,
  selectedId,
  selectHref,
  profileHref,
  colorOf,
}: {
  /** `id` der rollenden Liste (für `KeepSelectedVisible`). */
  id: string;
  items: MemberListItem[];
  sort: MemberSortField;
  selectedId: string | null;
  /** Link, der dieses Mitglied im Detailbereich zeigt (mit den übrigen Parametern der Seite). */
  selectHref: (memberId: string) => string;
  /** Seite des Mitglieds (am Handy), mit der Adresse der Liste als Rückweg. */
  profileHref: (memberId: string) => string;
  colorOf: ReadonlyMap<string, string | null>;
}) {
  const groups = sort === "name" ? groupByLetter(items) : [{ letter: null, items }];
  return (
    <div
      id={id}
      className="relative px-2 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
    >
      {groups.map(({ letter, items: members }, index) => {
        // Nach der Nummer des Abschnitts, nicht nach dem Buchstaben: Je nach Sortierfolge der Datenbank kann ein Buchstabe
        // zweimal vorkommen (etwa „Ärger“ oder „von …“ hinter dem Z) – die IDs blieben sonst nicht eindeutig.
        const headingId = letter ? `mitglieder-buchstabe-${index}` : null;
        const rows = (
          // Eine Spalte, die schmaler als der längste Name werden darf (sonst schöbe er den Status aus der Karte).
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                sort={sort}
                selected={member.id === selectedId}
                selectHref={selectHref(member.id)}
                profileHref={profileHref(member.id)}
                color={safeColor(colorOf.get(member.departments[0]?.id ?? ""))}
              />
            ))}
          </ul>
        );
        return headingId ? (
          <div key={headingId} role="group" aria-labelledby={headingId}>
            {/* Klebender Buchstabe: oben in der rollenden Liste (Computer) bzw. unter der Kopfzeile (Handy). */}
            <h3
              id={headingId}
              className="sticky top-(--app-header-height) z-10 bg-card/95 px-3 pt-2.5 pb-1 text-xs font-semibold text-muted-foreground backdrop-blur-sm lg:top-0"
            >
              {letter}
            </h3>
            {rows}
          </div>
        ) : (
          <div key="alle" className="pt-1">
            {rows}
          </div>
        );
      })}
      {selectedId && <KeepSelectedVisible listId={id} selectedId={selectedId} />}
    </div>
  );
}

/**
 * Gemeinsame Klassen beider Namenslinks: Lange Namen brechen in eine zweite Zeile um (erst danach „…“) – am Handy gibt es
 * keinen Detailbereich, der sie ganz zeigte. Die Fläche `after:` deckt die ganze Zeile (`li` ist `relative`).
 */
const NAME_LINK = "min-w-0 line-clamp-2 break-words after:absolute after:inset-0 after:rounded-xl";

function MemberRow({
  member,
  sort,
  selected,
  selectHref,
  profileHref,
  color,
}: {
  member: MemberListItem;
  sort: MemberSortField;
  selected: boolean;
  selectHref: string;
  profileHref: string;
  color: string | null;
}) {
  // Das Schlüssel-Symbol (Benutzerkonto, wie im Detailbereich) läuft im Text mit – bei zwei Zeilen steht es hinter dem
  // Nachnamen. Mit dessen letztem Buchstaben untrennbar verbunden, rutscht es nie allein in die nächste Zeile.
  const { head, tail } = splitLastCharacter(member.lastName);
  const name = (
    <>
      {member.firstName}{" "}
      <span className="font-semibold">
        {member.hasAccount ? (
          <>
            {head}
            <span className="whitespace-nowrap">
              {tail}
              <KeyRoundIcon
                aria-hidden="true"
                className="ml-1.5 inline size-3.5 align-[-0.125em] text-muted-foreground"
              />
            </span>
          </>
        ) : (
          member.lastName
        )}
      </span>
    </>
  );
  const departments =
    member.departments.length === 0
      ? "Keine Abteilung"
      : member.departments.map((d) => d.name).join(", ");
  const sortValue =
    sort === "memberNumber"
      ? `Nr. ${member.memberNumber ?? "–"}`
      : sort === "joinedAt"
        ? `Eintritt ${formatCalendarDate(member.joinedAt)}`
        : null;

  return (
    <li
      data-member={member.id}
      className={cn(
        // Fokus per Tastatur färbt die ganze Zeile (der Fokusrahmen selbst liegt am Namen, wie bei allen Links).
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted has-[a:focus-visible]:bg-muted",
        selected &&
          "lg:bg-primary/[0.08] lg:ring-1 lg:ring-primary/20 lg:ring-inset lg:hover:bg-primary/[0.11] lg:has-[a:focus-visible]:bg-primary/[0.11] dark:lg:bg-primary/[0.13] dark:lg:ring-primary/25",
      )}
    >
      <MemberAvatar firstName={member.firstName} lastName={member.lastName} color={color} />
      <div className="min-w-0 flex-1">
        <p className="min-w-0">
          {/* Ohne Vorabladen: Die Auswahl bleibt auf derselben Seite (das Ladegerüst erscheint dabei nicht), vorab geladene
              Hüllen für jede sichtbare Zeile wären nur Last. Die Seite rollt nicht nach oben. */}
          <Link
            href={selectHref}
            prefetch={false}
            scroll={false}
            aria-current={selected ? "true" : undefined}
            className={cn(NAME_LINK, "max-lg:hidden")}
          >
            {name}
          </Link>
          <Link href={profileHref} className={cn(NAME_LINK, "lg:hidden")}>
            {name}
          </Link>
          {member.hasAccount && <span className="sr-only">, Benutzerkonto</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {sortValue && <span className="tabular-nums">{sortValue} · </span>}
          {departments}
        </p>
      </div>
      <MemberStatusDot status={member.status} className="shrink-0 text-xs text-muted-foreground" />
    </li>
  );
}
