import "server-only";
import type { Club } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { PERMISSIONS, PERMISSION_KEYS } from "@/server/permissions/catalog";
import { SYSTEM_ROLES } from "@/server/permissions/defaults";

type Db = Pick<typeof prisma, "permission" | "role" | "rolePermission" | "club">;

/**
 * Gleicht die Tabelle `Permission` mit dem Katalog im Code ab (anlegen/aktualisieren).
 * Nicht mehr vorhandene Schlüssel werden entfernt (die zugehörigen Rollenzuweisungen fallen weg).
 */
export async function syncPermissionCatalog(
  db: Pick<typeof prisma, "permission"> = prisma,
): Promise<void> {
  // Im Normalfall (Katalog unverändert) genügt eine einzige Abfrage.
  const existing = new Map((await db.permission.findMany()).map((row) => [row.key, row]));

  const missing = PERMISSION_KEYS.filter((key) => !existing.has(key));
  if (missing.length > 0) {
    await db.permission.createMany({
      data: missing.map((key) => ({
        key,
        module: PERMISSIONS[key].module,
        description: PERMISSIONS[key].label,
      })),
      skipDuplicates: true,
    });
  }

  for (const key of PERMISSION_KEYS) {
    const row = existing.get(key);
    const { module, label } = PERMISSIONS[key];
    if (row && (row.module !== module || row.description !== label)) {
      await db.permission.update({ where: { key }, data: { module, description: label } });
    }
  }

  const obsolete = [...existing.keys()].filter((key) => !(key in PERMISSIONS));
  if (obsolete.length > 0) {
    await db.permission.deleteMany({ where: { key: { in: obsolete } } });
  }
}

/** Legt die Systemrollen samt Berechtigungen für einen Verein an. */
export async function createSystemRoles(db: Db, clubId: string): Promise<Record<string, string>> {
  const roleIds: Record<string, string> = {};

  for (const definition of SYSTEM_ROLES) {
    const role = await db.role.create({
      data: {
        clubId,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });
    roleIds[definition.key] = role.id;

    const grants = Object.entries(definition.permissions).map(([permissionKey, scope]) => ({
      clubId,
      roleId: role.id,
      permissionKey,
      scope,
    }));
    if (grants.length > 0) {
      await db.rolePermission.createMany({ data: grants });
    }
  }
  return roleIds;
}

export interface ProvisionClubInput {
  name: string;
  slug: string;
  timezone?: string;
  contactEmail?: string | null;
}

/**
 * Legt einen neuen Verein an – inklusive Systemrollen. Alles in einer Transaktion:
 * entweder ist der Verein vollständig eingerichtet oder gar nicht vorhanden.
 */
export async function provisionClub(
  input: ProvisionClubInput,
): Promise<{ club: Club; roleIds: Record<string, string> }> {
  return prisma.$transaction(async (tx) => {
    await syncPermissionCatalog(tx);
    const club = await tx.club.create({
      data: {
        name: input.name,
        slug: input.slug,
        timezone: input.timezone ?? "Europe/Berlin",
        contactEmail: input.contactEmail ?? null,
      },
    });
    const roleIds = await createSystemRoles(tx, club.id);
    return { club, roleIds };
  });
}
