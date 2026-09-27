-- =============================================================================
-- Rechnungen und offene Zahlungen (erster Baustein des Finanzmoduls).
-- Eine Rechnung ist ein Dokument (Beleg) mit Betrag, Fälligkeit und Zahlungsstand. Geld steht in ganzen Cent.
-- Neue Rechte „finance:read“ und „finance:manage“ – auch für bereits bestehende Vereine (Vereinsadministrator und
-- Vorstand), denn Rollenrechte entstehen sonst nur beim Anlegen eines Vereins.
-- =============================================================================

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "amountCents" INTEGER,
    "dueDate" DATE,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "paidAt" TIMESTAMPTZ(3),
    "paidById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_clubId_status_dueDate_idx" ON "Invoice"("clubId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_clubId_id_key" ON "Invoice"("clubId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_clubId_documentId_key" ON "Invoice"("clubId", "documentId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clubId_documentId_fkey" FOREIGN KEY ("clubId", "documentId") REFERENCES "Document"("clubId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Prüfregeln (unabhängig vom Anwendungscode)
-- -----------------------------------------------------------------------------

-- Betrag in Cent: größer als 0 und höchstens 10 Millionen Euro.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amount_chk"
  CHECK ("amountCents" IS NULL OR ("amountCents" > 0 AND "amountCents" <= 1000000000));

-- Eine offene Rechnung hat immer einen Betrag – sonst ließe sich nicht sagen, wie viel noch offen ist.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_open_amount_chk"
  CHECK ("status" <> 'OPEN' OR "amountCents" IS NOT NULL);

-- „Bezahlt am/von“ gibt es nur bei bezahlten Rechnungen; wer bezahlt hat, nur mit Zeitpunkt.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paid_chk"
  CHECK (("paidAt" IS NULL OR "status" = 'PAID') AND ("paidById" IS NULL OR "paidAt" IS NOT NULL));

-- -----------------------------------------------------------------------------
-- Neue Rechte für bestehende Vereine
-- -----------------------------------------------------------------------------

-- Katalog (Beschreibungen wie in src/server/permissions/catalog.ts).
INSERT INTO "Permission" ("key", "module", "description") VALUES
  ('finance:read', 'Finanzen', 'Offene Zahlungen und Rechnungen ansehen'),
  ('finance:manage', 'Finanzen', 'Rechnungen erfassen und als bezahlt markieren')
ON CONFLICT ("key") DO NOTHING;

-- Vereinsadministrator und Vorstand (nur die Systemrollen; eigene Rollen bleiben unangetastet).
INSERT INTO "RolePermission" ("clubId", "roleId", "permissionKey", "scope")
SELECT r."clubId", r."id", k."key", 'CLUB'::"PermissionScope"
FROM "Role" r
CROSS JOIN (VALUES ('finance:read'), ('finance:manage')) AS k("key")
WHERE r."isSystem" AND r."key" IN ('CLUB_ADMIN', 'BOARD')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
