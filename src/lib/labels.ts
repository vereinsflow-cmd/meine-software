import type {
  ConsentType,
  EventStatus,
  EventType,
  MemberStatus,
  ParticipantStatus,
  PermissionScope,
  ShiftStatus,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";

/**
 * Deutsche Beschriftungen für Aufzählungen (Enums). Die Typen `Record<Enum, …>` stellen sicher,
 * dass bei neuen Werten im Datenmodell die Beschriftung nicht vergessen wird (Compile-Fehler).
 */
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "Aktiv",
  PASSIVE: "Passiv",
  LEFT: "Ausgetreten",
  HONORARY: "Ehrenmitglied",
  BLOCKED: "Gesperrt",
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgesagt",
  ARCHIVED: "Archiviert",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  EVENT: "Veranstaltung",
  TRAINING: "Training",
  MEETING: "Sitzung",
  COMPETITION: "Wettkampf",
  WORK_ASSIGNMENT: "Arbeitseinsatz",
  OTHER: "Sonstiges",
};

export const PARTICIPANT_STATUS_LABEL: Record<ParticipantStatus, string> = {
  ACCEPTED: "Zugesagt",
  DECLINED: "Abgesagt",
  WAITLISTED: "Warteliste",
};

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  OPEN: "Offen",
  CLOSED: "Geschlossen",
  CANCELLED: "Abgesagt",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  DONE: "Erledigt",
  BLOCKED: "Blockiert",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Niedrig",
  NORMAL: "Normal",
  HIGH: "Hoch",
  URGENT: "Dringend",
};

export const PERMISSION_SCOPE_LABEL: Record<PermissionScope, string> = {
  CLUB: "Gesamter Verein",
  DEPARTMENT: "Eigene Abteilung(en)",
  OWN: "Nur eigene Daten",
};

export const CONSENT_TYPE_LABEL: Record<ConsentType, string> = {
  PRIVACY_POLICY: "Datenschutzerklärung zur Kenntnis genommen",
  DATA_PROCESSING: "Einwilligung in die Datenverarbeitung",
  NEWSLETTER: "Vereinsinformationen und Newsletter per E-Mail",
  PHOTO_PUBLICATION: "Veröffentlichung von Fotos",
};

/** Feldnamen der Mitgliedsdaten für Protokoll und Fehlermeldungen. */
export const MEMBER_FIELD_LABEL: Record<string, string> = {
  memberNumber: "Mitgliedsnummer",
  firstName: "Vorname",
  lastName: "Nachname",
  status: "Status",
  clubFunction: "Funktion",
  joinedAt: "Eintrittsdatum",
  leftAt: "Austrittsdatum",
  email: "E-Mail",
  phone: "Telefon",
  street: "Straße",
  postalCode: "PLZ",
  city: "Ort",
  country: "Land",
  birthDate: "Geburtsdatum",
  internalNotes: "Notizen",
  departments: "Abteilungen",
};

export function options<T extends string>(
  labels: Record<T, string>,
): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
