import type { Metadata } from "next";
import { BanknoteIcon, FileSpreadsheetIcon, HandCoinsIcon, ReceiptTextIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Finanzen" };

/**
 * PLATZHALTER: Das Finanzmodul ist noch nicht gebaut. Diese Seite sagt das offen und zeigt, was geplant ist – sie
 * enthält bewusst keine Bedienelemente und keine Beispielzahlen, die Funktionen vortäuschen würden.
 * Die technische Vorbereitung (Mandantentrennung, Rechte, Änderungsprotokoll) gilt später auch hier; der Plan mit
 * Datenmodell-Entwurf steht in docs/ROADMAP.md.
 */
const PLANNED = [
  {
    icon: <ReceiptTextIcon aria-hidden="true" />,
    title: "Mitgliedsbeiträge",
    text: "Beitragsarten je Abteilung oder Altersgruppe, Beitragsläufe, offene Posten, Zahlungseingang und Erinnerungen.",
  },
  {
    icon: <BanknoteIcon aria-hidden="true" />,
    title: "Kassenbuch",
    text: "Einnahmen und Ausgaben mit Belegen, zugeordnet zu Abteilungen und Veranstaltungen (Kostenstellen).",
  },
  {
    icon: <HandCoinsIcon aria-hidden="true" />,
    title: "Spenden",
    text: "Spenden erfassen und Zuwendungsbestätigungen erstellen.",
  },
  {
    icon: <FileSpreadsheetIcon aria-hidden="true" />,
    title: "Auswertungen und Export",
    text: "Jahresübersicht, Beitragsstatistik und Export für die Steuerberatung (CSV).",
  },
] as const;

export default async function FinancePage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "club:update")) return <NoAccess what="die Finanzen" />;

  return (
    <>
      <PageHeader
        title="Finanzen"
        description="Beiträge, Kassenbuch und Spenden deines Vereins."
        actions={<ToneBadge tone="warning">In Vorbereitung</ToneBadge>}
      />

      <Alert role="status" className="mb-6">
        <AREA_ICON.finanzen aria-hidden="true" />
        <AlertTitle>Dieses Modul ist noch nicht verfügbar</AlertTitle>
        <AlertDescription>
          Die Finanzverwaltung gehört nicht zur ersten Ausbaustufe von VereinsFlow. Bis dahin führst
          du Beiträge und Kasse wie bisher außerhalb der Anwendung. Deine Mitglieder-, Abteilungs-
          und Veranstaltungsdaten sind bereits so angelegt, dass sich Beiträge und Kostenstellen
          später daran anschließen lassen.
        </AlertDescription>
      </Alert>

      <h2 className="mb-3 text-lg font-semibold">Geplant</h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {PLANNED.map((item) => (
          <li key={item.title}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle
                  role="heading"
                  aria-level={3}
                  className="flex items-center gap-2 text-base [&_svg]:size-4"
                >
                  {item.icon} {item.title}
                </CardTitle>
                <CardDescription>{item.text}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Noch nicht umgesetzt.
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
