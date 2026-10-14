import { describe, expect, it } from "vitest";
import { rejectOversizedDocumentUpload, rejectOversizedUpload } from "@/server/upload-limit";

/** In den Unit-Tests ist `MAX_UPLOAD_MB` = 5 (tests/setup/env.ts). */
const DOCUMENT_LIMIT = 5 * 1024 * 1024 + 256 * 1024;

const upload = (contentLength?: string) =>
  new Request("http://localhost:3000/api/dokumente", {
    method: "POST",
    headers: contentLength === undefined ? {} : { "content-length": contentLength },
  });

describe("rejectOversizedUpload (angekündigte Größe vor dem Lesen)", () => {
  it("lässt Uploads bis zur Grenze durch", () => {
    expect(rejectOversizedUpload(upload("1000"), 1000, "zu groß")).toBeNull();
    expect(rejectOversizedUpload(upload("0"), 1000, "zu groß")).toBeNull();
  });

  it("ohne oder mit unlesbarer Angabe entscheidet erst der Dienst (am Inhalt)", () => {
    expect(rejectOversizedUpload(upload(), 1000, "zu groß")).toBeNull();
    expect(rejectOversizedUpload(upload("viel"), 1000, "zu groß")).toBeNull();
  });

  it("lehnt eine größere Angabe mit 413 und Feldfehler am Feld „file“ ab", async () => {
    const response = rejectOversizedUpload(upload("1001"), 1000, "Das Logo ist zu groß.");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(413);
    expect(response!.headers.get("Cache-Control")).toBe("no-store");
    expect(await response!.json()).toEqual({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Das Logo ist zu groß.",
        fieldErrors: { file: ["Das Logo ist zu groß."] },
      },
    });
  });
});

describe("rejectOversizedDocumentUpload (Dokumente und Belege)", () => {
  it("Grenze: MAX_UPLOAD_MB plus 256 KiB für die übrigen Formularfelder", () => {
    expect(rejectOversizedDocumentUpload(upload(String(DOCUMENT_LIMIT)))).toBeNull();
    expect(rejectOversizedDocumentUpload(upload(String(DOCUMENT_LIMIT + 1)))?.status).toBe(413);
  });

  it("nennt die Grenze in MB", async () => {
    const response = rejectOversizedDocumentUpload(upload(String(50 * 1024 * 1024)));
    const message = "Die Datei ist zu groß (höchstens 5 MB).";
    expect(await response!.json()).toEqual({
      ok: false,
      error: { code: "VALIDATION", message, fieldErrors: { file: [message] } },
    });
  });
});
