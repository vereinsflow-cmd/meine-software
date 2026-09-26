import { AREA_ICON, type Area } from "@/components/shared/area-icons";
import type { PermissionKey } from "@/server/permissions/catalog";
import type { PermissionHolder } from "@/server/permissions/policy";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Kleiner Zähler am Zeilenende, z. B. offene Aufgaben oder ungelesene Benachrichtigungen. */
  badge?: number;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
  /** Einklappbares Untermenü (Akkordeon); ohne Angabe ist die Gruppe immer sichtbar. */
  collapsible?: boolean;
}

interface NavDefinition {
  href: string;
  /** Heißt wie die Seite selbst (Titel oben auf der Seite) und wie ihr Eintrag in der Suche (`lib/search/registry.ts`). */
  label: string;
  /** Bereich, dessen Symbol der Menüpunkt trägt – dasselbe wie in der Suche und auf dem Dashboard (`area-icons.ts`). */
  area: Area;
  /** Sichtbar, wenn die Rolle diese Berechtigung besitzt … */
  permission?: PermissionKey;
  /** … und zwar mindestens in dieser Reichweite (OWN-Reichweite sieht nur den eigenen Datensatz → kein Menüpunkt). */
  notOwnOnly?: boolean;
}

/** Alle Menüsymbole in derselben Größe (20 px) und Strichstärke. */
function areaIcon(area: Area): React.ReactNode {
  const Icon = AREA_ICON[area];
  return <Icon className="size-5 shrink-0" />;
}

const dashboard: NavDefinition[] = [{ href: "/dashboard", label: "Dashboard", area: "dashboard" }];

const verein: NavDefinition[] = [
  {
    href: "/mitglieder",
    label: "Mitglieder",
    area: "mitglieder",
    permission: "members:read",
    notOwnOnly: true,
  },
  {
    href: "/kalender",
    label: "Kalender",
    area: "kalender",
    permission: "events:read",
  },
  {
    href: "/veranstaltungen",
    label: "Veranstaltungen",
    area: "veranstaltungen",
    permission: "events:read",
  },
  {
    href: "/helferplanung",
    label: "Helferplanung",
    area: "helferplanung",
    permission: "shifts:read",
  },
  {
    href: "/abteilungen",
    label: "Abteilungen",
    area: "abteilungen",
    permission: "departments:read",
  },
];

const organisation: NavDefinition[] = [
  {
    href: "/aufgaben",
    label: "Aufgaben",
    area: "aufgaben",
    permission: "tasks:read",
  },
  {
    href: "/dokumente",
    label: "Dokumente",
    area: "dokumente",
    permission: "documents:read",
  },
];

const kommunikation: NavDefinition[] = [
  {
    href: "/nachrichten",
    label: "Nachrichten",
    area: "nachrichten",
    permission: "messages:read",
  },
  { href: "/benachrichtigungen", label: "Benachrichtigungen", area: "benachrichtigungen" },
];

const einstellungen: NavDefinition[] = [
  {
    href: "/benutzer",
    label: "Benutzer und Rollen",
    area: "benutzer",
    permission: "users:read",
  },
  {
    href: "/einstellungen",
    label: "Vereinseinstellungen",
    area: "einstellungen",
    permission: "club:update",
  },
  {
    href: "/finanzen",
    label: "Finanzen",
    area: "finanzen",
    permission: "club:update",
  },
  {
    href: "/protokoll",
    label: "Änderungsprotokoll",
    area: "protokoll",
    permission: "audit:read",
  },
];

const personal: NavDefinition[] = [
  { href: "/profil", label: "Mein Profil", area: "profil" },
  { href: "/datenschutz", label: "Datenschutz", area: "datenschutz" },
  { href: "/hilfe", label: "Hilfe & Support", area: "hilfe" },
];

function visible(definitions: NavDefinition[], holder: PermissionHolder): NavItem[] {
  return definitions
    .filter((definition) => {
      if (!definition.permission) return true;
      const scope = holder.permissions.get(definition.permission);
      if (!scope) return false;
      return !(definition.notOwnOnly && scope === "OWN");
    })
    .map(({ href, label, area }) => ({ href, label, icon: areaIcon(area) }));
}

function withBadge(items: NavItem[], href: string, count: number | undefined): NavItem[] {
  if (!count) return items;
  return items.map((item) => (item.href === href ? { ...item, badge: count } : item));
}

/** Zähler für die kleinen Badges an Menüpunkten. */
export interface NavBadges {
  /** Meine offenen Aufgaben → Badge am Menüpunkt „Aufgaben“. */
  tasks?: number;
  /** Ungelesene Benachrichtigungen → Badge am Menüpunkt „Benachrichtigungen“. */
  notifications?: number;
}

/** Menüpunkte, die für die Rolle des Benutzers sichtbar sind (die Seiten prüfen die Rechte zusätzlich selbst). */
export function getNavigation(
  holder: PermissionHolder,
  options: { isPlatformAdmin: boolean; badges?: NavBadges },
): NavGroup[] {
  const groups: NavGroup[] = [{ items: visible(dashboard, holder) }];

  const vereinItems = visible(verein, holder);
  if (vereinItems.length > 0) {
    groups.push({ label: "Verein", items: vereinItems, collapsible: true });
  }

  const organisationItems = withBadge(
    visible(organisation, holder),
    "/aufgaben",
    options.badges?.tasks,
  );
  if (organisationItems.length > 0) {
    groups.push({ label: "Organisation", items: organisationItems, collapsible: true });
  }

  const kommunikationItems = withBadge(
    visible(kommunikation, holder),
    "/benachrichtigungen",
    options.badges?.notifications,
  );
  if (kommunikationItems.length > 0) {
    groups.push({ label: "Kommunikation", items: kommunikationItems, collapsible: true });
  }

  const einstellungenItems = visible(einstellungen, holder);
  if (einstellungenItems.length > 0) {
    groups.push({ label: "Einstellungen", items: einstellungenItems, collapsible: true });
  }

  const personalItems = visible(personal, holder);
  if (options.isPlatformAdmin) {
    personalItems.unshift({
      href: "/system",
      label: "Systemadministration",
      icon: areaIcon("system"),
    });
  }
  groups.push({ label: "Persönlich", items: personalItems });
  return groups;
}
