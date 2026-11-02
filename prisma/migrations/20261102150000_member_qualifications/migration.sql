-- =============================================================================
-- Qualifikationen und Lizenzen von Mitgliedern: Übungsleiter- und Trainerlizenz, Erste Hilfe, Jugendleiter-Card,
-- Rettungsschwimmer, Schiedsrichter – oder „Sonstige“ mit eigener Bezeichnung. Je Eintrag optional Bezeichnung, Nummer,
-- ausgestellt am, gültig bis, ausstellende Stelle und Notiz. Für Zuschüsse und die Übungsleiterpauschale muss der Verein
-- gültige Lizenzen nachweisen; bisher ging das nur über Freitext (Funktion, interne Notizen).
--
-- Das Mitglied ist ein zusammengesetzter Fremdschlüssel (clubId, id): Die Datenbank verknüpft nie Zeilen zweier Vereine.
-- Wird das Mitglied endgültig gelöscht, entfallen seine Qualifikationen mit; beim Anonymisieren löscht sie der Dienst.
--
-- Nur hinzufügend: neue Tabelle und neuer Typ, bestehende Tabellen bleiben unverändert.
--
-- Rückgängig (falls nötig): DROP TABLE "MemberQualification"; DROP TYPE "QualificationKind";
-- =============================================================================

-- CreateEnum
CREATE TYPE "QualificationKind" AS ENUM ('INSTRUCTOR_LICENSE', 'TRAINER_LICENSE', 'YOUTH_LEADER_CARD', 'FIRST_AID', 'LIFEGUARD', 'REFEREE', 'OTHER');

-- CreateTable
CREATE TABLE "MemberQualification" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "QualificationKind" NOT NULL,
    "title" TEXT,
    "number" TEXT,
    "issuedOn" DATE,
    "validUntil" DATE,
    "issuer" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MemberQualification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberQualification_clubId_memberId_idx" ON "MemberQualification"("clubId", "memberId");

-- AddForeignKey
ALTER TABLE "MemberQualification" ADD CONSTRAINT "MemberQualification_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prüfregeln (dieselben Grenzen wie im Eingabe-Schema src/modules/members/qualification-schemas.ts)
ALTER TABLE "MemberQualification" ADD CONSTRAINT "MemberQualification_dates_chk"
  CHECK ("validUntil" IS NULL OR "issuedOn" IS NULL OR "validUntil" >= "issuedOn");
ALTER TABLE "MemberQualification" ADD CONSTRAINT "MemberQualification_title_chk"
  CHECK (("title" IS NULL OR char_length(btrim("title")) BETWEEN 1 AND 120) AND ("kind" <> 'OTHER' OR "title" IS NOT NULL));
ALTER TABLE "MemberQualification" ADD CONSTRAINT "MemberQualification_text_chk"
  CHECK (("number" IS NULL OR char_length("number") BETWEEN 1 AND 60)
    AND ("issuer" IS NULL OR char_length("issuer") BETWEEN 1 AND 120)
    AND ("note" IS NULL OR char_length("note") BETWEEN 1 AND 1000));
