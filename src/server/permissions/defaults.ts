import type { PermissionScope } from "@/generated/prisma/enums";
import { PERMISSION_KEYS, type PermissionKey } from "./catalog";

/**
 * Standardrollen, die für jeden neuen Verein angelegt werden.
 * (Die Rolle "Superadministrator" ist keine Vereinsrolle, sondern das Plattform-Flag
 * `User.isPlatformAdmin` – sie verwaltet Vereine, sieht aber keine Mitgliederdaten.)
 */
export const SYSTEM_ROLE_KEYS = [
  "CLUB_ADMIN",
  "BOARD",
  "DEPARTMENT_LEAD",
  "HELPER",
  "MEMBER",
] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export type PermissionGrants = Partial<Record<PermissionKey, PermissionScope>>;

export interface RoleDefinition {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: PermissionGrants;
}

const CLUB: PermissionScope = "CLUB";
const DEPARTMENT: PermissionScope = "DEPARTMENT";
const OWN: PermissionScope = "OWN";

const everything = Object.fromEntries(
  PERMISSION_KEYS.map((key) => [key, CLUB]),
) as PermissionGrants;

export const SYSTEM_ROLES: readonly RoleDefinition[] = [
  {
    key: "CLUB_ADMIN",
    name: "Vereinsadministrator",
    description:
      "Verwaltet den gesamten Verein: Benutzer, Rollen, Mitglieder, Veranstaltungen und Einstellungen.",
    permissions: everything,
  },
  {
    key: "BOARD",
    name: "Vorstandsmitglied",
    description:
      "Verwaltet Mitglieder, erstellt Veranstaltungen, organisiert Helfer und versendet Nachrichten.",
    permissions: {
      "club:read": CLUB,
      "users:read": CLUB,
      "members:read": CLUB,
      "members:read_contact": CLUB,
      "members:read_private": CLUB,
      "members:create": CLUB,
      "members:update": CLUB,
      "members:archive": CLUB,
      "members:import": CLUB,
      "members:export": CLUB,
      "departments:read": CLUB,
      "departments:manage": CLUB,
      "events:read": CLUB,
      "events:create": CLUB,
      "events:update": CLUB,
      "events:publish": CLUB,
      "events:archive": CLUB,
      "events:participate": CLUB,
      "events:manage_participants": CLUB,
      "shifts:read": CLUB,
      "shifts:signup": CLUB,
      "shifts:manage": CLUB,
      "shifts:assign": CLUB,
      "shifts:hours": CLUB,
      "tasks:read": CLUB,
      "tasks:manage": CLUB,
      "tasks:update": CLUB,
      "messages:read": OWN,
      "messages:send": CLUB,
      "documents:read": CLUB,
      "documents:upload": CLUB,
      "documents:manage": CLUB,
    },
  },
  {
    key: "DEPARTMENT_LEAD",
    name: "Abteilungsleiter",
    description:
      "Verwaltet Mitglieder, Veranstaltungen und Helferschichten der eigenen Abteilung(en).",
    permissions: {
      "club:read": CLUB,
      "members:read": DEPARTMENT,
      "members:read_contact": DEPARTMENT,
      // Alter und Einwilligungen der eigenen Mitglieder werden für Jugendarbeit, Mindestalter bei
      // Schichten und Fotoerlaubnis benötigt – aber nur für die eigene Abteilung.
      "members:read_private": DEPARTMENT,
      "members:create": DEPARTMENT,
      "members:update": DEPARTMENT,
      "departments:read": CLUB,
      // Pflege der eigenen Abteilung und ihrer Gruppen; Abteilungen anlegen/löschen bleibt dem Vorstand vorbehalten.
      "departments:manage": DEPARTMENT,
      "events:read": CLUB,
      "events:create": DEPARTMENT,
      "events:update": DEPARTMENT,
      "events:publish": DEPARTMENT,
      "events:archive": DEPARTMENT,
      "events:participate": CLUB,
      "events:manage_participants": DEPARTMENT,
      "shifts:read": CLUB,
      "shifts:signup": CLUB,
      "shifts:manage": DEPARTMENT,
      "shifts:assign": DEPARTMENT,
      "shifts:hours": DEPARTMENT,
      "tasks:read": DEPARTMENT,
      "tasks:manage": DEPARTMENT,
      "tasks:update": OWN,
      "messages:read": OWN,
      "messages:send": DEPARTMENT,
      "documents:read": CLUB,
      "documents:upload": DEPARTMENT,
    },
  },
  {
    key: "HELPER",
    name: "Helfer",
    description:
      "Sieht Veranstaltungen, trägt sich in Helferschichten ein und sieht die eigenen Aufgaben.",
    permissions: {
      "club:read": CLUB,
      "members:read": OWN,
      "members:read_contact": OWN,
      "members:read_private": OWN,
      "departments:read": CLUB,
      "events:read": CLUB,
      "events:participate": CLUB,
      "shifts:read": CLUB,
      "shifts:signup": CLUB,
      "tasks:read": OWN,
      "tasks:update": OWN,
      "messages:read": OWN,
      "documents:read": CLUB,
    },
  },
  {
    key: "MEMBER",
    name: "Mitglied",
    description:
      "Sieht das eigene Profil und Veranstaltungen und kann sich für Helferschichten eintragen.",
    permissions: {
      "club:read": CLUB,
      "members:read": OWN,
      "members:read_contact": OWN,
      "members:read_private": OWN,
      "departments:read": CLUB,
      "events:read": CLUB,
      "events:participate": CLUB,
      "shifts:read": CLUB,
      "shifts:signup": CLUB,
      "messages:read": OWN,
      "documents:read": CLUB,
    },
  },
];

export function getSystemRole(key: string): RoleDefinition | undefined {
  return SYSTEM_ROLES.find((role) => role.key === key);
}
