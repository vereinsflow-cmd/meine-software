import { describe, expect, it, vi } from "vitest";

// FIRST_RUN_SETUP je Test umschaltbar; alles andere wie in der echten Konfiguration.
const flags = vi.hoisted(() => ({ firstRun: true }));
vi.mock("@/server/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/env")>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, property) =>
        property === "FIRST_RUN_SETUP" ? flags.firstRun : Reflect.get(target, property),
    }),
  };
});

import { prisma } from "@/server/db/client";
import { authenticate } from "@/server/auth/service";
import { completeFirstRun, isFirstRunOpen } from "@/server/platform/first-run";
import { completeSetup, getSetupOverview } from "@/modules/setup/service";
import { isSetupLocked } from "@/server/tenancy/setup-gate";
import { addUserToClub, contextFor, createDepartment, createMember } from "../helpers/factories";

const meta = { ip: "unknown", ipPrefix: null };
/** Der eine Verein dieser Datei – samt Rollen, wie ihn die Test-Helfer erwarten. */
async function theClub() {
  const club = await prisma.club.findFirstOrThrow({ include: { roles: true } });
  return { ...club, roleIds: Object.fromEntries(club.roles.map((role) => [role.key, role.id])) };
}

const input = {
  clubName: "TSV Grün-Weiß Musterstadt",
  firstName: "Erika",
  lastName: "Muster",
  email: " Erika@Beispiel.test ",
  password: "Unser Verein startet heute neu",
};

/*
 * Eine Datei = eine frische Datenbank ohne Konten. Die Reihenfolge der Tests ist deshalb wichtig: erst die leere
 * Installation, dann die Ersteinrichtung, danach ist sie für immer zu.
 */
describe("Ersteinrichtung der leeren Version", () => {
  it("ist nur offen, wenn FIRST_RUN_SETUP gesetzt ist und es noch kein Konto gibt", async () => {
    expect(await prisma.user.count()).toBe(0);
    flags.firstRun = false;
    expect(await isFirstRunOpen()).toBe(false);
    await expect(completeFirstRun(input, meta)).rejects.toMatchObject({ code: "NOT_FOUND" });
    flags.firstRun = true;
    expect(await isFirstRunOpen()).toBe(true);
  });

  it("prüft das Passwort, bevor irgendetwas angelegt wird", async () => {
    await expect(
      completeFirstRun({ ...input, password: "erika@beispiel.test" }, meta),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.club.count()).toBe(0);
  });

  it("legt Verein, Administrator-Konto, Mitgliedsdatensatz und Einwilligung an – danach ist sie zu", async () => {
    const { userId, clubId } = await completeFirstRun(input, meta);

    const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
    expect(club).toMatchObject({
      name: "TSV Grün-Weiß Musterstadt",
      slug: "tsv-gruen-weiss-musterstadt",
      contactEmail: "erika@beispiel.test",
      setupCompletedAt: null,
    });
    const membership = await prisma.clubMembership.findFirstOrThrow({
      where: { clubId, userId },
      include: { role: true },
    });
    expect(membership.role.key).toBe("CLUB_ADMIN");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ email: "erika@beispiel.test", isPlatformAdmin: false });
    const member = await prisma.member.findFirstOrThrow({ where: { clubId, userId } });
    expect(member.status).toBe("ACTIVE");
    expect(await prisma.consent.count({ where: { memberId: member.id } })).toBe(1);

    // Anmelden funktioniert mit genau diesem Passwort
    await expect(
      authenticate({ email: "erika@beispiel.test", password: input.password }, meta),
    ).resolves.toMatchObject({ userId, activeClubId: clubId });

    expect(await isFirstRunOpen()).toBe(false);
    await expect(
      completeFirstRun({ ...input, email: "zweite@beispiel.test" }, meta),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.club.count()).toBe(1);
  });

  it("der Assistent zeigt den Fortschritt; abschließen erst mit den Pflichtangaben, dann ist die App frei", async () => {
    const club = await theClub();
    const admin = await prisma.clubMembership.findFirstOrThrow({ where: { clubId: club.id } });
    const ctx = await contextFor(admin.userId, club.id);

    expect(isSetupLocked(ctx)).toBe(true);
    let overview = await getSetupOverview(ctx);
    expect(overview.done).toEqual({
      verein: false,
      logo: false,
      abteilungen: false,
      mitglieder: false,
      vorstand: false,
    });

    // Kontakt-E-Mail ist schon da (aus der Ersteinrichtung), die Anschrift fehlt noch
    await expect(completeSetup(ctx)).rejects.toMatchObject({ code: "CONFLICT" });
    await prisma.club.update({
      where: { id: club.id },
      data: { street: "Hauptstraße 1", city: "Musterstadt" },
    });
    expect((await getSetupOverview(ctx)).done.verein).toBe(false); // ohne PLZ unvollständig
    await prisma.club.update({ where: { id: club.id }, data: { postalCode: "12345" } });

    await createDepartment(club.id, "Fußball");
    await createMember(club.id);
    await addUserToClub(club, "BOARD");
    overview = await getSetupOverview(ctx);
    // Das Logo fehlt noch – alles andere ist erledigt
    expect(overview.done).toEqual({
      verein: true,
      logo: false,
      abteilungen: true,
      mitglieder: true,
      vorstand: true,
    });
    expect(overview.departments.map((d) => d.name)).toEqual(["Fußball"]);

    await completeSetup(ctx);
    await completeSetup(ctx); // ein zweites Mal ändert nichts
    expect(isSetupLocked(await contextFor(admin.userId, club.id))).toBe(false);
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "club.setup_completed" } }),
    ).toBe(1);
  });

  it("gesperrt ist nur, wer den Verein verwaltet – Vorstand und Mitglieder sehen die App wie gewohnt", async () => {
    const club = await theClub();
    await prisma.club.update({ where: { id: club.id }, data: { setupCompletedAt: null } });
    const admin = await prisma.clubMembership.findFirstOrThrow({
      where: { clubId: club.id, role: { key: "CLUB_ADMIN" } },
    });
    expect(isSetupLocked(await contextFor(admin.userId, club.id))).toBe(true);
    const board = await addUserToClub(club, "BOARD");
    expect(isSetupLocked(await contextFor(board.user.id, club.id))).toBe(false);
    const member = await addUserToClub(club, "MEMBER");
    const ctx = await contextFor(member.user.id, club.id);
    expect(isSetupLocked(ctx)).toBe(false);
    await expect(completeSetup(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
