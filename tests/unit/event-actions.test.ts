import { describe, expect, it } from "vitest";
import type { EventStatus } from "@/generated/prisma/enums";
import { availableEventActions } from "@/modules/events/available-actions";

const all = { update: true, publish: true, archive: true, duplicate: true };
const none = { update: false, publish: false, archive: false, duplicate: false };

/** Namen der angebotenen Aktionen, zum knappen Vergleichen. */
const offered = (status: EventStatus, can = all) =>
  Object.entries(availableEventActions(status, can))
    .filter(([, shown]) => shown)
    .map(([name]) => name);

describe("Veranstaltungsseite: angebotene Aktionen je Status (volle Rechte)", () => {
  it("Entwurf: bearbeiten, veröffentlichen, duplizieren, archivieren, absagen, löschen", () => {
    expect(offered("DRAFT")).toEqual([
      "edit",
      "publish",
      "duplicate",
      "archive",
      "cancel",
      "delete",
    ]);
  });

  it("Veröffentlicht: abschließen und absagen statt veröffentlichen; nicht löschen", () => {
    expect(offered("PUBLISHED")).toEqual(["edit", "complete", "duplicate", "archive", "cancel"]);
  });

  // Ob noch bearbeitet werden darf, entscheidet schon der Fachdienst über `can.update` (je Status).
  it("Abgeschlossen und abgesagt: nur noch duplizieren und archivieren", () => {
    expect(offered("COMPLETED")).toEqual(["edit", "duplicate", "archive"]);
    expect(offered("CANCELLED")).toEqual(["edit", "duplicate", "archive"]);
  });

  it("Archiviert: wiederherstellen statt archivieren, löschen möglich", () => {
    expect(offered("ARCHIVED")).toEqual(["edit", "duplicate", "restore", "delete"]);
  });
});

describe("Veranstaltungsseite: Rechte", () => {
  it("ohne Rechte gibt es keine einzige Aktion (auch kein Menü „Weitere Aktionen“)", () => {
    for (const status of ["DRAFT", "PUBLISHED", "COMPLETED", "CANCELLED", "ARCHIVED"] as const)
      expect(offered(status, none)).toEqual([]);
  });

  it("jedes Recht schaltet nur seine eigenen Aktionen frei", () => {
    expect(offered("DRAFT", { ...none, update: true })).toEqual(["edit"]);
    expect(offered("DRAFT", { ...none, publish: true })).toEqual(["publish", "cancel"]);
    expect(offered("PUBLISHED", { ...none, publish: true })).toEqual(["complete", "cancel"]);
    expect(offered("DRAFT", { ...none, archive: true })).toEqual(["archive", "delete"]);
    expect(offered("ARCHIVED", { ...none, archive: true })).toEqual(["restore", "delete"]);
    expect(offered("PUBLISHED", { ...none, duplicate: true })).toEqual(["duplicate"]);
  });
});
