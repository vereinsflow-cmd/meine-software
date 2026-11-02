import { beforeEach, describe, expect, it, vi } from "vitest";

// Keine echten KI-Aufrufe: Das SDK ist ersetzt, `parse` liefert, was der Test vorgibt. Schlüssel je Test umschaltbar, die
// Obergrenze für Uploads auf 10 MB (damit auch ein Foto über der Grenze der Schnittstelle von 5 MB hochgeladen werden kann);
// alles andere wie in der echten Konfiguration.
const sdk = vi.hoisted(() => ({ parse: vi.fn() }));
const settings = vi.hoisted(() => ({ apiKey: "test-schluessel" as string | undefined }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { parse: sdk.parse } };
  },
}));
vi.mock("@/server/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/env")>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, property) =>
        property === "ANTHROPIC_API_KEY"
          ? settings.apiKey
          : property === "MAX_UPLOAD_MB"
            ? 10
            : Reflect.get(target, property),
    }),
  };
});
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());

import { NextRequest } from "next/server";
import { POST } from "@/app/api/rechnungen/auslesen/route";
import type { ExtractedInvoice } from "@/modules/finance/invoice-prefill";
import { readInvoice } from "@/modules/finance/invoice-reader";
import { prisma } from "@/server/db/client";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";
import { loginAs, request } from "../helpers/next-request";

/**
 * Rechnung auslesen (kostenpflichtiger Aufruf bei Anthropic): erst Recht und Kostenbremse, dann Größe und Dateityp – und
 * nur, was sich auslesen lässt, geht an die Schnittstelle. Fehler bremsen das Hochladen nicht und landen ohne
 * Rechnungsinhalt im Protokoll.
 */
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const MB = 1024 * 1024;
const telekom: ExtractedInvoice = {
  isInvoice: true,
  vendor: "Telekom Deutschland GmbH",
  description: "Internet Oktober 2026",
  totalCents: 4995,
  currency: "EUR",
  invoiceDate: "2026-10-02",
  dueDate: "2026-10-16",
  alreadyPaid: false,
};

beforeEach(() => {
  sdk.parse.mockReset();
  sdk.parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: telekom });
  settings.apiKey = "test-schluessel";
  request.token = null;
});

async function setup() {
  const club = await createClub("Rechnungsverein");
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    board,
    member,
    ctx: {
      board: await contextFor(board.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

const rateLimitBuckets = (userId: string) =>
  prisma.rateLimitBucket.count({ where: { key: `invoice-read:${userId}` } });

/** Datei mit gültigem Kopf („%PDF-“, PNG-Signatur) und `size` Bytes. */
function file(kind: "pdf" | "png", size: number): Uint8Array {
  const head =
    kind === "pdf" ? PDF : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes;
}

describe("Rechnung auslesen", () => {
  it("liest ein PDF aus: genau ein Aufruf mit der Datei als Dokument, Vorschläge fürs Formular", async () => {
    const { ctx } = await setup();
    const result = await readInvoice(ctx.board, { fileName: "telekom.pdf", bytes: PDF });
    expect(result).toEqual({
      ok: true,
      prefill: {
        title: "Telekom Deutschland GmbH – Internet Oktober 2026",
        amount: "49,95",
        dueDate: "2026-10-16",
        paid: false,
        note: null,
      },
    });
    expect(sdk.parse).toHaveBeenCalledTimes(1);
    expect(sdk.parse.mock.calls[0]![0]).toMatchObject({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: Buffer.from(PDF).toString("base64"),
              },
            },
            { type: "text" },
          ],
        },
      ],
    });
  });

  it("nur mit finance:manage – ohne das Recht kein Aufruf und kein Verbrauch der Kostenbremse", async () => {
    const { ctx, member } = await setup();
    await expect(
      readInvoice(ctx.member, { fileName: "telekom.pdf", bytes: PDF }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(sdk.parse).not.toHaveBeenCalled();
    expect(await rateLimitBuckets(member.user.id)).toBe(0);
  });

  it("ohne ANTHROPIC_API_KEY ausgeschaltet: kein Aufruf, „selbst eintragen“", async () => {
    const { ctx, board } = await setup();
    settings.apiKey = undefined;
    expect(await readInvoice(ctx.board, { fileName: "telekom.pdf", bytes: PDF })).toEqual({
      ok: false,
      reason: "Das automatische Auslesen ist nicht eingerichtet.",
    });
    expect(sdk.parse).not.toHaveBeenCalled();
    expect(await rateLimitBuckets(board.user.id)).toBe(0);
  });

  it("Kostenbremse: höchstens 60 Aufrufe je Stunde und Person – der 61. wird abgelehnt, andere lesen weiter", async () => {
    const { club, ctx } = await setup();
    for (let call = 0; call < 60; call += 1)
      expect(await readInvoice(ctx.board, { fileName: "telekom.pdf", bytes: PDF })).toMatchObject({
        ok: true,
      });
    await expect(
      readInvoice(ctx.board, { fileName: "telekom.pdf", bytes: PDF }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
    expect(sdk.parse).toHaveBeenCalledTimes(60);

    const treasurer = await addUserToClub(club, "BOARD");
    const other = await contextFor(treasurer.user.id, club.id);
    expect(await readInvoice(other, { fileName: "telekom.pdf", bytes: PDF })).toMatchObject({
      ok: true,
    });
  });

  it("prüft Größe und Dateityp, bevor etwas hinausgeht", async () => {
    const { ctx } = await setup();
    // Über der Grenze für Uploads: Fehler am Feld „Datei“.
    await expect(
      readInvoice(ctx.board, { fileName: "gross.pdf", bytes: file("pdf", 10 * MB + 1) }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { file: ["Die Datei ist zu groß (höchstens 10 MB)."] },
    });
    // Endung und Inhalt passen nicht zusammen, bzw. kein erlaubter Dateityp.
    await expect(
      readInvoice(ctx.board, { fileName: "rechnung.pdf", bytes: new Uint8Array([1, 2, 3]) }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { file: [expect.any(String)] } });
    await expect(
      readInvoice(ctx.board, { fileName: "rechnung.exe", bytes: PDF }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Erlaubt zum Hochladen, aber nicht zum Auslesen: Office-Dateien, Fotos über 5 MB.
    const docx = new TextEncoder().encode(
      "PK\u0003\u0004....[Content_Types].xml word/document.xml",
    );
    expect(await readInvoice(ctx.board, { fileName: "rechnung.docx", bytes: docx })).toEqual({
      ok: false,
      reason: "Nur PDFs und Fotos können ausgelesen werden.",
    });
    expect(
      await readInvoice(ctx.board, { fileName: "foto.png", bytes: file("png", 5 * MB + 1) }),
    ).toEqual({ ok: false, reason: "Das Foto ist zu groß zum Auslesen." });
    expect(sdk.parse).not.toHaveBeenCalled();

    // Ein PDF darf größer sein als ein Foto.
    expect(
      await readInvoice(ctx.board, { fileName: "scan.pdf", bytes: file("pdf", 6 * MB) }),
    ).toMatchObject({ ok: true });
  });

  it("Ablehnung oder leere Antwort: „ließ sich nicht auslesen“", async () => {
    const { ctx } = await setup();
    sdk.parse.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null });
    sdk.parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: null });
    for (let call = 0; call < 2; call += 1)
      expect(await readInvoice(ctx.board, { fileName: "telekom.pdf", bytes: PDF })).toEqual({
        ok: false,
        reason: "Die Rechnung ließ sich nicht auslesen.",
      });
  });

  it("Ausfall der Schnittstelle: Hochladen geht weiter, das Protokoll nennt weder Dateiname noch Inhalt", async () => {
    const { ctx } = await setup();
    sdk.parse.mockRejectedValueOnce(new Error("Connection error."));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await readInvoice(ctx.board, { fileName: "Telekom-Oktober-Vereinsheim.pdf", bytes: PDF }),
    ).toEqual({ ok: false, reason: "Die Rechnung ließ sich gerade nicht auslesen." });
    const logged = error.mock.calls.flat().join(" ");
    error.mockRestore();
    expect(logged).toContain("[invoice-read]");
    expect(logged).toContain("Connection error.");
    expect(logged).not.toContain("Telekom");
    expect(logged).not.toContain(Buffer.from(PDF).toString("base64"));
  });
});

describe("POST /api/rechnungen/auslesen", () => {
  const post = (form?: FormData) =>
    POST(
      new NextRequest("http://localhost:3000/api/rechnungen/auslesen", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: form ?? new FormData(),
      }),
      undefined,
    );
  const withFile = () => {
    const form = new FormData();
    form.set("file", new File([PDF], "telekom.pdf", { type: "application/pdf" }));
    return form;
  };

  it("ohne Anmeldung 401, ohne Finanzrecht 403 – beides ohne Aufruf der Schnittstelle", async () => {
    const { club, member } = await setup();
    expect((await post(withFile())).status).toBe(401);
    await loginAs(member.user.id, club.id);
    expect((await post(withFile())).status).toBe(403);
    expect(sdk.parse).not.toHaveBeenCalled();
  });

  it("mit Finanzrecht: Vorschläge als { ok, data }, nicht zwischengespeichert; ohne Datei 422", async () => {
    const { club, board } = await setup();
    await loginAs(board.user.id, club.id);
    const response = await post(withFile());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { ok: true, prefill: { amount: "49,95", dueDate: "2026-10-16" } },
    });
    expect((await post()).status).toBe(422);
  });
});
