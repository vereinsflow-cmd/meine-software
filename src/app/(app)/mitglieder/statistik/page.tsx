import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { MEMBER_STATUS_LABEL } from "@/lib/labels";
import { getMemberStats } from "@/modules/members/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Mitgliederstatistik" };

/** Balkenliste mit sichtbaren Zahlen (nicht nur Farbe/Länge) – lesbar für Screenreader und im Schwarzweiß-Druck. */
function BarList({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Keine Daten vorhanden.</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.map((row) => (
        <li
          key={row.label}
          className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm"
        >
          <span className="truncate">{row.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function MemberStatsPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "members:read")) return <NoAccess what="die Mitgliederstatistik" />;
  const stats = await getMemberStats(ctx);

  return (
    <>
      <p className="mb-3">
        <Link
          href="/mitglieder"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Alle Mitglieder
        </Link>
      </p>
      <PageHeader
        title="Mitgliederstatistik"
        description={`${stats.total} Mitglieder (ohne archivierte)`}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Nach Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              rows={stats.byStatus.map((s) => ({
                label: MEMBER_STATUS_LABEL[s.status],
                count: s.count,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Nach Abteilung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={stats.byDepartment.map((d) => ({ label: d.name, count: d.count }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Eintritte pro Jahr
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              rows={stats.joinedPerYear.map((y) => ({ label: String(y.year), count: y.count }))}
            />
          </CardContent>
        </Card>
        {stats.ageGroups && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Altersgruppen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarList rows={stats.ageGroups.map((g) => ({ label: g.label, count: g.count }))} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
