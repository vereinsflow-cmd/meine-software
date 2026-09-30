-- =============================================================================
-- Dashboard selbst einstellen: Jede Person legt je Verein fest, welche Karten ihr Dashboard zeigt und in welcher
-- Reihenfolge. Gespeichert an der Vereinsmitgliedschaft (je Person und Verein), leer = Standard-Ansicht der Rolle.
-- Inhalt (von der Anwendung geprüft): { "v": 1, "tabs": { "<Reiter>": { "order": [...], "hidden": [...] } } }
-- =============================================================================

-- AlterTable
ALTER TABLE "ClubMembership" ADD COLUMN "dashboardLayout" JSONB;
