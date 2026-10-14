import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { ToneBadge } from "@/components/shared/status-badge";
import { TableCard } from "@/components/shared/table-card";
import { formatDate } from "@/lib/dates";
import {
  ClubStatusButton,
  CreateClubDialog,
} from "@/modules/platform/components/platform-controls";
import { getPlatformStats, listPlatformClubs } from "@/server/platform/clubs";
import { requirePlatformAdminPage } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Systemadministration" };

export default async function SystemPage() {
  const user = await requirePlatformAdminPage();
  const [stats, clubs] = await Promise.all([getPlatformStats(user), listPlatformClubs(user)]);

  const tiles = [
    { label: "Aktive Vereine", value: stats.clubs.active },
    { label: "Deaktivierte Vereine", value: stats.clubs.deactivated },
    { label: "Benutzerkonten", value: stats.users },
    { label: "Mitglieder gesamt", value: stats.members },
    { label: "Kommende Veranstaltungen", value: stats.upcomingEvents },
    { label: "Aktive Sitzungen", value: stats.activeSessions },
  ];

  return (
    <PageStack>
      <PageHeader
        title="Systemadministration"
        description="Vereine der Plattform. Aus Datenschutzgründen siehst du hier nur Kennzahlen – keine Mitgliederdaten."
        actions={<CreateClubDialog />}
      />

      <section
        aria-label="Globale Statistiken"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      >
        {tiles.map((tile) => (
          <Card key={tile.label} size="sm">
            <CardHeader className="pb-0">
              <CardTitle
                role="heading"
                aria-level={2}
                className="text-xs font-medium text-muted-foreground"
              >
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <TableCard>
        {/* Am Handy eine kleine Karte je Verein mit allen Kennzahlen; ab `md` die Tabelle („Angelegt“ erst ab `lg`). */}
        <Table stack className="[--table-stack-label:10rem]">
          <caption className="sr-only">Vereine der Plattform</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Verein</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mitglieder</TableHead>
              <TableHead>Benutzer</TableHead>
              <TableHead>Veranstaltungen</TableHead>
              <TableHead className="md:max-lg:hidden">Angelegt</TableHead>
              <TableHead className="w-40">
                <span className="sr-only">Aktionen</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clubs.map((club) => (
              <TableRow key={club.id}>
                <TableCell>
                  <span className="font-medium">{club.name}</span>
                  <p className="text-xs text-muted-foreground">{club.slug}</p>
                </TableCell>
                <TableCell label="Status">
                  <div className="flex flex-wrap gap-1">
                    {club.active ? (
                      <ToneBadge tone="success">Aktiv</ToneBadge>
                    ) : (
                      <ToneBadge tone="danger">Deaktiviert</ToneBadge>
                    )}
                    {club.pendingAdminInvitation && (
                      <ToneBadge tone="warning">Admin-Einladung offen</ToneBadge>
                    )}
                  </div>
                </TableCell>
                <TableCell label="Mitglieder" className="tabular-nums">
                  {club.memberCount}
                </TableCell>
                <TableCell label="Benutzer" className="tabular-nums">
                  {club.userCount}
                </TableCell>
                <TableCell label="Veranstaltungen" className="tabular-nums">
                  {club.eventCount}
                </TableCell>
                <TableCell label="Angelegt" className="text-muted-foreground md:max-lg:hidden">
                  {formatDate(club.createdAt)}
                </TableCell>
                <TableCell className="max-md:mt-2">
                  <ClubStatusButton clubId={club.id} name={club.name} active={club.active} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </PageStack>
  );
}
