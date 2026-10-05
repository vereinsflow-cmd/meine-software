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
  "club.logo_updated": "Vereinslogo geändert",
  "club.logo_removed": "Vereinslogo entfernt",
  "club.setup_completed": "Einrichtung des Vereins abgeschlossen",
  "platform.club_created": "Verein angelegt",
  "platform.first_run": "Verein und erstes Konto angelegt (Ersteinrichtung)",
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
  "member.application_received": "Beitrittsantrag eingegangen",
  "member.application_accepted": "Beitrittsantrag angenommen",
  "member.application_rejected": "Beitrittsantrag abgelehnt",
  "member.join_link_created": "QR-Code zum Beitritt eingerichtet",
  "member.join_link_renewed": "QR-Code zum Beitritt erneuert",
  "member.join_link_closed": "Beitritt per QR-Code geschlossen",
  "member.join_limit_changed": "Anzahl der Anmeldungen über den QR-Code geändert",
  "members.imported": "Mitglieder importiert",
  "members.exported": "Mitglieder exportiert",
  "department.created": "Abteilung angelegt",
  "department.updated": "Abteilung geändert",
  "department.deleted": "Abteilung gelöscht",
  "department.member_added": "Mitglied zur Abteilung hinzugefügt",
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
  "finance.invoice_created": "Rechnung erfasst",
  "finance.invoice_updated": "Rechnung geändert",
  "finance.invoice_paid": "Rechnung als bezahlt markiert",
  "finance.invoice_reopened": "Rechnung wieder offen",
  "finance.setup_completed": "Kassenbuch eingerichtet",
  "finance.entry_created": "Buchung erfasst",
  "finance.entry_reversed": "Buchung storniert",
  "finance.entry_corrected": "Buchung korrigiert",
  "finance.transfer_created": "Umbuchung erfasst",
  "finance.opening_corrected": "Anfangsbestand korrigiert",
  "finance.receipt_attached": "Beleg angehängt",
  "finance.receipt_removed": "Beleg entfernt",
  "finance.invoice_booked": "Rechnung ins Kassenbuch gebucht",
  "finance.period_closed": "Monat abgeschlossen",
  "finance.cash_counted": "Kassensturz",
  "finance.account_created": "Konto angelegt",
  "finance.account_updated": "Konto geändert",
  "finance.account_archived": "Konto archiviert",
  "finance.account_restored": "Konto wieder aktiviert",
  "finance.category_created": "Kategorie angelegt",
  "finance.category_updated": "Kategorie geändert",
  "finance.category_archived": "Kategorie archiviert",
  "finance.category_restored": "Kategorie wieder aktiviert",
  "finance.fee_settings_updated": "Einstellungen für Beiträge geändert",
  "finance.fee_type_created": "Beitragsart angelegt",
  "finance.fee_type_updated": "Beitragsart geändert",
  "finance.fee_type_archived": "Beitragsart archiviert",
  "finance.fee_type_restored": "Beitragsart wieder aktiviert",
  "finance.fee_rate_added": "Neuer Beitragssatz",
  "finance.fee_rate_deleted": "Beitragssatz zurückgenommen",
  "finance.member_finance_updated": "Zahler und Zahlweg geändert",
  "finance.assignment_created": "Beitragsregel angelegt",
  "finance.assignment_ended": "Beitragsregel beendet",
  "finance.assignment_deleted": "Beitragsregel entfernt",
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
  { key: "finanzen", label: "Finanzen", prefixes: ["finance."] },
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
