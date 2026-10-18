"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsRightIcon,
  BriefcaseIcon,
  HouseIcon,
  MessagesSquareIcon,
  WrenchIcon,
} from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "./nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * Schmale Symbolleiste (seit 17.10.2026, nach der Vorlage „Analytics“, die Ben schickte: „mach die sidebar links genau so“; seit
 * 18.10.2026 im Aussehen der Vorlage „Vertix“: helle, schwebende Pillen statt einer dunklen Leiste). Statt aller 17 Menüpunkte steht je Gruppe ein Symbol (Ben wählte „Gruppen + Ausklapp-Menü“): Dashboard führt direkt
 * hin, Verein, Organisation, Kommunikation und Einstellungen öffnen rechts daneben ein kleines Menü mit ihren Seiten. Unten das
 * Kürzel der angemeldeten Person – es öffnet „Persönlich“ (Profil, Datenschutz, Hilfe & Support) – und der Knopf, der die
 * breite Seitenleiste mit Text ausklappt.
 *
 * Die aktuelle Seite (bzw. ihre Gruppe) trägt einen gefüllten, dunklen Kreis (im Dunkeln hell) – wie der gewählte Punkt der
 * Vorlage. Zähler (offene Aufgaben, Ungelesenes) stehen als blauer Kreis an der Gruppe und im Menü an der Seite. Oben über den
 * Gruppen Hell/Dunkel (`ThemeToggle`).
 */

/**
 * Symbol je Gruppe (die Seiten darin behalten ihre eigenen Symbole im Menü). Bewusst keine Symbole der Bereiche selbst
 * (`AREA_ICON`) – sonst sähe „Verein“ aus wie „Mitglieder“ und „Einstellungen“ wie „Vereinseinstellungen“.
 */
const GROUP_ICON: Record<string, React.ReactNode> = {
  Verein: <HouseIcon className="size-5" />,
  Organisation: <BriefcaseIcon className="size-5" />,
  Kommunikation: <MessagesSquareIcon className="size-5" />,
  Einstellungen: <WrenchIcon className="size-5" />,
};

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const count = (items: readonly NavItem[]) =>
  items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

/** Kleiner blauer Zähler oben rechts an einem Symbol. */
function RailBadge({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -top-0.5 -right-0.5 z-10 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground ring-2 ring-card"
    >
      {value > 9 ? "9+" : value}
    </span>
  );
}

/** Hülle eines Symbols: mittig in der Pille der Leiste. */
function RailSlot({ children }: { active?: boolean; children: React.ReactNode }) {
  return <div className="relative flex w-full justify-center">{children}</div>;
}

/** Aussehen eines Symbol-Knopfs bzw. -Links in der Leiste. */
function railButton(active: boolean) {
  return cn(
    "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-safe:active:scale-95 motion-reduce:transition-none [&_svg]:size-[1.125rem]",
    active
      ? "bg-foreground text-background"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

/** Ein Menüpunkt direkt in der Leiste (z. B. Dashboard) – mit Hinweis statt sichtbarem Text. */
function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <RailSlot active={active}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={item.badge ? `${item.label} (${item.badge})` : item.label}
            className={railButton(active)}
          >
            {item.icon}
            <RailBadge value={item.badge ?? 0} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </RailSlot>
  );
}

/** Eine Seite im Ausklapp-Menü einer Gruppe: Symbol, Name, Zähler; die aktuelle Seite gefüllt. */
function MenuLink({
  item,
  active,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  // „Hilfe & Support“ merkt sich die Seite, von der man kam (wie in der breiten Seitenleiste).
  const target =
    item.href === "/hilfe" && !active ? `/hilfe?von=${encodeURIComponent(pathname)}` : item.href;
  return (
    <Link
      href={target}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        // Abstand zwischen Fokusrahmen und Fläche – sonst verschwände der Rahmen an der blau gefüllten aktuellen Seite.
        "flex items-center gap-3 rounded-xl px-3 py-2 text-base font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover motion-reduce:transition-none",
        active
          ? "bg-primary font-semibold text-primary-foreground"
          : "text-foreground/90 hover:bg-muted hover:text-foreground",
      )}
    >
      <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {!!item.badge && (
        <span
          aria-hidden="true"
          className={cn(
            "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 text-xs leading-none font-semibold",
            active
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      {!!item.badge && <span className="sr-only">({item.badge})</span>}
    </Link>
  );
}

/**
 * Gruppe als Symbol mit Ausklapp-Menü rechts daneben (Klick, Enter oder Leertaste; Escape schließt). Enthält die Gruppe die
 * aktuelle Seite, ist ihr Symbol gefüllt. Das Menü steht im Code innerhalb der
 * Navigation (ohne Portal) – seine Links gehören so für Screenreader zur „Hauptnavigation“. Es liegt `fixed` über der Seite und
 * wird deshalb vom Rand der Leiste nicht abgeschnitten. Der Name des Knopfs ist genau der Name der Gruppe; Zähler und „enthält
 * die aktuelle Seite“ stehen in der Beschreibung (wie in der breiten Seitenleiste).
 */
function RailGroup({
  label,
  name,
  icon,
  items,
  pathname,
  trigger,
}: {
  label: string;
  /** Name des Knopfs, wenn er nicht nur der Name der Gruppe sein soll (z. B. „Persönlich (BA)“ – das Kürzel steht sichtbar darauf). */
  name?: string;
  icon: React.ReactNode;
  items: NavItem[];
  pathname: string;
  /** Eigener Inhalt des Knopfs (z. B. das Kürzel der Person) statt des Symbols. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const describedId = useId();
  // Auch ein Seitenwechsel ohne Klick ins Menü (Zurück im Browser, Link auf der Seite) schließt es – angepasst während des
  // Renderns statt in einem Effekt (wie in `SidebarNav`).
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (open) setOpen(false);
  }
  const active = items.some((item) => isActive(item.href, pathname));
  const pending = count(items);
  const description = [
    pending > 0 ? `${pending} offen` : null,
    active ? "enthält die aktuelle Seite" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <RailSlot active={active}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={name ?? label}
            aria-describedby={description ? describedId : undefined}
            className={cn(railButton(active), open && !active && "bg-muted text-foreground")}
          >
            {trigger ?? icon}
            <RailBadge value={pending} />
          </button>
        </PopoverPrimitive.Trigger>
        {description && (
          <span id={describedId} className="sr-only">
            {description}
          </span>
        )}
        <PopoverPrimitive.Content
          side="right"
          align="start"
          // Vom Knopf (mittig in der 6,5 rem breiten Leiste) bis knapp hinter den Rand der Leiste
          sideOffset={40}
          collisionPadding={12}
          aria-label={label}
          // Der Fokus springt auf die aktuelle Seite bzw. den ersten Eintrag (statt auf die unsichtbare Fläche des Menüs).
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const box = event.currentTarget as HTMLElement;
            (
              box.querySelector<HTMLElement>('a[aria-current="page"]') ??
              box.querySelector<HTMLElement>("a")
            )?.focus();
          }}
          className="z-50 grid w-64 gap-0.5 rounded-2xl bg-popover p-2 text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-hidden"
        >
          <p
            aria-hidden="true"
            className="px-3 pt-1.5 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            {label}
          </p>
          {items.map((item) => (
            <MenuLink
              key={item.href}
              item={item}
              active={isActive(item.href, pathname)}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Root>
    </RailSlot>
  );
}

/** Kürzel aus dem Namen („Ben Admin“ → „BA“). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]!, parts.at(-1)!] : parts.slice(0, 1);
  return letters.map((part) => Array.from(part)[0]?.toUpperCase() ?? "").join("") || "?";
}

export function NavRail({
  groups,
  userName,
  onExpand,
}: {
  groups: NavGroup[];
  /** Name der angemeldeten Person – ihr Kürzel öffnet „Persönlich“. */
  userName: string;
  onExpand: () => void;
}) {
  const pathname = usePathname();
  // Letzte Gruppe ohne Einklappen = „Persönlich“ (Profil, Datenschutz, Hilfe) → unten am Kürzel der Person.
  const last = groups.at(-1);
  const personal = last && last.label && !last.collapsible ? last : null;
  const main = personal ? groups.slice(0, -1) : groups;

  return (
    // Eine Navigation für alles – auch „Persönlich“ unten am Kürzel gehört dazu.
    <nav aria-label="Hauptnavigation" className="flex min-h-0 flex-1 flex-col items-stretch">
      {/* Auf sehr niedrigen Fenstern scrollen nur die Gruppen – Kürzel und Ausklappen bleiben unten erreichbar (die überstehende
          Fläche wird dann am Rand abgeschnitten; die Menüs liegen `fixed` darüber und nicht). */}
      <ThemeToggle className="mx-auto mt-4 shrink-0" />
      <div className="mx-auto mt-4 flex w-13 flex-col gap-1.5 rounded-full bg-card p-1.5 shadow-xs [@media(max-height:35em)]:min-h-0 [@media(max-height:35em)]:overflow-x-hidden [@media(max-height:35em)]:overflow-y-auto">
        {main.flatMap((group, index) =>
          group.collapsible && group.label
            ? [
                <RailGroup
                  key={group.label}
                  label={group.label}
                  icon={GROUP_ICON[group.label] ?? group.items[0]?.icon}
                  items={group.items}
                  pathname={pathname}
                />,
              ]
            : group.items.map((item) => (
                <RailLink
                  key={`${index}-${item.href}`}
                  item={item}
                  active={isActive(item.href, pathname)}
                />
              )),
        )}
      </div>
      <div className="mx-auto mt-auto mb-5 flex w-13 shrink-0 flex-col items-stretch gap-1.5 rounded-full bg-card p-1.5 shadow-xs">
        {personal && personal.label && (
          <RailGroup
            label={personal.label}
            name={`${personal.label} (${initialsOf(userName)})`}
            icon={null}
            items={personal.items}
            pathname={pathname}
            trigger={<span className="text-xs font-bold">{initialsOf(userName)}</span>}
          />
        )}
        <div className="flex justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-sidebar-toggle=""
                onClick={onExpand}
                aria-label="Seitenleiste ausklappen"
                className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <ChevronsRightIcon className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Seitenleiste ausklappen</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </nav>
  );
}
