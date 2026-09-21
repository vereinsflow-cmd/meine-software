import type { ConsentType, MemberStatus } from "@/generated/prisma/enums";

export interface MemberDepartmentRef {
  id: string;
  name: string;
  isLeader: boolean;
}

/** Zeile der Mitgliederliste. Kontaktdaten sind nur gefüllt, wenn die Rolle sie für dieses Mitglied sehen darf. */
export interface MemberListItem {
  id: string;
  memberNumber: string | null;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  clubFunction: string | null;
  joinedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  hasAccount: boolean;
  departments: MemberDepartmentRef[];
  email: string | null;
  phone: string | null;
}

export interface ConsentState {
  type: ConsentType;
  granted: boolean;
  recordedAt: Date;
  source: string | null;
}

export interface MemberDetail extends MemberListItem {
  leftAt: Date | null;
  accountStatus: "ACTIVE" | "SUSPENDED" | null;
  /** Nur bei Berechtigung `members:read_contact`. */
  contact: {
    street: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
  } | null;
  /** Nur bei Berechtigung `members:read_private`. */
  private: {
    birthDate: Date | null;
    internalNotes: string | null;
    consents: ConsentState[];
  } | null;
  /** Was der aktuelle Benutzer mit DIESEM Mitglied tun darf (für die Anzeige der Schaltflächen; der Server prüft erneut). */
  can: { update: boolean; archive: boolean; delete: boolean; consents: boolean };
}

export type MemberView = "active" | "archived" | "trash";
export const MEMBER_SORT_FIELDS = ["name", "joinedAt", "status", "memberNumber"] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];
