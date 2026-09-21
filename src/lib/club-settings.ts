/**
 * Vereinseinstellungen, die als JSON in `Club.settings` liegen (reine Funktionen, auch im Browser nutzbar).
 *
 * Aufbewahrungsfristen (DSGVO: Speicherbegrenzung). Der Aufbewahrungsjob hält sich an diese Werte.
 */
export interface RetentionSettings {
  /** Monate, nach denen die Daten ausgetretener Mitglieder anonymisiert werden (0 = nie automatisch). */
  leftMembersMonths: number;
  /** Tage, die gelöschte Mitglieder im Papierkorb bleiben, bevor sie endgültig anonymisiert werden. */
  trashDays: number;
  /** Monate, nach denen Einträge des Änderungsprotokolls gelöscht werden. */
  auditMonths: number;
}

export const DEFAULT_RETENTION: RetentionSettings = {
  leftMembersMonths: 24,
  trashDays: 30,
  auditMonths: 36,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isInteger(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

/** Ansprechpartner, die der Verein unter „Hilfe & Support“ anzeigt (in `Club.settings.support.contacts`). */
export interface SupportContact {
  name: string;
  /** Wofür die Person zuständig ist, z. B. „Technische Fragen“ oder „Helferplanung“. */
  role: string | null;
  email: string | null;
  phone: string | null;
}

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** Liest die Ansprechpartner tolerant: Fehlerhafte Einträge werden übersprungen, nie ein Fehler geworfen. */
export function readSupportContacts(settings: unknown): SupportContact[] {
  const raw = (settings as { support?: { contacts?: unknown } } | null)?.support?.contacts;
  if (!Array.isArray(raw)) return [];
  const contacts: SupportContact[] = [];
  for (const entry of raw.slice(0, 6)) {
    const item = entry as Record<string, unknown> | null;
    const name = text(item?.name, 100);
    if (!name) continue;
    contacts.push({
      name,
      role: text(item?.role, 100),
      email: text(item?.email, 254),
      phone: text(item?.phone, 40),
    });
  }
  return contacts;
}

export function readRetention(settings: unknown): RetentionSettings {
  const raw =
    (settings as { retention?: Partial<Record<keyof RetentionSettings, unknown>> } | null)
      ?.retention ?? {};
  return {
    leftMembersMonths: clamp(raw.leftMembersMonths, 0, 120, DEFAULT_RETENTION.leftMembersMonths),
    trashDays: clamp(raw.trashDays, 7, 365, DEFAULT_RETENTION.trashDays),
    auditMonths: clamp(raw.auditMonths, 6, 120, DEFAULT_RETENTION.auditMonths),
  };
}
