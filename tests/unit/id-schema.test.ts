import { describe, expect, it } from "vitest";
import {
  idSchema,
  idString,
  optionalIdString,
  trimmedIdString,
  trimmedOptionalIdString,
} from "@/lib/id-schema";
import { idSchema as departmentsIdSchema } from "@/modules/departments/schemas";
import { idSchema as documentsIdSchema } from "@/modules/documents/schemas";
import { idSchema as eventsIdSchema } from "@/modules/events/schemas";
import { feeRateDeleteSchema, feeTypeUpdateSchema } from "@/modules/fees/schemas";
import { attachmentIdSchema, entrySchema } from "@/modules/finance/ledger-schemas";
import { idSchema as helpIdSchema } from "@/modules/help/schemas";
import { idSchema as membersIdSchema } from "@/modules/members/schemas";
import { idSchema as applicationsIdSchema } from "@/modules/membership-applications/schemas";
import { idSchema as messagesIdSchema } from "@/modules/messages/schemas";
import { idSchema as shiftsIdSchema } from "@/modules/shifts/schemas";
import { idSchema as tasksIdSchema } from "@/modules/tasks/schemas";
import { idSchema as usersIdSchema } from "@/modules/users/schemas";

const long = (length: number) => "a".repeat(length);

describe("Datensatz-IDs: idString (unverändert)", () => {
  it("nimmt 1 bis 64 Zeichen", () => {
    expect(idString.parse("a")).toBe("a");
    expect(idString.parse(long(64))).toBe(long(64));
    expect(idString.safeParse("").success).toBe(false);
    expect(idString.safeParse(long(65)).success).toBe(false);
  });

  it("lässt Leerraum stehen – „   “ ist eine (unbekannte) ID, kein leerer Wert", () => {
    expect(idString.parse(" a ")).toBe(" a ");
    expect(idString.parse("   ")).toBe("   ");
  });

  it("lehnt andere Typen ab", () => {
    for (const value of [undefined, null, 1, {}, ["a"]])
      expect(idString.safeParse(value).success).toBe(false);
  });
});

describe("Datensatz-IDs: trimmedIdString (Beiträge, Kassenbuch)", () => {
  it("schneidet Leerraum ab, bevor die Länge geprüft wird", () => {
    expect(trimmedIdString.parse(" abc ")).toBe("abc");
    expect(trimmedIdString.parse(`  ${long(64)}  `)).toBe(long(64));
    expect(trimmedIdString.safeParse(long(65)).success).toBe(false);
  });

  it("reiner Leerraum ist leer und damit ungültig", () => {
    expect(trimmedIdString.safeParse("   ").success).toBe(false);
    expect(trimmedIdString.safeParse("").success).toBe(false);
  });
});

describe("Freiwillige IDs", () => {
  it("optionalIdString: leer oder fehlend wird undefined, sonst unverändert", () => {
    expect(optionalIdString.parse(undefined)).toBeUndefined();
    expect(optionalIdString.parse("")).toBeUndefined();
    expect(optionalIdString.parse("a")).toBe("a");
    expect(optionalIdString.parse(" ")).toBe(" ");
    expect(optionalIdString.safeParse(long(65)).success).toBe(false);
  });

  it("trimmedOptionalIdString: Leerraum zählt als leer", () => {
    expect(trimmedOptionalIdString.parse(undefined)).toBeUndefined();
    expect(trimmedOptionalIdString.parse("   ")).toBeUndefined();
    expect(trimmedOptionalIdString.parse(" a ")).toBe("a");
    expect(trimmedOptionalIdString.safeParse(long(65)).success).toBe(false);
  });
});

describe("idSchema: ein gemeinsames { id } für alle Bereiche", () => {
  it("prüft { id } wie idString", () => {
    expect(idSchema.parse({ id: "x1" })).toEqual({ id: "x1" });
    expect(idSchema.parse({ id: " x1 " })).toEqual({ id: " x1 " });
    expect(idSchema.safeParse({}).success).toBe(false);
    expect(idSchema.safeParse({ id: "" }).success).toBe(false);
    expect(idSchema.safeParse({ id: long(65) }).success).toBe(false);
  });

  it("die Bereiche geben genau dieses Schema weiter (keine eigenen Kopien)", () => {
    for (const schema of [
      departmentsIdSchema,
      documentsIdSchema,
      eventsIdSchema,
      helpIdSchema,
      membersIdSchema,
      applicationsIdSchema,
      messagesIdSchema,
      shiftsIdSchema,
      tasksIdSchema,
      usersIdSchema,
    ])
      expect(schema).toBe(idSchema);
  });

  it("Beiträge und Kassenbuch schneiden Leerraum der IDs weiterhin ab", () => {
    expect(feeRateDeleteSchema.parse({ id: " r1 " })).toEqual({ id: "r1" });
    expect(feeRateDeleteSchema.safeParse({ id: "  " }).success).toBe(false);
    expect(attachmentIdSchema.parse({ id: " a1 " })).toEqual({ id: "a1" });
    expect(
      feeTypeUpdateSchema.parse({ id: "t1", name: "Grundbeitrag", statuses: [], departmentId: " " })
        .departmentId,
    ).toBeUndefined();
    const entry = entrySchema.parse({
      kind: "INCOME",
      accountId: "acc",
      bookingDate: "2026-10-01",
      description: "Spende",
      counterpartyMemberId: "  ",
      lines: [{ categoryId: "cat", amount: "10,00" }],
    });
    expect(entry.counterpartyMemberId).toBeUndefined();
  });
});
