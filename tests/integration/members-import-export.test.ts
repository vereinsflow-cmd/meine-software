import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { exportMembersCsv } from "@/modules/members/export";
import { executeMemberImport, previewMemberImport } from "@/modules/members/import";
import { memberFormSchema } from "@/modules/members/schemas";
import { archiveMember, createMember, deleteMember } from "@/modules/members/service";
import { addUserToClub, contextFor, createClub, createDepartment } from "../helpers/factories";

async function setup() {
  const club = await createClub("Importverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const helper = await addUserToClub(club, "HELPER");
  return {
    club,
    fussball,
    handball,
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
    },
  };
}

const CSV = [
  "Mitgliedsnummer;Vorname;Nachname;E-Mail;Telefon;Geburtsdatum;Eintritt;Status;Abteilungen;Bemerkung;Unbekannt",
  "M-9001;Anna;Adler;anna@example.org;0171 111;12.03.1990;01.01.2020;aktiv;Fußball;Torwart;x",
  "M-9002;Bernd;Bauer;;;1985-07-01;;passiv;Fußball|Handball;;x",
  "M-9003;Clara;Conrad;clara@example.org;;;;Ehrenmitglied;;;x",
  ";Dieter;Dietz;;;;;;;;x",
].join("\n");

describe("CSV-Import", () => {
  it("Vorschau erkennt deutsche Spaltennamen, Datumsformate und Status, ohne etwas zu speichern", async () => {
    const { ctx } = await setup();
    const preview = await previewMemberImport(ctx.board, CSV);

    expect(preview.counts).toEqual({ ok: 4, duplicate: 0, error: 0 });
    expect(preview.recognizedColumns).toEqual(
      expect.arrayContaining([
        "memberNumber",
        "firstName",
        "lastName",
        "email",
        "phone",
        "birthDate",
        "joinedAt",
        "status",
        "departments",
        "internalNotes",
      ]),
    );
    expect(preview.ignoredColumns).toEqual(["Unbekannt"]);
    expect(
      await prisma.member.count({ where: { clubId: ctx.board.clubId, firstName: "Anna" } }),
    ).toBe(0);
  });

  it("importiert gültige Zeilen samt Abteilungen und protokolliert den Import", async () => {
    const { ctx } = await setup();
    const result = await executeMemberImport(ctx.board, CSV);
    expect(result).toEqual({ created: 4, skipped: 0, failed: 0 });

    const anna = await prisma.member.findFirstOrThrow({
      where: { clubId: ctx.board.clubId, memberNumber: "M-9001" },
      include: { departments: { include: { department: true } } },
    });
    expect(anna).toMatchObject({
      firstName: "Anna",
      lastName: "Adler",
      email: "anna@example.org",
      status: "ACTIVE",
      internalNotes: "Torwart",
    });
    expect(anna.birthDate?.toISOString().slice(0, 10)).toBe("1990-03-12");
    expect(anna.joinedAt?.toISOString().slice(0, 10)).toBe("2020-01-01");
    expect(anna.departments.map((d) => d.department.name)).toEqual(["Fußball"]);

    const bernd = await prisma.member.findFirstOrThrow({
      where: { clubId: ctx.board.clubId, memberNumber: "M-9002" },
      include: { departments: { include: { department: true } } },
    });
    expect(bernd.status).toBe("PASSIVE");
    expect(bernd.departments.map((d) => d.department.name).sort()).toEqual(["Fußball", "Handball"]);
    expect(
      (
        await prisma.member.findFirstOrThrow({
          where: { memberNumber: "M-9003", clubId: ctx.board.clubId },
        })
      ).status,
    ).toBe("HONORARY");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: ctx.board.clubId, action: "members.imported" },
    });
    expect(audit.summary).toContain("4 Mitglieder");
    expect(JSON.stringify(audit.changes)).not.toContain("anna@example.org"); // keine personenbezogenen Daten im Protokoll
  });

  it("ist wiederholbar: Ein zweiter Import derselben Datei legt nichts doppelt an", async () => {
    const { ctx } = await setup();
    await executeMemberImport(ctx.board, CSV);
    const second = await executeMemberImport(ctx.board, CSV);
    expect(second).toEqual({ created: 0, skipped: 4, failed: 0 });
    expect(
      await prisma.member.count({
        where: { clubId: ctx.board.clubId, memberNumber: { in: ["M-9001", "M-9002", "M-9003"] } },
      }),
    ).toBe(3);
  });

  it("meldet Fehler zeilenweise und importiert trotzdem die gültigen Zeilen", async () => {
    const { ctx } = await setup();
    const csv = [
      "Vorname;Nachname;E-Mail;Geburtsdatum;Status;Abteilung",
      "Gültig;Person;gueltig@example.org;01.02.2000;aktiv;Fußball",
      "Kaputte;Mail;keine-mail;;;",
      "Falsches;Datum;;31.02.2000;;",
      "Neuer;Status;;;Zauberer;",
      "Fremde;Abteilung;;;;Quidditch",
      ";OhneVorname;;;;",
    ].join("\n");

    const preview = await previewMemberImport(ctx.board, csv);
    expect(preview.counts).toEqual({ ok: 1, duplicate: 0, error: 5 });
    const byLabel = Object.fromEntries(preview.rows.map((r) => [r.label, r]));
    expect(byLabel["Kaputte Mail"]?.messages.join(" ")).toContain("E-Mail");
    expect(byLabel["Falsches Datum"]?.messages.join(" ")).toContain("Datum");
    expect(byLabel["Neuer Status"]?.messages.join(" ")).toContain("Unbekannter Status");
    expect(byLabel["Fremde Abteilung"]?.messages.join(" ")).toContain("Quidditch");
    expect(preview.rows.find((r) => r.line === 7)?.status).toBe("error");

    const result = await executeMemberImport(ctx.board, csv);
    expect(result).toEqual({ created: 1, skipped: 0, failed: 5 });
  });

  it("erkennt Duplikate im Bestand und innerhalb der Datei", async () => {
    const { ctx } = await setup();
    await createMember(
      ctx.admin,
      memberFormSchema.parse({
        firstName: "Doppelt",
        lastName: "Vorhanden",
        status: "ACTIVE",
        departmentIds: [],
        leaderDepartmentIds: [],
      }),
    );
    const csv = ["Vorname;Nachname", "Doppelt;Vorhanden", "Neu;Person", "neu;PERSON"].join("\n");
    const preview = await previewMemberImport(ctx.board, csv);
    expect(preview.rows.map((r) => r.status)).toEqual(["duplicate", "ok", "duplicate"]);
  });

  it("erkennt Mitgliedsnummern von Mitgliedern im Papierkorb als vergeben, statt den ganzen Import abzubrechen", async () => {
    const { ctx } = await setup();
    const { id } = await createMember(
      ctx.admin,
      memberFormSchema.parse({
        memberNumber: "M-0042",
        firstName: "Paula",
        lastName: "Papierkorb",
        status: "ACTIVE",
        departmentIds: [],
        leaderDepartmentIds: [],
      }),
    );
    await archiveMember(ctx.admin, id);
    await deleteMember(ctx.admin, id);

    const csv = [
      "Mitgliedsnummer;Vorname;Nachname",
      "M-0042;Neue;Person",
      "M-0043;Gültige;Zeile",
    ].join("\n");
    const preview = await previewMemberImport(ctx.board, csv);
    expect(preview.rows.map((r) => r.status)).toEqual(["duplicate", "ok"]);
    expect(preview.rows[0]!.messages.join(" ")).toContain("Papierkorb");

    expect(await executeMemberImport(ctx.board, csv)).toEqual({
      created: 1,
      skipped: 1,
      failed: 0,
    });
    expect(
      await prisma.member.count({ where: { clubId: ctx.board.clubId, memberNumber: "M-0043" } }),
    ).toBe(1);
  });

  it("mehrere Spalten für dasselbe Feld: Eine leere Zelle überschreibt den Wert einer anderen Spalte nicht", async () => {
    const { ctx } = await setup();
    const csv = [
      "Vorname;Nachname;Telefon;Handy;Bemerkung;Notizen",
      "Anna;Adler;0711 123456;;Torwart;",
      "Bernd;Bauer;;0171 2345678;;Kapitän",
    ].join("\n");
    expect(await executeMemberImport(ctx.board, csv)).toEqual({
      created: 2,
      skipped: 0,
      failed: 0,
    });
    const rows = await prisma.member.findMany({
      where: { clubId: ctx.board.clubId, lastName: { in: ["Adler", "Bauer"] } },
      select: { lastName: true, phone: true, internalNotes: true },
      orderBy: { lastName: "asc" },
    });
    expect(rows).toEqual([
      { lastName: "Adler", phone: "0711 123456", internalNotes: "Torwart" },
      { lastName: "Bauer", phone: "0171 2345678", internalNotes: "Kapitän" },
    ]);
  });

  it("erkennt Abteilungsnamen mit Trennzeichen („Ski/Snowboard“) und trennt mehrere Abteilungen trotzdem", async () => {
    const { club, ctx, fussball, handball } = await setup();
    const ski = await createDepartment(club.id, "Ski/Snowboard");
    const turnen = await createDepartment(club.id, "Turnen, Tanz & Fitness");
    const csv = [
      "Vorname;Nachname;Abteilungen",
      "Sina;Ski;Ski/Snowboard",
      "Toni;Turner;turnen, tanz & fitness",
      "Mia;Mehrfach;Ski/Snowboard | Fußball",
      "Hans;Hand;Fußball/Handball",
      "Kim;Komma;Turnen, Tanz & Fitness, Handball",
      "Udo;Unbekannt;Ski/Rodeln",
    ].join("\n");

    const preview = await previewMemberImport(ctx.board, csv);
    expect(preview.rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "error"]);
    expect(preview.rows[5]!.messages.join(" ")).toContain("„Rodeln“");

    await executeMemberImport(ctx.board, csv);
    const departmentsOf = async (lastName: string) =>
      (
        await prisma.memberDepartment.findMany({
          where: { clubId: club.id, member: { lastName } },
          select: { departmentId: true },
        })
      )
        .map((d) => d.departmentId)
        .sort();
    expect(await departmentsOf("Ski")).toEqual([ski.id]);
    expect(await departmentsOf("Turner")).toEqual([turnen.id]);
    expect(await departmentsOf("Mehrfach")).toEqual([ski.id, fussball.id].sort());
    expect(await departmentsOf("Hand")).toEqual([fussball.id, handball.id].sort());
    expect(await departmentsOf("Komma")).toEqual([turnen.id, handball.id].sort());
  });

  it("verlangt Vorname und Nachname als Spalten", async () => {
    const { ctx } = await setup();
    await expect(previewMemberImport(ctx.board, "E-Mail;Telefon\na@b.de;1")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(previewMemberImport(ctx.board, "kein csv  ")).rejects.toBeDefined();
  });

  it("darf nur, wer die Berechtigung besitzt", async () => {
    const { ctx } = await setup();
    for (const forbidden of [ctx.lead, ctx.helper]) {
      await expect(previewMemberImport(forbidden, CSV)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(executeMemberImport(forbidden, CSV)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });

  it("legt Datensätze ausschließlich im eigenen Verein an", async () => {
    const a = await setup();
    const b = await setup();
    await executeMemberImport(a.ctx.board, CSV);
    expect(
      await prisma.member.count({ where: { clubId: b.club.id, memberNumber: "M-9001" } }),
    ).toBe(0);
    // Abteilungsnamen werden nur im eigenen Verein aufgelöst.
    const preview = await previewMemberImport(b.ctx.board, CSV);
    expect(preview.counts.error).toBe(0);
  });

  it("speichert gefährliche Zellinhalte als reinen Text", async () => {
    const { ctx } = await setup();
    const csv = [
      "Vorname;Nachname;Bemerkung",
      'Hacker;Test;"=HYPERLINK(""http://evil.example"",""x"")"',
      "Script;Test;<script>alert(1)</script>",
    ].join("\n");
    await executeMemberImport(ctx.board, csv);
    const notes = (
      await prisma.member.findMany({
        where: { clubId: ctx.board.clubId, lastName: "Test" },
        select: { internalNotes: true },
      })
    ).map((m) => m.internalNotes);
    expect(notes).toContain('=HYPERLINK("http://evil.example","x")');
    expect(notes).toContain("<script>alert(1)</script>");
  });
});

describe("CSV-Export", () => {
  it("exportiert für Berechtigte alle Spalten und protokolliert den Export", async () => {
    const { ctx, fussball } = await setup();
    await executeMemberImport(ctx.board, CSV);
    const { csv, count, filename } = await exportMembersCsv(ctx.board);

    expect(filename).toMatch(/^mitglieder-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(count).toBe(4 + 4); // 4 importierte + 4 Benutzer aus setup()
    const [header, ...lines] = csv.replace("﻿", "").split("\r\n");
    expect(header).toContain("E-Mail;Telefon");
    expect(header).toContain("Geburtsdatum;Notizen");
    expect(lines.find((l) => l.startsWith("M-9001;Anna;Adler;Aktiv;"))).toContain("12.03.1990");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: ctx.board.clubId, action: "members.exported" },
    });
    expect(audit.actorUserId).toBe(ctx.board.userId);
    expect(JSON.stringify(audit.changes)).not.toContain("Adler");
    void fussball;
  });

  it("schützt Excel vor Formeln in Mitgliedsdaten", async () => {
    const { ctx } = await setup();
    await createMember(
      ctx.admin,
      memberFormSchema.parse({
        firstName: "=cmd|' /C calc'!A0",
        lastName: "@SUM(1+1)",
        status: "ACTIVE",
        departmentIds: [],
        leaderDepartmentIds: [],
      }),
    );
    const { csv } = await exportMembersCsv(ctx.admin);
    expect(csv).not.toMatch(/(^|[\r\n;])=cmd/);
    expect(csv).not.toMatch(/(^|[\r\n;])@SUM/);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'@SUM");
  });

  it("wird verweigert ohne Berechtigung", async () => {
    const { ctx } = await setup();
    for (const forbidden of [ctx.lead, ctx.helper]) {
      await expect(exportMembersCsv(forbidden)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("enthält nur Daten, die der Exportierende auch sehen darf (Abteilungsleiter mit Exportrecht)", async () => {
    const { ctx, club, fussball, handball } = await setup();
    await createMember(
      ctx.admin,
      memberFormSchema.parse({
        firstName: "Eigene",
        lastName: "Abteilung",
        email: "eigene@example.org",
        status: "ACTIVE",
        departmentIds: [fussball.id],
        leaderDepartmentIds: [],
      }),
    );
    await createMember(
      ctx.admin,
      memberFormSchema.parse({
        firstName: "Fremde",
        lastName: "Abteilung",
        email: "fremde@example.org",
        status: "ACTIVE",
        departmentIds: [handball.id],
        leaderDepartmentIds: [],
      }),
    );

    const role = await prisma.role.findFirstOrThrow({
      where: { clubId: club.id, key: "DEPARTMENT_LEAD" },
    });
    await prisma.rolePermission.create({
      data: { clubId: club.id, roleId: role.id, permissionKey: "members:export", scope: "CLUB" },
    });
    const lead = await contextFor(ctx.lead.userId, club.id);

    const { csv } = await exportMembersCsv(lead);
    expect(csv).toContain("eigene@example.org");
    expect(csv).not.toContain("fremde@example.org");
    expect(csv).not.toContain("Fremde");
  });

  it("filtert nach Status und Abteilung", async () => {
    const { ctx } = await setup();
    await executeMemberImport(ctx.board, CSV);
    const passive = await exportMembersCsv(ctx.board, { status: "PASSIVE" });
    expect(passive.count).toBe(1);
    expect(passive.csv).toContain("Bauer");
    expect(passive.csv).not.toContain("Adler");
  });
});

describe("Export → Import", () => {
  it("liest die eigene Exportdatei wieder ein: Das Hochkomma des Formelschutzes landet nicht in den Daten", async () => {
    const a = await setup();
    const b = await setup();
    await createMember(
      a.ctx.admin,
      memberFormSchema.parse({
        firstName: "Ina",
        lastName: "International",
        phone: "+49 171 1234567",
        clubFunction: "-Kasse-",
        internalNotes: "=Zeile eins\nZeile zwei",
        status: "ACTIVE",
        departmentIds: [],
        leaderDepartmentIds: [],
      }),
    );
    const { csv } = await exportMembersCsv(a.ctx.admin);
    expect(csv).toContain("'+49 171 1234567"); // Excel-Schutz im Export bleibt

    const preview = await previewMemberImport(b.ctx.board, csv);
    const row = preview.rows.find((r) => r.label === "Ina International");
    expect(row).toMatchObject({ status: "ok", messages: [] });

    await executeMemberImport(b.ctx.board, csv);
    expect(
      await prisma.member.findFirstOrThrow({
        where: { clubId: b.club.id, lastName: "International" },
        select: { phone: true, clubFunction: true, internalNotes: true },
      }),
    ).toEqual({
      phone: "+49 171 1234567",
      clubFunction: "-Kasse-",
      internalNotes: "=Zeile eins\nZeile zwei",
    });
  });
});
