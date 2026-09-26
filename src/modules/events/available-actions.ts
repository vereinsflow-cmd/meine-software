import type { EventStatus } from "@/generated/prisma/enums";

/** Rechte an einer Veranstaltung, wie `getEvent` sie liefert (der Server prüft jede Aktion erneut). */
export interface EventActionRights {
  update: boolean;
  publish: boolean;
  archive: boolean;
  duplicate: boolean;
}

/** Welche Verwaltungsaktion auf der Veranstaltungsseite angeboten wird – je nach Rechten und Status. */
export interface AvailableEventActions {
  edit: boolean;
  publish: boolean;
  complete: boolean;
  duplicate: boolean;
  archive: boolean;
  restore: boolean;
  cancel: boolean;
  delete: boolean;
}

/**
 * Sichtbarkeit der Aktionen im Seitenkopf der Veranstaltung. „Bearbeiten“ und „Veröffentlichen“ stehen als Knöpfe
 * da, alles Übrige steckt in „Weitere Aktionen“ (`EventActions`) – die Regeln je Status sind dieselben wie zuvor.
 */
export function availableEventActions(
  status: EventStatus,
  can: EventActionRights,
): AvailableEventActions {
  return {
    edit: can.update,
    publish: can.publish && status === "DRAFT",
    complete: can.publish && status === "PUBLISHED",
    duplicate: can.duplicate,
    archive: can.archive && status !== "ARCHIVED",
    restore: can.archive && status === "ARCHIVED",
    cancel: can.publish && (status === "PUBLISHED" || status === "DRAFT"),
    delete: can.archive && (status === "DRAFT" || status === "ARCHIVED"),
  };
}
