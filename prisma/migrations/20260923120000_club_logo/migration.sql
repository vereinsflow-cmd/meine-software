-- =============================================================================
-- Vereinslogo: optionales Bild je Verein (PNG, JPEG oder WebP), erscheint neben dem Vereinsnamen.
-- Die Datei liegt wie Dokumente unter STORAGE_DIR/<clubId>/<zufälliger Schlüssel>; hier stehen nur die Angaben dazu.
-- =============================================================================

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "logoMimeType" TEXT,
ADD COLUMN     "logoSha256" TEXT,
ADD COLUMN     "logoSizeBytes" INTEGER,
ADD COLUMN     "logoStorageKey" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "Club_logoStorageKey_key" ON "Club"("logoStorageKey");

-- -----------------------------------------------------------------------------
-- Prüfregeln (unabhängig vom Anwendungscode)
-- -----------------------------------------------------------------------------

-- Entweder ein vollständiges Logo oder keines – nie halbe Angaben.
ALTER TABLE "Club" ADD CONSTRAINT "Club_logo_complete_chk" CHECK (
  ("logoStorageKey" IS NULL AND "logoMimeType" IS NULL AND "logoSizeBytes" IS NULL
    AND "logoSha256" IS NULL AND "logoUpdatedAt" IS NULL)
  OR
  ("logoStorageKey" IS NOT NULL AND "logoMimeType" IS NOT NULL AND "logoSizeBytes" IS NOT NULL
    AND "logoSha256" IS NOT NULL AND "logoUpdatedAt" IS NOT NULL)
);

-- Nur Rasterbilder aus der Positivliste (kein SVG), höchstens 1 MiB, Schlüssel und Prüfsumme im erwarteten Format.
ALTER TABLE "Club" ADD CONSTRAINT "Club_logo_type_chk" CHECK (
  "logoMimeType" IS NULL OR "logoMimeType" IN ('image/png', 'image/jpeg', 'image/webp')
);
ALTER TABLE "Club" ADD CONSTRAINT "Club_logo_size_chk" CHECK (
  "logoSizeBytes" IS NULL OR ("logoSizeBytes" > 0 AND "logoSizeBytes" <= 1048576)
);
ALTER TABLE "Club" ADD CONSTRAINT "Club_logo_key_chk" CHECK (
  "logoStorageKey" IS NULL OR "logoStorageKey" ~ '^[0-9a-f]{32}$'
);
ALTER TABLE "Club" ADD CONSTRAINT "Club_logo_sha_chk" CHECK (
  "logoSha256" IS NULL OR "logoSha256" ~ '^[0-9a-f]{64}$'
);
