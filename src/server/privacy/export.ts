import "server-only";
import { calendarDateToInputValue } from "@/lib/dates";
import { prisma } from "@/server/db/client";

/**
 * Datenexport für die betroffene Person (Auskunft und Datenübertragbarkeit, Art. 15 und 20 DSGVO).
 *
 * Ausgegeben werden AUSSCHLIESSLICH die Daten der anfragenden Person: ihr Konto, ihre Mitgliedschaften samt
 * Stammdaten, Einwilligungen, Anmeldungen, Schichten, Aufgaben, Benachrichtigungen, Kalender-Abos (ohne Geheimnisse) und
 * Sitzungen (ohne Token). Angaben über andere Personen (Mitanmeldungen, andere Helfer, Namen in Protokolltexten) sind
 * bewusst NICHT enthalten. Passwort-Hash, Zwei-Faktor-Geheimnis und Token verlassen den Server nie.
 * Das Format ist gut lesbares JSON mit deutschen Schlüsseln.
 */
export const EXPORT_FORMAT = "VereinsFlow-Datenexport";
export const EXPORT_VERSION = 1;
const LIMIT = 1000;

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);
const day = (value: Date | null | undefined): string | null =>
  value ? calendarDateToInputValue(value) : null;

export interface UserDataExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  erstelltAm: string;
  hinweis: string;
  konto: Record<string, unknown>;
  vereine: Record<string, unknown>[];
  sitzungen: Record<string, unknown>[];
  protokoll: { hinweis: string; eintraege: Record<string, unknown>[] };
}

export async function buildUserDataExport(
  userId: string,
  now: Date = new Date(),
): Promise<UserDataExport | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      emailNotifications: true,
      totpEnabledAt: true,
      termsAcceptedAt: true,
      termsVersion: true,
    },
  });
  if (!user) return null;

  const memberships = await prisma.clubMembership.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: {
      club: { select: { id: true, name: true } },
      role: { select: { name: true } },
      member: {
        include: {
          departments: { include: { department: { select: { name: true } } } },
          consents: { orderBy: { recordedAt: "asc" } },
          participations: {
            include: { event: { select: { title: true, startsAt: true } } },
            orderBy: { createdAt: "asc" },
            take: LIMIT,
          },
          shiftAssignments: {
            include: {
              shift: {
                select: {
                  title: true,
                  startsAt: true,
                  endsAt: true,
                  event: { select: { title: true } },
                },
              },
            },
            orderBy: { createdAt: "asc" },
            take: LIMIT,
          },
          assignedTasks: {
            where: { deletedAt: null },
            select: { title: true, status: true, dueDate: true, completedAt: true },
            take: LIMIT,
          },
        },
      },
    },
  });

  const [notifications, feedTokens, sessions, audit, received, uploads, tickets] =
    await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
        select: { clubId: true, title: true, body: true, createdAt: true, readAt: true },
      }),
      prisma.calendarFeedToken.findMany({
        where: { userId },
        select: { clubId: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      }),
      prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          userAgent: true,
          ipPrefix: true,
        },
      }),
      // Nur Art, Objekt-Typ und Zeitpunkt – Textfelder und Objekt-IDs können Namen anderer Personen enthalten.
      prisma.auditLog.findMany({
        where: { actorUserId: userId },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
        select: { clubId: true, action: true, entityType: true, createdAt: true },
      }),
      prisma.messageRecipient.findMany({
        where: { userId },
        orderBy: { id: "desc" },
        take: LIMIT,
        select: {
          clubId: true,
          readAt: true,
          message: { select: { subject: true, sentAt: true } },
        },
      }),
      prisma.document.findMany({
        where: { uploadedById: userId, deletedAt: null },
        select: { clubId: true, name: true, mimeType: true, sizeBytes: true, createdAt: true },
        take: LIMIT,
      }),
      // Eigene Meldungen an die Vereinsverwaltung (samt Antwort).
      prisma.supportTicket.findMany({
        where: { createdById: userId },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
        select: {
          clubId: true,
          category: true,
          subject: true,
          description: true,
          status: true,
          response: true,
          createdAt: true,
        },
      }),
    ]);

  const clubName = new Map(memberships.map((m) => [m.clubId, m.club.name]));
  const inClub = <T extends { clubId: string }>(rows: T[], clubId: string) =>
    rows.filter((row) => row.clubId === clubId);

  const vereine = memberships.map((membership) => {
    const member = membership.member;
    return {
      verein: membership.club.name,
      rolle: membership.role.name,
      mitgliedschaftStatus: membership.status,
      seit: iso(membership.joinedAt),
      mitglied: member
        ? {
            mitgliedsnummer: member.memberNumber,
            vorname: member.firstName,
            nachname: member.lastName,
            email: member.email,
            telefon: member.phone,
            strasse: member.street,
            postleitzahl: member.postalCode,
            ort: member.city,
            land: member.country,
            geburtsdatum: day(member.birthDate),
            status: member.status,
            funktionImVerein: member.clubFunction,
            eintritt: day(member.joinedAt),
            austritt: day(member.leftAt),
            interneNotizen: member.internalNotes,
            abteilungen: member.departments.map((d) => ({
              abteilung: d.department.name,
              leitung: d.isLeader,
              seit: day(d.since),
            })),
            einwilligungen: member.consents.map((c) => ({
              art: c.type,
              erteilt: c.granted,
              am: iso(c.recordedAt),
              quelle: c.source,
              textVersion: c.textVersion,
            })),
            veranstaltungen: member.participations.map((p) => ({
              veranstaltung: p.event.title,
              beginn: iso(p.event.startsAt),
              antwort: p.status,
              notiz: p.note,
              am: iso(p.respondedAt),
            })),
            helferschichten: member.shiftAssignments.map((a) => ({
              veranstaltung: a.shift.event.title,
              schicht: a.shift.title,
              beginn: iso(a.shift.startsAt),
              ende: iso(a.shift.endsAt),
              status: a.status,
              geleisteteMinuten: a.workedMinutes,
              notiz: a.note,
              eingetragenAm: iso(a.assignedAt),
            })),
            aufgaben: member.assignedTasks.map((t) => ({
              titel: t.title,
              status: t.status,
              faelligAm: day(t.dueDate),
              erledigtAm: iso(t.completedAt),
            })),
          }
        : null,
      benachrichtigungen: inClub(notifications, membership.clubId).map((n) => ({
        titel: n.title,
        text: n.body,
        am: iso(n.createdAt),
        gelesenAm: iso(n.readAt),
      })),
      nachrichten: inClub(received, membership.clubId).map((r) => ({
        betreff: r.message.subject,
        gesendetAm: iso(r.message.sentAt),
        gelesenAm: iso(r.readAt),
      })),
      kalenderAbos: inClub(feedTokens, membership.clubId).map((t) => ({
        erstelltAm: iso(t.createdAt),
        zuletztAbgerufen: iso(t.lastUsedAt),
        widerrufenAm: iso(t.revokedAt),
      })),
      hochgeladeneDokumente: inClub(uploads, membership.clubId).map((d) => ({
        name: d.name,
        typ: d.mimeType,
        groesseBytes: d.sizeBytes,
        am: iso(d.createdAt),
      })),
      supportMeldungen: inClub(tickets, membership.clubId).map((t) => ({
        art: t.category,
        betreff: t.subject,
        text: t.description,
        status: t.status,
        antwort: t.response,
        am: iso(t.createdAt),
      })),
    };
  });

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    erstelltAm: now.toISOString(),
    hinweis:
      "Dieser Export enthält deine personenbezogenen Daten aus VereinsFlow. Angaben über andere Personen sowie Passwörter, Token und Geheimnisse sind aus Sicherheits- und Datenschutzgründen nicht enthalten.",
    konto: {
      email: user.email,
      vorname: user.firstName,
      nachname: user.lastName,
      erstelltAm: iso(user.createdAt),
      letzteAnmeldung: iso(user.lastLoginAt),
      emailBestaetigtAm: iso(user.emailVerifiedAt),
      emailBenachrichtigungen: user.emailNotifications,
      zweiFaktorAktiv: user.totpEnabledAt !== null,
      datenschutzhinweisAkzeptiertAm: iso(user.termsAcceptedAt),
      datenschutzhinweisVersion: user.termsVersion,
    },
    vereine,
    sitzungen: sessions.map((s) => ({
      erstelltAm: iso(s.createdAt),
      zuletztAktiv: iso(s.lastSeenAt),
      gueltigBis: iso(s.expiresAt),
      geraet: s.userAgent,
      ipAdresseGekuerzt: s.ipPrefix,
    })),
    protokoll: {
      hinweis:
        "Aktionen, die du selbst ausgeführt hast (Art, Objekt-Typ und Zeitpunkt). Details stehen aus Datenschutzgründen nicht dabei.",
      eintraege: audit.map((a) => ({
        verein: a.clubId ? (clubName.get(a.clubId) ?? null) : null,
        aktion: a.action,
        objekt: a.entityType,
        zeitpunkt: iso(a.createdAt),
      })),
    },
  };
}
