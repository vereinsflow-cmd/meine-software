import { MEMBER_FIELD_LABEL } from "@/lib/labels";

/**
 * Beschriftungen für das Änderungsprotokoll. Unbekannte Aktionen (z. B. aus einer neueren Version) werden mit ihrem
 * technischen Namen angezeigt – nichts wird verschluckt.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "auth.login": "Anmeldung",
  "auth.logout": "Abmeldung",
  "auth.password_changed": "Passwort geändert",
  "auth.password_reset": "Passwort zurückgesetzt",
  "auth.profile_updated": "Profil geändert",
  "invitation.created": "Einladung versendet",
  "invitation.revoked": "Einladung zurückgezogen",
  "invitation.accepted": "Einladung angenommen",
  "user.role_changed": "Rolle geändert",
  "user.removed": "Benutzer entfernt",
  "club.updated": "Vereinseinstellungen geändert",
  "platform.club_created": "Verein angelegt",
  "platform.admin_created": "Plattform-Administrator eingerichtet",
  "seed.completed": "Demo-Daten eingespielt",
  "member.created": "Mitglied angelegt",
  "member.updated": "Mitglied geändert",
  "member.archived": "Mitglied archiviert",
  "member.restored": "Mitglied wiederhergestellt",
  "member.deleted": "Mitglied in den Papierkorb verschoben",
  "member.restored_from_trash": "Mitglied aus dem Papierkorb geholt",
  "member.consent_changed": "Einwilligung geändert",
  "member.anonymized": "Mitglied anonymisiert",
  "members.imported": "Mitglieder importiert",
  "members.exported": "Mitglieder exportiert",
  "department.created": "Abteilung angelegt",
  "department.updated": "Abteilung geändert",
  "department.deleted": "Abteilung gelöscht",
  "group.created": "Gruppe angelegt",
  "group.updated": "Gruppe geändert",
  "group.deleted": "Gruppe gelöscht",
  "group.member_added": "Mitglied zur Gruppe hinzugefügt",
  "group.member_removed": "Mitglied aus der Gruppe entfernt",
  "event.created": "Veranstaltung angelegt",
  "event.updated": "Veranstaltung geändert",
  "event.published": "Veranstaltung veröffentlicht",
  "event.cancelled": "Veranstaltung abgesagt",
  "event.completed": "Veranstaltung abgeschlossen",
  "event.auto_completed": "Veranstaltung automatisch abgeschlossen",
  "event.archived": "Veranstaltung archiviert",
  "event.restored": "Veranstaltung wiederhergestellt",
  "event.deleted": "Veranstaltung gelöscht",
  "event.duplicated": "Veranstaltung dupliziert",
  "event.participant_set": "Teilnahme gesetzt",
  "event.participant_removed": "Teilnehmer entfernt",
  "shift.created": "Schicht angelegt",
  "shift.updated": "Schicht geändert",
  "shift.deleted": "Schicht gelöscht",
  "shift.assigned": "Helfer eingetragen",
  "shift.unassigned": "Helfer ausgetragen",
  "shift.hours_recorded": "Helferstunden erfasst",
  "task.created": "Aufgabe angelegt",
  "task.updated": "Aufgabe geändert",
  "task.status_changed": "Aufgabenstatus geändert",
  "task.deleted": "Aufgabe gelöscht",
  "checklist.created": "Checkliste angelegt",
  "checklist.deleted": "Checkliste gelöscht",
  "document.uploaded": "Dokument hochgeladen",
  "document.updated": "Dokument geändert",
  "document.deleted": "Dokument gelöscht",
  "support.ticket_created": "Meldung erstellt",
  "support.ticket_updated": "Meldung bearbeitet",
  "support.contacts_updated": "Ansprechpartner geändert",
  "message.sent": "Nachricht gesendet",
  "message.deleted": "Nachricht gelöscht oder zurückgerufen",
  "calendar.feed_created": "Kalender-Abo-Link erzeugt",
  "calendar.feed_revoked": "Kalender-Abo-Link widerrufen",
  "privacy.deletion_requested": "Löschung beantragt",
  "privacy.deletion_cancelled": "Löschantrag zurückgezogen",
  "privacy.deletion_completed": "Konto auf Antrag gelöscht",
  "privacy.export_created": "Datenexport erstellt",
};

export const auditActionLabel = (action: string): string => AUDIT_ACTION_LABEL[action] ?? action;

/** Themenbereiche für den Filter; jeder fasst Aktionen anhand ihres Präfixes zusammen. */
export const AUDIT_MODULES = [
  { key: "auth", label: "Anmeldung und Konto", prefixes: ["auth."] },
  { key: "mitglieder", label: "Mitglieder", prefixes: ["member.", "members."] },
  { key: "abteilungen", label: "Abteilungen und Gruppen", prefixes: ["department.", "group."] },
  { key: "veranstaltungen", label: "Veranstaltungen", prefixes: ["event."] },
  { key: "helferplanung", label: "Helferplanung", prefixes: ["shift."] },
  { key: "aufgaben", label: "Aufgaben und Checklisten", prefixes: ["task.", "checklist."] },
  { key: "nachrichten", label: "Nachrichten", prefixes: ["message."] },
  { key: "dokumente", label: "Dokumente", prefixes: ["document."] },
  { key: "hilfe", label: "Hilfe und Support", prefixes: ["support."] },
  { key: "benutzer", label: "Benutzer und Rollen", prefixes: ["user.", "invitation."] },
  { key: "verein", label: "Verein und Plattform", prefixes: ["club.", "platform.", "seed."] },
  { key: "kalender", label: "Kalender", prefixes: ["calendar."] },
  { key: "datenschutz", label: "Datenschutz", prefixes: ["privacy."] },
] as const;
export type AuditModuleKey = (typeof AUDIT_MODULES)[number]["key"];

const MAX_VALUE_LENGTH = 120;

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (Array.isArray(value)) return value.map(show).join(", ");
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)} …` : text;
}

/**
 * Macht die Änderungsdetails eines Protokolleintrags lesbar: "Vorname: Max → Moritz", "E-Mail: geändert".
 * Sensible Felder sind schon beim Speichern maskiert; hier wird nur dargestellt.
 */
export function formatAuditChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, unknown>)
    .slice(0, 30)
    .map(([key, value]) => {
      const label = MEMBER_FIELD_LABEL[key] ?? key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const change = value as { from?: unknown; to?: unknown };
        if ("from" in change && "to" in change)
          return `${label}: ${show(change.from)} → ${show(change.to)}`;
        if ("to" in change) return `${label}: ${show(change.to)}`;
      }
      return `${label}: ${show(value)}`;
    });
}
