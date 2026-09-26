import {
  BellIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CalendarIcon,
  FolderOpenIcon,
  HandHeartIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  ListChecksIcon,
  MessageSquareIcon,
  NetworkIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldUserIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
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
  icon: React.ReactNode;
  /** Sichtbar, wenn die Rolle diese Berechtigung besitzt … */
  permission?: PermissionKey;
  /** … und zwar mindestens in dieser Reichweite (OWN-Reichweite sieht nur den eigenen Datensatz → kein Menüpunkt). */
  notOwnOnly?: boolean;
}

const icon = "size-5 shrink-0";

const dashboard: NavDefinition[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboardIcon className={icon} /> },
];

const verein: NavDefinition[] = [
  {
    href: "/mitglieder",
    label: "Mitglieder",
    icon: <UsersIcon className={icon} />,
    permission: "members:read",
    notOwnOnly: true,
  },
  {
    href: "/kalender",
    label: "Kalender",
    icon: <CalendarIcon className={icon} />,
    permission: "events:read",
  },
  {
    href: "/veranstaltungen",
    label: "Veranstaltungen",
    icon: <CalendarDaysIcon className={icon} />,
    permission: "events:read",
  },
  {
    href: "/helferplanung",
    label: "Helferplanung",
    icon: <HandHeartIcon className={icon} />,
    permission: "shifts:read",
  },
  {
    href: "/abteilungen",
    label: "Abteilungen",
    icon: <NetworkIcon className={icon} />,
    permission: "departments:read",
  },
];

const organisation: NavDefinition[] = [
  {
    href: "/aufgaben",
    label: "Aufgaben",
    icon: <ListChecksIcon className={icon} />,
    permission: "tasks:read",
  },
  {
    href: "/dokumente",
    label: "Dokumente",
    icon: <FolderOpenIcon className={icon} />,
    permission: "documents:read",
  },
];

const kommunikation: NavDefinition[] = [
  {
    href: "/nachrichten",
    label: "Nachrichten",
    icon: <MessageSquareIcon className={icon} />,
    permission: "messages:read",
  },
  { href: "/benachrichtigungen", label: "Benachrichtigungen", icon: <BellIcon className={icon} /> },
];

const einstellungen: NavDefinition[] = [
  {
    href: "/benutzer",
    label: "Benutzer und Rollen",
    icon: <ShieldCheckIcon className={icon} />,
    permission: "users:read",
  },
  {
    href: "/einstellungen",
    label: "Vereinseinstellungen",
    icon: <SettingsIcon className={icon} />,
    permission: "club:update",
  },
  {
    href: "/finanzen",
    label: "Finanzen",
    icon: <WalletIcon className={icon} />,
    permission: "club:update",
  },
  {
    href: "/protokoll",
    label: "Änderungsprotokoll",
    icon: <HistoryIcon className={icon} />,
    permission: "audit:read",
  },
];

const personal: NavDefinition[] = [
  { href: "/profil", label: "Mein Profil", icon: <UserRoundIcon className={icon} /> },
  { href: "/datenschutz", label: "Datenschutz", icon: <ShieldUserIcon className={icon} /> },
  { href: "/hilfe", label: "Hilfe & Support", icon: <LifeBuoyIcon className={icon} /> },
];

function visible(definitions: NavDefinition[], holder: PermissionHolder): NavItem[] {
  return definitions
    .filter((definition) => {
      if (!definition.permission) return true;
      const scope = holder.permissions.get(definition.permission);
      if (!scope) return false;
      return !(definition.notOwnOnly && scope === "OWN");
    })
    .map(({ href, label, icon: nodeIcon }) => ({ href, label, icon: nodeIcon }));
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
      icon: <BuildingIcon className={icon} />,
    });
  }
  groups.push({ label: "Persönlich", items: personalItems });
  return groups;
}
