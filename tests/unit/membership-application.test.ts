import { describe, expect, it } from "vitest";
import { toDateInputValue } from "@/lib/dates";
import { joinLogoUrl, joinPath } from "@/lib/membership-application";
import { buildPosterPageStyle } from "@/lib/print";
import { QR_QUIET_ZONE, qrMatrix, qrPath, qrViewBoxSize, type QrMatrix } from "@/lib/qr-code";
import {
  applicationFormSchema,
  isHoneypotFilled,
  type ApplicationFormInput,
} from "@/modules/membership-applications/schemas";

const valid: ApplicationFormInput = {
  token: "a".repeat(43),
  firstName: "  Bea ",
  lastName: "Beitritt",
  email: " Bea.Beitritt@Example.ORG ",
  phone: "",
  birthDate: "",
  departmentId: "",
  message: "",
  consent: true,
  website: "",
};

const parse = (over: Partial<ApplicationFormInput> = {}) =>
  applicationFormSchema.safeParse({ ...valid, ...over });

/** Feldfehler eines fehlgeschlagenen Laufs, z. B. `{ consent: ["…"] }`. */
const errors = (over: Partial<ApplicationFormInput>) => {
  const result = parse(over);
  expect(result.success).toBe(false);
  return result.success ? {} : result.error.flatten().fieldErrors;
};

const dayOffset = (days: number) => toDateInputValue(new Date(Date.now() + days * 86_400_000));

describe("Antragsformular „Mitglied werden“", () => {
  it("nimmt einen vollständigen Antrag an; leere freiwillige Felder gelten als „nicht angegeben“, die E-Mail klein", () => {
    const result = parse();
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      firstName: "Bea",
      lastName: "Beitritt",
      email: "bea.beitritt@example.org",
      phone: undefined,
      birthDate: undefined,
      departmentId: undefined,
      message: undefined,
      consent: true,
    });
  });

  it("verlangt die Einwilligung – ohne Häkchen kein Antrag", () => {
    expect(errors({ consent: false }).consent?.[0]).toMatch(/Bitte stimme zu/);
  });

  it("Pflichtfelder und Längen: Vor-/Nachname 1–80 Zeichen, gültige E-Mail, Nachricht höchstens 1000 Zeichen", () => {
    expect(errors({ firstName: "   " }).firstName?.[0]).toBe("Bitte gib deinen Vornamen ein.");
    expect(errors({ lastName: "x".repeat(81) }).lastName?.[0]).toMatch(/zu lang/);
    expect(parse({ lastName: "x".repeat(80) }).success).toBe(true);
    expect(errors({ email: "keine-adresse" }).email?.[0]).toBe(
      "Bitte gib eine gültige E-Mail-Adresse ein.",
    );
    expect(errors({ email: "" }).email?.[0]).toBe("Bitte gib deine E-Mail-Adresse ein.");
    expect(errors({ message: "m".repeat(1001) }).message?.[0]).toMatch(/höchstens 1000/);
    expect(parse({ message: "m".repeat(1000) }).success).toBe(true);
    expect(errors({ phone: "0170 ABC" }).phone?.[0]).toMatch(/gültige Telefonnummer/);
    expect(parse({ phone: "+49 (0)170 123-45/67" }).data?.phone).toBe("+49 (0)170 123-45/67");
  });

  it("Geburtsdatum: freiwillig, aber ein echtes Datum in der Vergangenheit und plausibel", () => {
    expect(parse({ birthDate: "2001-02-28" }).data?.birthDate).toBe("2001-02-28");
    expect(errors({ birthDate: "2001-02-30" }).birthDate?.[0]).toBe(
      "Bitte gib ein gültiges Datum ein.",
    );
    expect(errors({ birthDate: "28.02.2001" }).birthDate?.[0]).toBe(
      "Bitte gib ein gültiges Datum ein.",
    );
    expect(errors({ birthDate: dayOffset(0) }).birthDate?.[0]).toBe(
      "Das Geburtsdatum muss in der Vergangenheit liegen.",
    );
    expect(errors({ birthDate: dayOffset(30) }).birthDate?.[0]).toBe(
      "Das Geburtsdatum muss in der Vergangenheit liegen.",
    );
    expect(errors({ birthDate: "1899-12-31" }).birthDate?.[0]).toBe(
      "Das Geburtsdatum ist nicht plausibel.",
    );
    expect(parse({ birthDate: "1900-01-01" }).success).toBe(true);
  });

  it("Honigtopf: ein ausgefülltes Feld „website“ ist KEIN Eingabefehler (der Roboter soll nichts merken), wird aber erkannt", () => {
    const bot = parse({ website: "https://spam.example" });
    expect(bot.success).toBe(true);
    expect(isHoneypotFilled(bot.data!)).toBe(true);
    expect(isHoneypotFilled(parse().data!)).toBe(false);
    expect(isHoneypotFilled(parse({ website: "   " }).data!)).toBe(false);
    // Fehlt das Feld ganz (z. B. ein Skript ohne das Formular), gilt es als leer.
    const { website: _unused, ...withoutTrap } = valid;
    void _unused;
    expect(isHoneypotFilled(applicationFormSchema.parse(withoutTrap))).toBe(false);
  });
});

describe("Adressen", () => {
  it("öffentliche Seite und Logo hängen am Beitrittslink; ohne Logo keine Bildadresse", () => {
    const token = "b".repeat(43);
    expect(joinPath(token)).toBe(`/beitreten/${token}`);
    expect(joinLogoUrl(token, "0123456789abcdef".repeat(4))).toBe(
      `/api/beitreten/${token}/logo?v=0123456789abcdef`,
    );
    expect(joinLogoUrl(token, null)).toBeNull();
  });
});

describe("QR-Code als SVG-Pfad", () => {
  const matrix = (rows: string[]): QrMatrix => ({
    size: rows.length,
    dark: rows.flatMap((row) => [...row].map((cell) => cell === "#")),
  });

  it("fasst nebeneinanderliegende dunkle Module einer Zeile zu einem Rechteck zusammen und rückt um die Ruhezone ein", () => {
    const m = matrix(["##.", ".#.", "#.#"]);
    expect(qrPath(m, 0)).toBe("M0 0h2v1h-2zM1 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1z");
    expect(qrPath(m)).toBe(
      `M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h2v1h-2zM${QR_QUIET_ZONE + 1} ${QR_QUIET_ZONE + 1}h1v1h-1zM${QR_QUIET_ZONE} ${QR_QUIET_ZONE + 2}h1v1h-1zM${QR_QUIET_ZONE + 2} ${QR_QUIET_ZONE + 2}h1v1h-1z`,
    );
    expect(qrPath(matrix(["...", "...", "..."]))).toBe("");
    expect(qrViewBoxSize(m)).toBe(3 + 2 * QR_QUIET_ZONE);
  });

  it("die Matrix eines Beitrittslinks ist ein echter QR-Code: quadratisch, Version 1–40, mit Suchmustern in drei Ecken", () => {
    const m = qrMatrix(`https://verein.example/beitreten/${"c".repeat(43)}`);
    expect(m.dark).toHaveLength(m.size * m.size);
    expect((m.size - 17) % 4).toBe(0); // Kantenlänge = 17 + 4 × Version
    const at = (row: number, col: number) => m.dark[row * m.size + col];
    for (const [top, left] of [
      [0, 0],
      [0, m.size - 7],
      [m.size - 7, 0],
    ] as const) {
      // Suchmuster: dunkler Rand, heller Ring, dunkler 3×3-Kern
      expect(at(top, left)).toBe(true);
      expect(at(top + 6, left + 6)).toBe(true);
      expect(at(top + 1, left + 1)).toBe(false);
      expect(at(top + 3, left + 3)).toBe(true);
    }
    expect(qrPath(m).startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h7`)).toBe(true);
  });
});

describe("Aushang drucken", () => {
  it("eine A4-Seite hoch mit Rand, ohne Kopf- und Fußzeile", () => {
    const style = buildPosterPageStyle();
    expect(style).toContain("size: A4 portrait;");
    expect(style).toContain("margin: 16mm;");
    expect(style).not.toContain("@top-");
    expect(style).not.toContain("@bottom-");
  });
});
