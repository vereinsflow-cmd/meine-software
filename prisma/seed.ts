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
import Module, { createRequire } from "node:module";
import type { Prisma } from "../src/generated/prisma/client";
import {
  addBerlinDays,
  berlinWeekday,
  formatCalendarDate,
  parseBerlinDateTime,
  parseCalendarDate,
  toDateInputValue,
} from "../src/lib/dates";
import { TERMS_VERSION } from "../src/lib/legal";
import { hashPassword } from "../src/server/auth/password";
import { prisma } from "../src/server/db/client";
import { isDatabaseUnreachable } from "../src/server/db/unreachable";
import { provisionClub } from "../src/server/platform/provision";
import { saveFile } from "../src/server/storage/files";

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
    setupCompleted: true,
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
  // Rechnungen (offene Zahlungen): eine bald fällige, eine überfällige, eine bezahlte. Die Belege liegen wie echte
  // Uploads im Speicher (STORAGE_DIR), damit „Herunterladen“ funktioniert; erfasst hat sie der Kassenwart.
  // ---------------------------------------------------------------------------------------------
  const receipt = (text: string) =>
    new TextEncoder().encode(
      `%PDF-1.4\n% ${text}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
    );
  const calendarDayIn = (days: number) =>
    parseCalendarDate(toDateInputValue(addBerlinDays(today, days)))!;
  const demoInvoices = [
    { daysAgo: 12, text: "Getränkehandel Sommerfest", cents: 34_950, dueIn: 14, paid: false },
    { daysAgo: 30, text: "Hallenmiete September", cents: 120_000, dueIn: -3, paid: false },
    { daysAgo: 45, text: "Pokale Jugendturnier", cents: 8_990, dueIn: null, paid: true },
  ] as const;
  for (const demo of demoInvoices) {
    const invoiceDate = calendarDayIn(-demo.daysAgo);
    const bytes = receipt(demo.text);
    const stored = await saveFile(club.id, bytes);
    const document = await prisma.document.create({
      data: {
        clubId: club.id,
        name: `Rechnung vom ${formatCalendarDate(invoiceDate)}.pdf`,
        storageKey: stored.storageKey,
        sha256: stored.sha256,
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        category: "Rechnungen",
        access: "BOARD",
        uploadedById: accounts.vorstand!.userId,
        createdAt: at(addBerlinDays(today, -demo.daysAgo), "10:00"),
      },
    });
    await prisma.invoice.create({
      data: {
        clubId: club.id,
        documentId: document.id,
        invoiceDate,
        amountCents: demo.cents,
        dueDate: demo.dueIn === null ? null : calendarDayIn(demo.dueIn),
        status: demo.paid ? "PAID" : "OPEN",
        paidAt: demo.paid ? at(addBerlinDays(today, -40), "18:00") : null,
        paidById: demo.paid ? accounts.vorstand!.userId : null,
        createdById: accounts.vorstand!.userId,
      },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Beiträge: Beitragsordnung des Demovereins (Ehrenmitglieder ohne eigene Beitragsart sind beitragsfrei) und eine
  // Ermäßigung für Claudia als Übungsleiterin.
  // ---------------------------------------------------------------------------------------------
  const feeStart = parseCalendarDate(`${today.getUTCFullYear()}-01-01`)!;
  const feeSpecs = [
    { name: "Jugend bis 17 Jahre", priority: 10, maxAge: 17, statuses: [], cents: 600 },
    { name: "Passiv", priority: 20, maxAge: null, statuses: ["PASSIVE"], cents: 400 },
    { name: "Erwachsene", priority: 30, maxAge: null, statuses: [], cents: 1_200 },
  ] as const;
  for (const spec of feeSpecs) {
    const feeType = await prisma.feeType.create({
      data: {
        clubId: club.id,
        name: spec.name,
        kind: "BASE",
        priority: spec.priority,
        maxAge: spec.maxAge,
        statuses: [...spec.statuses],
      },
    });
    await prisma.feeRate.create({
      data: {
        clubId: club.id,
        feeTypeId: feeType.id,
        validFrom: feeStart,
        amountCents: spec.cents,
        interval: "MONTHLY",
        createdById: accounts.vorstand!.userId,
      },
    });
  }
  await prisma.memberFeeAssignment.create({
    data: {
      clubId: club.id,
      memberId: accounts.abteilung!.memberId,
      kind: "DISCOUNT_PERCENT",
      percentBp: 5_000,
      validFrom: feeStart,
      reason: "Übungsleiterin",
      createdById: accounts.vorstand!.userId,
    },
  });

  // Familie Krüger zahlt den Familienbeitrag statt zweier Grundbeiträge (15 € statt 12 € + 6 €), Sophie per Lastschrift.
  // Für die Koch-Brüder Lukas und Paul zahlt Ben Koch.
  const familyType = await prisma.feeType.create({
    data: { clubId: club.id, name: "Familienbeitrag", kind: "FAMILY", familyMinMembers: 2 },
  });
  await prisma.feeRate.create({
    data: {
      clubId: club.id,
      feeTypeId: familyType.id,
      validFrom: feeStart,
      amountCents: 1_500,
      interval: "MONTHLY",
      createdById: accounts.vorstand!.userId,
    },
  });
  const memberNamed = (firstName: string, lastName: string) =>
    prisma.member.findFirst({
      where: { clubId: club.id, firstName, lastName },
      select: { id: true },
    });
  const sophie = await memberNamed("Sophie", "Krüger");
  const lena = await memberNamed("Lena", "Krüger");
  if (sophie && lena) {
    await prisma.memberFinance.create({
      data: { clubId: club.id, memberId: sophie.id, paymentMethod: "DIRECT_DEBIT" },
    });
    const family = await prisma.feeFamily.create({
      data: {
        clubId: club.id,
        name: "Familie Krüger",
        feeTypeId: familyType.id,
        payerMemberId: sophie.id,
        createdById: accounts.vorstand!.userId,
      },
    });
    await prisma.feeFamilyMember.createMany({
      data: [sophie, lena].map((m) => ({
        clubId: club.id,
        familyId: family.id,
        memberId: m.id,
        validFrom: feeStart,
        createdById: accounts.vorstand!.userId,
      })),
    });
  }
  const benKoch = await memberNamed("Ben", "Koch");
  if (benKoch) {
    await prisma.memberFinance.create({
      data: { clubId: club.id, memberId: benKoch.id, paymentMethod: "DIRECT_DEBIT" },
    });
    for (const first of ["Lukas", "Paul"]) {
      const child = await memberNamed(first, "Koch");
      if (child)
        await prisma.memberFinance.create({
          data: { clubId: club.id, memberId: child.id, payerMemberId: benKoch.id },
        });
    }
  }

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
    setupCompleted: true,
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

  // Finanzen-Demo nur für Entwicklung und Website-Bilder: Die E2E-Tests richten das Kassenbuch selbst über die Oberfläche
  // ein und erwarten dessen Zahlen (tests/setup/rebuild-database.ts setzt NODE_ENV=test).
  if (process.env.NODE_ENV !== "test") {
    await seedFinanceDemo({
      clubId: club.id,
      userId: accounts.vorstand!.userId,
      youthDepartmentId: departments.jugend!.id,
      nextNumber,
    });
  }

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

// ---------------------------------------------------------------------------------------------
// Finanzen-Demo (Entwurf „Spenden-Cockpit“, docs/adr/0013): eingerichtetes Kassenbuch ab 1. Januar und die 23 Spenden von
// 14 Spendern aus dem Bild (4.185,00 €). Alles läuft über die echten Dienste mit Bernd Vorstand (Kassenwart) – Trigger,
// Nummern, Protokoll und Prüfungen greifen wie in der Oberfläche. Die Dienste werden erst hier geladen, damit der Seed der
// Tests sie gar nicht anfasst.
// ---------------------------------------------------------------------------------------------

/** Spender der Demo: Mitglieder (Vorname, Nachname) und andere Spender mit eigener Anschrift. */
const DEMO_MEMBER_DONORS = {
  vogel: ["Karin", "Vogel"],
  krueger: ["Sophie", "Krüger"],
  richter: ["Thomas", "Richter"],
  wolff: ["Marta", "Wolff"],
  becker: ["Jens", "Becker"],
  schmitz: ["Helga", "Schmitz"],
  brandt: ["Ursula", "Brandt"],
  pkoch: ["Paul", "Koch"],
  bkoch: ["Ben", "Koch"],
  hoffmann: ["Dieter", "Hoffmann"],
} as const;

const DEMO_OTHER_DONORS = {
  brinkmann: { kind: "COMPANY", name: "Autohaus Brinkmann GmbH", street: "Industriestraße 4" },
  jansen: { kind: "COMPANY", name: "Getränke Jansen e.K.", street: "Bahnhofstraße 12" },
  stiftung: {
    kind: "ORGANIZATION",
    name: "Sparkassenstiftung Musterstadt",
    street: "Marktplatz 1",
  },
  lange: { kind: "COMPANY", name: "Bäckerei Lange GmbH", street: "Lindenweg 7" },
} as const;

type DemoDonorKey = keyof typeof DEMO_MEMBER_DONORS | keyof typeof DEMO_OTHER_DONORS;

/**
 * Die Spenden des Bildes (Tag im Seed-Jahr „MM-TT“). Ohne `from` = Spendendose. Geld kommt aufs Girokonto, `cash` in die
 * Barkasse (Zahlart dann „bar übergeben“); Zweck Jugend = Abteilung „Jugendarbeit“, Vereinsheim = anderer fester Zweck.
 */
const DEMO_DONATIONS: {
  on: string;
  from?: DemoDonorKey;
  box?: string;
  kind?: "IN_KIND" | "EXPENSE_WAIVER";
  amount: string;
  cash?: boolean;
  purpose?: "jugend" | "vereinsheim";
  wanted?: boolean;
}[] = [
  { on: "01-15", from: "vogel", amount: "50,00" },
  { on: "01-27", from: "krueger", amount: "25,00" },
  { on: "02-12", from: "richter", amount: "50,00" },
  { on: "03-20", from: "wolff", amount: "150,00", purpose: "jugend", wanted: true },
  { on: "04-09", from: "becker", amount: "100,00", wanted: true },
  { on: "04-25", from: "schmitz", amount: "50,00", cash: true },
  { on: "05-06", from: "stiftung", amount: "1.000,00", purpose: "jugend" },
  { on: "05-19", from: "richter", amount: "50,00" },
  { on: "06-03", from: "wolff", amount: "150,00", purpose: "jugend", wanted: true },
  { on: "06-10", from: "brandt", amount: "100,00", purpose: "vereinsheim", wanted: true },
  { on: "06-14", from: "pkoch", kind: "EXPENSE_WAIVER", amount: "240,00" },
  { on: "06-24", from: "richter", amount: "50,00" },
  { on: "07-04", from: "jansen", kind: "IN_KIND", amount: "180,00" },
  { on: "07-05", box: "Spendendose Sommerfest", amount: "62,40", cash: true },
  { on: "07-18", from: "bkoch", amount: "300,00", cash: true, purpose: "jugend" },
  { on: "08-07", from: "lange", amount: "100,00" },
  { on: "08-21", from: "krueger", amount: "60,00" },
  { on: "09-08", from: "vogel", amount: "50,00" },
  { on: "09-16", from: "brinkmann", amount: "750,00", purpose: "vereinsheim" },
  { on: "09-22", from: "brandt", amount: "150,00", wanted: true },
  { on: "09-29", from: "hoffmann", amount: "350,00" },
  { on: "09-30", box: "Spendendose Theke", amount: "47,60", cash: true },
  { on: "10-02", from: "krueger", amount: "120,00" },
];

/**
 * Wie im Server-Teil von Next: „next/navigation“ zeigt im Skript auf die Server-Fassung. Die Dienste importieren über
 * `parseInput` (`server/action.ts`) `unstable_rethrow` von dort; die normale Fassung braucht `React.createContext`, das es
 * unter `--conditions=react-server` nicht gibt.
 */
function preferServerNavigation() {
  const require = createRequire(__filename);
  const target = require.resolve("next/dist/client/components/navigation.react-server");
  const loader = Module as unknown as {
    _resolveFilename: (request: string, ...rest: unknown[]) => string;
  };
  const resolve = loader._resolveFilename;
  loader._resolveFilename = function (request, ...rest) {
    return request === "next/navigation" ? target : resolve.call(this, request, ...rest);
  };
}

async function seedFinanceDemo(options: {
  clubId: string;
  userId: string;
  youthDepartmentId: string;
  nextNumber: () => string;
}) {
  preferServerNavigation();
  const [{ loadTenantContextForUser }, { setupLedger }, donations, { attachDonationNote }] =
    await Promise.all([
      import("../src/server/tenancy/context-core"),
      import("../src/modules/finance/ledger"),
      import("../src/modules/donations/service"),
      import("../src/modules/donations/evidence"),
    ]);
  const ctx = await loadTenantContextForUser(options.userId, options.clubId);
  if (!ctx) throw new Error("Finanzen-Demo: Bernd Vorstand hat keinen Zugang zum Demo-Verein.");

  // Seed-Jahr = Jahr von „heute − 120 Tage“: Im Januar zeigt die Demo noch das volle Vorjahr. Alles relativ dazu – feste
  // Daten liefen ab (der Bescheid gilt nur 5 Jahre, K9). Spenden nach heute fehlen einfach.
  const today = toDateInputValue(new Date());
  const year = Number(toDateInputValue(addBerlinDays(new Date(), -120)).slice(0, 4));
  const on = (monthDay: string) => `${year}-${monthDay}`;

  await setupLedger(ctx, {
    ledgerStartDate: on("01-01"),
    bankName: "Girokonto",
    bankInstitute: "Sparkasse Musterstadt",
    bankOpening: "11.200,00",
    withCash: true,
    cashName: "Barkasse",
    cashOpening: "239,80",
  });
  await donations.updateTaxSettings(ctx, {
    taxOffice: "Musterstadt",
    taxNumber: "12/345/67890",
    exemptionKind: "EXEMPTION_NOTICE",
    exemptionDate: `${year - 2}-03-14`,
    exemptionLastYear: String(year - 4),
    taxPurposes: "des Sports",
    membershipFeesDeductible: false,
  });

  const bank = await ctx.db.financeAccount.findFirstOrThrow({ where: { kind: "BANK" } });
  const cash = await ctx.db.financeAccount.findFirstOrThrow({ where: { kind: "CASH" } });

  // Mitglieder als Spender: vorhandene Demo-Mitglieder nutzen (Sophie Krüger, Ben und Paul Koch), die übrigen anlegen –
  // Dieter Hoffmann bewusst ohne Anschrift („Adresse fehlt“).
  const memberIds = new Map<DemoDonorKey, string>();
  for (const [key, [firstName, lastName]] of Object.entries(DEMO_MEMBER_DONORS)) {
    const existing = await prisma.member.findFirst({
      where: { clubId: options.clubId, firstName, lastName, deletedAt: null, anonymizedAt: null },
      select: { id: true },
    });
    const withAddress = key !== "hoffmann";
    const member =
      existing ??
      (await prisma.member.create({
        data: {
          clubId: options.clubId,
          memberNumber: options.nextNumber(),
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.org`,
          street: withAddress ? `Am Sportplatz ${memberIds.size + 3}` : null,
          postalCode: withAddress ? "12345" : null,
          city: withAddress ? "Musterstadt" : null,
          birthDate: parseCalendarDate(
            `${1958 + memberIds.size * 4}-0${(memberIds.size % 9) + 1}-12`,
          ),
          joinedAt: parseCalendarDate(`${2010 + memberIds.size}-03-01`),
          status: "ACTIVE",
        },
        select: { id: true },
      }));
    memberIds.set(key as DemoDonorKey, member.id);
  }
  const otherIds = new Map<DemoDonorKey, string>();
  for (const [key, donor] of Object.entries(DEMO_OTHER_DONORS)) {
    const { id } = await donations.createDonor(ctx, {
      ...donor,
      postalCode: "12345",
      city: "Musterstadt",
    });
    otherIds.set(key as DemoDonorKey, id);
  }

  let recorded = 0;
  for (const row of DEMO_DONATIONS) {
    const receivedOn = on(row.on);
    if (receivedOn > today) continue;
    const kind = row.kind ?? "MONEY";
    const memberId = row.from ? memberIds.get(row.from) : undefined;
    const { donationId } = await donations.recordDonation(ctx, {
      kind,
      donorMode: row.box ? "ANONYMOUS" : memberId ? "MEMBER" : "DONOR",
      memberId,
      donorId: row.from && !memberId ? otherIds.get(row.from) : undefined,
      anonymousLabel: row.box,
      amount: row.amount,
      receivedOn,
      // Zahlart: Vorgabe aus dem Konto (Girokonto = Überweisung, Barkasse = bar übergeben).
      accountId: kind === "MONEY" ? (row.cash ? cash.id : bank.id) : undefined,
      target:
        row.purpose === "jugend"
          ? `a:${options.youthDepartmentId}`
          : row.purpose === "vereinsheim"
            ? "andere"
            : "frei",
      purposeText: row.purpose === "vereinsheim" ? "Vereinsheim" : undefined,
      receiptWish: row.wanted ? "WANTED" : "AUTO",
      ...(kind === "IN_KIND" && {
        itemDescription:
          "12 Kisten Mineralwasser und Apfelschorle, neu, für die Verpflegung beim Jugendturnier am 05.07.",
        inKindOrigin: "BUSINESS",
        valuationDocs: true,
      }),
      // Verzicht nur auf Fahrten VOR dem Verzicht (April und Mai, nicht Juni – K24); Grundlage Reisekostenordnung.
      ...(kind === "EXPENSE_WAIVER" && {
        activityText: "Fahrten zu Auswärtsspielen der D-Jugend im April und Mai, 800 km × 0,30 €",
        waiverBasis: "STATUTE",
        claimGrantedOn: on("01-01"),
        activityFrom: on("04-01"),
        activityTo: on("05-31"),
        claimDueOn: on("05-31"),
        regularActivity: false,
        claimConfirmed: true,
      }),
    });
    recorded += 1;
    if (kind === "IN_KIND")
      await attachDonationNote(ctx, {
        donationId,
        note: "Lieferschein und Rechnung von Getränke Jansen (Entnahmewert mit Umsatzsteuer) liegen beim Kassenwart.",
      });
    if (kind === "EXPENSE_WAIVER")
      await attachDonationNote(ctx, {
        donationId,
        note: "Fahrtkostenabrechnung (Reisekostenordnung) und unterschriebene Verzichtserklärung liegen beim Kassenwart.",
      });
  }
  console.log(
    `Finanzen-Demo: Kassenbuch ab 01.01.${year}, ${recorded} von ${DEMO_DONATIONS.length} Spenden erfasst.`,
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
