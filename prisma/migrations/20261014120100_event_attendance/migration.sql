-- =============================================================================
-- Anwesenheit bei Terminen (Training, Probe, Versammlung): Für einen Termin wird festgehalten, wer da war, wer
-- entschuldigt fehlte und wer unentschuldigt fehlte. Je Termin und Mitglied genau eine Zeile; erneutes Erfassen ändert
-- nur den Status (und „erfasst am/von“).
--
-- Bewusst OHNE Freitext: Gründe für das Fehlen („krank“, „Knie verletzt“) wären Gesundheitsdaten (Art. 9 DSGVO) und
-- gehören nicht in eine Anwesenheitsliste.
-- `recordedById` ist eine reine Herkunftsangabe ohne Fremdschlüssel (wie alle `…ById`) und wird beim Löschen des Kontos
-- geleert. Termin und Mitglied sind zusammengesetzte Fremdschlüssel (clubId, id): Die Datenbank verknüpft nie Zeilen
-- zweier Vereine. Wird der Termin oder das Mitglied endgültig gelöscht, entfällt die Anwesenheit mit.
--
-- Rückgängig (falls nötig): DROP TABLE "EventAttendance"; DROP TYPE "AttendanceStatus";
-- =============================================================================

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'EXCUSED', 'ABSENT');

-- CreateTable
CREATE TABLE "EventAttendance" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventAttendance_clubId_memberId_idx" ON "EventAttendance"("clubId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendance_eventId_memberId_key" ON "EventAttendance"("eventId", "memberId");

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_clubId_eventId_fkey" FOREIGN KEY ("clubId", "eventId") REFERENCES "Event"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
