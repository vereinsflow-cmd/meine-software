-- =============================================================================
-- Hinweise im Chat-Verlauf: „Anna hat Hans hinzugefügt“ (Mitglieder einer Chat-Gruppe später hinzufügen, 17.10.2026).
--
-- Neue Spalte "kind" an "Message": TEXT = von einer Person geschrieben (alle bisherigen Nachrichten), MEMBERS_ADDED =
-- Hinweis, dass jemand der Gruppe hinzugefügt wurde. Nur hinzufügend: Die Spalte hat einen festen Standardwert, damit
-- schreibt PostgreSQL die Tabelle nicht um, und alte Programmstände (die die Spalte nicht kennen) laufen weiter.
--
-- Rückgängig: ALTER TABLE "Message" DROP COLUMN "kind"; DROP TYPE "MessageKind";
-- =============================================================================

CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'MEMBERS_ADDED');

ALTER TABLE "Message" ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'TEXT';
