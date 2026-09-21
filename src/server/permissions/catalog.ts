/**
 * Katalog aller Berechtigungen der Anwendung.
 *
 * Der Code ist die Quelle der Wahrheit; die Tabelle `Permission` wird daraus synchronisiert
 * (siehe `syncPermissionCatalog`). Schlüssel folgen dem Muster `<bereich>:<aktion>`.
 * Die Reichweite (ganzer Verein / eigene Abteilung / nur eigene Daten) legt erst die Rolle fest.
 */
export const PERMISSIONS = {
  // Verein & Benutzer
  "club:read": { module: "Verein", label: "Vereinsdaten ansehen" },
  "club:update": { module: "Verein", label: "Vereinseinstellungen ändern" },
  "users:read": { module: "Verein", label: "Benutzer und Rollen ansehen" },
  "users:invite": { module: "Verein", label: "Benutzer einladen" },
  "users:manage": { module: "Verein", label: "Rollen zuweisen, Benutzer sperren oder entfernen" },
  "audit:read": { module: "Verein", label: "Änderungsprotokoll ansehen" },
  "privacy:manage": { module: "Verein", label: "Datenschutzanfragen bearbeiten" },

  // Mitglieder
  "members:read": { module: "Mitglieder", label: "Mitglieder ansehen (Stammdaten)" },
  "members:read_contact": {
    module: "Mitglieder",
    label: "Kontaktdaten ansehen (E-Mail, Telefon, Adresse)",
  },
  "members:read_private": {
    module: "Mitglieder",
    label: "Sensible Daten ansehen (Geburtsdatum, Notizen, Einwilligungen, Verlauf)",
  },
  "members:create": { module: "Mitglieder", label: "Mitglieder anlegen" },
  "members:update": { module: "Mitglieder", label: "Mitglieder bearbeiten" },
  "members:archive": { module: "Mitglieder", label: "Mitglieder archivieren und wiederherstellen" },
  "members:delete": { module: "Mitglieder", label: "Mitglieder endgültig löschen" },
  "members:import": { module: "Mitglieder", label: "Mitglieder per CSV importieren" },
  "members:export": { module: "Mitglieder", label: "Mitglieder exportieren" },

  // Abteilungen
  "departments:read": { module: "Abteilungen", label: "Abteilungen ansehen" },
  "departments:manage": { module: "Abteilungen", label: "Abteilungen und Gruppen verwalten" },

  // Veranstaltungen
  "events:read": { module: "Veranstaltungen", label: "Veranstaltungen ansehen" },
  "events:create": { module: "Veranstaltungen", label: "Veranstaltungen erstellen" },
  "events:update": { module: "Veranstaltungen", label: "Veranstaltungen bearbeiten" },
  "events:publish": {
    module: "Veranstaltungen",
    label: "Veranstaltungen veröffentlichen und absagen",
  },
  "events:archive": { module: "Veranstaltungen", label: "Veranstaltungen archivieren und löschen" },
  "events:participate": { module: "Veranstaltungen", label: "Zu- und Absagen für Veranstaltungen" },
  "events:manage_participants": { module: "Veranstaltungen", label: "Teilnehmerlisten verwalten" },

  // Helferplanung
  "shifts:read": { module: "Helferplanung", label: "Helferschichten ansehen" },
  "shifts:signup": { module: "Helferplanung", label: "Sich selbst in Schichten eintragen" },
  "shifts:manage": {
    module: "Helferplanung",
    label: "Schichten erstellen, bearbeiten und löschen",
  },
  "shifts:assign": { module: "Helferplanung", label: "Helfer manuell zuweisen" },
  "shifts:hours": { module: "Helferplanung", label: "Helferstunden dokumentieren und bestätigen" },

  // Aufgaben
  "tasks:read": { module: "Aufgaben", label: "Aufgaben ansehen" },
  "tasks:manage": { module: "Aufgaben", label: "Aufgaben und Checklisten verwalten" },
  "tasks:update": { module: "Aufgaben", label: "Status eigener Aufgaben ändern" },

  // Kommunikation
  "messages:read": { module: "Kommunikation", label: "Nachrichten lesen" },
  "messages:send": { module: "Kommunikation", label: "Nachrichten versenden" },

  // Dokumente
  "documents:read": { module: "Dokumente", label: "Dokumente ansehen und herunterladen" },
  "documents:upload": { module: "Dokumente", label: "Dokumente hochladen" },
  "documents:manage": { module: "Dokumente", label: "Dokumente verwalten und löschen" },
} as const satisfies Record<string, { module: string; label: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}
