import type { Metadata } from "next";
import Link from "next/link";
import { QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/shared/back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import { clubLogoUrl } from "@/lib/club-logo";
import { buildPosterPageStyle } from "@/lib/print";
import { QrCode } from "@/modules/membership-applications/components/qr-code";
import { canManageApplications, getJoinLink } from "@/modules/membership-applications/service";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Aushang drucken" };

const STEPS = [
  "Scanne den QR-Code mit der Kamera deines Handys.",
  "Fülle den Antrag aus und sende ihn ab – das dauert nur zwei Minuten.",
  "Der Vorstand prüft deinen Antrag. Danach bekommst du eine Einladung per E-Mail.",
] as const;

/**
 * Aushang „Mitglied werden“ zum Ausdrucken (DIN A4 hoch, eine Seite): Vereinslogo und -name, großer QR-Code, der Link als
 * Text (falls die Kamera streikt) und drei kurze Schritte. Vorbild ist „Helferplan drucken“: Bedienelemente sind
 * `print:hidden`, beim Drucken bleibt nur das Blatt. Auf dem Bildschirm steht das Blatt als weiße „Papier“-Vorschau –
 * auch in der dunklen Darstellung, damit man sieht, was aus dem Drucker kommt.
 */
export default async function JoinPosterPage() {
  const ctx = await requirePageContext();
  if (!canManageApplications(ctx)) return <NoAccess what="den Aushang zum Beitritt" />;
  const link = await getJoinLink(ctx);
  const logoUrl = clubLogoUrl(ctx.clubId, ctx.club.logoSha256);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden">
        <BackLink href="/mitglieder/antraege">Beitrittsanträge</BackLink>
        <PageHeader
          title="Aushang drucken"
          description="Ein DIN-A4-Blatt mit dem QR-Code – für das Vereinsheim, das Schwarze Brett oder die Halle."
          actions={link ? <PrintButton label="Aushang drucken" /> : undefined}
        />
      </div>

      {!link ? (
        <EmptyState
          icon={<QrCodeIcon />}
          title="Noch kein QR-Code"
          description="Richte zuerst den QR-Code zum Beitritt ein – danach kannst du den Aushang hier drucken."
          action={
            <Button asChild>
              <Link href="/mitglieder/antraege">Zu den Beitrittsanträgen</Link>
            </Button>
          }
        />
      ) : (
        <article
          id="aushang"
          aria-label="Aushang „Mitglied werden“"
          className="mx-auto flex max-w-[210mm] break-inside-avoid flex-col items-center rounded-xl bg-white px-6 py-10 text-center text-neutral-950 shadow-sm ring-1 ring-foreground/10 sm:px-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0"
        >
          <style id="aushang-seitenstil">{buildPosterPageStyle()}</style>
          {logoUrl && (
            // Schlichtes <img> wie im Helferplan-Ausdruck: steht sofort im HTML (schnelles Drucken), schmückend – der
            // Vereinsname steht darunter.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mb-3 size-20 object-contain" />
          )}
          <p className="text-xl font-semibold break-words">{ctx.club.name}</p>
          <h2 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">Mitglied werden</h2>
          <p className="mt-3 max-w-md text-xl">
            Du möchtest bei uns mitmachen? Stell deinen Antrag ganz einfach am Handy.
          </p>
          <QrCode
            value={link.url}
            label="QR-Code zum Beitrittsformular"
            className="mt-8 size-64 sm:size-72 print:size-[85mm]"
          />
          <p className="mt-4 max-w-full font-mono text-sm break-all">{link.url}</p>
          <ol className="mt-8 grid w-full max-w-lg gap-3 text-left text-lg">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-neutral-950 font-bold"
                >
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </article>
      )}
    </div>
  );
}
