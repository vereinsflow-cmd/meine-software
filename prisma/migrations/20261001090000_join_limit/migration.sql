-- =============================================================================
-- Beitritt per QR-Code: begrenzte Zahl an Anmeldungen. Beim Einrichten (und beim neuen Code) legt der Verein fest,
-- wie viele Anträge über den QR-Code eingehen dürfen (`joinLimit`); `joinUsed` zählt sie. Abgelehnte Anträge geben ihren
-- Platz zurück – aber nur, wenn sie über den AKTUELLEN Code kamen: Dafür merkt sich jeder Antrag, zu welchem Code er
-- gehört (`joinLinkCreatedAt` = Zeitpunkt, zu dem dieser Code eingerichtet wurde).
-- Bestehende QR-Codes bleiben ohne Begrenzung (leer), bis der Verein eine Anzahl festlegt; ihre bisherigen Anträge
-- werden nachgezählt.
-- =============================================================================

-- AlterTable
ALTER TABLE "Club" ADD COLUMN "joinLimit" INTEGER,
ADD COLUMN "joinUsed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Club" ADD CONSTRAINT "Club_join_limit_chk" CHECK ("joinLimit" IS NULL OR "joinLimit" BETWEEN 1 AND 5000);
ALTER TABLE "Club" ADD CONSTRAINT "Club_join_used_chk" CHECK ("joinUsed" >= 0);

-- AlterTable
ALTER TABLE "MembershipApplication" ADD COLUMN "joinLinkCreatedAt" TIMESTAMPTZ(3);

-- Bestehende Anträge dem aktuellen Code zuordnen (eingegangen, seit er eingerichtet wurde) …
UPDATE "MembershipApplication" a
SET "joinLinkCreatedAt" = c."joinTokenCreatedAt"
FROM "Club" c
WHERE a."clubId" = c."id"
  AND c."joinToken" IS NOT NULL
  AND a."createdAt" >= c."joinTokenCreatedAt";

-- … und für ihn nachzählen (offene und angenommene – abgelehnte haben ihren Platz zurückgegeben)
UPDATE "Club" c
SET "joinUsed" = (
  SELECT count(*)::int FROM "MembershipApplication" a
  WHERE a."clubId" = c."id" AND a."joinLinkCreatedAt" = c."joinTokenCreatedAt" AND a."status" <> 'REJECTED'
)
WHERE c."joinToken" IS NOT NULL;
