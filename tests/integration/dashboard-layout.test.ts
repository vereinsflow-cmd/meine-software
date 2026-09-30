import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { getDashboardLayout, saveDashboardLayout } from "@/modules/dashboard/layout-service";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

const layout = {
  v: 1 as const,
  tabs: { uebersicht: { order: ["benachrichtigungen", "kennzahlen"], hidden: ["aufgaben"] } },
};

describe("Dashboard selbst einstellen (gespeichert je Person und Verein)", () => {
  it("speichert und liest die eigene Anordnung; „Zurücksetzen“ führt zur Standard-Ansicht", async () => {
    const club = await createClub("Layoutverein");
    const admin = await addUserToClub(club, "CLUB_ADMIN");
    const member = await addUserToClub(club, "MEMBER");
    const ctx = await contextFor(admin.user.id, club.id);

    expect(await getDashboardLayout(ctx)).toBeNull();
    await saveDashboardLayout(ctx, layout);
    expect(await getDashboardLayout(ctx)).toEqual(layout);
    // Nur die eigene Mitgliedschaft ist betroffen
    expect(await getDashboardLayout(await contextFor(member.user.id, club.id))).toBeNull();

    await saveDashboardLayout(ctx, null);
    expect(await getDashboardLayout(ctx)).toBeNull();
  });

  it("dieselbe Person in zwei Vereinen hat je Verein eine eigene Anordnung", async () => {
    const a = await createClub("Verein A");
    const b = await createClub("Verein B");
    const inA = await addUserToClub(a, "BOARD");
    await addUserToClub(b, "MEMBER", { user: inA.user });
    const ctxA = await contextFor(inA.user.id, a.id);
    const ctxB = await contextFor(inA.user.id, b.id);

    await saveDashboardLayout(ctxA, layout);
    expect(await getDashboardLayout(ctxA)).toEqual(layout);
    expect(await getDashboardLayout(ctxB)).toBeNull();
    const rows = await prisma.clubMembership.findMany({
      where: { userId: inA.user.id },
      select: { clubId: true, dashboardLayout: true },
    });
    expect(rows.find((row) => row.clubId === b.id)?.dashboardLayout).toBeNull();
  });

  it("eine beschädigte gespeicherte Einstellung ergibt die Standard-Ansicht statt eines Fehlers", async () => {
    const club = await createClub("Kaputtverein");
    const admin = await addUserToClub(club, "CLUB_ADMIN");
    const ctx = await contextFor(admin.user.id, club.id);
    await prisma.clubMembership.update({
      where: { id: ctx.membershipId },
      data: { dashboardLayout: { v: 99, irgendwas: true } },
    });
    expect(await getDashboardLayout(ctx)).toBeNull();
  });
});
