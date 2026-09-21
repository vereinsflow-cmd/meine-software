-- =============================================================================
-- Hilfe und Support: Meldungen von Mitgliedern an die Vereinsverwaltung.
-- =============================================================================

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('PROBLEM', 'QUESTION', 'IDEA');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "createdById" TEXT,
    "category" "SupportCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pagePath" TEXT,
    "userAgent" TEXT,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "respondedAt" TIMESTAMPTZ(3),
    "respondedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicket_clubId_status_createdAt_idx" ON "SupportTicket"("clubId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_clubId_createdById_createdAt_idx" ON "SupportTicket"("clubId", "createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_clubId_id_key" ON "SupportTicket"("clubId", "id");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Prüfregeln (unabhängig vom Anwendungscode)
-- ---------------------------------------------------------------------------

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_text_chk"
    CHECK (length(btrim("subject")) > 0 AND length(btrim("description")) > 0),
  -- Der Pfad der Seite ist immer ein interner Pfad (kein Verweis auf fremde Adressen).
  ADD CONSTRAINT "SupportTicket_path_chk"
    CHECK (
      "pagePath" IS NULL
      OR ("pagePath" LIKE '/%' AND "pagePath" NOT LIKE '//%' AND "pagePath" NOT LIKE '/\%')
    );
