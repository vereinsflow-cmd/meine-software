import { beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ sent: [] as { to: string; text: string }[] }));
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async (m: { to: string; text: string }) => void mail.sent.push(m),
  sendMail: async (m: { to: string; text: string }) => void mail.sent.push(m),
}));

// Server Actions laufen hier ohne Next.js: Cookies/Kopfzeilen der Anfrage und das Neuladen des Caches werden ersetzt.
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClubAction, setClubStatusAction } from "@/modules/platform/actions";
import { prisma } from "@/server/db/client";
import { addUserToClub, createClub, createUser, unique } from "../helpers/factories";
import { loginAs, request } from "../helpers/next-request";

/**
 * Server Actions der Systemverwaltung: Erst wird geprüft, ob überhaupt ein Superadministrator handelt – erst danach
 * die Eingabe. So erfährt niemand ohne Zugriff etwas über erwartete Felder oder vorhandene Kürzel.
 */
beforeEach(() => {
  request.token = null;
  mail.sent.length = 0;
});

const newClubInput = () => ({
  name: "Neuer Verein",
  slug: unique("neu"),
  adminEmail: `${unique("admin")}@example.test`,
});

describe("Systemverwaltung (Server Actions)", () => {
  it("ohne Anmeldung: UNAUTHENTICATED – auch bei ungültiger Eingabe", async () => {
    expect(await createClubAction(newClubInput())).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(await createClubAction({})).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(await setClubStatusAction({ clubId: "x", active: false })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(mail.sent).toHaveLength(0);
  });

  it("Vereinsadministratoren haben keinen Zugriff – weder anlegen noch (de)aktivieren", async () => {
    const club = await createClub("Fremdverein");
    const clubAdmin = await addUserToClub(club, "CLUB_ADMIN");
    await loginAs(clubAdmin.user.id);

    const input = newClubInput();
    expect(await createClubAction(input)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    // Auch eine ungültige Eingabe ergibt FORBIDDEN statt Feldfehlern.
    expect(await createClubAction({ name: "" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await setClubStatusAction({ clubId: club.id, active: false })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await prisma.club.count({ where: { slug: input.slug } })).toBe(0);
    expect((await prisma.club.findUniqueOrThrow({ where: { id: club.id } })).status).toBe("ACTIVE");
    expect(mail.sent).toHaveLength(0);
  });

  it("ein entzogenes Superadmin-Recht gilt sofort – auch bei bestehender Sitzung", async () => {
    const admin = await createUser({ isPlatformAdmin: true });
    await loginAs(admin.id);
    await prisma.user.update({ where: { id: admin.id }, data: { isPlatformAdmin: false } });

    expect(await createClubAction(newClubInput())).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("Superadministratoren legen Vereine an und (de)aktivieren sie; Eingaben werden geprüft", async () => {
    const admin = await createUser({ isPlatformAdmin: true });
    await loginAs(admin.id);

    expect(await createClubAction({ name: "", slug: "A B", adminEmail: "kein" })).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: {
          name: [expect.any(String)],
          slug: [expect.any(String)],
          adminEmail: [expect.any(String)],
        },
      },
    });

    const input = newClubInput();
    const created = await createClubAction(input);
    expect(created).toMatchObject({ ok: true, data: { clubId: expect.any(String) } });
    const clubId = created.ok ? created.data.clubId : "";
    expect(await prisma.club.findUniqueOrThrow({ where: { id: clubId } })).toMatchObject({
      slug: input.slug,
      status: "ACTIVE",
    });
    expect(mail.sent.map((m) => m.to)).toEqual([input.adminEmail]);

    expect(await setClubStatusAction({ clubId, active: false })).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await prisma.club.findUniqueOrThrow({ where: { id: clubId } })).status).toBe(
      "DEACTIVATED",
    );
    expect(await setClubStatusAction({ clubId, active: "nein" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
  });
});
