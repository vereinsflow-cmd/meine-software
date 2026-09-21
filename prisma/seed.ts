/**
 * Seed-Daten für die LOKALE ENTWICKLUNG.
 *
 *   npm run db:seed
 *
 * Legt zwei getrennte Demo-Vereine mit Benutzern in allen Rollen an. Das Passwort aller
 * Demo-Benutzer steht in .env (SEED_PASSWORD). Diese Zugänge sind ausschließlich für die
 * Entwicklung gedacht – das Skript verweigert die Ausführung in Produktion.
 */
import "dotenv/config";
import type { Prisma } from "../src/generated/prisma/client";
import {
  addBerlinDays,
  berlinWeekday,
  parseBerlinDateTime,
  parseCalendarDate,
  toDateInputValue,
} from "../src/lib/dates";
import { TERMS_VERSION } from "../src/lib/legal";
import { hashPassword } from "../src/server/auth/password";
import { prisma } from "../src/server/db/client";
import { isDatabaseUnreachable } from "../src/server/db/unreachable";
import { provisionClub } from "../src/server/platform/provision";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "1") {
  throw new Error("Seed-Daten dürfen nicht in Produktion eingespielt werden.");
}

const DEMO_SLUG = "tsv-musterstadt";
const OTHER_SLUG = "anderer-verein";

/** Kleiner, deterministischer Zufallsgenerator – die Demo-Daten sind bei jedem Lauf gleich. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const random = rng(2026);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const between = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;

const at = (day: Date, time: string): Date => {
  const value = parseBerlinDateTime(toDateInputValue(day), time);
  if (!value) throw new Error(`Ungültige Zeit ${time}`);
  return value;
};

async function main() {
  const existing = await prisma.club.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    console.log(
      `Demo-Daten sind bereits vorhanden (Verein "${existing.name}"). Zum Neuaufbau: npm run db:reset`,
    );
    return;
  }

  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD fehlt in der .env");
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const verified = { emailVerifiedAt: now, termsAcceptedAt: now, termsVersion: TERMS_VERSION };

  // ---------------------------------------------------------------------------------------------
  // Plattform: Superadministrator
  // ---------------------------------------------------------------------------------------------
  await prisma.user.create({
    data: {
      email: "superadmin@vereinsflow.local",
      firstName: "Sabine",
      lastName: "Superadmin",
      passwordHash,
      isPlatformAdmin: true,
      ...verified,
    },
  });

  // ---------------------------------------------------------------------------------------------
  // Verein 1: TSV Musterstadt (Hauptdemo)
  // ---------------------------------------------------------------------------------------------
  const { club, roleIds } = await provisionClub({
    name: "TSV Musterstadt 1898 e.V.",
    slug: DEMO_SLUG,
    contactEmail: "info@tsv-musterstadt.example",
  });
  await prisma.club.update({
    where: { id: club.id },
    data: {
      street: "Vereinsweg 1",
      postalCode: "12345",
      city: "Musterstadt",
      website: "https://tsv-musterstadt.example",
      // Ansprechpartner unter „Hilfe & Support“
      settings: {
        support: {
          contacts: [
            {
              name: "Anna Admin",
              role: "Zugang, Passwort und technische Fragen",
              email: "admin@demo-verein.local",
              phone: null,
            },
            {
              name: "Bernd Vorstand",
              role: "Veranstaltungen und Helferplanung",
              email: "vorstand@demo-verein.local",
              phone: "01234 567890",
            },
          ],
        },
      },
    },
  });

  const departments = Object.fromEntries(
    await Promise.all(
      [
        ["fussball", "Fußball", "Herren, Damen und Jugend", "#16a34a"],
        ["handball", "Handball", "Männer- und Frauenmannschaften", "#dc2626"],
        ["tischtennis", "Tischtennis", "Training und Ligabetrieb", "#2563eb"],
        ["jugend", "Jugendarbeit", "Jugendtreff und Ferienfreizeiten", "#d97706"],
      ].map(async ([key, name, description, color]) => [
        key,
        await prisma.department.create({
          data: { clubId: club.id, name: name!, description, color },
        }),
      ]),
    ),
  ) as Record<string, { id: string }>;

  const accountSpecs = [
    {
      key: "admin",
      first: "Anna",
      last: "Admin",
      email: "admin@demo-verein.local",
      role: "CLUB_ADMIN",
      func: "1. Vorsitzende",
    },
    {
      key: "vorstand",
      first: "Bernd",
      last: "Vorstand",
      email: "vorstand@demo-verein.local",
      role: "BOARD",
      func: "Kassenwart",
    },
    {
      key: "abteilung",
      first: "Claudia",
      last: "Abteilungsleiterin",
      email: "abteilung@demo-verein.local",
      role: "DEPARTMENT_LEAD",
      func: "Abteilungsleiterin Fußball",
    },
    {
      key: "helfer",
      first: "Hans",
      last: "Helfer",
      email: "helfer@demo-verein.local",
      role: "HELPER",
      func: null,
    },
    {
      key: "mitglied",
      first: "Maria",
      last: "Mitglied",
      email: "mitglied@demo-verein.local",
      role: "MEMBER",
      func: null,
    },
    {
      key: "mehrfach",
      first: "Michael",
      last: "Mehrfach",
      email: "mehrfach@demo-verein.local",
      role: "MEMBER",
      func: null,
    },
  ] as const;

  const accounts: Record<string, { userId: string; memberId: string }> = {};
  let memberNumber = 1;
  const nextNumber = () => `M-${String(memberNumber++).padStart(4, "0")}`;

  for (const spec of accountSpecs) {
    const user = await prisma.user.create({
      data: {
        email: spec.email,
        firstName: spec.first,
        lastName: spec.last,
        passwordHash,
        ...verified,
      },
    });
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: user.id, roleId: roleIds[spec.role]! },
    });
    const member = await prisma.member.create({
      data: {
        clubId: club.id,
        userId: user.id,
        memberNumber: nextNumber(),
        firstName: spec.first,
        lastName: spec.last,
        email: spec.email,
        phone: `0170 ${between(1000000, 9999999)}`,
        street: `Musterstraße ${between(1, 80)}`,
        postalCode: "12345",
        city: "Musterstadt",
        birthDate: parseCalendarDate(
          `${between(1965, 1995)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
        ),
        joinedAt: parseCalendarDate(`${between(2005, 2020)}-0${between(1, 9)}-01`),
        clubFunction: spec.func,
        status: "ACTIVE",
      },
    });
    accounts[spec.key] = { userId: user.id, memberId: member.id };
  }

  // Abteilungsleiterin leitet Fußball; weitere Zuordnungen
  await prisma.memberDepartment.createMany({
    data: [
      {
        clubId: club.id,
        memberId: accounts.abteilung!.memberId,
        departmentId: departments.fussball!.id,
        isLeader: true,
      },
      {
        clubId: club.id,
        memberId: accounts.helfer!.memberId,
        departmentId: departments.fussball!.id,
      },
      {
        clubId: club.id,
        memberId: accounts.mitglied!.memberId,
        departmentId: departments.tischtennis!.id,
      },
      {
        clubId: club.id,
        memberId: accounts.vorstand!.memberId,
        departmentId: departments.handball!.id,
        isLeader: true,
      },
    ],
  });

  // Weitere Mitglieder ohne Benutzerkonto (z. B. aus einem CSV-Import)
  const firstNames = [
    "Lukas",
    "Sophie",
    "Jonas",
    "Lena",
    "Felix",
    "Laura",
    "Paul",
    "Emma",
    "Tim",
    "Mia",
    "Ben",
    "Hannah",
    "Leon",
    "Clara",
    "Elias",
    "Nina",
    "Noah",
    "Marie",
  ];
  const lastNames = [
    "Schneider",
    "Wagner",
    "Becker",
    "Hoffmann",
    "Schäfer",
    "Koch",
    "Richter",
    "Klein",
    "Wolf",
    "Schröder",
    "Neumann",
    "Schwarz",
    "Zimmermann",
    "Braun",
    "Krüger",
    "Hartmann",
  ];
  const deptKeys = ["fussball", "handball", "tischtennis", "jugend"] as const;
  const extraMembers: { id: string; deptKey: (typeof deptKeys)[number] }[] = [];

  for (let i = 0; i < 18; i++) {
    const first = firstNames[i % firstNames.length]!;
    const last = pick(lastNames);
    const youth = i % 4 === 3;
    const status =
      i === 5 || i === 11 ? "PASSIVE" : i === 7 ? "HONORARY" : i === 13 ? "LEFT" : "ACTIVE";
    const deptKey = youth ? "jugend" : deptKeys[i % 3]!;
    const birthYear = youth ? between(2009, 2014) : between(1955, 2000);
    const member = await prisma.member.create({
      data: {
        clubId: club.id,
        memberNumber: nextNumber(),
        firstName: first,
        lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")}@example.org`,
        phone: i % 3 === 0 ? null : `0151 ${between(1000000, 9999999)}`,
        street: `Beispielweg ${between(1, 60)}`,
        postalCode: "12345",
        city: "Musterstadt",
        birthDate: parseCalendarDate(
          `${birthYear}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
        ),
        joinedAt: parseCalendarDate(`${between(2008, 2024)}-0${between(1, 9)}-15`),
        leftAt: status === "LEFT" ? parseCalendarDate("2025-12-31") : null,
        status,
        internalNotes: i === 2 ? "Kann samstags nur nachmittags helfen." : null,
      },
    });
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: member.id, departmentId: departments[deptKey]!.id },
    });
    extraMembers.push({ id: member.id, deptKey });
    // Einwilligung zur Fotoveröffentlichung: bei einigen erteilt, bei einem widerrufen
    if (i % 3 === 0) {
      await prisma.consent.create({
        data: {
          clubId: club.id,
          memberId: member.id,
          type: "PHOTO_PUBLICATION",
          granted: true,
          textVersion: "2026-01",
          source: "paper",
        },
      });
    }
    if (i === 6) {
      await prisma.consent.create({
        data: {
          clubId: club.id,
          memberId: member.id,
          type: "NEWSLETTER",
          granted: true,
          source: "app",
        },
      });
      await prisma.consent.create({
        data: {
          clubId: club.id,
          memberId: member.id,
          type: "NEWSLETTER",
          granted: false,
          source: "app",
        },
      });
    }
  }

  // Gruppen innerhalb einer Abteilung
  const herren = await prisma.group.create({
    data: { clubId: club.id, departmentId: departments.fussball!.id, name: "1. Herrenmannschaft" },
  });
  const festausschuss = await prisma.group.create({
    data: {
      clubId: club.id,
      name: "Festausschuss",
      description: "Plant Sommerfest und Weihnachtsfeier",
    },
  });
  await prisma.groupMember.createMany({
    data: [
      { clubId: club.id, groupId: herren.id, memberId: accounts.helfer!.memberId },
      {
        clubId: club.id,
        groupId: festausschuss.id,
        memberId: accounts.vorstand!.memberId,
        isLead: true,
      },
      { clubId: club.id, groupId: festausschuss.id, memberId: accounts.admin!.memberId },
    ],
  });

  // ---------------------------------------------------------------------------------------------
  // Veranstaltungen
  // ---------------------------------------------------------------------------------------------
  const today = new Date();
  const daysUntilSaturday = (5 - berlinWeekday(today) + 7) % 7;
  const nextSaturday = addBerlinDays(today, daysUntilSaturday === 0 ? 7 : daysUntilSaturday);
  const festDay = addBerlinDays(nextSaturday, 7); // Sommerfest: in ein bis zwei Wochen → Warnungen bei Lücken sichtbar

  const sommerfest = await prisma.event.create({
    data: {
      clubId: club.id,
      title: "Sommerfest 2026",
      description:
        "Unser jährliches Vereinsfest mit Grillstand, Kuchenbuffet, Hüpfburg und Musik. Alle Mitglieder mit Familie sind herzlich eingeladen!",
      type: "EVENT",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      startsAt: at(festDay, "14:00"),
      endsAt: at(festDay, "22:00"),
      locationName: "Sportplatz am Vereinsheim",
      address: "Vereinsweg 1, 12345 Musterstadt",
      contactMemberId: accounts.vorstand!.memberId,
      targetAudience: "Mitglieder mit Familie und Freunde des Vereins",
      maxParticipants: 120,
      registrationRequired: true,
      registrationDeadline: at(addBerlinDays(festDay, -3), "23:59"),
      waitlistEnabled: true,
      internalNotes:
        "Ordnungsamt: Genehmigung bis 14 Tage vor dem Fest einreichen. Strom-Verteiler beim Hausmeister abholen.",
      publishedAt: now,
      createdById: accounts.admin!.userId,
    },
  });

  const shiftDefs = [
    {
      title: "Aufbau",
      taskName: "Zelte, Tische und Bänke aufbauen",
      from: "09:00",
      to: "11:00",
      required: 5,
      point: "Vereinsheim, Lager",
      minAge: 16,
    },
    {
      title: "Getränkestand",
      taskName: "Getränke ausschenken und kassieren",
      from: "12:00",
      to: "15:00",
      required: 4,
      point: "Getränkestand am Eingang",
      minAge: 16,
    },
    {
      title: "Grillstand",
      taskName: "Bratwurst und Steaks grillen",
      from: "12:00",
      to: "16:00",
      required: 3,
      point: "Grillzelt",
      minAge: 18,
    },
    {
      title: "Kuchenbuffet",
      taskName: "Kuchen annehmen und verkaufen",
      from: "13:00",
      to: "17:00",
      required: 3,
      point: "Kuchenzelt",
      minAge: null,
    },
    {
      title: "Abbau",
      taskName: "Alles abbauen und aufräumen",
      from: "18:00",
      to: "20:00",
      required: 6,
      point: "Vereinsheim, Lager",
      minAge: 16,
    },
  ];
  const shifts: Record<string, { id: string }> = {};
  for (const def of shiftDefs) {
    shifts[def.title] = await prisma.eventShift.create({
      data: {
        clubId: club.id,
        eventId: sommerfest.id,
        title: def.title,
        taskName: def.taskName,
        startsAt: at(festDay, def.from),
        endsAt: at(festDay, def.to),
        meetingPoint: def.point,
        requiredCount: def.required,
        minAge: def.minAge,
        responsibleMemberId:
          def.title === "Aufbau" ? accounts.abteilung!.memberId : accounts.vorstand!.memberId,
        description: `Schicht „${def.title}“ beim Sommerfest.`,
      },
    });
  }

  const helpers = [
    accounts.helfer!.memberId,
    accounts.mitglied!.memberId,
    ...extraMembers.filter((m) => m.deptKey !== "jugend").map((m) => m.id),
  ];
  const assign = async (shiftTitle: string, memberIds: string[]) => {
    for (const memberId of memberIds) {
      await prisma.shiftAssignment.create({
        data: {
          clubId: club.id,
          shiftId: shifts[shiftTitle]!.id,
          memberId,
          assignedByUserId: accounts.admin!.userId,
        },
      });
    }
  };
  await assign("Aufbau", [accounts.helfer!.memberId, ...helpers.slice(2, 6)]); // 5 von 5: vollständig besetzt
  await assign("Getränkestand", [accounts.helfer!.memberId, helpers[6]!]); // 2 von 4: teilweise besetzt
  await assign("Kuchenbuffet", [accounts.mitglied!.memberId]); // 1 von 3
  await assign("Abbau", [helpers[7]!]); // 1 von 6: kritisch
  // Grillstand bleibt bewusst leer (0 von 3)

  // Teilnehmer (Zu-/Absagen)
  const attendees = [
    accounts.admin!.memberId,
    accounts.vorstand!.memberId,
    accounts.abteilung!.memberId,
    accounts.helfer!.memberId,
    accounts.mitglied!.memberId,
    ...extraMembers.slice(0, 8).map((m) => m.id),
  ];
  await prisma.eventParticipant.createMany({
    data: attendees.map((memberId, index) => ({
      clubId: club.id,
      eventId: sommerfest.id,
      memberId,
      status: index === 6 ? ("DECLINED" as const) : ("ACCEPTED" as const),
    })),
  });

  // Weitere Veranstaltungen für den Kalender
  await prisma.event.create({
    data: {
      clubId: club.id,
      title: "Vorstandssitzung",
      type: "MEETING",
      status: "PUBLISHED",
      visibility: "INTERNAL",
      startsAt: at(addBerlinDays(today, 5), "19:30"),
      endsAt: at(addBerlinDays(today, 5), "21:30"),
      locationName: "Vereinsheim, Besprechungsraum",
      internalNotes: "Tagesordnung: Sommerfest, Haushalt 2027, Trainerhonorare.",
      publishedAt: now,
    },
  });
  await prisma.event
    .create({
      data: {
        clubId: club.id,
        title: "Arbeitseinsatz Vereinsheim",
        description: "Gemeinsames Streichen und Aufräumen. Für Verpflegung ist gesorgt.",
        type: "WORK_ASSIGNMENT",
        status: "PUBLISHED",
        visibility: "INTERNAL",
        startsAt: at(nextSaturday, "09:00"),
        endsAt: at(nextSaturday, "13:00"),
        locationName: "Vereinsheim",
        maxParticipants: 20,
        registrationRequired: true,
        publishedAt: now,
      },
    })
    .then(async (event) => {
      await prisma.eventShift.create({
        data: {
          clubId: club.id,
          eventId: event.id,
          title: "Malerarbeiten",
          startsAt: at(nextSaturday, "09:00"),
          endsAt: at(nextSaturday, "13:00"),
          requiredCount: 4,
          meetingPoint: "Haupteingang",
        },
      });
    });
  await prisma.event.create({
    data: {
      clubId: club.id,
      title: "Handball-Turnier der Jugend",
      description: "Regionales Jugendturnier – Planung läuft noch.",
      type: "COMPETITION",
      status: "DRAFT",
      visibility: "INTERNAL",
      startsAt: at(addBerlinDays(today, 40), "10:00"),
      endsAt: at(addBerlinDays(today, 40), "17:00"),
      departmentId: departments.handball!.id,
      locationName: "Sporthalle Nord",
    },
  });

  // Trainingsserie Fußball (dienstags 18:30) – als einzelne Termine mit gemeinsamer Serien-ID
  const seriesId = crypto.randomUUID();
  const daysUntilTuesday = (1 - berlinWeekday(today) + 7) % 7 || 7;
  for (let week = 0; week < 6; week++) {
    const day = addBerlinDays(today, daysUntilTuesday + week * 7);
    await prisma.event.create({
      data: {
        clubId: club.id,
        seriesId,
        title: "Fußball-Training Herren",
        type: "TRAINING",
        status: "PUBLISHED",
        visibility: "INTERNAL",
        startsAt: at(day, "18:30"),
        endsAt: at(day, "20:00"),
        departmentId: departments.fussball!.id,
        locationName: "Sportplatz",
        publishedAt: now,
      },
    });
  }

  // Abgeschlossene Veranstaltung mit dokumentierten Helferstunden
  const past = addBerlinDays(today, -30);
  const jhv = await prisma.event.create({
    data: {
      clubId: club.id,
      title: "Jahreshauptversammlung 2026",
      type: "MEETING",
      status: "COMPLETED",
      visibility: "INTERNAL",
      startsAt: at(past, "18:00"),
      endsAt: at(past, "21:00"),
      locationName: "Vereinsheim",
      publishedAt: addBerlinDays(today, -60),
      completedAt: undefined,
    } as Prisma.EventUncheckedCreateInput,
  });
  const jhvShift = await prisma.eventShift.create({
    data: {
      clubId: club.id,
      eventId: jhv.id,
      title: "Bewirtung",
      startsAt: at(past, "17:00"),
      endsAt: at(past, "21:30"),
      requiredCount: 2,
      status: "CLOSED",
    },
  });
  for (const memberId of [accounts.helfer!.memberId, accounts.mitglied!.memberId]) {
    await prisma.shiftAssignment.create({
      data: {
        clubId: club.id,
        shiftId: jhvShift.id,
        memberId,
        workedMinutes: 270,
        hoursApprovedAt: now,
        hoursApprovedById: accounts.admin!.userId,
      },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Aufgaben und Checkliste (Sommerfest)
  // ---------------------------------------------------------------------------------------------
  const taskDefs: Prisma.TaskUncheckedCreateInput[] = [
    {
      clubId: club.id,
      eventId: sommerfest.id,
      title: "Genehmigung beim Ordnungsamt einreichen",
      description: "Formular ausfüllen, Lageplan und Versicherungsnachweis beifügen.",
      assigneeMemberId: accounts.vorstand!.memberId,
      dueDate: parseCalendarDate(toDateInputValue(addBerlinDays(today, 3))),
      status: "IN_PROGRESS",
      priority: "HIGH",
    },
    {
      clubId: club.id,
      eventId: sommerfest.id,
      title: "Getränke bestellen",
      description: "Bier, Softdrinks und Wasser beim Getränkehandel bestellen.",
      assigneeMemberId: accounts.abteilung!.memberId,
      dueDate: parseCalendarDate(toDateInputValue(addBerlinDays(today, 5))),
      status: "OPEN",
      priority: "URGENT",
    },
    {
      clubId: club.id,
      eventId: sommerfest.id,
      title: "Bierzeltgarnituren mieten",
      assigneeMemberId: accounts.admin!.memberId,
      status: "BLOCKED",
      priority: "NORMAL",
      notes: "Wartet auf Rückmeldung des Verleihs (Preisanfrage läuft).",
    },
    {
      clubId: club.id,
      eventId: sommerfest.id,
      title: "Plakate drucken und aufhängen",
      assigneeMemberId: accounts.helfer!.memberId,
      dueDate: parseCalendarDate(toDateInputValue(addBerlinDays(today, -2))),
      status: "DONE",
      priority: "LOW",
      completedAt: now,
    },
    {
      clubId: club.id,
      eventId: sommerfest.id,
      title: "Helfer einteilen",
      description: "Freie Schichten besetzen, ggf. Mitglieder direkt ansprechen.",
      assigneeMemberId: accounts.admin!.memberId,
      dueDate: parseCalendarDate(toDateInputValue(addBerlinDays(today, 7))),
      status: "OPEN",
      priority: "HIGH",
    },
    {
      clubId: club.id,
      title: "Mitgliedsbeiträge für 2027 planen",
      assigneeMemberId: accounts.vorstand!.memberId,
      status: "OPEN",
      priority: "NORMAL",
    },
  ];
  await prisma.task.createMany({
    data: taskDefs.map((task) => ({ ...task, createdById: accounts.admin!.userId })),
  });

  const checklist = await prisma.checklist.create({
    data: { clubId: club.id, eventId: sommerfest.id, title: "Vorbereitung Sommerfest" },
  });
  const items = [
    "Material vorbereiten",
    "Genehmigungen prüfen",
    "Helfer einteilen",
    "Getränke bestellen",
    "Veranstaltungsort vorbereiten",
    "Abrechnung durchführen",
  ];
  await prisma.checklistItem.createMany({
    data: items.map((text, position) => ({
      clubId: club.id,
      checklistId: checklist.id,
      text,
      position,
      isDone: position === 1,
      doneAt: position === 1 ? now : null,
    })),
  });

  // ---------------------------------------------------------------------------------------------
  // Nachrichten und Benachrichtigungen
  // ---------------------------------------------------------------------------------------------
  const welcome = await prisma.message.create({
    data: {
      clubId: club.id,
      authorUserId: accounts.admin!.userId,
      subject: "Willkommen bei VereinsFlow!",
      body: "Liebe Mitglieder,\n\nab sofort organisieren wir Veranstaltungen und Helferschichten mit VereinsFlow. Bitte tragt euch für das Sommerfest in freie Schichten ein.\n\nViele Grüße\nAnna",
      audience: "ALL_MEMBERS",
      isAnnouncement: true,
      sendInApp: true,
      status: "SENT",
      sentAt: addBerlinDays(today, -1),
      recipientCount: accountSpecs.length - 1, // alle außer der Absenderin
    },
  });
  await prisma.messageRecipient.createMany({
    data: accountSpecs
      .filter((spec) => spec.key !== "admin")
      .map((spec) => ({
        clubId: club.id,
        messageId: welcome.id,
        memberId: accounts[spec.key]!.memberId,
        userId: accounts[spec.key]!.userId,
        readAt: spec.key === "helfer" ? now : null,
      })),
  });
  await prisma.message.create({
    data: {
      clubId: club.id,
      authorUserId: accounts.admin!.userId,
      subject: "Erinnerung: Helfer für das Sommerfest gesucht",
      body: "Für Grillstand, Kuchenbuffet und Abbau fehlen noch Helfer. Bitte tragt euch ein!",
      audience: "ALL_MEMBERS",
      sendEmail: true,
      status: "DRAFT",
    },
  });

  await prisma.supportTicket.create({
    data: {
      clubId: club.id,
      createdById: accounts.mitglied!.userId,
      category: "QUESTION",
      subject: "Wie ändere ich meine E-Mail-Adresse?",
      description:
        "Meine Adresse hat sich geändert. Kann ich sie selbst umstellen oder muss das der Verein machen?",
      pagePath: "/profil",
      userAgent: "Edge auf Windows",
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        clubId: club.id,
        userId: accounts.helfer!.userId,
        type: "SHIFT_ASSIGNED",
        title: "Du wurdest für „Aufbau“ eingeteilt",
        body: "Sommerfest 2026 – Aufbau, 09:00–11:00 Uhr",
        linkUrl: `/veranstaltungen/${sommerfest.id}`,
      },
      {
        clubId: club.id,
        userId: accounts.helfer!.userId,
        type: "MESSAGE",
        title: "Ankündigung: Willkommen bei VereinsFlow!",
        linkUrl: `/nachrichten/${welcome.id}`,
        readAt: now,
      },
      {
        clubId: club.id,
        userId: accounts.mitglied!.userId,
        type: "EVENT_PUBLISHED",
        title: "Neue Veranstaltung: Sommerfest 2026",
        linkUrl: `/veranstaltungen/${sommerfest.id}`,
      },
      {
        clubId: club.id,
        userId: accounts.admin!.userId,
        type: "SYSTEM",
        title: "Freie Helferschichten beim Sommerfest",
        body: "Grillstand und Abbau sind noch unbesetzt.",
        linkUrl: `/helferplanung`,
      },
      {
        clubId: club.id,
        userId: accounts.abteilung!.userId,
        type: "TASK_ASSIGNED",
        title: "Neue Aufgabe: Getränke bestellen",
        linkUrl: "/aufgaben",
      },
    ],
  });

  // ---------------------------------------------------------------------------------------------
  // Verein 2: zeigt die Mandantentrennung (eigene Daten, kein Zugriff auf Verein 1)
  // ---------------------------------------------------------------------------------------------
  const other = await provisionClub({
    name: "Anderer Verein e.V.",
    slug: OTHER_SLUG,
    contactEmail: "kontakt@anderer-verein.example",
  });
  const otherAdmin = await prisma.user.create({
    data: {
      email: "admin@anderer-verein.local",
      firstName: "Otto",
      lastName: "Anders",
      passwordHash,
      ...verified,
    },
  });
  await prisma.clubMembership.create({
    data: { clubId: other.club.id, userId: otherAdmin.id, roleId: other.roleIds.CLUB_ADMIN! },
  });
  await prisma.member.create({
    data: {
      clubId: other.club.id,
      userId: otherAdmin.id,
      memberNumber: "A-0001",
      firstName: "Otto",
      lastName: "Anders",
      email: otherAdmin.email,
      clubFunction: "Vorsitzender",
    },
  });
  for (const [first, last] of [
    ["Petra", "Privat"],
    ["Quirin", "Quelle"],
    ["Rita", "Rausch"],
  ]) {
    await prisma.member.create({
      data: {
        clubId: other.club.id,
        firstName: first!,
        lastName: last!,
        email: `${first!.toLowerCase()}@anderer-verein.example`,
      },
    });
  }
  await prisma.event.create({
    data: {
      clubId: other.club.id,
      title: "Vereinsabend (Anderer Verein)",
      startsAt: at(addBerlinDays(today, 9), "19:00"),
      endsAt: at(addBerlinDays(today, 9), "22:00"),
      status: "PUBLISHED",
      publishedAt: now,
    },
  });

  // "Michael Mehrfach" ist in BEIDEN Vereinen Mitglied (Vereinswechsel-Demo)
  const multi = await prisma.user.findUniqueOrThrow({
    where: { email: "mehrfach@demo-verein.local" },
  });
  await prisma.clubMembership.create({
    data: { clubId: other.club.id, userId: multi.id, roleId: other.roleIds.MEMBER! },
  });
  await prisma.member.create({
    data: {
      clubId: other.club.id,
      userId: multi.id,
      memberNumber: "A-0002",
      firstName: "Michael",
      lastName: "Mehrfach",
      email: multi.email,
    },
  });

  await prisma.auditLog.create({
    data: {
      clubId: club.id,
      actorType: "SYSTEM",
      action: "seed.completed",
      entityType: "Club",
      entityId: club.id,
      summary: "Demo-Daten eingespielt",
    },
  });

  console.log("\nDemo-Daten wurden angelegt.\n");
  console.log(
    "Testzugänge (NUR lokale Entwicklung) – Passwort für alle: siehe SEED_PASSWORD in .env",
  );
  console.log("  superadmin@vereinsflow.local   Superadministrator (Plattform)");
  console.log("  admin@demo-verein.local        Vereinsadministrator (TSV Musterstadt)");
  console.log("  vorstand@demo-verein.local     Vorstandsmitglied");
  console.log("  abteilung@demo-verein.local    Abteilungsleiterin Fußball");
  console.log("  helfer@demo-verein.local       Helfer");
  console.log("  mitglied@demo-verein.local     Mitglied");
  console.log("  mehrfach@demo-verein.local     Mitglied in zwei Vereinen");
  console.log(
    "  admin@anderer-verein.local     Administrator des zweiten Vereins (Mandantentrennung)\n",
  );
}

main()
  .catch((error) => {
    if (isDatabaseUnreachable(error)) {
      console.error(
        "\n✘ Die Datenbank ist nicht erreichbar – sie läuft vermutlich nicht.\n\n" +
          "  Am einfachsten alles auf einmal starten:   npm run dev:all   (unter Windows: Start-VereinsFlow.cmd)\n" +
          "  Oder die Datenbank einzeln starten:        npm run db:embedded   (Fenster offen lassen)\n" +
          "                                             docker compose up -d  (mit Docker)\n" +
          "  Danach diesen Befehl wiederholen. Prüfe außerdem DATABASE_URL in der Datei .env.\n",
      );
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
