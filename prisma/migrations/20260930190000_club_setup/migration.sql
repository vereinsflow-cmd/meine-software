-- =============================================================================
-- Verein einrichten: Zeitpunkt, zu dem der Assistent „Verein einrichten“ abgeschlossen wurde. Neue Vereine starten leer
-- (NULL) – ihr Administrator sieht einen Hinweis und wird Schritt für Schritt durch den Start geführt. Bestehende Vereine
-- gelten als eingerichtet.
-- =============================================================================

-- AlterTable
ALTER TABLE "Club" ADD COLUMN "setupCompletedAt" TIMESTAMPTZ(3);

-- Bestehende Vereine sind längst in Betrieb
UPDATE "Club" SET "setupCompletedAt" = now();
