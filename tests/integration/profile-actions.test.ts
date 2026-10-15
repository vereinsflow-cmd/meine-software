import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions laufen hier ohne Next.js: Cookies/Kopfzeilen der Anfrage und das Neuladen des Caches werden ersetzt.
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
  setEmailNotificationsAction,
  updateProfileAction,
} from "@/modules/profile/actions";
import { createSessionRecord } from "@/server/auth/session-core";
import { prisma } from "@/server/db/client";
import { hashToken } from "@/server/security/tokens";
import { addUserToClub, createClub } from "../helpers/factories";
import { request } from "../helpers/next-request";

/**
 * Server Actions des Profils: Sie wirken ausschließlich auf das Konto der angemeldeten Person. Die Benutzer-ID stammt
 * aus der Sitzung – zusätzliche Felder in der Eingabe (fremde IDs, E-Mail) werden nie übernommen.
 */
beforeEach(() => {
  request.token = null;
  vi.mocked(revalidatePath).mockClear();
});

async function newSession(userId: string) {
  const { token } = await createSessionRecord({
    userId,
    activeClubId: null,
    userAgent: "vitest",
    ipPrefix: null,
  });
  return { token, id: hashToken(token) };
}

async function setup() {
  const club = await createClub("Profilaktionsverein");
  const paula = await addUserToClub(club, "MEMBER", { firstName: "Paula", lastName: "Person" });
  const otto = await addUserToClub(club, "MEMBER", { firstName: "Otto", lastName: "Anders" });
  const current = await newSession(paula.user.id);
  request.token = current.token;
  return { club, paula, otto, current };
}

const user = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

describe("Profil-Aktionen ohne Anmeldung", () => {
  it("melden UNAUTHENTICATED und ändern nichts", async () => {
    const { paula } = await setup();
    request.token = null;
    const unauthenticated = { ok: false, error: { code: "UNAUTHENTICATED" } };

    expect(await updateProfileAction({ firstName: "X", lastName: "Y" })).toMatchObject(
      unauthenticated,
    );
    expect(await setEmailNotificationsAction({ enabled: false })).toMatchObject(unauthenticated);
    expect(await revokeSessionAction({ sessionId: "s".repeat(20) })).toMatchObject(unauthenticated);
    expect(await revokeOtherSessionsAction()).toMatchObject(unauthenticated);

    expect(await user(paula.user.id)).toMatchObject({
      firstName: "Paula",
      lastName: "Person",
      emailNotifications: true,
    });
    expect(await prisma.session.count({ where: { userId: paula.user.id } })).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ein ungültiges oder abgelaufenes Sitzungs-Token zählt nicht als Anmeldung", async () => {
    const { paula, current } = await setup();
    request.token = `${current.token}x`;
    expect(await setEmailNotificationsAction({ enabled: false })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });

    // Vor 15 Tagen angelegt – längst abgelaufen (im Test höchstens 14 Tage gültig).
    const { token: expired } = await createSessionRecord({
      userId: paula.user.id,
      activeClubId: null,
      userAgent: "vitest",
      ipPrefix: null,
      now: new Date(Date.now() - 15 * 86_400_000),
    });
    request.token = expired;
    expect(await setEmailNotificationsAction({ enabled: false })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect((await user(paula.user.id)).emailNotifications).toBe(true);
  });
});

describe("Name ändern", () => {
  it("ändert nur den eigenen Namen – eingeschleuste Felder (fremde ID, E-Mail) werden ignoriert", async () => {
    const { paula, otto } = await setup();
    expect(
      await updateProfileAction({
        firstName: "  Paulina ",
        lastName: " Neu ",
        userId: otto.user.id,
        id: otto.user.id,
        email: "uebernahme@example.test",
        isPlatformAdmin: true,
      }),
    ).toEqual({ ok: true, data: undefined });

    expect(await user(paula.user.id)).toMatchObject({
      firstName: "Paulina",
      lastName: "Neu",
      email: paula.user.email,
      isPlatformAdmin: false,
    });
    expect(await user(otto.user.id)).toMatchObject({
      firstName: "Otto",
      lastName: "Anders",
      email: otto.user.email,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("prüft die Eingabe: leere oder überlange Namen ergeben Feldfehler", async () => {
    const { paula } = await setup();
    const empty = await updateProfileAction({ firstName: "   ", lastName: "" });
    expect(empty).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: {
          firstName: ["Bitte gib deinen Vornamen ein."],
          lastName: ["Bitte gib deinen Nachnamen ein."],
        },
      },
    });
    const tooLong = await updateProfileAction({ firstName: "A".repeat(101), lastName: "Person" });
    expect(tooLong).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { firstName: [expect.any(String)] } },
    });
    expect(await updateProfileAction("kein Objekt")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect((await user(paula.user.id)).firstName).toBe("Paula");
  });
});

describe("E-Mail-Benachrichtigungen", () => {
  it("schaltet nur die eigenen E-Mail-Benachrichtigungen um", async () => {
    const { paula, otto } = await setup();
    expect(await setEmailNotificationsAction({ enabled: false, userId: otto.user.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await user(paula.user.id)).emailNotifications).toBe(false);
    expect((await user(otto.user.id)).emailNotifications).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/profil");

    await setEmailNotificationsAction({ enabled: true });
    expect((await user(paula.user.id)).emailNotifications).toBe(true);
  });

  it("nimmt nur echte Wahrheitswerte an (kein 'false' als Text)", async () => {
    const { paula } = await setup();
    for (const enabled of ["false", 0, null, undefined]) {
      expect(await setEmailNotificationsAction({ enabled })).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    }
    expect((await user(paula.user.id)).emailNotifications).toBe(true);
  });
});

describe("Angemeldete Geräte", () => {
  it("eine fremde Sitzung lässt sich nicht beenden, die aktuelle nicht über diesen Weg", async () => {
    const { otto, current } = await setup();
    const theirs = await newSession(otto.user.id);

    expect(await revokeSessionAction({ sessionId: theirs.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await prisma.session.count({ where: { id: theirs.id } })).toBe(1);

    expect(await revokeSessionAction({ sessionId: current.id })).toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
    expect(await prisma.session.count({ where: { id: current.id } })).toBe(1);
  });

  it("beendet eine andere eigene Sitzung", async () => {
    const { paula } = await setup();
    const phone = await newSession(paula.user.id);
    expect(await revokeSessionAction({ sessionId: phone.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await prisma.session.count({ where: { id: phone.id } })).toBe(0);
    expect(await revokeSessionAction({ sessionId: "zu-kurz" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
  });

  it("'Auf allen anderen Geräten abmelden' behält die aktuelle Sitzung und lässt andere Personen angemeldet", async () => {
    const { paula, otto, current } = await setup();
    await newSession(paula.user.id);
    await newSession(paula.user.id);
    const theirs = await newSession(otto.user.id);

    expect(await revokeOtherSessionsAction()).toEqual({ ok: true, data: { count: 2 } });
    expect(
      (await prisma.session.findMany({ where: { userId: paula.user.id } })).map((s) => s.id),
    ).toEqual([current.id]);
    expect(await prisma.session.count({ where: { id: theirs.id } })).toBe(1);
    expect(await revokeOtherSessionsAction()).toEqual({ ok: true, data: { count: 0 } });
  });
});
