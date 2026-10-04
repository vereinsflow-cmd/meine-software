-- =============================================================================
-- Finanzen: Bereich für den Kassenwart freischalten
--
-- Das Recht „Finanzdaten exportieren“ kommt hinzu (Berichte, Steuerberater, Kassenprüfung), und die Beschreibungen der
-- Finanz-Rechte passen zum ganzen Finanzbereich statt nur zu den Rechnungen. Vereinsadministrator und Vorstand bekommen
-- das neue Recht (nur die Systemrollen; eigene Rollen bleiben unangetastet).
-- =============================================================================

INSERT INTO "Permission" ("key", "module", "description") VALUES
  ('finance:export', 'Finanzen', 'Finanzdaten exportieren (Berichte, Steuerberater, Kassenprüfung)')
ON CONFLICT ("key") DO NOTHING;

UPDATE "Permission" SET "module" = 'Finanzen', "description" = 'Finanzen ansehen' WHERE "key" = 'finance:read';
UPDATE "Permission" SET "module" = 'Finanzen',
  "description" = 'Finanzen bearbeiten (buchen, Rechnungen, Beiträge, Lastschrift)'
WHERE "key" = 'finance:manage';

INSERT INTO "RolePermission" ("clubId", "roleId", "permissionKey", "scope")
SELECT r."clubId", r."id", 'finance:export', 'CLUB'::"PermissionScope"
FROM "Role" r
WHERE r."isSystem" AND r."key" IN ('CLUB_ADMIN', 'BOARD')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
