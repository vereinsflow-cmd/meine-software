-- =============================================================================
-- Mitglied werden per QR-Code: Ein Verein erzeugt einen öffentlichen Link (als QR-Code zum Aushängen). Wer ihn öffnet,
-- stellt einen Beitrittsantrag; der Vorstand nimmt an oder lehnt ab. Erst beim Annehmen entsteht das Mitglied und bekommt
-- eine Einladung per E-Mail – ohne Bestätigung gibt es keinen Zugang (Mitglieder sehen Chats, Termine und Dokumente).
--
-- Der Schlüssel des Links („joinToken“) steht bewusst im Klartext am Verein: Er gewährt keinen Zugang, sondern erlaubt nur,
-- einen Antrag einzureichen, und muss für Nachdrucke des Aushangs wieder anzeigbar sein. Ein neuer Schlüssel ersetzt den
-- alten (alte Aushänge werden ungültig), leer heißt „Beitritt geschlossen“.
-- Anträge enthalten Personendaten ohne Konto; der Aufbewahrungsjob löscht entschiedene nach 30 Tagen, offene nach 180 Tagen.
-- =============================================================================

-- CreateEnum
CREATE TYPE "MembershipApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "joinToken" TEXT,
ADD COLUMN     "joinTokenCreatedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "MembershipApplication" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "birthDate" DATE,
    "departmentId" TEXT,
    "message" TEXT,
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "MembershipApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" TEXT,
    "memberId" TEXT,
    "ipPrefix" TEXT,

    CONSTRAINT "MembershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipApplication_clubId_status_createdAt_idx" ON "MembershipApplication"("clubId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipApplication_clubId_id_key" ON "MembershipApplication"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Club_joinToken_key" ON "Club"("joinToken");

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_clubId_departmentId_fkey" FOREIGN KEY ("clubId", "departmentId") REFERENCES "Department"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_clubId_memberId_fkey" FOREIGN KEY ("clubId", "memberId") REFERENCES "Member"("clubId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfregeln (unabhängig vom Anwendungscode)
-- -----------------------------------------------------------------------------

-- Beitrittslink: 32 zufällige Bytes in base64url (43 Zeichen) – und ein Link hat immer seinen Erstellungszeitpunkt.
ALTER TABLE "Club" ADD CONSTRAINT "Club_join_token_chk" CHECK (
  ("joinToken" IS NULL AND "joinTokenCreatedAt" IS NULL)
  OR ("joinToken" ~ '^[A-Za-z0-9_-]{43}$' AND "joinTokenCreatedAt" IS NOT NULL)
);

ALTER TABLE "MembershipApplication"
  -- Namen wie im Formular: nicht leer, höchstens 80 Zeichen.
  ADD CONSTRAINT "MembershipApplication_name_chk"
    CHECK (
      length(btrim("firstName")) > 0 AND length("firstName") <= 80
      AND length(btrim("lastName")) > 0 AND length("lastName") <= 80
    ),
  -- E-Mail immer klein geschrieben (Vergleich mit vorhandenen Mitgliedern und Einladungen) und plausibel.
  ADD CONSTRAINT "MembershipApplication_email_chk"
    CHECK ("email" = lower("email") AND length("email") <= 254 AND position('@' in "email") > 1),
  -- Freie Texte begrenzt – das Formular ist öffentlich.
  ADD CONSTRAINT "MembershipApplication_text_chk"
    CHECK (
      ("phone" IS NULL OR length("phone") <= 40)
      AND ("message" IS NULL OR length("message") <= 1000)
      AND ("ipPrefix" IS NULL OR length("ipPrefix") <= 64)
    ),
  -- Offen heißt „noch nicht entschieden“; wer entschieden hat, steht nur mit Zeitpunkt da; ein angelegtes Mitglied gibt es
  -- nur bei einem angenommenen Antrag.
  ADD CONSTRAINT "MembershipApplication_decision_chk"
    CHECK (
      (("status" = 'PENDING') = ("decidedAt" IS NULL))
      AND ("decidedById" IS NULL OR "decidedAt" IS NOT NULL)
      AND ("memberId" IS NULL OR "status" = 'ACCEPTED')
    );
