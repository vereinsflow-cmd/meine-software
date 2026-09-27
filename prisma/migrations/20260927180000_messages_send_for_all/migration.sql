-- Jeder darf Nachrichten schreiben (27.09.2026): Helfer und Mitglieder bekommen „Nachrichten versenden“ mit der
-- Reichweite OWN – sie schreiben damit nur in Gruppen, zu denen sie selbst gehören (alle Mitglieder, eigene
-- Abteilungen, zugesagte Veranstaltungen, eigene Helfereinsätze), ohne Ankündigung und E-Mail. Die Regeln prüft der
-- Nachrichtendienst (src/modules/messages/service.ts). Neue Vereine erhalten das Recht über die Standardrollen
-- (src/server/permissions/defaults.ts); hier werden die Systemrollen bestehender Vereine nachgezogen.
INSERT INTO "RolePermission" ("clubId", "roleId", "permissionKey", "scope")
SELECT r."clubId", r."id", 'messages:send', 'OWN'::"PermissionScope"
FROM "Role" r
WHERE r."isSystem" AND r."key" IN ('HELPER', 'MEMBER')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
