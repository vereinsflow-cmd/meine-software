import {
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
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

interface NavDefinition {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Sichtbar, wenn die Rolle diese Berechtigung besitzt … */
  permission?: PermissionKey;
  /** … und zwar mindestens in dieser Reichweite (OWN-Reichweite sieht nur den eigenen Datensatz → kein Menüpunkt). */
  notOwnOnly?: boolean;
}

const icon = "size-5 shrink-0";

const main: NavDefinition[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboardIcon className={icon} /> },
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
    href: "/kalender",
    label: "Kalender",
    icon: <CalendarIcon className={icon} />,
    permission: "events:read",
  },
  {
    href: "/aufgaben",
    label: "Aufgaben",
    icon: <ListChecksIcon className={icon} />,
    permission: "tasks:read",
  },
  {
    href: "/nachrichten",
    label: "Nachrichten",
    icon: <MessageSquareIcon className={icon} />,
    permission: "messages:read",
  },
  {
    href: "/mitglieder",
    label: "Mitglieder",
    icon: <UsersIcon className={icon} />,
    permission: "members:read",
    notOwnOnly: true,
  },
  {
    href: "/abteilungen",
    label: "Abteilungen",
    icon: <NetworkIcon className={icon} />,
    permission: "departments:read",
  },
  {
    href: "/dokumente",
    label: "Dokumente",
    icon: <FolderOpenIcon className={icon} />,
    permission: "documents:read",
  },
];

const admin: NavDefinition[] = [
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

/** Menüpunkte, die für die Rolle des Benutzers sichtbar sind (die Seiten prüfen die Rechte zusätzlich selbst). */
export function getNavigation(
  holder: PermissionHolder,
  options: { isPlatformAdmin: boolean },
): NavGroup[] {
  const groups: NavGroup[] = [{ items: visible(main, holder) }];
  const adminItems = visible(admin, holder);
  if (adminItems.length > 0) groups.push({ label: "Verwaltung", items: adminItems });
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
