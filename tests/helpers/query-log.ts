import type { PrismaClient } from "@/generated/prisma/client";
import type { TenantDb } from "@/server/db/tenant";
import type { TenantContext } from "@/server/tenancy/context-core";

/**
 * Zählt die Datenbankzugriffe einer Fachfunktion: ein Kontext, dessen Mandanten-Client jede Operation als
 * „Modell.Operation“ (z. B. `AuditLog.count`) in `queries` einträgt und dann unverändert ausführt.
 *
 *   const { ctx, queries } = withQueryLog(admin);
 *   await getDashboard(ctx);
 *   expect(queries.length).toBeLessThanOrEqual(…);
 *
 * Gezählt wird nur, was über `ctx.db` läuft (Fachcode unter `src/modules` darf ohnehin nichts anderes benutzen).
 */
export function withQueryLog(ctx: TenantContext): { ctx: TenantContext; queries: string[] } {
  const queries: string[] = [];
  // `TenantDb` blendet `$extends` nur im Typ aus; der Mandantenfilter bleibt in der Erweiterung erhalten.
  const db = (ctx.db as unknown as PrismaClient).$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          queries.push(`${model}.${operation}`);
          return query(args);
        },
      },
    },
  });
  return { ctx: { ...ctx, db: db as unknown as TenantDb }, queries };
}
