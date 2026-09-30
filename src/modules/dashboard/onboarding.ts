import { can, scopeOf } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";

/**
 * „Erste Schritte“ für einen neuen Verein: eine Liste, die sich selbst abhakt, sobald der Schritt erledigt ist (gemessen an
 * den Daten, nicht an Klicks). Sie erscheint nur für den Vereinsadministrator und verschwindet, wenn alles erledigt ist;
 * ausblenden lässt sie sich über die eigene Dashboard-Einstellung (Karte „erste-schritte“).
 */

export interface OnboardingFacts {
  logo: boolean;
  contact: boolean;
  departments: number;
  members: number;
  users: number;
  events: number;
  joinLink: boolean;
}

export type OnboardingRight = "club" | "departments" | "members" | "users" | "events" | "joinLink";

export interface OnboardingStep {
  id: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
}

const STEPS: readonly (Omit<OnboardingStep, "done"> & {
  right: OnboardingRight;
  isDone: (facts: OnboardingFacts) => boolean;
})[] = [
  {
    id: "logo",
    title: "Vereinslogo hochladen",
    hint: "Erscheint in der Kopfzeile, im Menü und auf Aushängen.",
    href: "/einstellungen",
    right: "club",
    isDone: (f) => f.logo,
  },
  {
    id: "vereinsdaten",
    title: "Vereinsdaten ergänzen",
    hint: "Kontakt-E-Mail und Anschrift – sie stehen in E-Mails und im Kalender.",
    href: "/einstellungen",
    right: "club",
    isDone: (f) => f.contact,
  },
  {
    id: "abteilungen",
    title: "Abteilungen anlegen",
    hint: "z. B. Fußball, Tennis, Jugend – danach lassen sich Mitglieder und Termine zuordnen.",
    href: "/abteilungen",
    right: "departments",
    isDone: (f) => f.departments > 0,
  },
  {
    id: "mitglieder",
    title: "Mitglieder eintragen",
    hint: "Einzeln anlegen oder die vorhandene Liste als Tabelle (CSV) importieren.",
    href: "/mitglieder/import",
    right: "members",
    isDone: (f) => f.members > 1, // das eigene Mitglied zählt nicht
  },
  {
    id: "vorstand",
    title: "Vorstand einladen",
    hint: "Wer mitverwalten soll, bekommt eine Einladung per E-Mail.",
    href: "/benutzer",
    right: "users",
    isDone: (f) => f.users > 1,
  },
  {
    id: "termin",
    title: "Ersten Termin anlegen",
    hint: "z. B. Training, Sitzung oder Sommerfest – Mitglieder sehen ihn im Kalender.",
    href: "/veranstaltungen/neu",
    right: "events",
    isDone: (f) => f.events > 0,
  },
  {
    id: "qr-code",
    title: "QR-Code für neue Mitglieder",
    hint: "Ein Aushang, über den Interessierte einen Mitgliedsantrag stellen.",
    href: "/mitglieder/antraege",
    right: "joinLink",
    isDone: (f) => f.joinLink,
  },
];

/** Die Schritte, für die die Person das Recht hat, mit Stand „erledigt“. Rein – einzeln getestet. */
export function onboardingSteps(
  facts: OnboardingFacts,
  allowed: Record<OnboardingRight, boolean>,
): OnboardingStep[] {
  return STEPS.filter((step) => allowed[step.right]).map((step) => ({
    id: step.id,
    title: step.title,
    hint: step.hint,
    href: step.href,
    done: step.isDone(facts),
  }));
}

/** „Erste Schritte“ für die Dashboard-Karte – `null`, wenn die Person nicht einrichtet oder schon alles erledigt ist. */
export async function getOnboarding(ctx: TenantContext): Promise<OnboardingStep[] | null> {
  if (!can(ctx, "club:update")) return null;
  const [club, departments, members, users, events] = await Promise.all([
    ctx.db.club.findFirstOrThrow({
      select: { logoStorageKey: true, contactEmail: true, street: true, joinToken: true },
    }),
    ctx.db.department.count({ where: { isActive: true } }),
    ctx.db.member.count({ where: { deletedAt: null, archivedAt: null } }),
    ctx.db.clubMembership.count({ where: { status: "ACTIVE" } }),
    ctx.db.event.count({ where: { deletedAt: null } }),
  ]);
  const steps = onboardingSteps(
    {
      logo: club.logoStorageKey !== null,
      contact: Boolean(club.contactEmail && club.street),
      departments,
      members,
      users,
      events,
      joinLink: club.joinToken !== null,
    },
    {
      club: true,
      departments: can(ctx, "departments:manage"),
      members: can(ctx, "members:create"),
      users: can(ctx, "users:invite"),
      events: can(ctx, "events:create"),
      joinLink: scopeOf(ctx, "members:create") === "CLUB",
    },
  );
  return steps.every((step) => step.done) ? null : steps;
}
